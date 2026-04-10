import type { PrismaClient } from "@job-alert/generated-prisma";
import type { Role, Level } from "@job-alert/shared";
import { ScraperOrchestrator } from "@job-alert/scraper";
import type { ScraperConfig, ScrapeRunStats } from "@job-alert/scraper";
import { GeminiClient, AIFilterPipeline } from "@job-alert/ai-filter";
import type {
  PipelineConfig,
  PipelineStats,
  MatchedJob,
} from "@job-alert/ai-filter";
import {
  TelegramNotifier,
  formatRunSummary,
  sessionExpiredAlert,
  runCompleteNoMatchesAlert,
} from "@job-alert/notifier";
import { isUniqueConstraintError } from "./prisma-errors.js";
import { parseSettingsRow } from "./settings-helpers.js";
import { createDeduplicationStore } from "./dedup-store.js";
import { scraperState } from "./scraper-state.js";
import type { PipelineRunStats, RunSource } from "./scraper-state.js";

// ── Constants ──

/** Maximum execution time for a single pipeline run. */
const RUN_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// ── Types ──

export interface PipelineRunResult {
  stats: PipelineRunStats;
  matchedCount: number;
  sessionExpired: boolean;
}

interface ScrapeWindowOverride {
  from: string | null;
  to: string | null;
}

// ── Runner ──

export class PipelineRunner {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifier: TelegramNotifier | null,
  ) {}

  /** Create a PipelineRunner from environment variables. */
  static fromEnv(prisma: PrismaClient): PipelineRunner {
    const botToken = process.env["TELEGRAM_BOT_TOKEN"];
    const chatId = process.env["TELEGRAM_CHAT_ID"];

    const notifier =
      botToken && chatId
        ? new TelegramNotifier({ botToken, defaultChatId: chatId })
        : null;

    return new PipelineRunner(prisma, notifier);
  }

  async run(
    source: RunSource = "manual",
    windowOverride?: ScrapeWindowOverride,
    runId?: string,
  ): Promise<PipelineRunResult> {
    // ── 1. Load settings ──
    const settingsRow = await this.prisma.settings.findUnique({
      where: { id: 1 },
    });
    if (!settingsRow) {
      throw new Error("Settings not configured");
    }

    const settings = parseSettingsRow(settingsRow);
    const cookiePath = process.env["COOKIE_PATH"];
    if (!cookiePath) {
      throw new Error("COOKIE_PATH environment variable not set");
    }
    const geminiApiKey = process.env["GEMINI_API_KEY"];
    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY environment variable not set");
    }

    const scraperConfig: ScraperConfig = {
      targetGroups: settings.target_groups,
      cookiePath,
      maxPostsPerGroup: settings.max_posts_per_group,
      // All configured groups are always scraped
      maxGroups: settings.target_groups.length,
      // Total cap = posts per group × number of groups
      maxTotalPosts:
        settings.max_posts_per_group * settings.target_groups.length,
    };

    // Compute lookback cutoff so the scraper can stop scrolling early
    const { scrape_lookback_hours, scrape_date_from, scrape_date_to } =
      settings;
    const hasWindowOverride =
      windowOverride?.from != null || windowOverride?.to != null;
    const effectiveFrom =
      windowOverride?.from ?? (!hasWindowOverride ? scrape_date_from : null);
    const effectiveTo =
      windowOverride?.to ?? (!hasWindowOverride ? scrape_date_to : null);
    const lookbackFrom = hasWindowOverride
      ? effectiveFrom != null
        ? new Date(effectiveFrom)
        : null
      : scrape_lookback_hours != null
        ? new Date(Date.now() - scrape_lookback_hours * 60 * 60 * 1000)
        : effectiveFrom != null
          ? new Date(effectiveFrom)
          : null;
    const lookbackTo = effectiveTo != null ? new Date(effectiveTo) : null;

    if (lookbackFrom) {
      scraperConfig.lookbackCutoff = lookbackFrom;
    }

    // Merge common keywords + all enabled role keywords (deduplicated)
    const roleKeywords = settings.role_keywords;
    const allKeywords = new Set(settings.target_keywords);
    for (const role of settings.allowed_roles) {
      const keywords = roleKeywords[role];
      if (keywords) {
        for (const kw of keywords) allKeywords.add(kw);
      }
    }

    const pipelineConfig: PipelineConfig = {
      filterCriteria: {
        allowedRoles: settings.allowed_roles as Role[],
        allowedLevels: settings.allowed_levels as Level[],
        maxYoe: settings.max_yoe,
        roleExclusionKeywords: settings.role_exclusion_keywords,
      },
      keywords: [...allKeywords],
      blacklist: settings.blacklist,
      excludedLocations: settings.excluded_locations,
      roleKeywords: settings.role_keywords,
      roleExclusionKeywords: settings.role_exclusion_keywords,
      commonRules: settings.common_rules,
      roleRules: settings.role_rules,
    };

    this.throwIfCancelled(runId);

    // ── 2. Scrape ──
    const notifier = this.notifier;
    const alertFn = notifier
      ? (msg: string) => notifier.sendMessage(msg)
      : undefined;

    const orchestrator = new ScraperOrchestrator({
      deduplicationStore: createDeduplicationStore(),
      alertFn,
    });

    const scrapeResult = await orchestrator.run(scraperConfig);
    this.throwIfCancelled(runId);

    // ── 2b. Apply post-age filter (safety net — scraper already stops early
    //        via lookbackCutoff, but some posts may lack parseable timestamps) ──
    if (lookbackFrom || lookbackTo) {
      scrapeResult.newPosts = scrapeResult.newPosts.filter((p) => {
        if (!p.createdTimeUtc) return true; // no timestamp — keep (benefit of the doubt)
        if (lookbackFrom && p.createdTimeUtc < lookbackFrom) return false;
        if (lookbackTo && p.createdTimeUtc > lookbackTo) return false;
        return true;
      });

      console.log(
        `[PipelineRunner] After time filter: ${scrapeResult.newPosts.length} posts remain`,
      );
    }

    if (scrapeResult.sessionExpired) {
      await this.notify(sessionExpiredAlert());
      console.log("[PipelineRunner] Session expired — aborting run.");
      return {
        stats: {
          scrape: scrapeResult.stats,
          ai: {
            total: 0,
            processed: 0,
            matched: 0,
            skipped: 0,
            apiCallsUsed: 0,
          },
          savedCount: 0,
        },
        matchedCount: 0,
        sessionExpired: true,
      };
    }

    // ── 3. Save raw posts to DB (before AI filter) ──
    const scrapeDate = new Date().toISOString(); // full ISO datetime — unique per run
    const rawPostMap = new Map<string, number>(); // postUrlHash -> rawPostId
    if (scrapeResult.newPosts.length > 0) {
      for (const post of scrapeResult.newPosts) {
        this.throwIfCancelled(runId);
        try {
          const created = await this.prisma.rawPost.create({
            data: {
              fb_post_id: post.fbPostId ?? null,
              content: post.content,
              post_url: post.postUrl,
              poster_name: post.posterName,
              poster_url: post.posterProfileUrl,
              post_url_hash: post.postUrlHash,
              content_hash: post.contentHash,
              group_url: post.groupUrl,
              scrape_date: scrapeDate,
              created_time_raw: post.createdTimeRaw,
              created_time_utc: post.createdTimeUtc ?? null,
              first_seen_at: post.firstSeenAt,
            },
          });
          rawPostMap.set(post.postUrlHash, created.id);
        } catch (error: unknown) {
          if (isUniqueConstraintError(error)) {
            continue;
          }
          throw error;
        }
      }
      console.log(
        `[PipelineRunner] Saved ${rawPostMap.size} raw posts before AI filtering`,
      );
    }

    // ── 4. AI Filter ──
    let aiStats: PipelineStats = {
      total: 0,
      processed: 0,
      matched: 0,
      skipped: 0,
      apiCallsUsed: 0,
    };
    let matchedJobs: MatchedJob[] = [];

    if (scrapeResult.newPosts.length > 0) {
      this.throwIfCancelled(runId);
      console.log(
        `[PipelineRunner] Starting AI filtering for ${scrapeResult.newPosts.length} posts...`,
      );
      const geminiClient = new GeminiClient({ apiKey: geminiApiKey });
      const aiPipeline = new AIFilterPipeline(geminiClient);
      const aiResult = await aiPipeline.run(
        scrapeResult.newPosts,
        pipelineConfig,
      );
      this.throwIfCancelled(runId);

      aiStats = aiResult.stats;
      matchedJobs = aiResult.matchedJobs;
      console.log(
        `[PipelineRunner] AI filtering complete: processed=${aiStats.processed}, matched=${aiStats.matched}, skipped=${aiStats.skipped}, apiCalls=${aiStats.apiCallsUsed}`,
      );

      // ── 4b. Update raw posts with AI classification results ──
      if (aiResult.classifiedPosts.length > 0) {
        let updatedCount = 0;
        for (const classified of aiResult.classifiedPosts) {
          this.throwIfCancelled(runId);
          const rawPostId = rawPostMap.get(classified.postUrlHash);
          if (!rawPostId) continue;

          try {
            await this.prisma.rawPost.update({
              where: { id: rawPostId },
              data: {
                filter_role: classified.role,
                filter_level: classified.level,
                filter_yoe: classified.yoe,
                filter_score: classified.score,
                filter_reason: classified.reason,
                rejection_reason: classified.rejectionReason,
              },
            });
            updatedCount++;
          } catch (error) {
            // Log but continue - don't fail the whole run for this
            console.warn(
              `[PipelineRunner] Failed to update raw post ${rawPostId}: ${error}`,
            );
          }
        }
        console.log(
          `[PipelineRunner] Updated ${updatedCount} raw posts with AI classification results`,
        );
      }
    }

    // ── 5. Save matched jobs to DB ──
    let savedCount = 0;
    if (matchedJobs.length > 0) {
      const jobData = matchedJobs.map((job) => ({
        fb_post_id: job.fbPostId ?? null,
        content: job.content,
        post_url: job.postUrl,
        poster_name: job.posterName,
        poster_url: job.posterProfileUrl,
        post_url_hash: job.postUrlHash,
        content_hash: job.contentHash,
        role: job.role,
        level: job.level,
        yoe: job.yoe,
        score: job.score,
        reason: job.reason,
        is_freelance: job.isFreelance,
        status: "new" as const,
        source,
        created_time_raw: job.createdTimeRaw,
        created_time_utc: job.createdTimeUtc ?? null,
        first_seen_at: job.firstSeenAt,
      }));

      savedCount = await this.prisma.$transaction(async (tx) => {
        let count = 0;
        for (const data of jobData) {
          this.throwIfCancelled(runId);
          try {
            await tx.job.create({ data });
            count++;
          } catch (error: unknown) {
            if (isUniqueConstraintError(error)) {
              continue;
            }
            throw error;
          }
        }
        return count;
      });

      const skipped = matchedJobs.length - savedCount;
      if (skipped > 0) {
        console.log(`[PipelineRunner] ${skipped} duplicate jobs skipped`);
      }
    }

    // ── 6. Notify (raw posts are kept for the Raw Posts dashboard) ──
    const runStats: PipelineRunStats = {
      scrape: scrapeResult.stats,
      ai: aiStats,
      savedCount,
    };

    if (matchedJobs.length > 0) {
      const summary = formatRunSummary({
        stats: aiStats,
        matchedJobs: matchedJobs.map((j) => ({
          role: j.role,
          level: j.level,
          isFreelance: j.isFreelance,
          postUrl: j.postUrl,
          posterName: j.posterName,
          score: j.score,
        })),
        dashboardUrl: process.env["DASHBOARD_URL"],
      });
      await this.notify(summary);
    } else {
      await this.notify(runCompleteNoMatchesAlert(aiStats));
    }

    // ── 8. Log stats ──
    console.log("[PipelineRunner] Run complete:", {
      groups: `${scrapeResult.stats.groupsSucceeded}/${scrapeResult.stats.groupsAttempted}`,
      scraped: scrapeResult.stats.totalScraped,
      newPosts: scrapeResult.stats.totalNew,
      aiProcessed: aiStats.processed,
      matched: aiStats.matched,
      skipped: aiStats.skipped,
      apiCalls: aiStats.apiCallsUsed,
      saved: savedCount,
    });

    return {
      stats: runStats,
      matchedCount: matchedJobs.length,
      sessionExpired: false,
    };
  }

  /** Run with a timeout guard. Clears the timer on completion. */
  async runWithTimeout(
    source: RunSource = "manual",
    timeoutMs: number = RUN_TIMEOUT_MS,
    windowOverride?: ScrapeWindowOverride,
    runId?: string,
  ): Promise<PipelineRunResult> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        if (runId) {
          scraperState.requestCancel(runId);
        }
        reject(new Error("Pipeline run timed out"));
      }, timeoutMs);
    });

    try {
      return await Promise.race([
        this.run(source, windowOverride, runId),
        timeout,
      ]);
    } finally {
      clearTimeout(timer!);
    }
  }

  async runFilterOnly(
    source: RunSource = "manual",
    runId?: string,
  ): Promise<PipelineRunResult> {
    // ── 1. Load settings ──
    const settingsRow = await this.prisma.settings.findUnique({
      where: { id: 1 },
    });
    if (!settingsRow) throw new Error("Settings not configured");
    const settings = parseSettingsRow(settingsRow);
    const geminiApiKey = process.env["GEMINI_API_KEY"];
    if (!geminiApiKey)
      throw new Error("GEMINI_API_KEY environment variable not set");

    const roleKeywords = settings.role_keywords;
    const allKeywords = new Set(settings.target_keywords);
    for (const role of settings.allowed_roles) {
      const keywords = roleKeywords[role];
      if (keywords) {
        for (const kw of keywords) allKeywords.add(kw);
      }
    }

    const pipelineConfig: PipelineConfig = {
      filterCriteria: {
        allowedRoles: settings.allowed_roles as Role[],
        allowedLevels: settings.allowed_levels as Level[],
        maxYoe: settings.max_yoe,
        roleExclusionKeywords: settings.role_exclusion_keywords,
      },
      keywords: [...allKeywords],
      blacklist: settings.blacklist,
      excludedLocations: settings.excluded_locations,
      roleKeywords: settings.role_keywords,
      roleExclusionKeywords: settings.role_exclusion_keywords,
      commonRules: settings.common_rules,
      roleRules: settings.role_rules,
    };

    this.throwIfCancelled(runId);

    // ── 2. Query Raw Posts ──
    const latestRow = await this.prisma.rawPost.findFirst({
      select: { scrape_date: true },
      where: {
        scrape_date: {
          not: "",
        },
      },
      orderBy: { scrape_date: "desc" },
    });
    const latestScrapeDate = latestRow?.scrape_date ?? null;
    const rawPostsDb = latestScrapeDate
      ? await this.prisma.rawPost.findMany({
          where: { scrape_date: latestScrapeDate },
        })
      : [];
    console.log(
      `[PipelineRunner] Found ${rawPostsDb.length} raw posts for filter-only run (latest scrape_date only).`,
    );

    let scrapeStats: ScrapeRunStats = {
      groupsAttempted: 0,
      groupsSucceeded: 0,
      groupsFailed: 0,
      totalScraped: rawPostsDb.length,
      totalNew: rawPostsDb.length,
      errors: [],
    };

    let aiStats: PipelineStats = {
      total: 0,
      processed: 0,
      matched: 0,
      skipped: 0,
      apiCallsUsed: 0,
    };
    let matchedJobs: MatchedJob[] = [];
    let savedCount = 0;

    if (rawPostsDb.length > 0) {
      this.throwIfCancelled(runId);
      // Map to expected format
      const postsToFilter = rawPostsDb.map((p) => ({
        fbPostId: p.fb_post_id ?? undefined,
        content: p.content,
        postUrl: p.post_url,
        posterName: p.poster_name,
        posterProfileUrl: p.poster_url,
        postUrlHash: p.post_url_hash,
        contentHash: p.content_hash,
        groupUrl: p.group_url,
        createdTimeRaw: p.created_time_raw,
        createdTimeUtc: p.created_time_utc ?? undefined,
        firstSeenAt: p.first_seen_at,
      }));

      // ── 3. AI Filter ──
      console.log(
        `[PipelineRunner] Starting AI filtering for ${postsToFilter.length} posts (filter-only)...`,
      );
      const geminiClient = new GeminiClient({ apiKey: geminiApiKey });
      const aiPipeline = new AIFilterPipeline(geminiClient);
      const aiResult = await aiPipeline.run(postsToFilter, pipelineConfig);
      this.throwIfCancelled(runId);
      aiStats = aiResult.stats;
      matchedJobs = aiResult.matchedJobs;
      console.log(
        `[PipelineRunner] AI filtering complete (filter-only): processed=${aiStats.processed}, matched=${aiStats.matched}, skipped=${aiStats.skipped}, apiCalls=${aiStats.apiCallsUsed}`,
      );

      // ── 3b. Update raw posts with AI classification results ──
      if (aiResult.classifiedPosts.length > 0) {
        const rawPostIdByHash = new Map(
          rawPostsDb.map((rawPost) => [rawPost.post_url_hash, rawPost.id]),
        );

        let updatedCount = 0;
        for (const classified of aiResult.classifiedPosts) {
          this.throwIfCancelled(runId);
          const rawPostId = rawPostIdByHash.get(classified.postUrlHash);
          if (!rawPostId) continue;

          try {
            await this.prisma.rawPost.update({
              where: { id: rawPostId },
              data: {
                filter_role: classified.role,
                filter_level: classified.level,
                filter_yoe: classified.yoe,
                filter_score: classified.score,
                filter_reason: classified.reason,
                rejection_reason: classified.rejectionReason,
              },
            });
            updatedCount++;
          } catch (error) {
            console.warn(
              `[PipelineRunner] Failed to update raw post ${rawPostId}: ${error}`,
            );
          }
        }
        console.log(
          `[PipelineRunner] Updated ${updatedCount} raw posts with AI classification results (filter-only)`,
        );
      }

      // ── 4. Save matched jobs to DB ──
      if (matchedJobs.length > 0) {
        const jobData = matchedJobs.map((job) => ({
          fb_post_id: job.fbPostId ?? null,
          content: job.content,
          post_url: job.postUrl,
          poster_name: job.posterName,
          poster_url: job.posterProfileUrl,
          post_url_hash: job.postUrlHash,
          content_hash: job.contentHash,
          role: job.role,
          level: job.level,
          yoe: job.yoe,
          score: job.score,
          reason: job.reason,
          is_freelance: job.isFreelance,
          status: "new" as const,
          source,
          created_time_raw: job.createdTimeRaw,
          created_time_utc: job.createdTimeUtc ?? null,
          first_seen_at: job.firstSeenAt,
        }));

        savedCount = await this.prisma.$transaction(async (tx) => {
          let count = 0;
          for (const data of jobData) {
            this.throwIfCancelled(runId);
            try {
              await tx.job.create({ data });
              count++;
            } catch (error: unknown) {
              if (isUniqueConstraintError(error)) {
                continue;
              }
              throw error;
            }
          }
          return count;
        });

        const skipped = matchedJobs.length - savedCount;
        if (skipped > 0) {
          console.log(`[PipelineRunner] ${skipped} duplicate jobs skipped`);
        }
      }

      // Raw posts are kept for the Raw Posts dashboard (no cleanup step)
    }

    const runStats: PipelineRunStats = {
      scrape: scrapeStats,
      ai: aiStats,
      savedCount,
    };

    if (matchedJobs.length > 0) {
      const summary = formatRunSummary({
        stats: aiStats,
        matchedJobs: matchedJobs.map((j) => ({
          role: j.role,
          level: j.level,
          isFreelance: j.isFreelance,
          postUrl: j.postUrl,
          posterName: j.posterName,
          score: j.score,
        })),
        dashboardUrl: process.env["DASHBOARD_URL"],
      });
      await this.notify(summary);
    } else {
      await this.notify(runCompleteNoMatchesAlert(aiStats));
    }

    console.log("[PipelineRunner] Filter-Only Run complete:", {
      aiProcessed: aiStats.processed,
      matched: aiStats.matched,
      skipped: aiStats.skipped,
      apiCalls: aiStats.apiCallsUsed,
      saved: savedCount,
    });

    return {
      stats: runStats,
      matchedCount: matchedJobs.length,
      sessionExpired: false,
    };
  }

  async runFilterOnlyWithTimeout(
    source: RunSource = "manual",
    timeoutMs: number = RUN_TIMEOUT_MS,
    runId?: string,
  ): Promise<PipelineRunResult> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        if (runId) {
          scraperState.requestCancel(runId);
        }
        reject(new Error("Pipeline run timed out"));
      }, timeoutMs);
    });

    try {
      return await Promise.race([this.runFilterOnly(source, runId), timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private throwIfCancelled(runId?: string): void {
    if (!runId) return;
    if (scraperState.isCancelRequested(runId)) {
      throw new Error("Run cancelled by user");
    }
  }

  private async notify(message: string): Promise<void> {
    if (this.notifier) {
      await this.notifier.sendMessage(message);
    }
  }
}
