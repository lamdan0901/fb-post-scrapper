import cron from "node-cron";
import { prisma } from "./db.js";
import { scraperState } from "./scraper-state.js";
import { PipelineRunner } from "./pipeline-runner.js";
import { persistCompletedRunTime } from "./run-times-store.js";

class CronScheduler {
  private task: cron.ScheduledTask | null = null;
  private expression: string | null = null;

  /**
   * Start (or restart) the cron schedule. Stops any existing task first.
   */
  start(cronExpr: string): void {
    if (!cron.validate(cronExpr)) {
      console.error(`[Scheduler] Invalid cron expression: ${cronExpr}`);
      return;
    }

    this.stop();

    this.expression = cronExpr;
    this.task = cron.schedule(cronExpr, () => {
      this.executeCronRun();
    });

    console.log(`[Scheduler] Scheduled pipeline runs with cron: ${cronExpr}`);
  }

  /** Stop and destroy the current cron task. */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log("[Scheduler] Stopped cron task");
    }
    this.expression = null;
  }

  /** Returns the current cron expression, or null if not scheduled. */
  getExpression(): string | null {
    return this.expression;
  }

  /** Returns whether a cron job is currently active. */
  isScheduled(): boolean {
    return this.task !== null;
  }

  /** Execute a cron-triggered pipeline run with concurrent-run prevention. */
  private executeCronRun(): void {
    const runId = scraperState.tryStartRun("cron", "scraper");
    if (!runId) {
      console.log(
        "[Scheduler] Skipping cron run — a run is already in progress",
      );
      return;
    }

    console.log("[Scheduler] Starting cron-triggered pipeline run");

    const runner = PipelineRunner.fromEnv(prisma);

    runner
      .runWithTimeout("cron", undefined, undefined, runId)
      .then(async (result) => {
        scraperState.completeRunFor(runId, result.stats);
        try {
          await persistCompletedRunTime(runId, "cron");
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unknown persistence error";
          console.error(
            `[Scheduler] Failed to persist cron run timestamp for run ${runId}: ${message}`,
          );
        }
        console.log("[Scheduler] Cron run completed successfully");
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Unknown pipeline error";
        scraperState.failRunFor(runId, message);
        console.error(`[Scheduler] Cron run failed: ${message}`);
      });
  }
}

export const scheduler = new CronScheduler();
