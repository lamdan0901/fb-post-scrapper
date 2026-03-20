import { Router, type Router as RouterType } from "express";
import type { DeduplicationStore } from "@job-alert/scraper";
import { ScraperOrchestrator } from "@job-alert/scraper";
import { prisma } from "../lib/db.js";
import { scraperState } from "../lib/scraper-state.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { parseSettingsRow } from "./settings.js";
import type { ScraperConfig } from "@job-alert/scraper";

/** Maximum execution time for a single scraper run. */
const RUN_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// ── Prisma-backed DeduplicationStore ──

function createDeduplicationStore(): DeduplicationStore {
  return {
    async findByFbPostId(fbPostId: string) {
      return prisma.job.findFirst({
        where: { fb_post_id: fbPostId },
        select: { first_seen_at: true },
      });
    },
    async findByPostUrlHash(hash: string) {
      return prisma.job.findFirst({
        where: { post_url_hash: hash },
        select: { first_seen_at: true },
      });
    },
    async findByContentHash(hash: string) {
      return prisma.job.findFirst({
        where: { content_hash: hash },
        select: { first_seen_at: true },
      });
    },
  };
}

// ── Async run execution (fire-and-forget) ──

async function executeRun(config: ScraperConfig): Promise<void> {
  try {
    const orchestrator = new ScraperOrchestrator({
      deduplicationStore: createDeduplicationStore(),
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Scraper run timed out")),
        RUN_TIMEOUT_MS,
      ),
    );

    const result = await Promise.race([orchestrator.run(config), timeout]);
    scraperState.completeRun(result.stats);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown scraper error";
    scraperState.failRun(message);
  }
}

// ── Router ──

export const scraperRouter: RouterType = Router();

// POST /scraper/run — trigger async scraping run
scraperRouter.post("/run", async (_req, res) => {
  if (scraperState.isRunning()) {
    throw new ConflictError("A scrape run is already in progress");
  }

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

  const runId = scraperState.startRun();

  const config: ScraperConfig = {
    targetGroups: parsed.target_groups,
    cookiePath,
  };

  // Fire-and-forget — do not await
  executeRun(config);

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
