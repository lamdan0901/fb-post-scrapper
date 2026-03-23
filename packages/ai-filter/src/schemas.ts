import { z } from "zod";
import type { ClassificationResult } from "@job-alert/shared";

// ── Zod schema for Gemini JSON response (snake_case) ──

export const ClassificationResultSchema = z.object({
  is_match: z.boolean(),
  is_freelance: z.boolean(),
  role: z.enum(["Frontend", "Backend", "Fullstack", "Mobile", "Other"]),
  level: z.enum(["Fresher", "Junior", "Middle", "Senior", "Unknown"]),
  yoe: z
    .number()
    .min(0)
    .nullable()
    .transform((v) => (v !== null ? Math.round(v) : null)),
  score: z
    .number()
    .min(0)
    .max(100)
    .transform((v) => Math.round(v)),
  reason: z.string(),
});

export type ClassificationResultRaw = z.infer<
  typeof ClassificationResultSchema
>;

/**
 * Validate raw Gemini JSON output and transform snake_case → camelCase
 * to match the shared `ClassificationResult` interface.
 *
 * @throws {z.ZodError} if validation fails
 */
export function parseClassificationResult(json: unknown): ClassificationResult {
  const raw = ClassificationResultSchema.parse(json);
  return {
    isMatch: raw.is_match,
    isFreelance: raw.is_freelance,
    role: raw.role,
    level: raw.level,
    yoe: raw.yoe,
    score: raw.score,
    reason: raw.reason,
  };
}

// ── Batch schema for multi-post classification ──

export const BatchClassificationResultSchema = z.object({
  results: z.array(
    ClassificationResultSchema.extend({
      post_index: z.number().int().min(0),
    }),
  ),
});

/**
 * Validate a batch Gemini JSON response and transform to camelCase results.
 * Each entry includes a `postIndex` to map back to the original post array.
 *
 * @throws {z.ZodError} if validation fails
 */
export function parseBatchClassificationResult(
  json: unknown,
): (ClassificationResult & { postIndex: number })[] {
  const raw = BatchClassificationResultSchema.parse(json);
  return raw.results.map((r) => ({
    isMatch: r.is_match,
    isFreelance: r.is_freelance,
    role: r.role,
    level: r.level,
    yoe: r.yoe,
    score: r.score,
    reason: r.reason,
    postIndex: r.post_index,
  }));
}
