import { prisma } from "./db.js";
import { scraperState } from "./scraper-state.js";

type RunTimesRow = {
  last_manual_run: string | Date | null;
  last_cron_run: string | Date | null;
};

function normalizeRunTimeValue(value: string | Date | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function getPersistedRunTimes(): Promise<{
  lastManualRun: string | null;
  lastCronRun: string | null;
}> {
  const rows = await prisma.$queryRaw<RunTimesRow[]>`
    SELECT last_manual_run, last_cron_run
    FROM "Settings"
    WHERE id = 1
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    return {
      lastManualRun: null,
      lastCronRun: null,
    };
  }

  return {
    lastManualRun: normalizeRunTimeValue(row.last_manual_run),
    lastCronRun: normalizeRunTimeValue(row.last_cron_run),
  };
}

export async function persistRunStartTime(source: "manual" | "cron"): Promise<void> {
  const now = new Date().toISOString();
  if (source === "manual") {
    await prisma.$executeRaw`
      UPDATE "Settings"
      SET last_manual_run = ${now}
      WHERE id = 1
    `;
    return;
  }

  await prisma.$executeRaw`
    UPDATE "Settings"
    SET last_cron_run = ${now}
    WHERE id = 1
  `;
}

export async function persistCompletedRunTime(
  runId: string,
  source: "manual" | "cron",
): Promise<void> {
  const state = scraperState.getState();
  if (!state || state.runId !== runId || state.status !== "completed") {
    return;
  }

  const completedAt = state.completedAt ?? new Date().toISOString();
  if (source === "manual") {
    await prisma.$executeRaw`
      UPDATE "Settings"
      SET last_manual_run = ${completedAt}
      WHERE id = 1
    `;
    return;
  }

  await prisma.$executeRaw`
    UPDATE "Settings"
    SET last_cron_run = ${completedAt}
    WHERE id = 1
  `;
}
