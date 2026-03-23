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
import { parseSettingsRow } from "./settings-helpers.js";
import { createDeduplicationStore } from "./dedup-store.js";
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

  async run(source: RunSource = "manual"): Promise<PipelineRunResult> {
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
      },
      keywords: [...allKeywords],
      blacklist: settings.blacklist,
      roleKeywords: settings.role_keywords,
      commonRules: settings.common_rules,
      roleRules: settings.role_rules,
    };

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

    // ── 2b. Apply post-age filter ──
    const { scrape_lookback_hours, scrape_date_from, scrape_date_to } =
      settings;
    if (
      scrape_lookback_hours != null ||
      scrape_date_from != null ||
      scrape_date_to != null
    ) {
      const from =
        scrape_lookback_hours != null
          ? new Date(Date.now() - scrape_lookback_hours * 60 * 60 * 1000)
          : scrape_date_from != null
            ? new Date(scrape_date_from)
            : null;
      const to = scrape_date_to != null ? new Date(scrape_date_to) : null;

      scrapeResult.newPosts = scrapeResult.newPosts.filter((p) => {
        if (!p.createdTimeUtc) return true; // no timestamp — keep (benefit of the doubt)
        if (from && p.createdTimeUtc < from) return false;
        if (to && p.createdTimeUtc > to) return false;
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
    const rawPostIds: number[] = [];
    if (scrapeResult.newPosts.length > 0) {
      for (const post of scrapeResult.newPosts) {
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
              created_time_raw: post.createdTimeRaw,
              created_time_utc: post.createdTimeUtc ?? null,
              first_seen_at: post.firstSeenAt,
            },
          });
          rawPostIds.push(created.id);
        } catch (error: unknown) {
          if (
            error instanceof Error &&
            error.message.includes("UNIQUE constraint failed")
          ) {
            continue;
          }
          throw error;
        }
      }
      console.log(
        `[PipelineRunner] Saved ${rawPostIds.length} raw posts before AI filtering`,
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
      const geminiClient = new GeminiClient({ apiKey: geminiApiKey });
      const aiPipeline = new AIFilterPipeline(geminiClient);
      const aiResult = await aiPipeline.run(
        scrapeResult.newPosts,
        pipelineConfig,
      );

      aiStats = aiResult.stats;
      matchedJobs = aiResult.matchedJobs;
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
          try {
            await tx.job.create({ data });
            count++;
          } catch (error: unknown) {
            if (
              error instanceof Error &&
              error.message.includes("UNIQUE constraint failed")
            ) {
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

    // ── 6. Delete raw posts (processing complete) ──
    if (rawPostIds.length > 0) {
      await this.prisma.rawPost.deleteMany({
        where: { id: { in: rawPostIds } },
      });
      console.log(
        `[PipelineRunner] Cleaned up ${rawPostIds.length} raw posts after processing`,
      );
    }

    // ── 7. Notify ──
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
  ): Promise<PipelineRunResult> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Pipeline run timed out")),
        timeoutMs,
      );
    });

    try {
      return await Promise.race([this.run(source), timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private async notify(message: string): Promise<void> {
    if (this.notifier) {
      await this.notifier.sendMessage(message);
    }
  }
}
