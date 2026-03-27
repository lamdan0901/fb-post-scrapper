import { Router, type Router as RouterType } from "express";
import { prisma } from "../lib/db.js";
import { scraperState } from "../lib/scraper-state.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { parseSettingsRow } from "../lib/settings-helpers.js";
import { PipelineRunner } from "../lib/pipeline-runner.js";
import {
  scraperCancelLimiter,
  scraperLimiter,
} from "../middleware/rate-limit.js";
import { scheduler } from "../lib/scheduler.js";

// ── Async run execution (fire-and-forget) ──

async function executeRunFor(
  runId: string,
  source: "manual" | "cron" = "manual",
): Promise<void> {
  try {
    const runner = PipelineRunner.fromEnv(prisma);
    const result = await runner.runWithTimeout(source, undefined, runId);
    scraperState.completeRunFor(runId, result.stats);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown pipeline error";
    scraperState.failRunFor(runId, message);
  }
}

async function executeFilterOnlyFor(
  runId: string,
  source: "manual" | "cron" = "manual",
): Promise<void> {
  try {
    const runner = PipelineRunner.fromEnv(prisma);
    const result = await runner.runFilterOnlyWithTimeout(
      source,
      undefined,
      runId,
    );
    scraperState.completeRunFor(runId, result.stats);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown pipeline error";
    scraperState.failRunFor(runId, message);
  }
}

// ── Router ──

export const scraperRouter: RouterType = Router();

// POST /scraper/filter-only — trigger async filter only run
scraperRouter.post("/filter-only", scraperLimiter, async (_req, res) => {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    throw new NotFoundError("Settings not configured");
  }

  const runId = scraperState.tryStartRun("manual", "filter-only");
  if (!runId) {
    throw new ConflictError("A scrape run is already in progress");
  }

  // Fire-and-forget — do not await
  void executeFilterOnlyFor(runId, "manual");

  res.json({ runId, status: "running" });
});

// POST /scraper/run — trigger async scraping run (strict rate limit: 2/min)
scraperRouter.post("/run", scraperLimiter, async (_req, res) => {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    throw new NotFoundError("Settings not configured");
  }

  const parsed = parseSettingsRow(settings);
  if (parsed.target_groups.length === 0) {
    throw new ValidationError("No target groups configured");
  }

  const cookiePath = process.env["COOKIE_PATH"];
  if (!cookiePath) {
    throw new ValidationError("COOKIE_PATH environment variable not set");
  }

  const runId = scraperState.tryStartRun("manual", "scraper");
  if (!runId) {
    throw new ConflictError("A scrape run is already in progress");
  }

  // Fire-and-forget — do not await
  void executeRunFor(runId, "manual");

  res.json({ runId, status: "running" });
});

// POST /scraper/cancel — cancel the currently running scrape/filter run
scraperRouter.post("/cancel", scraperCancelLimiter, async (req, res) => {
  const runId =
    typeof req.body?.runId === "string" && req.body.runId.length > 0
      ? req.body.runId
      : undefined;

  const state = scraperState.requestCancel(runId);
  if (!state) {
    throw new ConflictError(
      runId
        ? "No matching running run found for cancellation"
        : "No scrape run is currently in progress",
    );
  }

  res.json(state);
});

// GET /scraper/status — return current/last run state
scraperRouter.get("/status", (_req, res) => {
  const state = scraperState.getState();
  if (!state) {
    res.json({ status: "idle" });
    return;
  }
  res.json(state);
});

// GET /scraper/run-times — return last completed run timestamps per source
scraperRouter.get("/run-times", (_req, res) => {
  res.json(scraperState.getRunTimes());
});

// ── Cron scheduler control ──

// GET /scraper/cron/status — return whether the cron job is active
scraperRouter.get("/cron/status", (_req, res) => {
  res.json({
    active: scheduler.isScheduled(),
    expression: scheduler.getExpression(),
  });
});

// POST /scraper/cron/start — start cron with the schedule from settings
scraperRouter.post("/cron/start", async (_req, res) => {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    throw new NotFoundError("Settings not configured");
  }

  const parsed = parseSettingsRow(settings);
  if (!parsed.cron_schedule) {
    throw new ValidationError("No cron schedule configured in settings");
  }

  scheduler.start(parsed.cron_schedule);
  res.json({ active: true, expression: parsed.cron_schedule });
});

// POST /scraper/cron/stop — stop the cron job
scraperRouter.post("/cron/stop", (_req, res) => {
  scheduler.stop();
  res.json({ active: false, expression: null });
});
