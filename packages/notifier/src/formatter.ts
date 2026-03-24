import type { Role, Level } from "@job-alert/shared";

// ── Types ──

/** Lightweight mirror of PipelineStats — avoids cross-package dependency. */
export interface RunStats {
  total: number;
  processed: number;
  matched: number;
  skipped: number;
  apiCallsUsed: number;
}

/** Minimal job shape needed for notification formatting. */
export interface RunJobSummary {
  role: Role;
  level: Level;
  isFreelance: boolean;
  postUrl: string;
  posterName: string;
  score: number;
}

/** Input for `formatRunSummary`. */
export interface RunSummaryInput {
  stats: RunStats;
  matchedJobs: RunJobSummary[];
  dashboardUrl?: string;
}

// ── Constants ──

const MAX_JOBS_PER_MESSAGE = 10;
const TELEGRAM_MAX_LENGTH = 4096;

// ── Utilities ──

/** Escape `&`, `<`, `>` for Telegram HTML parse_mode. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Formatter ──

/**
 * Format a scraping-run summary into an HTML string for Telegram.
 *
 * Anti-spam rules enforced:
 * - Max 10 jobs listed per message (total count always shown).
 * - Message truncated to 4 096 chars if necessary.
 * - Empty match list produces a "no matches" message.
 */
export function formatRunSummary(input: RunSummaryInput): string {
  const { stats, matchedJobs, dashboardUrl } = input;

  if (matchedJobs.length === 0) {
    return formatNoMatches(stats);
  }

  return formatWithMatches(stats, matchedJobs, dashboardUrl);
}

// ── Internal helpers ──

function formatNoMatches(stats: RunStats): string {
  const lines: string[] = [
    "✅ Scraping complete. No new matching jobs found.",
    "",
    formatStatsLine(stats),
  ];
  return lines.join("\n");
}

function formatWithMatches(
  stats: RunStats,
  jobs: RunJobSummary[],
  dashboardUrl?: string,
): string {
  const lines: string[] = [];

  // Header
  lines.push(
    `🚀 <b>Found ${jobs.length} new matching job${jobs.length === 1 ? "" : "s"}</b>`,
  );
  lines.push("");

  // Stats
  lines.push(formatStatsLine(stats));
  lines.push("");

  // Top N jobs
  const displayed = jobs.slice(0, MAX_JOBS_PER_MESSAGE);
  lines.push("<b>Top matches:</b>");

  for (let i = 0; i < displayed.length; i++) {
    lines.push(formatJobLine(i + 1, displayed[i]));
  }

  // Overflow indicator
  const remaining = jobs.length - displayed.length;
  if (remaining > 0) {
    lines.push(`\n…and <b>${remaining}</b> more`);
  }

  // Dashboard link
  if (dashboardUrl) {
    lines.push("");
    lines.push(
      `📋 <a href="${escapeHtml(dashboardUrl)}">View all on Dashboard</a>`,
    );
  }

  return truncateToLimit(lines.join("\n"));
}

function formatStatsLine(stats: RunStats): string {
  return `📊 ${stats.total} scraped → ${stats.processed} processed → ${stats.matched} matched`;
}

function formatJobLine(index: number, job: RunJobSummary): string {
  const freelanceTag = job.isFreelance ? " 🔧" : "";
  const name = escapeHtml(job.posterName);
  const link = escapeHtml(job.postUrl);
  const scoreTag = ` [${job.score}%]`;

  return (
    `${index}. <b>${escapeHtml(job.role)}</b> (${escapeHtml(job.level)})${freelanceTag}${scoreTag}` +
    ` — ${name}` +
    ` · <a href="${link}">View post</a>`
  );
}

/** Truncate message to Telegram's 4096-char limit, preserving valid HTML. */
function truncateToLimit(message: string): string {
  if (message.length <= TELEGRAM_MAX_LENGTH) {
    return message;
  }

  const suffix = "\n\n⚠️ Message truncated.";
  let cutoff = TELEGRAM_MAX_LENGTH - suffix.length;

  // Avoid cutting inside an HTML tag — backtrack to before the last open '<'
  const lastOpenTag = message.lastIndexOf("<", cutoff);
  const lastCloseTag = message.lastIndexOf(">", cutoff);
  if (lastOpenTag > lastCloseTag) {
    cutoff = lastOpenTag;
  }

  return message.slice(0, cutoff) + suffix;
}
