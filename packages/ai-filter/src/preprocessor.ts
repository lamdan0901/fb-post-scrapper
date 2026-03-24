// ── Constants ──

const MAX_CONTENT_LENGTH = 2000;

/**
 * Case-insensitive tech term aliases.
 * Keys are matched via regex word-boundary; values are the canonical form.
 */
const TECH_TERM_ALIASES: ReadonlyMap<RegExp, string> = new Map([
  [/\bReactJS\b/gi, "React"],
  [/\bReact\.js\b/gi, "React"],
  [/\bNext\.js\b/gi, "Nextjs"],
  [/\bNextJS\b/gi, "Nextjs"],
  [/\bNode\.js\b/gi, "Nodejs"],
  [/\bNodeJS\b/gi, "Nodejs"],
  [/\bVue\.js\b/gi, "Vue"],
  [/\bVueJS\b/gi, "Vue"],
  [/\bAngularJS\b/gi, "Angular"],
  [/\bTypeScript\b/gi, "TypeScript"],
  [/\bJavaScript\b/gi, "JavaScript"],
  [/\bGoLang\b/gi, "Go"],
]);

/**
 * Matches a run of 2+ identical emoji characters.
 * Covers most emoji via the Unicode Extended_Pictographic property.
 */
const REPEATED_EMOJI_RE = /(\p{Extended_Pictographic})\1+/gu;
const REMOTE_OPTION_RE = /\b(remote|wfh|work from home)\b/i;

// ── ContentPreprocessor ──

export interface PreprocessorConfig {
  /** Tech keywords to test for relevance (e.g. ["react", "frontend"]). */
  keywords: string[];
  /** Company / term blacklist (e.g. ["tinhvan", "cmcglobal"]). */
  blacklist: string[];
  /** Location strings to exclude (e.g. ["HCM", "Ho Chi Minh", "Đà Nẵng"]). */
  excludedLocations?: string[];
}

export class ContentPreprocessor {
  private readonly keywordPatterns: RegExp[];
  private readonly blacklistPatterns: RegExp[];
  private readonly locationPatterns: RegExp[];

  constructor(config: PreprocessorConfig) {
    // Pre-compile boundary-aware regexes once for reuse.
    this.keywordPatterns = config.keywords.map((kw) =>
      buildBoundaryPattern(kw),
    );
    this.blacklistPatterns = config.blacklist.map((term) =>
      buildBoundaryPattern(term),
    );
    this.locationPatterns = (config.excludedLocations ?? []).map((loc) =>
      buildBoundaryPattern(loc),
    );
  }

  /**
   * Normalise raw post content:
   * 1. Collapse excessive whitespace
   * 2. Deduplicate consecutive identical emojis
   * 3. Normalise tech term aliases to canonical forms
   * 4. Trim to {@link MAX_CONTENT_LENGTH} characters
   */
  normalize(text: string): string {
    let result = text;

    // Collapse multiple blank lines into one, and runs of spaces/tabs into a single space.
    result = result.replace(/[ \t]+/g, " ");
    result = result.replace(/(\r?\n){3,}/g, "\n\n");

    // Deduplicate consecutive identical emojis (keep one).
    result = result.replace(REPEATED_EMOJI_RE, "$1");

    // Normalise tech term aliases.
    for (const [pattern, canonical] of TECH_TERM_ALIASES) {
      result = result.replace(pattern, canonical);
    }

    // Trim whitespace then cap length.
    result = result.trim();
    if (result.length > MAX_CONTENT_LENGTH) {
      result = result.slice(0, MAX_CONTENT_LENGTH);
    }

    return result;
  }

  /**
   * Check whether the text contains at least one tech keyword.
   * Returns `true` when no keywords are configured (no filtering).
   */
  containsTechKeywords(text: string): boolean {
    if (this.keywordPatterns.length === 0) return true;
    return this.keywordPatterns.some((re) => re.test(text));
  }

  /**
   * Check whether the text contains any blacklisted term.
   */
  isBlacklisted(text: string): boolean {
    return this.blacklistPatterns.some((re) => re.test(text));
  }

  /**
   * Check whether the text contains any excluded location term.
   * Returns `false` when no excluded locations are configured.
   *
   * If a post offers a Remote option anywhere in its location text,
   * it should not be excluded even when it also mentions excluded cities
   * (e.g. "[Da Nang/HCM/Remote]").
   */
  isLocationExcluded(text: string): boolean {
    if (this.locationPatterns.length === 0) return false;

    const hasExcludedLocation = this.locationPatterns.some((re) =>
      re.test(text),
    );
    if (!hasExcludedLocation) return false;

    return !REMOTE_OPTION_RE.test(text);
  }
}

// ── Helpers ──

/** Escape special regex characters in a literal string. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a case-insensitive regex with smart word boundaries.
 * Uses `\b` for edges that are word characters, and lookaround for
 * non-word edges (handles keywords like `C++`, `C#`, `.NET`).
 */
function buildBoundaryPattern(keyword: string): RegExp {
  const escaped = escapeRegExp(keyword);
  const prefix = /\w/.test(keyword[0]) ? "\\b" : "(?<=\\s|^)";
  const suffix = /\w/.test(keyword[keyword.length - 1]) ? "\\b" : "(?=\\s|$)";
  return new RegExp(`${prefix}${escaped}${suffix}`, "i");
}
