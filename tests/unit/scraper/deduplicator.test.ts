import { describe, it, expect, vi } from "vitest";
import {
  generatePostUrlHash,
  generateContentHash,
  Deduplicator,
  type DeduplicationStore,
} from "../../../packages/scraper/src/deduplicator.js";
import type { RawPost } from "../../../shared/types.js";

// ── Helper ──

function makePost(overrides: Partial<RawPost> = {}): RawPost {
  return {
    fbPostId: "12345",
    content: "We are hiring a React developer",
    postUrl: "https://www.facebook.com/groups/123/posts/456",
    posterName: "John Doe",
    posterProfileUrl: "https://www.facebook.com/johndoe",
    createdTimeRaw: "2h",
    firstSeenAt: new Date("2026-03-20T12:00:00Z"),
    groupUrl: "https://www.facebook.com/groups/123",
    ...overrides,
  };
}

function makeEmptyStore(): DeduplicationStore {
  return {
    findByFbPostId: vi.fn().mockResolvedValue(null),
    findByPostUrlHash: vi.fn().mockResolvedValue(null),
    findByContentHash: vi.fn().mockResolvedValue(null),
  };
}

const FIRST_SEEN = new Date("2026-03-01T00:00:00Z");

// ── generatePostUrlHash ──
describe("generatePostUrlHash()", () => {
  it("returns a 64-character hex string", () => {
    const hash = generatePostUrlHash("https://example.com/post/1");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same URL", () => {
    const url = "https://www.facebook.com/groups/123/posts/456";
    expect(generatePostUrlHash(url)).toBe(generatePostUrlHash(url));
  });

  it("different URLs produce different hashes", () => {
    expect(generatePostUrlHash("https://a.com/1")).not.toBe(
      generatePostUrlHash("https://a.com/2"),
    );
  });
});

// ── generateContentHash ──
describe("generateContentHash()", () => {
  it("returns a 64-character hex string", () => {
    const hash = generateContentHash("Hello World");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same text", () => {
    expect(generateContentHash("abc")).toBe(generateContentHash("abc"));
  });

  it("normalises case — 'Hello' and 'hello' produce the same hash", () => {
    expect(generateContentHash("Hello World")).toBe(
      generateContentHash("hello world"),
    );
  });

  it("normalises whitespace — 'hello  world' and 'hello world' produce the same hash", () => {
    expect(generateContentHash("hello  world")).toBe(
      generateContentHash("hello world"),
    );
  });

  it("different content produces different hashes", () => {
    expect(generateContentHash("React developer")).not.toBe(
      generateContentHash("Vue developer"),
    );
  });
});

// ── Deduplicator.isDuplicate() ──
describe("Deduplicator.isDuplicate()", () => {
  it("returns isDuplicate=false when store has no matches", async () => {
    const store = makeEmptyStore();
    const dedup = new Deduplicator(store);
    const result = await dedup.isDuplicate(makePost());
    expect(result.isDuplicate).toBe(false);
    expect(result.reason).toBeUndefined();
    expect(result.postUrlHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("detects duplicate by fb_post_id (highest priority)", async () => {
    const store: DeduplicationStore = {
      findByFbPostId: vi.fn().mockResolvedValue({ first_seen_at: FIRST_SEEN }),
      findByPostUrlHash: vi.fn().mockResolvedValue(null),
      findByContentHash: vi.fn().mockResolvedValue(null),
    };
    const dedup = new Deduplicator(store);
    const result = await dedup.isDuplicate(makePost({ fbPostId: "abc" }));
    expect(result.isDuplicate).toBe(true);
    expect(result.reason).toBe("fb_post_id");
    expect(result.firstSeenAt).toBe(FIRST_SEEN);
  });

  it("skips fb_post_id check when fbPostId is absent", async () => {
    const store: DeduplicationStore = {
      findByFbPostId: vi.fn().mockResolvedValue({ first_seen_at: FIRST_SEEN }),
      findByPostUrlHash: vi.fn().mockResolvedValue(null),
      findByContentHash: vi.fn().mockResolvedValue(null),
    };
    const dedup = new Deduplicator(store);
    const result = await dedup.isDuplicate(makePost({ fbPostId: undefined }));
    expect(store.findByFbPostId).not.toHaveBeenCalled();
    expect(result.isDuplicate).toBe(false);
  });

  it("detects duplicate by post_url_hash when no fb_post_id match", async () => {
    const store: DeduplicationStore = {
      findByFbPostId: vi.fn().mockResolvedValue(null),
      findByPostUrlHash: vi
        .fn()
        .mockResolvedValue({ first_seen_at: FIRST_SEEN }),
      findByContentHash: vi.fn().mockResolvedValue(null),
    };
    const dedup = new Deduplicator(store);
    const result = await dedup.isDuplicate(makePost());
    expect(result.isDuplicate).toBe(true);
    expect(result.reason).toBe("post_url_hash");
    expect(result.firstSeenAt).toBe(FIRST_SEEN);
  });

  it("detects duplicate by content_hash (lowest priority)", async () => {
    const store: DeduplicationStore = {
      findByFbPostId: vi.fn().mockResolvedValue(null),
      findByPostUrlHash: vi.fn().mockResolvedValue(null),
      findByContentHash: vi
        .fn()
        .mockResolvedValue({ first_seen_at: FIRST_SEEN }),
    };
    const dedup = new Deduplicator(store);
    const result = await dedup.isDuplicate(makePost());
    expect(result.isDuplicate).toBe(true);
    expect(result.reason).toBe("content_hash");
    expect(result.firstSeenAt).toBe(FIRST_SEEN);
  });

  it("priority: fb_post_id wins over post_url_hash", async () => {
    const store: DeduplicationStore = {
      findByFbPostId: vi.fn().mockResolvedValue({ first_seen_at: FIRST_SEEN }),
      findByPostUrlHash: vi
        .fn()
        .mockResolvedValue({ first_seen_at: new Date() }),
      findByContentHash: vi.fn().mockResolvedValue(null),
    };
    const dedup = new Deduplicator(store);
    const result = await dedup.isDuplicate(makePost());
    expect(result.reason).toBe("fb_post_id");
    expect(store.findByPostUrlHash).not.toHaveBeenCalled();
  });
});

// ── Deduplicator.filterNew() ──
describe("Deduplicator.filterNew()", () => {
  it("returns all posts when none are duplicates", async () => {
    const store = makeEmptyStore();
    const dedup = new Deduplicator(store);
    const posts = [
      makePost({ fbPostId: "1" }),
      makePost({ fbPostId: "2", postUrl: "https://fb.com/2" }),
    ];
    const result = await dedup.filterNew(posts);
    expect(result).toHaveLength(2);
  });

  it("filters out duplicate posts", async () => {
    const store: DeduplicationStore = {
      findByFbPostId: vi
        .fn()
        .mockResolvedValueOnce({ first_seen_at: FIRST_SEEN }) // first post is dup
        .mockResolvedValue(null), // rest are new
      findByPostUrlHash: vi.fn().mockResolvedValue(null),
      findByContentHash: vi.fn().mockResolvedValue(null),
    };
    const dedup = new Deduplicator(store);
    const posts = [
      makePost({ fbPostId: "dup" }),
      makePost({ fbPostId: "new", postUrl: "https://fb.com/new" }),
    ];
    const result = await dedup.filterNew(posts);
    expect(result).toHaveLength(1);
    expect(result[0].fbPostId).toBe("new");
  });

  it("appends postUrlHash and contentHash to returned posts", async () => {
    const store = makeEmptyStore();
    const dedup = new Deduplicator(store);
    const [result] = await dedup.filterNew([makePost()]);
    expect(result.postUrlHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns empty array when all posts are duplicates", async () => {
    const store: DeduplicationStore = {
      findByFbPostId: vi.fn().mockResolvedValue({ first_seen_at: FIRST_SEEN }),
      findByPostUrlHash: vi.fn().mockResolvedValue(null),
      findByContentHash: vi.fn().mockResolvedValue(null),
    };
    const dedup = new Deduplicator(store);
    const result = await dedup.filterNew([makePost()]);
    expect(result).toHaveLength(0);
  });
});
