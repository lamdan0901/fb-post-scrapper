import { describe, it, expect } from "vitest";
import { ContentPreprocessor } from "../../../packages/ai-filter/src/preprocessor.js";
import { PreFilter } from "../../../packages/ai-filter/src/pre-filter.js";

function makePreFilter(keywords: string[], blacklist: string[]): PreFilter {
  const preprocessor = new ContentPreprocessor({ keywords, blacklist });
  return new PreFilter(preprocessor);
}

describe("PreFilter", () => {
  describe("blacklisted text", () => {
    it("returns shouldCallAI=false with reason 'Blacklisted company'", () => {
      const filter = makePreFilter(["React"], ["EvilCorp"]);
      const result = filter.evaluate("Hiring React developer at EvilCorp");
      expect(result.shouldCallAI).toBe(false);
      expect(result.skipReason).toBe("Blacklisted company");
    });

    it("case-insensitive blacklist match still returns false", () => {
      const filter = makePreFilter(["React"], ["evilcorp"]);
      const result = filter.evaluate("Job at EVILCORP");
      expect(result.shouldCallAI).toBe(false);
      expect(result.skipReason).toBe("Blacklisted company");
    });
  });

  describe("non-tech text (no matching keywords)", () => {
    it("returns shouldCallAI=false with reason 'Not tech-related'", () => {
      const filter = makePreFilter(["React", "Node"], []);
      const result = filter.evaluate("We are looking for a sales manager");
      expect(result.shouldCallAI).toBe(false);
      expect(result.skipReason).toBe("Not tech-related");
    });
  });

  describe("valid tech job post", () => {
    it("returns shouldCallAI=true without skipReason", () => {
      const filter = makePreFilter(["React"], []);
      const result = filter.evaluate(
        "Looking for a React developer with 2 years of experience",
      );
      expect(result.shouldCallAI).toBe(true);
      expect(result.skipReason).toBeUndefined();
    });

    it("empty keywords bypasses keyword check → shouldCallAI=true", () => {
      const filter = makePreFilter([], []);
      const result = filter.evaluate("Hire a chef for our restaurant");
      expect(result.shouldCallAI).toBe(true);
      expect(result.skipReason).toBeUndefined();
    });
  });

  describe("blacklist takes priority over keyword check", () => {
    it("blacklisted tech post → rejected as blacklisted (not 'not tech-related')", () => {
      const filter = makePreFilter(["React"], ["BadCo"]);
      // contains React keyword but also blacklisted company
      const result = filter.evaluate("React developer at BadCo");
      expect(result.shouldCallAI).toBe(false);
      expect(result.skipReason).toBe("Blacklisted company");
    });

    it("blacklisted non-tech post → rejected as blacklisted (not 'not tech-related')", () => {
      const filter = makePreFilter(["React"], ["BadCo"]);
      // no tech keywords but also blacklisted — blacklist wins
      const result = filter.evaluate("Sales job at BadCo");
      expect(result.shouldCallAI).toBe(false);
      expect(result.skipReason).toBe("Blacklisted company");
    });
  });
});
