import type { ContentPreprocessor } from "./preprocessor.js";

export interface PreFilterResult {
  shouldCallAI: boolean;
  skipReason?: string;
}

export class PreFilter {
  constructor(private readonly preprocessor: ContentPreprocessor) {}

  /**
   * Evaluate whether a post should be sent to the Gemini API.
   * Checks blacklist first (discard even if tech-relevant), then tech keywords.
   * Expects already-normalised text.
   */
  evaluate(text: string): PreFilterResult {
    // Stage 1: blacklist check
    if (this.preprocessor.isBlacklisted(text)) {
      return { shouldCallAI: false, skipReason: "Blacklisted company" };
    }

    // Stage 2: location exclusion check
    if (this.preprocessor.isLocationExcluded(text)) {
      return { shouldCallAI: false, skipReason: "Excluded location" };
    }

    // Stage 3: tech keyword check
    if (!this.preprocessor.containsTechKeywords(text)) {
      return { shouldCallAI: false, skipReason: "Not tech-related" };
    }

    return { shouldCallAI: true };
  }
}
