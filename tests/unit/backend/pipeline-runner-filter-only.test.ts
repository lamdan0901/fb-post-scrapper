import { beforeEach, describe, expect, it, vi } from "vitest";
import { PipelineRunner } from "../../../packages/backend/src/lib/pipeline-runner.js";

describe("PipelineRunner.runFilterOnly", () => {
  beforeEach(() => {
    process.env["GEMINI_API_KEY"] = "test-key";
  });

  it("writes classification fields back to raw_post rows for filter-only runs", async () => {
    const updateMock = vi.fn().mockResolvedValue(undefined);

    const prismaMock = {
      settings: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1,
          target_groups: JSON.stringify(["https://www.facebook.com/groups/test"]),
          target_keywords: JSON.stringify(["react"]),
          blacklist: JSON.stringify([]),
          allowed_roles: JSON.stringify([
            "Frontend",
            "Backend",
            "Fullstack",
            "Mobile",
            "Other",
          ]),
          allowed_levels: JSON.stringify([
            "Fresher",
            "Junior",
            "Middle",
            "Senior",
            "Unknown",
          ]),
          role_keywords: JSON.stringify({}),
          role_exclusion_keywords: JSON.stringify({}),
          common_rules: "",
          role_rules: JSON.stringify({}),
          max_yoe: 5,
          cron_schedule: "0 */4 * * *",
          scrape_lookback_hours: null,
          scrape_date_from: null,
          scrape_date_to: null,
          max_posts_per_group: 50,
          excluded_locations: JSON.stringify([]),
        }),
      },
      rawPost: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ scrape_date: "2026-03-25T10:00:00.000Z" }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 10,
            fb_post_id: "a",
            content: "Hiring office admin",
            post_url: "https://example.com/post/1",
            poster_name: "Alice",
            poster_url: "https://example.com/alice",
            post_url_hash: "hash-1",
            content_hash: "content-1",
            group_url: "https://www.facebook.com/groups/test",
            created_time_raw: "1h",
            created_time_utc: new Date("2026-03-25T09:00:00.000Z"),
            first_seen_at: new Date("2026-03-25T09:10:00.000Z"),
          },
          {
            id: 11,
            fb_post_id: "b",
            content: "Need sales executive",
            post_url: "https://example.com/post/2",
            poster_name: "Bob",
            poster_url: "https://example.com/bob",
            post_url_hash: "hash-2",
            content_hash: "content-2",
            group_url: "https://www.facebook.com/groups/test",
            created_time_raw: "2h",
            created_time_utc: new Date("2026-03-25T08:00:00.000Z"),
            first_seen_at: new Date("2026-03-25T08:10:00.000Z"),
          },
        ]),
        update: updateMock,
      },
      job: {
        create: vi.fn(),
      },
      $transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<number>) =>
          fn({ job: { create: vi.fn() } }),
        ),
    };

    const runner = new PipelineRunner(prismaMock as never, null);
    await runner.runFilterOnly("manual");

    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenNthCalledWith(1, {
      where: { id: 10 },
      data: expect.objectContaining({
        filter_role: "Other",
        filter_level: "Unknown",
        filter_score: 0,
        rejection_reason: "Not tech-related",
      }),
    });
    expect(updateMock).toHaveBeenNthCalledWith(2, {
      where: { id: 11 },
      data: expect.objectContaining({
        filter_role: "Other",
        filter_level: "Unknown",
        filter_score: 0,
        rejection_reason: "Not tech-related",
      }),
    });
  });
});
