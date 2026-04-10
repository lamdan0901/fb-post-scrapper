import { describe, it, expect } from "vitest";
import { AIFilterPipeline } from "../../../packages/ai-filter/src/pipeline.js";
import { GeminiCallBudgetExhaustedError, GeminiClassificationError } from "../../../packages/ai-filter/src/gemini-client.js";
import type { ClassificationResult } from "@job-alert/shared";

function makePost(index: number) {
  return {
    fbPostId: `fb-${index}`,
    content: `Need React dev ${index}`,
    postUrl: `https://example.com/post/${index}`,
    posterName: "Tester",
    posterProfileUrl: "https://example.com/u/tester",
    postUrlHash: `hash-${index}`,
    contentHash: `content-${index}`,
    groupUrl: "https://www.facebook.com/groups/test",
    createdTimeRaw: "1h",
    createdTimeUtc: new Date("2026-01-01T00:00:00.000Z"),
    firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function makeResult(postIndex: number): ClassificationResult & { postIndex: number } {
  return {
    postIndex,
    isMatch: true,
    isFreelance: false,
    role: "Frontend",
    level: "Junior",
    yoe: 2,
    score: 80,
    reason: "Match",
  };
}

describe("AIFilterPipeline reliability", () => {
  it("retries a failed batch instead of dropping posts", async () => {
    let calls = 0;
    const client = {
      batchSize: 2,
      remainingCalls: 100,
      callsUsed: 0,
      resetCallCount() {
        // no-op in this test
      },
      async classifyBatch() {
        calls++;
        if (calls === 1) {
          throw new GeminiClassificationError("transient parse error");
        }
        return [makeResult(0), makeResult(1)];
      },
    };

    const pipeline = new AIFilterPipeline(client as never);
    const posts = [makePost(1), makePost(2)];
    const result = await pipeline.run(posts, {
      filterCriteria: {
        allowedRoles: ["Frontend", "Backend", "Fullstack", "Mobile", "Other"],
        allowedLevels: ["Fresher", "Junior", "Middle", "Senior", "Unknown"],
        maxYoe: 5,
      },
      keywords: [],
      blacklist: [],
      roleKeywords: {},
      commonRules: "",
      roleRules: {},
    });

    expect(calls).toBe(2);
    expect(result.classifiedPosts).toHaveLength(2);
    expect(result.classifiedPosts.map((p) => p.postUrlHash)).toEqual([
      "hash-1",
      "hash-2",
    ]);
    expect(result.stats.processed).toBe(2);
  });

  it("continues after call-budget exhaustion until all posts are classified", async () => {
    let exhausted = true;
    let resetCount = 0;
    const client = {
      batchSize: 2,
      remainingCalls: 100,
      callsUsed: 0,
      resetCallCount() {
        resetCount++;
      },
      async classifyBatch() {
        if (exhausted) {
          exhausted = false;
          throw new GeminiCallBudgetExhaustedError(1);
        }
        return [makeResult(0), makeResult(1)];
      },
    };

    const pipeline = new AIFilterPipeline(client as never);
    const posts = [makePost(1), makePost(2)];
    const result = await pipeline.run(posts, {
      filterCriteria: {
        allowedRoles: ["Frontend", "Backend", "Fullstack", "Mobile", "Other"],
        allowedLevels: ["Fresher", "Junior", "Middle", "Senior", "Unknown"],
        maxYoe: 5,
      },
      keywords: [],
      blacklist: [],
      roleKeywords: {},
      commonRules: "",
      roleRules: {},
    });

    expect(resetCount).toBeGreaterThan(0);
    expect(result.classifiedPosts).toHaveLength(2);
    expect(result.stats.processed).toBe(2);
  });
});
