// ── Alert Message Templates ──
// Pure functions returning HTML-formatted strings for Telegram.
// Callers send via TelegramNotifier.sendMessage().

import { type RunStats, formatRunSummary } from "./formatter.js";

// ── Utilities ──

/** Escape `&`, `<`, `>` for Telegram HTML parse_mode. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Alert Templates ──

/** Session expired — cookies need to be re-uploaded. */
export function sessionExpiredAlert(): string {
  return "⚠️ Facebook session expired. Please re-upload cookies.";
}

/** Scraper failed for a specific group after retries. */
export function scraperFailureAlert(groupUrl: string, reason: string): string {
  return `⚠️ Scraper failed for group ${escapeHtml(groupUrl)}: ${escapeHtml(reason)}`;
}

/** Run completed with no matching jobs. */
export function runCompleteNoMatchesAlert(stats: RunStats): string {
  return formatRunSummary({ stats, matchedJobs: [] });
}

/** No posts found in a group — possible DOM structure change. */
export function domChangeAlert(groupUrl: string): string {
  return `⚠️ No posts found in group: ${escapeHtml(groupUrl)}. Possible DOM change or empty group.`;
}

/** Scrape run exceeded the maximum allowed duration. */
export function scrapeTimeoutAlert(): string {
  return "⚠️ Scrape run timed out — stopping early.";
}
