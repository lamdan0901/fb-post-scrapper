/**
 * Parses Facebook timestamp strings into UTC Date objects.
 *
 * Handles three categories:
 *  1. Relative times  — "Just now", "2h", "3 mins", "1d", "2w"
 *  2. Absolute times  — "Yesterday at 10:00 AM", "March 10 at 2:00 PM", "March 10, 2026"
 *  3. Vietnamese times — "Vừa xong", "2 giờ", "3 phút", "Hôm qua lúc 10:00"
 */

export interface ParsedTimestamp {
  createdTimeRaw: string;
  createdTimeUtc: Date | null;
  firstSeenAt: Date;
}

// ── Month name maps ──

const ENGLISH_MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const VIETNAMESE_MONTHS: Record<string, number> = {
  "tháng 1": 0,
  "tháng 2": 1,
  "tháng 3": 2,
  "tháng 4": 3,
  "tháng 5": 4,
  "tháng 6": 5,
  "tháng 7": 6,
  "tháng 8": 7,
  "tháng 9": 8,
  "tháng 10": 9,
  "tháng 11": 10,
  "tháng 12": 11,
};

// ── Relative time unit maps (English + Vietnamese) ──

const RELATIVE_UNITS: Record<string, number> = {
  // English
  s: 1_000,
  sec: 1_000,
  secs: 1_000,
  second: 1_000,
  seconds: 1_000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  wk: 604_800_000,
  wks: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
  // Vietnamese
  giây: 1_000,
  phút: 60_000,
  giờ: 3_600_000,
  ngày: 86_400_000,
  tuần: 604_800_000,
};

// Patterns for "just now" in English and Vietnamese
const JUST_NOW_PATTERNS = [
  /^just\s+now$/i,
  /^vừa\s+xong$/i,
  /^vừa\s+mới$/i,
  /^mới\s+đây$/i,
  /^now$/i,
];

// ── Regex patterns ──

/** Relative: "2h", "3 mins", "1 hr", "5 phút", "2 giờ" */
const RELATIVE_RE =
  /^(\d+)\s*([a-záàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ]+)$/i;

/** "Yesterday at 10:00 AM" / "Yesterday at 10:00" / "Hôm qua lúc 10:00" */
const YESTERDAY_EN_RE = /^yesterday\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i;
const YESTERDAY_VI_RE = /^hôm\s+qua\s+lúc\s+(\d{1,2}):(\d{2})$/i;

/** "March 10 at 2:00 PM" / "March 10 at 14:00" */
const MONTH_DAY_TIME_EN_RE =
  /^([A-Z][a-z]+)\s+(\d{1,2})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i;

/** "March 10, 2026" / "March 10, 2026 at 2:00 PM" */
const MONTH_DAY_YEAR_RE =
  /^([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})(?:\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?$/i;

/** Vietnamese: "10 tháng 3 lúc 14:00" / "10 tháng 3" */
const VI_DAY_MONTH_TIME_RE =
  /^(\d{1,2})\s+(tháng\s+\d{1,2})(?:\s+lúc\s+(\d{1,2}):(\d{2}))?$/i;

/** Vietnamese: "10 tháng 3, 2026" / "10 tháng 3, 2026 lúc 14:00" */
const VI_DAY_MONTH_YEAR_RE =
  /^(\d{1,2})\s+(tháng\s+\d{1,2}),?\s+(\d{4})(?:\s+lúc\s+(\d{1,2}):(\d{2}))?$/i;

export class TimestampParser {
  /**
   * Parse a raw Facebook timestamp string into a UTC date.
   *
   * @param raw  — the original timestamp text from Facebook
   * @param now  — reference "now" for relative calculations (defaults to `new Date()`)
   * @returns parsed timestamp info; `createdTimeUtc` is `null` if parsing fails
   */
  parse(raw: string, now: Date = new Date()): ParsedTimestamp {
    const trimmed = raw.trim();
    const result: ParsedTimestamp = {
      createdTimeRaw: trimmed,
      createdTimeUtc: null,
      firstSeenAt: now,
    };

    if (!trimmed) return result;

    result.createdTimeUtc =
      this.parseJustNow(trimmed, now) ??
      this.parseRelative(trimmed, now) ??
      this.parseYesterday(trimmed, now) ??
      this.parseAbsoluteEnglish(trimmed, now) ??
      this.parseAbsoluteVietnamese(trimmed, now);

    return result;
  }

  // ── "Just now" / "Vừa xong" ──

  private parseJustNow(text: string, now: Date): Date | null {
    for (const pattern of JUST_NOW_PATTERNS) {
      if (pattern.test(text)) return new Date(now);
    }
    return null;
  }

  // ── Relative timestamps: "2h", "3 mins", "1 ngày" ──

  private parseRelative(text: string, now: Date): Date | null {
    const match = RELATIVE_RE.exec(text);
    if (!match) return null;

    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const ms = RELATIVE_UNITS[unit];
    if (ms === undefined) return null;

    return new Date(now.getTime() - amount * ms);
  }

  // ── Yesterday ──

  private parseYesterday(text: string, now: Date): Date | null {
    let hours: number;
    let minutes: number;

    const enMatch = YESTERDAY_EN_RE.exec(text);
    if (enMatch) {
      hours = this.to24Hour(parseInt(enMatch[1], 10), enMatch[3]);
      minutes = parseInt(enMatch[2], 10);
    } else {
      const viMatch = YESTERDAY_VI_RE.exec(text);
      if (!viMatch) return null;
      hours = parseInt(viMatch[1], 10);
      minutes = parseInt(viMatch[2], 10);
    }

    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - 1);
    date.setUTCHours(hours, minutes, 0, 0);
    return date;
  }

  // ── Absolute English: "March 10 at 2:00 PM", "March 10, 2026" ──

  private parseAbsoluteEnglish(text: string, now: Date): Date | null {
    // "March 10 at 2:00 PM"
    const dayTimeMatch = MONTH_DAY_TIME_EN_RE.exec(text);
    if (dayTimeMatch) {
      const month = ENGLISH_MONTHS[dayTimeMatch[1].toLowerCase()];
      if (month === undefined) return null;

      const day = parseInt(dayTimeMatch[2], 10);
      const hours = this.to24Hour(
        parseInt(dayTimeMatch[3], 10),
        dayTimeMatch[5],
      );
      const minutes = parseInt(dayTimeMatch[4], 10);

      const date = new Date(
        Date.UTC(now.getUTCFullYear(), month, day, hours, minutes, 0, 0),
      );

      // If the date is in the future, assume previous year
      if (date.getTime() > now.getTime()) {
        date.setUTCFullYear(date.getUTCFullYear() - 1);
      }
      return date;
    }

    // "March 10, 2026" or "March 10, 2026 at 2:00 PM"
    const yearMatch = MONTH_DAY_YEAR_RE.exec(text);
    if (yearMatch) {
      const month = ENGLISH_MONTHS[yearMatch[1].toLowerCase()];
      if (month === undefined) return null;

      const day = parseInt(yearMatch[2], 10);
      const year = parseInt(yearMatch[3], 10);
      const hours = yearMatch[4]
        ? this.to24Hour(parseInt(yearMatch[4], 10), yearMatch[6])
        : 0;
      const minutes = yearMatch[5] ? parseInt(yearMatch[5], 10) : 0;

      return new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
    }

    return null;
  }

  // ── Absolute Vietnamese: "10 tháng 3 lúc 14:00", "10 tháng 3, 2026" ──

  private parseAbsoluteVietnamese(text: string, now: Date): Date | null {
    // "10 tháng 3, 2026 lúc 14:00"
    const yearMatch = VI_DAY_MONTH_YEAR_RE.exec(text);
    if (yearMatch) {
      const day = parseInt(yearMatch[1], 10);
      const month = VIETNAMESE_MONTHS[yearMatch[2].toLowerCase()];
      if (month === undefined) return null;

      const year = parseInt(yearMatch[3], 10);
      const hours = yearMatch[4] ? parseInt(yearMatch[4], 10) : 0;
      const minutes = yearMatch[5] ? parseInt(yearMatch[5], 10) : 0;

      return new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
    }

    // "10 tháng 3 lúc 14:00"
    const dayTimeMatch = VI_DAY_MONTH_TIME_RE.exec(text);
    if (dayTimeMatch) {
      const day = parseInt(dayTimeMatch[1], 10);
      const month = VIETNAMESE_MONTHS[dayTimeMatch[2].toLowerCase()];
      if (month === undefined) return null;

      const hours = dayTimeMatch[3] ? parseInt(dayTimeMatch[3], 10) : 0;
      const minutes = dayTimeMatch[4] ? parseInt(dayTimeMatch[4], 10) : 0;

      const date = new Date(
        Date.UTC(now.getUTCFullYear(), month, day, hours, minutes, 0, 0),
      );

      // If the date is in the future, assume previous year
      if (date.getTime() > now.getTime()) {
        date.setUTCFullYear(date.getUTCFullYear() - 1);
      }
      return date;
    }

    return null;
  }

  // ── Helpers ──

  private to24Hour(hour: number, meridiem?: string): number {
    if (!meridiem) return hour;
    const upper = meridiem.toUpperCase();
    if (upper === "AM") return hour === 12 ? 0 : hour;
    if (upper === "PM") return hour === 12 ? 12 : hour + 12;
    return hour;
  }
}
