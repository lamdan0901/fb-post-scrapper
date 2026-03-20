import { describe, it, expect } from "vitest";
import { TimestampParser } from "../../../packages/scraper/src/timestamp-parser.js";

const NOW = new Date("2026-03-20T12:00:00.000Z");
const parser = new TimestampParser();

function parse(raw: string) {
  return parser.parse(raw, NOW);
}

// Helpers
function expectUtc(raw: string, expected: Date | null) {
  const result = parse(raw);
  if (expected === null) {
    expect(result.createdTimeUtc).toBeNull();
  } else {
    expect(result.createdTimeUtc).not.toBeNull();
    expect(result.createdTimeUtc!.getTime()).toBe(expected.getTime());
  }
}

describe("TimestampParser", () => {
  describe("always sets metadata correctly", () => {
    it("preserves createdTimeRaw verbatim", () => {
      const result = parse("  2h  ");
      expect(result.createdTimeRaw).toBe("2h");
    });

    it("sets firstSeenAt to the provided now", () => {
      const result = parse("2h");
      expect(result.firstSeenAt.getTime()).toBe(NOW.getTime());
    });

    it("empty string → createdTimeUtc is null", () => {
      expectUtc("", null);
    });
  });

  // ── Just now ──
  describe("just now patterns", () => {
    it.each([
      "Just now",
      "just now",
      "JUST NOW",
      "now",
      "Vừa xong",
      "vừa xong",
      "Vừa mới",
      "Mới đây",
    ])('"%s" → equals now', (raw) => {
      const result = parse(raw);
      expect(result.createdTimeUtc).not.toBeNull();
      expect(result.createdTimeUtc!.getTime()).toBe(NOW.getTime());
    });
  });

  // ── Relative — English ──
  describe("relative times (English)", () => {
    it("2h → 2 hours ago", () => {
      expectUtc("2h", new Date(NOW.getTime() - 2 * 3_600_000));
    });
    it("3 mins → 3 minutes ago", () => {
      expectUtc("3 mins", new Date(NOW.getTime() - 3 * 60_000));
    });
    it("1d → 1 day ago", () => {
      expectUtc("1d", new Date(NOW.getTime() - 86_400_000));
    });
    it("1w → 1 week ago", () => {
      expectUtc("1w", new Date(NOW.getTime() - 604_800_000));
    });
    it("2 hours → 2 hours ago", () => {
      expectUtc("2 hours", new Date(NOW.getTime() - 2 * 3_600_000));
    });
    it("5 days → 5 days ago", () => {
      expectUtc("5 days", new Date(NOW.getTime() - 5 * 86_400_000));
    });
    it("30s → 30 seconds ago", () => {
      expectUtc("30s", new Date(NOW.getTime() - 30 * 1_000));
    });
    it("1 minute → 1 minute ago", () => {
      expectUtc("1 minute", new Date(NOW.getTime() - 60_000));
    });
    it("2 wks → 2 weeks ago", () => {
      expectUtc("2 wks", new Date(NOW.getTime() - 2 * 604_800_000));
    });
    it("unknown unit → null", () => {
      expectUtc("3 months", null);
    });
  });

  // ── Relative — Vietnamese ──
  describe("relative times (Vietnamese)", () => {
    it("2 giờ → 2 hours ago", () => {
      expectUtc("2 giờ", new Date(NOW.getTime() - 2 * 3_600_000));
    });
    it("5 phút → 5 minutes ago", () => {
      expectUtc("5 phút", new Date(NOW.getTime() - 5 * 60_000));
    });
    it("3 ngày → 3 days ago", () => {
      expectUtc("3 ngày", new Date(NOW.getTime() - 3 * 86_400_000));
    });
    it("1 tuần → 1 week ago", () => {
      expectUtc("1 tuần", new Date(NOW.getTime() - 604_800_000));
    });
    it("10 giây → 10 seconds ago", () => {
      expectUtc("10 giây", new Date(NOW.getTime() - 10 * 1_000));
    });
  });

  // ── Yesterday ──
  describe("yesterday (English)", () => {
    it("Yesterday at 10:00 AM", () => {
      // 2026-03-19T10:00:00Z
      expectUtc("Yesterday at 10:00 AM", new Date("2026-03-19T10:00:00.000Z"));
    });
    it("Yesterday at 10:00 PM", () => {
      expectUtc("Yesterday at 10:00 PM", new Date("2026-03-19T22:00:00.000Z"));
    });
    it("Yesterday at 14:30 (no meridiem)", () => {
      expectUtc("Yesterday at 14:30", new Date("2026-03-19T14:30:00.000Z"));
    });
    it("Yesterday at 12:00 AM → midnight", () => {
      expectUtc("Yesterday at 12:00 AM", new Date("2026-03-19T00:00:00.000Z"));
    });
    it("Yesterday at 12:00 PM → noon", () => {
      expectUtc("Yesterday at 12:00 PM", new Date("2026-03-19T12:00:00.000Z"));
    });
  });

  describe("yesterday (Vietnamese)", () => {
    it("Hôm qua lúc 10:00", () => {
      expectUtc("Hôm qua lúc 10:00", new Date("2026-03-19T10:00:00.000Z"));
    });
    it("hôm qua lúc 23:59", () => {
      expectUtc("hôm qua lúc 23:59", new Date("2026-03-19T23:59:00.000Z"));
    });
  });

  // ── Absolute English ──
  describe("absolute English (day + time, no year)", () => {
    it("March 10 at 2:00 PM → 2026-03-10 (before now)", () => {
      expectUtc("March 10 at 2:00 PM", new Date("2026-03-10T14:00:00.000Z"));
    });
    it("March 10 at 14:00 (24h)", () => {
      expectUtc("March 10 at 14:00", new Date("2026-03-10T14:00:00.000Z"));
    });
    it("March 25 at 10:00 AM → rolls back to 2025 (future date from now)", () => {
      // March 25 is after March 20 → must roll back to 2025
      expectUtc("March 25 at 10:00 AM", new Date("2025-03-25T10:00:00.000Z"));
    });
    it("January 5 at 9:00 AM → 2026 (before now in current year)", () => {
      expectUtc("January 5 at 9:00 AM", new Date("2026-01-05T09:00:00.000Z"));
    });
  });

  describe("absolute English (month/day/year)", () => {
    it("March 10, 2026", () => {
      expectUtc("March 10, 2026", new Date("2026-03-10T00:00:00.000Z"));
    });
    it("March 10, 2026 at 2:00 PM", () => {
      expectUtc(
        "March 10, 2026 at 2:00 PM",
        new Date("2026-03-10T14:00:00.000Z"),
      );
    });
    it("December 25, 2025 at 8:00 AM", () => {
      expectUtc(
        "December 25, 2025 at 8:00 AM",
        new Date("2025-12-25T08:00:00.000Z"),
      );
    });
    it("February 28, 2026", () => {
      expectUtc("February 28, 2026", new Date("2026-02-28T00:00:00.000Z"));
    });
    it("unknown month name → null", () => {
      expectUtc("Xyz 10, 2026", null);
    });
  });

  // ── Absolute Vietnamese ──
  describe("absolute Vietnamese (day + month + time, no year)", () => {
    it("10 tháng 3 lúc 14:00", () => {
      expectUtc("10 tháng 3 lúc 14:00", new Date("2026-03-10T14:00:00.000Z"));
    });
    it("10 tháng 3 (no time, before now)", () => {
      expectUtc("10 tháng 3", new Date("2026-03-10T00:00:00.000Z"));
    });
    it("25 tháng 3 lúc 10:00 → rolls back to 2025 (after now)", () => {
      expectUtc("25 tháng 3 lúc 10:00", new Date("2025-03-25T10:00:00.000Z"));
    });
    it("5 tháng 1 lúc 9:00", () => {
      expectUtc("5 tháng 1 lúc 9:00", new Date("2026-01-05T09:00:00.000Z"));
    });
  });

  describe("absolute Vietnamese (with year)", () => {
    it("10 tháng 3, 2026", () => {
      expectUtc("10 tháng 3, 2026", new Date("2026-03-10T00:00:00.000Z"));
    });
    it("10 tháng 3, 2026 lúc 14:00", () => {
      expectUtc(
        "10 tháng 3, 2026 lúc 14:00",
        new Date("2026-03-10T14:00:00.000Z"),
      );
    });
    it("25 tháng 12, 2025 lúc 8:00", () => {
      expectUtc(
        "25 tháng 12, 2025 lúc 8:00",
        new Date("2025-12-25T08:00:00.000Z"),
      );
    });
    it("unknown Vietnamese month → null", () => {
      // "tháng 0" is not a valid month
      expectUtc("10 tháng 0, 2026", null);
    });
  });
});
