/**
 * 9.3.2 — Scraper DOM Snapshot Regression Test
 *
 * Loads the saved Facebook group HTML snapshot into a headless Chromium page
 * and verifies the selectors that GroupScraper depends on still work.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Snapshot file (note the intentional "resouces" typo in the workspace folder name)
const SNAPSHOT_PATH = resolve(
  __dirname,
  "../../../resouces/snapshot/[IT JOBS] REMOTE - SHORT TERM - PART TIME - Otingting Network _ Facebook.html",
);

describe("Scraper DOM snapshot regression (9.3.2)", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();

    const html = readFileSync(SNAPSHOT_PATH, "utf-8");
    await page.setContent(html, { waitUntil: "domcontentloaded" });
  }, 60_000);

  afterAll(async () => {
    await browser.close();
  });

  // ── Selector: feed container (from dom-selectors.md) ──
  it("has a [role='feed'] container", async () => {
    const feedCount = await page.locator("[role='feed']").count();
    expect(feedCount).toBeGreaterThanOrEqual(1);
  });

  // ── Selector: post elements inside the feed ──
  it("has post elements inside the feed ([role='feed'] > div > div)", async () => {
    const postCount = await page.locator("[role='feed'] > div > div").count();
    expect(postCount).toBeGreaterThan(0);
  });

  // ── Selector: post text content ──
  it("has at least one non-empty content element (data-ad-preview or dir=auto)", async () => {
    const messageElements = await page
      .locator("div[data-ad-preview='message']")
      .count();
    const dirAutoElements = await page.locator("div[dir='auto']").count();

    // At least one of the two strategies must find elements
    expect(messageElements + dirAutoElements).toBeGreaterThan(0);

    // Verify the content is non-empty
    const firstContentSelector =
      messageElements > 0
        ? "div[data-ad-preview='message']"
        : "div[dir='auto']";
    const firstText = await page
      .locator(firstContentSelector)
      .first()
      .textContent();
    expect(firstText?.trim().length ?? 0).toBeGreaterThan(0);
  });

  // ── Selector: permalink / timestamp links ──
  it("has at least one post permalink link (a[href*='/posts/'] or a[href*='/permalink/'])", async () => {
    const postLinks = await page.locator("a[href*='/posts/']").count();
    const permalinks = await page.locator("a[href*='/permalink/']").count();
    expect(postLinks + permalinks).toBeGreaterThan(0);
  });

  // ── Structural extraction: build at least 1 RawPost-shaped object ──
  it("can extract a post URL and non-empty content from the snapshot", async () => {
    // Try to extract a post URL
    const postLinkLocator = page.locator("a[href*='/posts/']").first();
    const href = await postLinkLocator.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toContain("/posts/");

    // Try to extract content text
    const contentLocator =
      (await page.locator("div[data-ad-preview='message']").count()) > 0
        ? page.locator("div[data-ad-preview='message']").first()
        : page.locator("div[dir='auto']").first();

    const content = await contentLocator.textContent();
    expect(content?.trim().length ?? 0).toBeGreaterThan(0);

    // Verify the extracted pair forms a usable RawPost skeleton
    const postSkeleton = {
      postUrl: href!,
      content: content!.trim(),
    };
    expect(postSkeleton.postUrl).toMatch(/\/posts\//);
    expect(postSkeleton.content.length).toBeGreaterThan(0);
  });
});
