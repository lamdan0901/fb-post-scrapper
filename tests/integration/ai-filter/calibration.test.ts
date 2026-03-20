/**
 * 9.3.1 — AI Calibration Test
 *
 * Runs the full AIFilterPipeline against the 38-post static fixture dataset
 * and verifies classification accuracy is ≥ 95%.
 *
 * Requires: GEMINI_API_KEY environment variable to be set.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { AIFilterPipeline } from "../../../packages/ai-filter/src/pipeline.js";
import type {
  PipelineConfig,
  PipelineInput,
  PipelineResult,
} from "../../../packages/ai-filter/src/pipeline.js";
import { GeminiClient } from "../../../packages/ai-filter/src/gemini-client.js";
import type { FilterCriteria } from "../../../shared/types.js";
import { Role, Level } from "../../../shared/types.js";

// ── Fail fast if API key is absent ──
const GEMINI_API_KEY = process.env["GEMINI_API_KEY"];
if (!GEMINI_API_KEY) {
  throw new Error(
    "GEMINI_API_KEY environment variable is required for the AI calibration test (9.3.1). " +
      "Set it in your .env file or pass it as an environment variable.",
  );
}

// ── Fixture types ──
interface FixtureSettings {
  blacklist: string[];
  keywords: string[];
  max_yoe: number;
  allowed_levels: string[];
  allowed_roles: string[];
}

interface FixturePost {
  id: string;
  category: string | string[];
  content: string;
  post_url: string;
  poster_name: string;
  poster_url: string;
  created_time_raw: string;
  expected: {
    is_match: boolean;
    is_freelance: boolean;
    role: string;
    level: string;
    yoe: number | null;
    reason: string;
  };
}

interface Fixture {
  settings: FixtureSettings;
  posts: FixturePost[];
}

// ── Helpers ──
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function extractGroupUrl(postUrl: string): string {
  const match = /^(https:\/\/www\.facebook\.com\/groups\/[^/]+)/.exec(postUrl);
  return match?.[1] ?? "https://www.facebook.com/groups/test";
}

function toCategories(raw: string | string[]): string[] {
  return Array.isArray(raw) ? raw : [raw];
}

// ── Test suite ──
describe("AI Calibration (9.3.1) — ≥95% accuracy on 38-post fixture dataset", () => {
  const fixturePath = resolve(__dirname, "../../fixtures/test_jobs.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf-8")) as Fixture;
  const { posts } = fixture;

  // NOTE: The fixture settings include all roles, but the expected outcomes
  // for "wrong_role" category posts are based on a tighter filter that only
  // allows Frontend, Fullstack, and Mobile roles (matching the expected.reason
  // comments throughout the fixture). We use those narrower criteria here.
  const filterCriteria: FilterCriteria = {
    allowedRoles: [Role.Frontend, Role.Fullstack, Role.Mobile],
    allowedLevels: [Level.Fresher, Level.Junior, Level.Middle, Level.Unknown],
    maxYoe: fixture.settings.max_yoe,
  };

  const config: PipelineConfig = {
    filterCriteria,
    keywords: fixture.settings.keywords,
    blacklist: fixture.settings.blacklist,
  };

  // Convert fixture posts to PipelineInput (RawPost + hashes)
  const pipelineInputs: PipelineInput[] = posts.map((p) => ({
    fbPostId: undefined,
    content: p.content,
    postUrl: p.post_url,
    posterName: p.poster_name,
    posterProfileUrl: p.poster_url,
    createdTimeRaw: p.created_time_raw,
    firstSeenAt: new Date(),
    groupUrl: extractGroupUrl(p.post_url),
    postUrlHash: sha256(p.post_url.toLowerCase().trim()),
    contentHash: sha256(p.content.toLowerCase().replace(/\s+/g, " ").trim()),
  }));

  let pipelineResult: PipelineResult;

  beforeAll(async () => {
    const client = new GeminiClient({
      apiKey: GEMINI_API_KEY!,
      maxCallsPerRun: 60,
    });
    const pipeline = new AIFilterPipeline(client);
    pipelineResult = await pipeline.run(pipelineInputs, config);
  }, 180_000); // 3-minute timeout for 38 posts × Gemini latency

  it("processes all posts without throwing", () => {
    expect(pipelineResult).toBeDefined();
    expect(pipelineResult.stats.total).toBe(posts.length);
  });

  it("achieves ≥95% classification accuracy against expected outcomes", () => {
    const matchedUrls = new Set(
      pipelineResult.matchedJobs.map((j) => j.postUrl),
    );

    const evaluations = posts.map((post) => ({
      id: post.id,
      categories: toCategories(post.category),
      expectedMatch: post.expected.is_match,
      predictedMatch: matchedUrls.has(post.post_url),
    }));

    const correct = evaluations.filter(
      (e) => e.predictedMatch === e.expectedMatch,
    ).length;

    const incorrect = evaluations.filter(
      (e) => e.predictedMatch !== e.expectedMatch,
    );
    const accuracy = correct / posts.length;

    // Log breakdown for debugging on failure
    if (incorrect.length > 0) {
      console.log("\n── Misclassified posts ──");
      for (const e of incorrect) {
        const post = posts.find((p) => p.id === e.id)!;
        console.log(
          `  [${e.id}] categories=${e.categories.join("/")} ` +
            `expected=${e.expectedMatch} predicted=${e.predictedMatch}\n` +
            `  content: ${post.content.slice(0, 80)}...\n` +
            `  reason: ${post.expected.reason}`,
        );
      }
      console.log(
        `\n  Accuracy: ${correct}/${posts.length} = ${(accuracy * 100).toFixed(1)}%`,
      );
    }

    expect(
      accuracy,
      `Accuracy ${(accuracy * 100).toFixed(1)}% (${correct}/${posts.length}) is below the required 95% threshold. ` +
        `${incorrect.length} posts misclassified.`,
    ).toBeGreaterThanOrEqual(0.95);
  });

  it("reports sensible pipeline stats", () => {
    const { stats } = pipelineResult;
    expect(stats.total).toBe(posts.length);
    expect(
      stats.matched + stats.skipped + (stats.total - stats.processed),
    ).toBe(stats.total);
    expect(stats.apiCallsUsed).toBeGreaterThan(0);
    expect(stats.apiCallsUsed).toBeLessThanOrEqual(60);
  });
});
