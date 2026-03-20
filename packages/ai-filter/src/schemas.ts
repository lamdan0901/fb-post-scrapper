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
