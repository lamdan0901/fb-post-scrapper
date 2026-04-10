import type {
  ClassificationResult,
  FilterCriteria,
  RawPost,
  RoleKeywords,
  RoleRules,
  RoleExclusionKeywords,
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
  roleExclusionKeywords?: RoleExclusionKeywords;
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
  /** All posts that went through AI classification (for tracking rejection reasons). */
  classifiedPosts: ClassifiedPost[];
  stats: PipelineStats;
}

/** A post that was classified by AI (whether matched or rejected). */
export interface ClassifiedPost extends PipelineInput {
  /** Role classified by AI. */
  role: ClassificationResult["role"];
  /** Level classified by AI. */
  level: ClassificationResult["level"];
  /** Years of experience extracted. */
  yoe: number | null;
  /** Relevance score from AI (0-100). */
  score: number;
  /** AI's reasoning for classification. */
  reason: string;
  /** Whether this post is freelance. */
  isFreelance: boolean;
  /** Whether this post matched the filter criteria. */
  matched: boolean;
  /** Why this post was rejected (null if matched). */
  rejectionReason: string | null;
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
    let carriedApiCalls = 0;

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
    const classifiedPosts: ClassifiedPost[] = [];

    for (const post of posts) {
      const normalized = preprocessor.normalize(post.content);
      const preResult = preFilter.evaluate(normalized);
      if (!preResult.shouldCallAI) {
        stats.skipped++;
        stats.processed++;
        // Track pre-filter rejections too
        classifiedPosts.push({
          ...post,
          role: "Other",
          level: "Unknown",
          yoe: null,
          score: 0,
          reason: `Pre-filter: ${preResult.skipReason}`,
          isFreelance: false,
          matched: false,
          rejectionReason: preResult.skipReason ?? null,
        });
        continue;
      }
      candidates.push({ post, normalized });
    }

    // Phase 2: Process candidates in batches
    const batchSize = this.geminiClient.batchSize;
    const batchRetryDelayMs = 2_000;

    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const postContents = batch.map((c) => c.normalized);

      let results: (ClassificationResult & { postIndex: number })[] = [];
      while (true) {
        try {
          results = await this.geminiClient.classifyBatch(
            postContents,
            config.filterCriteria,
            { commonRules: config.commonRules, roleRules: config.roleRules },
          );
          break;
        } catch (error) {
          if (error instanceof GeminiCallBudgetExhaustedError) {
            carriedApiCalls += this.geminiClient.callsUsed;
            this.geminiClient.resetCallCount();
            console.warn(
              `[AIFilterPipeline] Batch ${Math.floor(i / batchSize) + 1}: Gemini call budget exhausted. Resetting budget and retrying...`,
            );
            continue;
          }

          const reason =
            error instanceof GeminiClassificationError
              ? error.message
              : error instanceof Error
                ? error.message
                : String(error);
          console.warn(
            `[AIFilterPipeline] Batch ${Math.floor(i / batchSize) + 1} failed: ${reason}. Retrying in ${Math.ceil(batchRetryDelayMs / 1000)}s...`,
          );
          await new Promise((resolve) => setTimeout(resolve, batchRetryDelayMs));
        }
      }

      // Map results back to posts by postIndex
      const resultsByIndex = new Map(results.map((r) => [r.postIndex, r]));

      for (let j = 0; j < batch.length; j++) {
        stats.processed++;
        const result = resultsByIndex.get(j);
        if (!result) {
          // Post not in results (model omitted it) — skip
          stats.skipped++;
          classifiedPosts.push({
            ...batch[j]!.post,
            role: "Other",
            level: "Unknown",
            yoe: null,
            score: 0,
            reason: "AI did not return classification for this post",
            isFreelance: false,
            matched: false,
            rejectionReason: "AI classification failed",
          });
          continue;
        }

        const matchResult = this.isMatch(result, config.filterCriteria, config.roleExclusionKeywords, batch[j]!.normalized);
        
        // Add to classified posts regardless of match
        classifiedPosts.push({
          ...batch[j]!.post,
          role: result.role,
          level: result.level,
          yoe: result.yoe,
          score: result.score,
          reason: result.reason,
          isFreelance: result.isFreelance,
          matched: matchResult.matched,
          rejectionReason: matchResult.rejectionReason,
        });

        if (matchResult.matched) {
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

    stats.apiCallsUsed = carriedApiCalls + this.geminiClient.callsUsed;
    return { matchedJobs, classifiedPosts, stats };
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
   * 5. Role exclusion keywords: if post contains exclusion keywords for its classified role, reject
   *
   * Returns: { matched: boolean, rejectionReason: string | null }
   */
  private isMatch(
    result: ClassificationResult,
    criteria: FilterCriteria,
    roleExclusionKeywords: RoleExclusionKeywords | undefined,
    normalizedContent: string,
  ): { matched: boolean; rejectionReason: string | null } {
    // Role must match (no bypass for freelance — strict filtering applies to all job types)
    if (!criteria.allowedRoles.includes(result.role)) {
      return { 
        matched: false, 
        rejectionReason: `Role "${result.role}" not in allowed roles: ${criteria.allowedRoles.join(", ")}` 
      };
    }

    // Hard exclusion check: if the post contains exclusion keywords for this role, reject
    if (roleExclusionKeywords && result.role in roleExclusionKeywords) {
      const exclusionKeywords = roleExclusionKeywords[result.role] || [];
      const matchedExclusionKeyword = exclusionKeywords.find((kw) => {
        const pattern = new RegExp(`\\b${kw}\\b`, "i");
        return pattern.test(normalizedContent);
      });
      if (matchedExclusionKeyword) {
        return { 
          matched: false, 
          rejectionReason: `Contains exclusion keyword "${matchedExclusionKeyword}" for role "${result.role}"` 
        };
      }
    }

    // Unknown level → still match (missing data tolerance)
    if (
      result.level !== "Unknown" &&
      !criteria.allowedLevels.includes(result.level)
    ) {
      return { 
        matched: false, 
        rejectionReason: `Level "${result.level}" not in allowed levels: ${criteria.allowedLevels.join(", ")}` 
      };
    }

    // Null YOE → still match; otherwise enforce max
    if (result.yoe !== null && result.yoe > criteria.maxYoe) {
      return { 
        matched: false, 
        rejectionReason: `YOE ${result.yoe} exceeds maximum ${criteria.maxYoe}` 
      };
    }

    return { matched: true, rejectionReason: null };
  }
}
