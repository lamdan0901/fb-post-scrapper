import { Router, type Router as RouterType } from "express";
import { prisma } from "../lib/db.js";
import { scraperState } from "../lib/scraper-state.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { parseSettingsRow } from "../lib/settings-helpers.js";
import { PipelineRunner } from "../lib/pipeline-runner.js";

// ── Async run execution (fire-and-forget) ──

async function executeRun(): Promise<void> {
  try {
    const runner = PipelineRunner.fromEnv(prisma);
    const result = await runner.runWithTimeout();
    scraperState.completeRun(result.stats);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown pipeline error";
    scraperState.failRun(message);
  }
}

// ── Router ──

export const scraperRouter: RouterType = Router();

// POST /scraper/run — trigger async scraping run
scraperRouter.post("/run", async (_req, res) => {
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

  const runId = scraperState.tryStartRun();
  if (!runId) {
    throw new ConflictError("A scrape run is already in progress");
  }

  // Fire-and-forget — do not await
  executeRun();

  res.json({ runId, status: "running" });
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
