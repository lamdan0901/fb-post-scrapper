import type {
  ClassificationResult,
  FilterCriteria,
  RawPost,
} from "@job-alert/shared";
import {
  GeminiCallBudgetExhaustedError,
  GeminiClassificationError,
  type GeminiClient,
} from "./gemini-client.js";
import { PreFilter } from "./pre-filter.js";
import { ContentPreprocessor } from "./preprocessor.js";

// ── Types ──

/** Enriched post from the scraper (RawPost + deduplication hashes). */
export type PipelineInput = RawPost & {
  postUrlHash: string;
  contentHash: string;
};

/** Settings-derived configuration for the pipeline run. */
export interface PipelineConfig {
  filterCriteria: FilterCriteria;
  keywords: string[];
  blacklist: string[];
}

/** A post that passed all filters, enriched with classification data. */
export interface MatchedJob extends PipelineInput {
  role: ClassificationResult["role"];
  level: ClassificationResult["level"];
  yoe: number | null;
  score: number;
  reason: string;
  isFreelance: boolean;
}

/** Aggregate statistics for a pipeline run. */
export interface PipelineStats {
  total: number;
  processed: number;
  matched: number;
  skipped: number;
  apiCallsUsed: number;
}

/** Complete result returned by the pipeline. */
export interface PipelineResult {
  matchedJobs: MatchedJob[];
  stats: PipelineStats;
}

// ── Pipeline ──

export class AIFilterPipeline {
  constructor(private readonly geminiClient: GeminiClient) {}

  /**
   * Run the AI filter pipeline over an array of scraped posts.
   *
   * Flow per post: normalize → pre-filter → Gemini classify → match logic.
   * Stops gracefully when the API call budget is exhausted.
   */
  async run(
    posts: PipelineInput[],
    config: PipelineConfig,
  ): Promise<PipelineResult> {
    this.geminiClient.resetCallCount();

    const preprocessor = new ContentPreprocessor({
      keywords: config.keywords,
      blacklist: config.blacklist,
    });
    const preFilter = new PreFilter(preprocessor);

    const matchedJobs: MatchedJob[] = [];
    const stats: PipelineStats = {
      total: posts.length,
      processed: 0,
      matched: 0,
      skipped: 0,
      apiCallsUsed: 0,
    };

    for (const post of posts) {
      // Normalize content
      const normalized = preprocessor.normalize(post.content);

      // Pre-filter: skip obvious non-matches without an API call
      const preResult = preFilter.evaluate(normalized);
      if (!preResult.shouldCallAI) {
        stats.skipped++;
        stats.processed++;
        continue;
      }

      // Check API budget before calling Gemini
      if (this.geminiClient.remainingCalls <= 0) {
        break;
      }

      let result: ClassificationResult;
      try {
        result = await this.geminiClient.classify(
          normalized,
          config.filterCriteria,
        );
      } catch (error) {
        if (error instanceof GeminiCallBudgetExhaustedError) {
          break;
        }
        if (error instanceof GeminiClassificationError) {
          // Single post failed after retries — skip it, continue pipeline
          stats.skipped++;
          stats.processed++;
          continue;
        }
        throw error; // Unexpected errors bubble up
      }

      stats.processed++;

      // Matching logic
      if (this.isMatch(result, config.filterCriteria)) {
        matchedJobs.push({
          ...post,
          role: result.role,
          level: result.level,
          yoe: result.yoe,
          score: result.score,
          reason: result.reason,
          isFreelance: result.isFreelance,
        });
        stats.matched++;
      }
    }

    stats.apiCallsUsed = this.geminiClient.callsUsed;
    return { matchedJobs, stats };
  }

  /**
   * Determine whether a classified post should be accepted.
   *
   * NOTE: This intentionally ignores Gemini's `isMatch` field and applies
   * matching rules in code for deterministic, auditable decisions. Gemini
   * provides role/level/yoe extraction only.
   *
   * Rules:
   * 1. Role must be in allowedRoles (applies to freelance posts too)
   * 2. Level "Unknown" → accept if role matches (missing data tolerance)
   * 3. Level must be in allowedLevels
   * 4. YOE null → accept (missing data tolerance); otherwise YOE ≤ maxYoe
   */
  private isMatch(
    result: ClassificationResult,
    criteria: FilterCriteria,
  ): boolean {
    // Role must match (no bypass for freelance — strict filtering applies to all job types)
    if (!criteria.allowedRoles.includes(result.role)) {
      return false;
    }

    // Unknown level → still match (missing data tolerance)
    if (
      result.level !== "Unknown" &&
      !criteria.allowedLevels.includes(result.level)
    ) {
      return false;
    }

    // Null YOE → still match; otherwise enforce max
    if (result.yoe !== null && result.yoe > criteria.maxYoe) {
      return false;
    }

    return true;
  }
}
