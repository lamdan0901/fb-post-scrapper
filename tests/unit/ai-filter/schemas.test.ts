import { describe, it, expect } from "vitest";
import {
  ClassificationResultSchema,
  parseClassificationResult,
} from "../../../packages/ai-filter/src/schemas.js";

const VALID_INPUT = {
  is_match: true,
  is_freelance: false,
  role: "Frontend",
  level: "Junior",
  yoe: 2,
  score: 80,
  reason: "Matches frontend role with 2 years of experience",
};

describe("ClassificationResultSchema", () => {
  describe("valid inputs", () => {
    it("parses a complete valid object without error", () => {
      expect(() => ClassificationResultSchema.parse(VALID_INPUT)).not.toThrow();
    });

    it("accepts yoe: null", () => {
      const result = ClassificationResultSchema.parse({
        ...VALID_INPUT,
        yoe: null,
      });
      expect(result.yoe).toBeNull();
    });

    it("rounds yoe to nearest integer", () => {
      const result = ClassificationResultSchema.parse({
        ...VALID_INPUT,
        yoe: 2.7,
      });
      expect(result.yoe).toBe(3);
    });

    it("rounds score to nearest integer", () => {
      const result = ClassificationResultSchema.parse({
        ...VALID_INPUT,
        score: 79.6,
      });
      expect(result.score).toBe(80);
    });

    it("accepts score of 0", () => {
      const result = ClassificationResultSchema.parse({
        ...VALID_INPUT,
        score: 0,
      });
      expect(result.score).toBe(0);
    });

    it("accepts score of 100", () => {
      const result = ClassificationResultSchema.parse({
        ...VALID_INPUT,
        score: 100,
      });
      expect(result.score).toBe(100);
    });

    it("accepts yoe: 0", () => {
      const result = ClassificationResultSchema.parse({
        ...VALID_INPUT,
        yoe: 0,
      });
      expect(result.yoe).toBe(0);
    });

    it("accepts all valid role enum values", () => {
      for (const role of [
        "Frontend",
        "Backend",
        "Fullstack",
        "Mobile",
        "Other",
      ]) {
        expect(() =>
          ClassificationResultSchema.parse({ ...VALID_INPUT, role }),
        ).not.toThrow();
      }
    });

    it("accepts all valid level enum values", () => {
      for (const level of [
        "Fresher",
        "Junior",
        "Middle",
        "Senior",
        "Unknown",
      ]) {
        expect(() =>
          ClassificationResultSchema.parse({ ...VALID_INPUT, level }),
        ).not.toThrow();
      }
    });
  });

  describe("invalid inputs", () => {
    it("throws when is_match is missing", () => {
      const { is_match: _omit, ...rest } = VALID_INPUT;
      expect(() => ClassificationResultSchema.parse(rest)).toThrow();
    });

    it("throws when role has an invalid enum value", () => {
      expect(() =>
        ClassificationResultSchema.parse({ ...VALID_INPUT, role: "DevOps" }),
      ).toThrow();
    });

    it("throws when level has an invalid enum value", () => {
      expect(() =>
        ClassificationResultSchema.parse({ ...VALID_INPUT, level: "Expert" }),
      ).toThrow();
    });

    it("throws when score > 100", () => {
      expect(() =>
        ClassificationResultSchema.parse({ ...VALID_INPUT, score: 101 }),
      ).toThrow();
    });

    it("throws when score < 0", () => {
      expect(() =>
        ClassificationResultSchema.parse({ ...VALID_INPUT, score: -1 }),
      ).toThrow();
    });

    it("throws when yoe < 0", () => {
      expect(() =>
        ClassificationResultSchema.parse({ ...VALID_INPUT, yoe: -1 }),
      ).toThrow();
    });

    it("throws when reason is missing", () => {
      const { reason: _omit, ...rest } = VALID_INPUT;
      expect(() => ClassificationResultSchema.parse(rest)).toThrow();
    });

    it("throws on completely empty object", () => {
      expect(() => ClassificationResultSchema.parse({})).toThrow();
    });
  });
});

describe("parseClassificationResult()", () => {
  it("maps is_match → isMatch", () => {
    const result = parseClassificationResult(VALID_INPUT);
    expect(result.isMatch).toBe(true);
  });

  it("maps is_freelance → isFreelance", () => {
    const result = parseClassificationResult({
      ...VALID_INPUT,
      is_freelance: true,
    });
    expect(result.isFreelance).toBe(true);
  });

  it("maps role correctly", () => {
    const result = parseClassificationResult(VALID_INPUT);
    expect(result.role).toBe("Frontend");
  });

  it("maps level correctly", () => {
    const result = parseClassificationResult(VALID_INPUT);
    expect(result.level).toBe("Junior");
  });

  it("maps yoe correctly", () => {
    const result = parseClassificationResult(VALID_INPUT);
    expect(result.yoe).toBe(2);
  });

  it("maps score correctly", () => {
    const result = parseClassificationResult(VALID_INPUT);
    expect(result.score).toBe(80);
  });

  it("maps reason correctly", () => {
    const result = parseClassificationResult(VALID_INPUT);
    expect(result.reason).toBe(
      "Matches frontend role with 2 years of experience",
    );
  });

  it("maps yoe: null correctly", () => {
    const result = parseClassificationResult({ ...VALID_INPUT, yoe: null });
    expect(result.yoe).toBeNull();
  });

  it("throws on invalid input (passes through schema validation)", () => {
    expect(() =>
      parseClassificationResult({ is_match: "not-a-bool" }),
    ).toThrow();
  });
});
