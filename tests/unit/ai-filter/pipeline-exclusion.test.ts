import { describe, it, expect } from "vitest";
import { AIFilterPipeline } from "../../../packages/ai-filter/src/pipeline.js";
import type { ClassificationResult, FilterCriteria, RoleExclusionKeywords } from "@job-alert/shared";

// Mock GeminiClient for testing
class MockGeminiClient {
  batchSize = 5;
  remainingCalls = 100;
  callsUsed = 0;
  resetCallCount() {
    this.callsUsed = 0;
  }
  async classifyBatch() {
    return [];
  }
}

describe("AIFilterPipeline - Role Exclusion Keywords", () => {
  const createMockResult = (overrides: Partial<ClassificationResult> = {}): ClassificationResult => ({
    isMatch: true,
    isFreelance: false,
    role: "Frontend",
    level: "Middle",
    yoe: 3,
    score: 80,
    reason: "Test",
    ...overrides,
  });

  it("should reject post with exclusion keyword for Frontend role", () => {
    const pipeline = new AIFilterPipeline(new MockGeminiClient() as any);
    const criteria: FilterCriteria = {
      allowedRoles: ["Frontend"],
      allowedLevels: ["Middle"],
      maxYoe: 5,
      roleExclusionKeywords: {
        Frontend: ["angular", "vue", "svelte"],
      },
    };

    // Access private method via any cast for testing
    const isMatch = (pipeline as any).isMatch.bind(pipeline);

    const result = createMockResult({ role: "Frontend" });
    const content = "Looking for Angular developer with React experience";

    const matchResult = isMatch(result, criteria, criteria.roleExclusionKeywords, content);
    expect(matchResult.matched).toBe(false);
    expect(matchResult.rejectionReason).toContain("angular");
  });

  it("should accept post without exclusion keywords for Frontend role", () => {
    const pipeline = new AIFilterPipeline(new MockGeminiClient() as any);
    const criteria: FilterCriteria = {
      allowedRoles: ["Frontend"],
      allowedLevels: ["Middle"],
      maxYoe: 5,
      roleExclusionKeywords: {
        Frontend: ["angular", "vue", "svelte"],
      },
    };

    const isMatch = (pipeline as any).isMatch.bind(pipeline);

    const result = createMockResult({ role: "Frontend" });
    const content = "Looking for React/Next.js developer";

    const matchResult = isMatch(result, criteria, criteria.roleExclusionKeywords, content);
    expect(matchResult.matched).toBe(true);
    expect(matchResult.rejectionReason).toBeNull();
  });

  it("should accept post when no exclusion keywords configured", () => {
    const pipeline = new AIFilterPipeline(new MockGeminiClient() as any);
    const criteria: FilterCriteria = {
      allowedRoles: ["Frontend"],
      allowedLevels: ["Middle"],
      maxYoe: 5,
    };

    const isMatch = (pipeline as any).isMatch.bind(pipeline);

    const result = createMockResult({ role: "Frontend" });
    const content = "Looking for Angular developer";

    const matchResult = isMatch(result, criteria, undefined, content);
    expect(matchResult.matched).toBe(true);
    expect(matchResult.rejectionReason).toBeNull();
  });

  it("should reject post with Vue.js exclusion keyword", () => {
    const pipeline = new AIFilterPipeline(new MockGeminiClient() as any);
    const criteria: FilterCriteria = {
      allowedRoles: ["Frontend"],
      allowedLevels: ["Middle"],
      maxYoe: 5,
      roleExclusionKeywords: {
        Frontend: ["angular", "vue", "svelte"],
      },
    };

    const isMatch = (pipeline as any).isMatch.bind(pipeline);

    const result = createMockResult({ role: "Frontend" });
    const content = "Need Vue.js developer with frontend experience";

    const matchResult = isMatch(result, criteria, criteria.roleExclusionKeywords, content);
    expect(matchResult.matched).toBe(false);
    expect(matchResult.rejectionReason).toContain("vue");
  });

  it("should not apply exclusion keywords for different role", () => {
    const pipeline = new AIFilterPipeline(new MockGeminiClient() as any);
    const criteria: FilterCriteria = {
      allowedRoles: ["Backend"],
      allowedLevels: ["Middle"],
      maxYoe: 5,
      roleExclusionKeywords: {
        Frontend: ["angular", "vue", "svelte"],
      },
    };

    const isMatch = (pipeline as any).isMatch.bind(pipeline);

    const result = createMockResult({ role: "Backend" });
    const content = "Looking for backend developer with angular knowledge";

    // Should pass because exclusion keywords are for Frontend, not Backend
    const matchResult = isMatch(result, criteria, criteria.roleExclusionKeywords, content);
    expect(matchResult.matched).toBe(true);
    expect(matchResult.rejectionReason).toBeNull();
  });
});
