import { Router, type Router as RouterType } from "express";
import { z } from "zod";
import { Role, Level } from "@job-alert/shared";
import { prisma } from "../lib/db.js";
import { NotFoundError } from "../errors.js";
import { parseSettingsRow } from "../lib/settings-helpers.js";
import { scheduler } from "../lib/scheduler.js";

export { parseSettingsRow } from "../lib/settings-helpers.js";

// ── Helpers ──

/**
 * Validate a 5-field cron expression structurally and by value range.
 * Fields: minute(0-59) hour(0-23) day(1-31) month(1-12) dow(0-6)
 */
function isValidCron(expr: string): boolean {
  // Allows: "*", "*/N" (step on wildcard), or numeric/list/range/step expressions.
  const fieldPattern = /^(\*|[0-9,\-\/]+|\*\/[0-9]+)$/;
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

    // Strip the /step suffix, then validate the base (list/range of values).
    // If the base is "*" (e.g. "*/4"), there are no concrete values to range-check.
    const base = part.replace(/\/\d+$/, "");
    if (base === "*") continue;
    const nums = base.split(/[,\-]/).map(Number);
    const [min, max] = ranges[i];
    if (nums.some((n) => Number.isNaN(n) || n < min || n > max)) return false;
  }
  return true;
}

const VALID_ROLES = Object.values(Role) as [string, ...string[]];
const VALID_LEVELS = Object.values(Level) as [string, ...string[]];

// Zod schema for role_keywords: Partial<Record<Role, string[]>>
const roleKeywordsSchema = z
  .record(z.string(), z.array(z.string().trim().min(1)))
  .default({})
  .refine((obj) => Object.keys(obj).every((k) => VALID_ROLES.includes(k)), {
    message: "role_keywords keys must be valid Role values",
  });

// Zod schema for role_rules: Partial<Record<Role, string>>
const roleRulesSchema = z
  .record(z.string(), z.string())
  .default({})
  .refine((obj) => Object.keys(obj).every((k) => VALID_ROLES.includes(k)), {
    message: "role_rules keys must be valid Role values",
  });

// ── Zod Schemas ──

export const updateSettingsSchema = z
  .object({
    target_groups: z
      .array(z.string().url("Each group must be a valid URL"))
      .min(1, "At least one target group is required"),
    target_keywords: z
      .array(z.string().trim().min(1, "Keyword must not be empty"))
      .min(1, "At least one keyword is required"),
    blacklist: z.array(
      z.string().trim().min(1, "Blacklist term must not be empty"),
    ),
    allowed_roles: z
      .array(z.enum(VALID_ROLES))
      .min(1, "At least one role is required"),
    allowed_levels: z
      .array(z.enum(VALID_LEVELS))
      .min(1, "At least one level is required"),
    role_keywords: roleKeywordsSchema,
    common_rules: z.string().default(""),
    role_rules: roleRulesSchema,
    max_yoe: z.number().int().positive("max_yoe must be a positive integer"),
    cron_schedule: z
      .string()
      .trim()
      .refine(
        isValidCron,
        "Must be a valid 5-field cron expression with values in range",
      ),
    scrape_lookback_hours: z
      .number()
      .int()
      .positive("Must be a positive integer")
      .nullable()
      .optional(),
    scrape_date_from: z
      .string()
      .datetime({ message: "Must be a valid ISO date" })
      .nullable()
      .optional(),
    scrape_date_to: z
      .string()
      .datetime({ message: "Must be a valid ISO date" })
      .nullable()
      .optional(),
    max_posts_per_group: z
      .number()
      .int()
      .min(1, "Must be at least 1")
      .max(200, "Must be at most 200"),
    excluded_locations: z
      .array(z.string().trim().min(1, "Location must not be empty"))
      .default([]),
  })
  .refine(
    (d) => {
      const hasLookback = d.scrape_lookback_hours != null;
      const hasRange = d.scrape_date_from != null || d.scrape_date_to != null;
      return !(hasLookback && hasRange);
    },
    {
      message:
        "Cannot set both a lookback window and a date range simultaneously",
    },
  );

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
      allowed_roles: JSON.stringify(body.allowed_roles),
      allowed_levels: JSON.stringify(body.allowed_levels),
      role_keywords: JSON.stringify(body.role_keywords),
      common_rules: body.common_rules,
      role_rules: JSON.stringify(body.role_rules),
      max_yoe: body.max_yoe,
      cron_schedule: body.cron_schedule,
      scrape_lookback_hours: body.scrape_lookback_hours ?? null,
      scrape_date_from: body.scrape_date_from ?? null,
      scrape_date_to: body.scrape_date_to ?? null,
      max_posts_per_group: body.max_posts_per_group,
      excluded_locations: JSON.stringify(body.excluded_locations),
    },
  });

  // If the cron schedule changed and the scheduler is active, restart it
  // with the new expression. If not active, leave it for manual control.
  if (
    scheduler.isScheduled() &&
    body.cron_schedule !== scheduler.getExpression()
  ) {
    scheduler.start(body.cron_schedule);
  }

  res.json(parseSettingsRow(row));
});
