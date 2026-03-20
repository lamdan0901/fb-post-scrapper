import { createHash } from "node:crypto";
import type { RawPost } from "@job-alert/shared";

// ── Interfaces ──

/** Abstracts DB lookups so the scraper package stays decoupled from Prisma. */
export interface DeduplicationStore {
  findByFbPostId(fbPostId: string): Promise<{ first_seen_at: Date } | null>;

  findByPostUrlHash(hash: string): Promise<{ first_seen_at: Date } | null>;

  findByContentHash(hash: string): Promise<{ first_seen_at: Date } | null>;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  reason?: "fb_post_id" | "post_url_hash" | "content_hash";
  /** Original `first_seen_at` from DB when the post is a duplicate. */
  firstSeenAt?: Date;
  /** SHA-256 hex digest of the normalised post URL. */
  postUrlHash: string;
  /** SHA-256 hex digest of the normalised post content. */
  contentHash: string;
}

// ── Hash helpers (pure, stateless) ──

/** SHA-256 hex digest of the post URL (already normalised by GroupScraper). */
export function generatePostUrlHash(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

/**
 * SHA-256 hex digest of normalised content.
 * Normalisation: lowercase → collapse whitespace → trim.
 */
export function generateContentHash(content: string): string {
  const normalised = content.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalised).digest("hex");
}

// ── Deduplicator ──

export class Deduplicator {
  constructor(private readonly store: DeduplicationStore) {}

  /**
   * Check whether a scraped post already exists in the database.
   *
   * Priority order: fb_post_id → post_url_hash → content_hash.
   * Always returns the computed hashes so callers can reuse them for DB insertion.
   */
  async isDuplicate(post: RawPost): Promise<DuplicateCheckResult> {
    const postUrlHash = generatePostUrlHash(post.postUrl);
    const contentHash = generateContentHash(post.content);

    // 1. fb_post_id (most specific — direct Facebook post ID match)
    if (post.fbPostId) {
      const existing = await this.store.findByFbPostId(post.fbPostId);
      if (existing) {
        return {
          isDuplicate: true,
          reason: "fb_post_id",
          firstSeenAt: existing.first_seen_at,
          postUrlHash,
          contentHash,
        };
      }
    }

    // 2. post_url_hash (unique constraint in DB)
    const byUrl = await this.store.findByPostUrlHash(postUrlHash);
    if (byUrl) {
      return {
        isDuplicate: true,
        reason: "post_url_hash",
        firstSeenAt: byUrl.first_seen_at,
        postUrlHash,
        contentHash,
      };
    }

    // 3. content_hash (catches reposts / cross-posts with different URLs)
    const byContent = await this.store.findByContentHash(contentHash);
    if (byContent) {
      return {
        isDuplicate: true,
        reason: "content_hash",
        firstSeenAt: byContent.first_seen_at,
        postUrlHash,
        contentHash,
      };
    }

    return { isDuplicate: false, postUrlHash, contentHash };
  }

  /**
   * Filter an array of raw posts, returning only those that don't already
   * exist in the database. Each returned post is annotated with its
   * pre-computed hashes for efficient downstream DB insertion.
   */
  async filterNew(
    posts: RawPost[],
  ): Promise<Array<RawPost & { postUrlHash: string; contentHash: string }>> {
    const results: Array<
      RawPost & { postUrlHash: string; contentHash: string }
    > = [];

    for (const post of posts) {
      const check = await this.isDuplicate(post);
      if (!check.isDuplicate) {
        results.push({
          ...post,
          postUrlHash: check.postUrlHash,
          contentHash: check.contentHash,
        });
      }
    }

    return results;
  }
}
