import { randomUUID } from "node:crypto";
import type { ScrapeRunStats } from "@job-alert/scraper";
import type { PipelineStats } from "@job-alert/ai-filter";

export type ScraperRunStatus =
  | "idle"
  | "running"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed";

/** Combined statistics from a full pipeline run. */
export interface PipelineRunStats {
  scrape: ScrapeRunStats;
  ai: PipelineStats;
  savedCount: number;
}

/** Maximum time a run can stay in "running" before it's considered stale. */
const STALE_RUN_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export type RunSource = "manual" | "cron";
export type RunType = "scraper" | "filter-only";

export interface ScraperRunState {
  runId: string;
  status: ScraperRunStatus;
  source: RunSource;
  runType: RunType;
  startedAt: string;
  cancelRequestedAt?: string;
  completedAt?: string;
  result?: PipelineRunStats;
  error?: string;
}

export interface RunTimeInfo {
  completedAt: string;
}

class ScraperState {
  private state: ScraperRunState | null = null;
  private lastManualRun: RunTimeInfo | null = null;
  private lastCronRun: RunTimeInfo | null = null;
  private readonly cancelRequestedRunIds = new Set<string>();

  isRunning(): boolean {
    if (!this.state) return false;
    if (this.state.status !== "running" && this.state.status !== "cancelling") {
      return false;
    }

    // Auto-fail stale runs that exceeded the timeout
    const elapsed = Date.now() - new Date(this.state.startedAt).getTime();
    if (elapsed > STALE_RUN_TIMEOUT_MS) {
      this.failRunFor(this.state.runId, "Run timed out (exceeded 30 minutes)");
      return false;
    }
    return true;
  }

  isCancelRequested(runId: string): boolean {
    return this.cancelRequestedRunIds.has(runId);
  }

  startRun(source: RunSource, runType: RunType = "scraper"): string {
    if (this.isRunning()) {
      throw new Error("A scrape run is already in progress");
    }
    const runId = randomUUID();
    this.state = {
      runId,
      status: "running",
      source,
      runType,
      startedAt: new Date().toISOString(),
    };
    return runId;
  }

  /** Atomically check-and-start: returns runId if started, null if already running. */
  tryStartRun(source: RunSource, runType: RunType = "scraper"): string | null {
    if (this.isRunning()) return null;
    const runId = randomUUID();
    this.state = {
      runId,
      status: "running",
      source,
      runType,
      startedAt: new Date().toISOString(),
    };
    return runId;
  }

  completeRun(result: PipelineRunStats): void {
    if (!this.state) {
      console.warn("[ScraperState] completeRun called with no active run");
      return;
    }

    this.state.status = "completed";
    this.state.completedAt = new Date().toISOString();
    this.state.result = result;
    this.cancelRequestedRunIds.delete(this.state.runId);

    const info: RunTimeInfo = { completedAt: this.state.completedAt };
    if (this.state.source === "manual") {
      this.lastManualRun = info;
    } else {
      this.lastCronRun = info;
    }
  }

  failRun(error: string): void {
    if (!this.state) {
      console.warn("[ScraperState] failRun called with no active run");
      return;
    }
    this.state.status = "failed";
    this.state.completedAt = new Date().toISOString();
    this.state.error = error;
    this.cancelRequestedRunIds.delete(this.state.runId);
  }

  requestCancel(runId?: string): ScraperRunState | null {
    if (
      !this.state ||
      (this.state.status !== "running" && this.state.status !== "cancelling")
    ) {
      return null;
    }

    if (runId && this.state.runId !== runId) {
      return null;
    }

    const now = new Date().toISOString();
    this.state.status = "cancelling";
    this.state.cancelRequestedAt = now;
    this.cancelRequestedRunIds.add(this.state.runId);
    return this.state;
  }

  private finalizeCancelledRun(runId: string): void {
    if (!this.state || this.state.runId !== runId) {
      return;
    }

    const completedAt = new Date().toISOString();
    this.state.status = "cancelled";
    this.state.completedAt = completedAt;
    this.state.error = "Run cancelled by user";
    this.cancelRequestedRunIds.delete(runId);
  }

  completeRunFor(runId: string, result: PipelineRunStats): void {
    if (!this.state) {
      console.warn("[ScraperState] completeRunFor called with no active run");
      return;
    }

    if (this.state.runId !== runId) {
      return;
    }

    if (this.state.status === "cancelling") {
      this.finalizeCancelledRun(runId);
      return;
    }

    if (this.state.status !== "running") {
      return;
    }

    this.completeRun(result);
  }

  failRunFor(runId: string, error: string): void {
    if (!this.state) {
      console.warn("[ScraperState] failRunFor called with no active run");
      return;
    }

    if (this.state.runId !== runId) {
      return;
    }

    if (this.state.status === "cancelling") {
      this.finalizeCancelledRun(runId);
      return;
    }

    if (this.state.status !== "running") {
      return;
    }

    this.failRun(error);
  }

  getState(): ScraperRunState | null {
    return this.state;
  }

  getRunTimes(): { lastManualRun: string | null; lastCronRun: string | null } {
    return {
      lastManualRun: this.lastManualRun?.completedAt ?? null,
      lastCronRun: this.lastCronRun?.completedAt ?? null,
    };
  }
}

export const scraperState = new ScraperState();
