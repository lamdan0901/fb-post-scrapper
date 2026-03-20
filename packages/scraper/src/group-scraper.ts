import type { Page, Locator } from "playwright";
import type { RawPost } from "@job-alert/shared";
import { SELECTORS } from "./selectors.js";
import { TimestampParser } from "./timestamp-parser.js";
import {
  smoothScroll,
  randomDelay,
  randomMouseMovement,
} from "./human-behavior.js";
import { randomInt } from "node:crypto";

const MAX_STALE_SCROLLS = 3;
const FEED_TIMEOUT = 15_000;
const SEE_MORE_RETRIES = 2;

export class GroupScraper {
  private readonly timestampParser = new TimestampParser();

  constructor(private readonly page: Page) {}

  /**
   * Scrape a single Facebook group for posts.
   *
   * Navigates to the group URL sorted chronologically, scrolls the feed to
   * collect posts, expands truncated content via "See more" clicks, and
   * extracts structured post data.
   *
   * @param groupUrl - Full Facebook group URL (e.g. `https://www.facebook.com/groups/xyz/`)
   * @param maxPosts - Maximum number of posts to collect before stopping
   * @returns Array of extracted {@link RawPost} objects
   */
  async scrapeGroup(groupUrl: string, maxPosts: number): Promise<RawPost[]> {
    if (maxPosts <= 0) return [];

    // Navigate to group sorted by newest first
    const url = new URL(groupUrl);
    url.searchParams.set("sorting_setting", "CHRONOLOGICAL");
    await this.page.goto(url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Wait for the feed container to appear
    await this.page.waitForSelector(SELECTORS.feed, { timeout: FEED_TIMEOUT });

    // Optional: small human-like pause after page load
    await randomDelay(1500, 3000);

    const posts: RawPost[] = [];
    const processedUrls = new Set<string>();
    let staleScrollCount = 0;

    while (posts.length < maxPosts && staleScrollCount < MAX_STALE_SCROLLS) {
      const postElements = await this.page.locator(SELECTORS.postItems).all();
      let foundNew = false;

      for (const el of postElements) {
        if (posts.length >= maxPosts) break;

        const post = await this.extractPost(el, groupUrl);
        if (!post) continue;
        if (processedUrls.has(post.postUrl)) continue;

        processedUrls.add(post.postUrl);
        posts.push(post);
        foundNew = true;
      }

      if (foundNew) {
        staleScrollCount = 0;
      } else {
        staleScrollCount++;
      }

      if (posts.length >= maxPosts) break;

      // Scroll down to load more posts
      await smoothScroll(this.page, randomInt(800, 1201));
      await randomDelay(2000, 4000);

      // Occasional mouse movement for anti-detection
      if (randomInt(0, 3) === 0) {
        await randomMouseMovement(this.page);
      }
    }

    return posts;
  }

  /**
   * Extract structured data from a single post element.
   * Returns `null` if the element is not a valid post (e.g. no content or URL).
   */
  private async extractPost(
    el: Locator,
    groupUrl: string,
  ): Promise<RawPost | null> {
    try {
      // ── Post URL & fb_post_id ──
      const linkEl = el.locator(SELECTORS.postLink).first();
      const href = await linkEl
        .getAttribute("href", { timeout: 1_000 })
        .catch(() => null);
      if (!href) return null;

      const postUrl = this.normalizePostUrl(href);
      const fbPostId = this.extractFbPostId(postUrl);

      // ── Timestamp (raw text from permalink link) ──
      const createdTimeRaw = await linkEl
        .innerText({ timeout: 1_000 })
        .catch(() => "");

      // ── Click "See more" to expand truncated content ──
      await this.clickSeeMore(el);

      // ── Post content ──
      const content = await this.extractContent(el);
      if (!content) return null;

      // ── Poster name & profile URL ──
      const { posterName, posterProfileUrl } = await this.extractPosterInfo(el);

      // ── Parse timestamp ──
      const parsed = this.timestampParser.parse(createdTimeRaw);

      return {
        fbPostId: fbPostId ?? undefined,
        content,
        postUrl,
        posterName,
        posterProfileUrl,
        createdTimeRaw,
        createdTimeUtc: parsed.createdTimeUtc ?? undefined,
        firstSeenAt: new Date(),
        groupUrl,
      };
    } catch {
      // Element may have been detached from DOM during extraction (virtualized feed)
      return null;
    }
  }

  /**
   * Click the "See more" button within a post element to expand truncated content.
   * Retries up to {@link SEE_MORE_RETRIES} times. Fails silently — partial content
   * is acceptable.
   */
  private async clickSeeMore(el: Locator): Promise<void> {
    for (const text of SELECTORS.seeMoreText) {
      const btn = el.locator(SELECTORS.seeMore, { hasText: text }).first();

      for (let attempt = 0; attempt < SEE_MORE_RETRIES; attempt++) {
        try {
          const visible = await btn
            .isVisible({ timeout: 500 })
            .catch(() => false);
          if (!visible) break;

          await btn.click({ timeout: 2_000 });
          // Wait briefly for content to expand
          await new Promise((r) => setTimeout(r, 500));
          return;
        } catch {
          // Retry or give up silently
        }
      }
    }
  }

  /**
   * Extract the text content of the post.
   * Tries `data-ad-preview="message"` first, falls back to `div[dir="auto"]`.
   */
  private async extractContent(el: Locator): Promise<string | null> {
    // Primary selector
    const primary = el.locator(SELECTORS.postContent).first();
    const primaryText = await primary
      .innerText({ timeout: 1_000 })
      .catch(() => null);
    if (primaryText?.trim()) return primaryText.trim();

    // Fallback: collect all dir="auto" divs and join their text
    const fallbackEls = el.locator(SELECTORS.postContentFallback);
    const count = await fallbackEls.count().catch(() => 0);
    if (count === 0) return null;

    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await fallbackEls
        .nth(i)
        .innerText({ timeout: 500 })
        .catch(() => "");
      if (text.trim()) parts.push(text.trim());
    }

    return parts.length > 0 ? parts.join("\n") : null;
  }

  /**
   * Extract poster name and profile URL from the post header.
   */
  private async extractPosterInfo(
    el: Locator,
  ): Promise<{ posterName: string; posterProfileUrl: string }> {
    // Try narrow selector first (poster name is typically in <strong> or <h3>)
    let link = el.locator(SELECTORS.posterLink).first();
    const visible = await link.isVisible({ timeout: 500 }).catch(() => false);
    if (!visible) {
      // Fallback to broader selector if narrow didn't match
      link = el.locator(SELECTORS.posterLinkFallback).first();
    }

    const posterName = await link
      .innerText({ timeout: 1_000 })
      .catch(() => "Unknown");

    const rawHref = await link
      .getAttribute("href", { timeout: 1_000 })
      .catch(() => "");

    const posterProfileUrl = this.normalizeProfileUrl(rawHref ?? "");

    return { posterName: posterName.trim() || "Unknown", posterProfileUrl };
  }

  /**
   * Normalize a post URL by stripping tracking params and ensuring it's absolute.
   */
  private normalizePostUrl(href: string): string {
    try {
      const url = new URL(href, "https://www.facebook.com");
      // Keep only the pathname — strip query params (tracking, ref, etc.)
      return `https://www.facebook.com${url.pathname}`;
    } catch {
      return href;
    }
  }

  /**
   * Extract the Facebook post ID from the URL path.
   * Patterns: `/groups/{id}/posts/{postId}` or `/permalink/{postId}`
   */
  private extractFbPostId(postUrl: string): string | null {
    const postsMatch = postUrl.match(/\/posts\/(\d+)/);
    if (postsMatch) return postsMatch[1];

    const permalinkMatch = postUrl.match(/\/permalink\/(\d+)/);
    if (permalinkMatch) return permalinkMatch[1];

    return null;
  }

  /**
   * Normalize a profile URL by stripping tracking query params.
   */
  private normalizeProfileUrl(href: string): string {
    if (!href) return "";
    try {
      const url = new URL(href, "https://www.facebook.com");
      // For profile.php, keep the id param; for vanity URLs, just keep pathname
      if (url.pathname === "/profile.php") {
        const id = url.searchParams.get("id");
        return id
          ? `https://www.facebook.com/profile.php?id=${encodeURIComponent(id)}`
          : `https://www.facebook.com${url.pathname}`;
      }
      return `https://www.facebook.com${url.pathname}`;
    } catch {
      return href;
    }
  }
}
