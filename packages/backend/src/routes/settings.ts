import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import type { Settings } from "@job-alert/generated-prisma";
import { prisma } from "../lib/db.js";
import { NotFoundError } from "../errors.js";

// ── Helpers ──

/**
 * Validate a 5-field cron expression structurally and by value range.
 * Fields: minute(0-59) hour(0-23) day(1-31) month(1-12) dow(0-6)
 */
function isValidCron(expr: string): boolean {
  const fieldPattern = /^(\*|[0-9,\-\/]+)$/;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const ranges = [
    [0, 59], // minute
    [0, 23], // hour
    [1, 31], // day of month
    [1, 12], // month
    [0, 6], // day of week
  ] as const;

  for (let i = 0; i < 5; i++) {
    const part = parts[i];
    if (!fieldPattern.test(part)) return false;
    if (part === "*") continue;

    // Extract all numeric values from the field (ignore / step)
    const nums = part
      .replace(/\/\d+$/, "")
      .split(/[,\-]/)
      .map(Number);
    const [min, max] = ranges[i];
    if (nums.some((n) => Number.isNaN(n) || n < min || n > max)) return false;
  }
  return true;
}

export function parseSettingsRow(row: Settings) {
  return {
    id: row.id,
    target_groups: JSON.parse(row.target_groups) as string[],
    target_keywords: JSON.parse(row.target_keywords) as string[],
    blacklist: JSON.parse(row.blacklist) as string[],
    max_yoe: row.max_yoe,
    cron_schedule: row.cron_schedule,
  };
}

// ── Zod Schemas ──

const updateSettingsSchema = z.object({
  target_groups: z
    .array(z.string().url("Each group must be a valid URL"))
    .min(1, "At least one target group is required"),
  target_keywords: z
    .array(z.string().trim().min(1, "Keyword must not be empty"))
    .min(1, "At least one keyword is required"),
  blacklist: z.array(
    z.string().trim().min(1, "Blacklist term must not be empty"),
  ),
  max_yoe: z.number().int().positive("max_yoe must be a positive integer"),
  cron_schedule: z
    .string()
    .trim()
    .refine(
      isValidCron,
      "Must be a valid 5-field cron expression with values in range",
    ),
});

// ── Router ──

export const settingsRouter: RouterType = Router();

// GET /settings — return current settings with JSON fields parsed
settingsRouter.get("/", async (_req, res) => {
  const row = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!row) {
    throw new NotFoundError("Settings not found");
  }
  res.json(parseSettingsRow(row));
});

// PUT /settings — validate and update settings
settingsRouter.put("/", async (req, res) => {
  const body = updateSettingsSchema.parse(req.body);

  const row = await prisma.settings.update({
    where: { id: 1 },
    data: {
      target_groups: JSON.stringify(body.target_groups),
      target_keywords: JSON.stringify(body.target_keywords),
      blacklist: JSON.stringify(body.blacklist),
      max_yoe: body.max_yoe,
      cron_schedule: body.cron_schedule,
    },
  });

  res.json(parseSettingsRow(row));
});
