import { randomUUID } from "node:crypto";
import type { ScrapeRunStats } from "@job-alert/scraper";
import type { PipelineStats } from "@job-alert/ai-filter";

export type ScraperRunStatus = "idle" | "running" | "completed" | "failed";

/** Combined statistics from a full pipeline run. */
export interface PipelineRunStats {
  scrape: ScrapeRunStats;
  ai: PipelineStats;
  savedCount: number;
}

/** Maximum time a run can stay in "running" before it's considered stale. */
const STALE_RUN_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export interface ScraperRunState {
  runId: string;
  status: ScraperRunStatus;
  startedAt: string;
  completedAt?: string;
  result?: PipelineRunStats;
  error?: string;
}

class ScraperState {
  private state: ScraperRunState | null = null;

  isRunning(): boolean {
    if (this.state?.status !== "running") return false;

    // Auto-fail stale runs that exceeded the timeout
    const elapsed = Date.now() - new Date(this.state.startedAt).getTime();
    if (elapsed > STALE_RUN_TIMEOUT_MS) {
      this.failRun("Run timed out (exceeded 30 minutes)");
      return false;
    }
    return true;
  }

  startRun(): string {
    if (this.isRunning()) {
      throw new Error("A scrape run is already in progress");
    }
    const runId = randomUUID();
    this.state = {
      runId,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    return runId;
  }

  /** Atomically check-and-start: returns runId if started, null if already running. */
  tryStartRun(): string | null {
    if (this.isRunning()) return null;
    const runId = randomUUID();
    this.state = {
      runId,
      status: "running",
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
  }

  failRun(error: string): void {
    if (!this.state) {
      console.warn("[ScraperState] failRun called with no active run");
      return;
    }
    this.state.status = "failed";
    this.state.completedAt = new Date().toISOString();
    this.state.error = error;
  }

  getState(): ScraperRunState | null {
    return this.state;
  }
}

export const scraperState = new ScraperState();
