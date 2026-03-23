import type {
  ClassificationResult,
  FilterCriteria,
  RawPost,
  RoleKeywords,
  RoleRules,
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
  excludedLocations?: string[];
  roleKeywords: RoleKeywords;
  commonRules: string;
  roleRules: RoleRules;
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
   * Flow: normalize → pre-filter → batch Gemini classify → match logic.
   * Posts are batched to reduce API calls. Stops gracefully when budget is exhausted.
   */
  async run(
    posts: PipelineInput[],
    config: PipelineConfig,
  ): Promise<PipelineResult> {
    this.geminiClient.resetCallCount();

    const preprocessor = new ContentPreprocessor({
      keywords: config.keywords,
      blacklist: config.blacklist,
      excludedLocations: config.excludedLocations ?? [],
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

    // Phase 1: Pre-filter all posts and collect candidates for Gemini
    const candidates: { post: PipelineInput; normalized: string }[] = [];

    for (const post of posts) {
      const normalized = preprocessor.normalize(post.content);
      const preResult = preFilter.evaluate(normalized);
      if (!preResult.shouldCallAI) {
        stats.skipped++;
        stats.processed++;
        continue;
      }
      candidates.push({ post, normalized });
    }

    // Phase 2: Process candidates in batches
    const batchSize = this.geminiClient.batchSize;

    for (let i = 0; i < candidates.length; i += batchSize) {
      if (this.geminiClient.remainingCalls <= 0) break;

      const batch = candidates.slice(i, i + batchSize);
      const postContents = batch.map((c) => c.normalized);

      let results: (ClassificationResult & { postIndex: number })[];
      try {
        results = await this.geminiClient.classifyBatch(
          postContents,
          config.filterCriteria,
          { commonRules: config.commonRules, roleRules: config.roleRules },
        );
      } catch (error) {
        if (error instanceof GeminiCallBudgetExhaustedError) {
          break;
        }
        if (error instanceof GeminiClassificationError) {
          // Entire batch failed — skip all posts in it
          stats.skipped += batch.length;
          stats.processed += batch.length;
          continue;
        }
        throw error;
      }

      // Map results back to posts by postIndex
      const resultsByIndex = new Map(results.map((r) => [r.postIndex, r]));

      for (let j = 0; j < batch.length; j++) {
        stats.processed++;
        const result = resultsByIndex.get(j);
        if (!result) {
          // Post not in results (model omitted it) — skip
          stats.skipped++;
          continue;
        }

        if (this.isMatch(result, config.filterCriteria)) {
          matchedJobs.push({
            ...batch[j]!.post,
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
