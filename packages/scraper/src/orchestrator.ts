import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import type { RawPost } from "@job-alert/shared";
import { CookieManager } from "./cookie-manager.js";
import { Deduplicator, type DeduplicationStore } from "./deduplicator.js";
import { SessionExpiredError } from "./errors.js";
import { GroupScraper, type ScrapeGroupOptions } from "./group-scraper.js";
import {
  getBrowserLaunchOptions,
  getContextOptions,
  randomDelay,
} from "./human-behavior.js";

// ── Configuration ──

export interface ScraperConfig {
  /** Facebook group URLs to scrape. */
  targetGroups: string[];
  /** Path to Netscape .txt cookie file. */
  cookiePath: string;
  /** Max posts to collect per group (default 50). */
  maxPostsPerGroup?: number;
  /** Max groups to process per run (default 10). */
  maxGroups?: number;
  /** Max total posts across all groups per run (default 50). */
  maxTotalPosts?: number;
  /** Max duration of a scrape run in milliseconds (default 10 minutes). */
  maxRunDurationMs?: number;
  /** Stop scraping a group when posts are older than this date. */
  lookbackCutoff?: Date;
}

// ── Dependencies ──

export interface OrchestratorDeps {
  /** DB-backed store for deduplication lookups. */
  deduplicationStore: DeduplicationStore;
  /** Optional callback to send alert messages (e.g. Telegram). */
  alertFn?: (message: string) => Promise<void>;
}

// ── Result ──

export interface ScrapeGroupError {
  group: string;
  error: string;
}

export interface ScrapeRunStats {
  groupsAttempted: number;
  groupsSucceeded: number;
  groupsFailed: number;
  totalScraped: number;
  totalNew: number;
  errors: ScrapeGroupError[];
}

export interface ScrapeRunResult {
  newPosts: Array<RawPost & { postUrlHash: string; contentHash: string }>;
  stats: ScrapeRunStats;
  sessionExpired: boolean;
}

// ── Defaults ──

const DEFAULT_MAX_POSTS_PER_GROUP = 50;
const DEFAULT_MAX_GROUPS = 10;
const DEFAULT_MAX_TOTAL_POSTS = 50;
const RETRY_DELAY_MS = 5_000;
const DEFAULT_MAX_RUN_DURATION_MS = 10 * 60 * 1_000; // 10 minutes

// ── Orchestrator ──

export class ScraperOrchestrator {
  private readonly deduplicator: Deduplicator;
  private readonly alertFn: (message: string) => Promise<void>;

  constructor(deps: OrchestratorDeps) {
    this.deduplicator = new Deduplicator(deps.deduplicationStore);
    // Default alertFn is a no-op if not provided.
    this.alertFn = deps.alertFn ?? (async () => {});
  }

  /**
   * Execute a full scrape run: launch browser, authenticate, scrape each
   * target group, deduplicate, and return new posts.
   */
  async run(config: ScraperConfig): Promise<ScrapeRunResult> {
    const maxPostsPerGroup =
      config.maxPostsPerGroup ?? DEFAULT_MAX_POSTS_PER_GROUP;
    const maxGroups = config.maxGroups ?? DEFAULT_MAX_GROUPS;
    const maxTotalPosts = config.maxTotalPosts ?? DEFAULT_MAX_TOTAL_POSTS;

    const groups = config.targetGroups.slice(0, maxGroups);

    const stats: ScrapeRunStats = {
      groupsAttempted: groups.length,
      groupsSucceeded: 0,
      groupsFailed: 0,
      totalScraped: 0,
      totalNew: 0,
      errors: [],
    };

    const allNewPosts: ScrapeRunResult["newPosts"] = [];

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      // ── Launch browser & authenticate ──
      browser = await chromium.launch(getBrowserLaunchOptions());
      context = await browser.newContext(getContextOptions());

      const cookieManager = new CookieManager();
      await cookieManager.loadCookies(config.cookiePath);
      await cookieManager.applyCookies(context);

      // Validate session with a temporary page
      const validationPage = await context.newPage();
      try {
        await cookieManager.validateSession(validationPage);
      } catch (err) {
        if (err instanceof SessionExpiredError) {
          await this.alertFn(
            "⚠️ Facebook session expired. Please re-upload cookies.",
          );
          return { newPosts: [], stats, sessionExpired: true };
        }
        throw err;
      } finally {
        await validationPage.close();
      }

      // ── Scrape groups ──
      const startTime = Date.now();
      const maxRunDurationMs =
        config.maxRunDurationMs ?? DEFAULT_MAX_RUN_DURATION_MS;

      for (const groupUrl of groups) {
        if (Date.now() - startTime > maxRunDurationMs) {
          await this.alertFn("⚠️ Scrape run timed out — stopping early.");
          break;
        }
        if (allNewPosts.length >= maxTotalPosts) break;

        const remainingBudget = maxTotalPosts - allNewPosts.length;
        const postsToFetch = Math.min(maxPostsPerGroup, remainingBudget);

        // Each group gets its own page to isolate state (CAPTCHAs, redirects)
        const page = await context.newPage();
        try {
          const scrapeOptions: ScrapeGroupOptions = {
            lookbackCutoff: config.lookbackCutoff,
          };
          const rawPosts = await this.scrapeGroupWithRetry(
            page,
            groupUrl,
            postsToFetch,
            scrapeOptions,
          );

          stats.totalScraped += rawPosts.length;

          // DOM change / empty group detection
          if (rawPosts.length === 0) {
            await this.alertFn(
              `⚠️ No posts found in group: ${groupUrl}. Possible DOM change or empty group.`,
            );
          }

          // Deduplicate against DB
          const newPosts = await this.deduplicator.filterNew(rawPosts);
          allNewPosts.push(...newPosts);
          stats.totalNew += newPosts.length;
          stats.groupsSucceeded++;
        } catch (err) {
          if (err instanceof SessionExpiredError) {
            await this.alertFn(
              "⚠️ Facebook session expired during scraping. Please re-upload cookies.",
            );
            return {
              newPosts: allNewPosts,
              stats,
              sessionExpired: true,
            };
          }

          const errorMessage = err instanceof Error ? err.message : String(err);
          stats.groupsFailed++;
          stats.errors.push({ group: groupUrl, error: errorMessage });

          await this.alertFn(
            `⚠️ Scraper failed for group ${groupUrl}: ${errorMessage}`,
          );
        } finally {
          await page.close();
        }
      }

      return { newPosts: allNewPosts, stats, sessionExpired: false };
    } finally {
      await context?.close();
      await browser?.close();
    }
  }

  /**
   * Attempt to scrape a group, retrying once on failure.
   * Re-throws `SessionExpiredError` immediately (no retry).
   */
  private async scrapeGroupWithRetry(
    page: Page,
    groupUrl: string,
    maxPosts: number,
    options?: ScrapeGroupOptions,
  ): Promise<RawPost[]> {
    const scraper = new GroupScraper(page);

    try {
      return await scraper.scrapeGroup(groupUrl, maxPosts, options);
    } catch (firstError) {
      // Never retry on session expiry — surface immediately.
      if (firstError instanceof SessionExpiredError) throw firstError;

      // Wait before retrying.
      await randomDelay(RETRY_DELAY_MS, RETRY_DELAY_MS + 2_000);

      // Second attempt — let errors propagate to caller.
      return await scraper.scrapeGroup(groupUrl, maxPosts, options);
    }
  }
}
