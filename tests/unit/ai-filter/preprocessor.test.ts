import { describe, it, expect } from "vitest";
import { ContentPreprocessor } from "../../../packages/ai-filter/src/preprocessor.js";

describe("ContentPreprocessor", () => {
  // ── normalize() ──
  describe("normalize()", () => {
    it("collapses multiple spaces to a single space", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.normalize("hello   world")).toBe("hello world");
    });

    it("collapses tabs to a single space", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.normalize("hello\t\tworld")).toBe("hello world");
    });

    it("collapses 3+ newlines to 2 newlines", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.normalize("a\n\n\n\nb")).toBe("a\n\nb");
    });

    it("keeps double newlines intact", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.normalize("a\n\nb")).toBe("a\n\nb");
    });

    it("deduplicates consecutive identical emojis", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.normalize("🔥🔥🔥🔥")).toBe("🔥");
    });

    it("keeps different emojis next to each other", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.normalize("🔥💯")).toBe("🔥💯");
    });

    it("normalises ReactJS → React", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.normalize("We use ReactJS")).toBe("We use React");
    });

    it("normalises React.js → React", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.normalize("Built with React.js")).toBe("Built with React");
    });

    it("normalises Next.js → Nextjs", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.normalize("Next.js developer")).toBe("Nextjs developer");
    });

    it("normalises NextJS → Nextjs", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.normalize("NextJS experience")).toBe("Nextjs experience");
    });

    it("normalises Node.js → Nodejs", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.normalize("Node.js backend")).toBe("Nodejs backend");
    });

    it("normalises NodeJS → Nodejs", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.normalize("NodeJS server")).toBe("Nodejs server");
    });

    it("normalises GoLang → Go", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.normalize("GoLang developer")).toBe("Go developer");
    });

    it("normalises Vue.js → Vue", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.normalize("Vue.js experience")).toBe("Vue experience");
    });

    it("normalises AngularJS → Angular", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.normalize("AngularJS project")).toBe("Angular project");
    });

    it("trims leading and trailing whitespace", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.normalize("  hello  ")).toBe("hello");
    });

    it("truncates to 2000 chars", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      const long = "a".repeat(3000);
      expect(p.normalize(long).length).toBe(2000);
    });

    it("leaves text under 2000 chars unchanged in length", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      const short = "hello world";
      expect(p.normalize(short)).toBe("hello world");
    });
  });

  // ── containsTechKeywords() ──
  describe("containsTechKeywords()", () => {
    it("returns true when a keyword matches (case-insensitive)", () => {
      const p = new ContentPreprocessor({ keywords: ["React"], blacklist: [] });
      expect(p.containsTechKeywords("We need a react developer")).toBe(true);
    });

    it("returns true when any one of multiple keywords matches", () => {
      const p = new ContentPreprocessor({
        keywords: ["React", "Vue", "Angular"],
        blacklist: [],
      });
      expect(p.containsTechKeywords("Looking for a Vue expert")).toBe(true);
    });

    it("returns false when no keyword matches", () => {
      const p = new ContentPreprocessor({
        keywords: ["React", "Vue"],
        blacklist: [],
      });
      expect(p.containsTechKeywords("We are hiring a chef")).toBe(false);
    });

    it("returns true when keywords array is empty (bypass)", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.containsTechKeywords("We are hiring a chef")).toBe(true);
    });

    it("word boundary: 'Reactivity' does not match React keyword", () => {
      const p = new ContentPreprocessor({ keywords: ["React"], blacklist: [] });
      // "Reactivity" starts with React but word boundary should prevent match
      expect(p.containsTechKeywords("Good Reactivity is needed")).toBe(false);
    });
  });

  // ── isBlacklisted() ──
  describe("isBlacklisted()", () => {
    it("returns true when blacklisted term found (case-insensitive)", () => {
      const p = new ContentPreprocessor({
        keywords: [],
        blacklist: ["Acme Corp"],
      });
      expect(p.isBlacklisted("Hiring at Acme Corp now")).toBe(true);
    });

    it("returns true with different casing", () => {
      const p = new ContentPreprocessor({
        keywords: [],
        blacklist: ["acme corp"],
      });
      expect(p.isBlacklisted("ACME CORP is great")).toBe(true);
    });

    it("returns false when no blacklisted term found", () => {
      const p = new ContentPreprocessor({
        keywords: [],
        blacklist: ["Scam Inc"],
      });
      expect(p.isBlacklisted("Legit company is hiring")).toBe(false);
    });

    it("returns false when blacklist is empty", () => {
      const p = new ContentPreprocessor({ keywords: [], blacklist: [] });
      expect(p.isBlacklisted("any text at all")).toBe(false);
    });

    it("multiple blacklist entries: matches on any", () => {
      const p = new ContentPreprocessor({
        keywords: [],
        blacklist: ["BadCo", "EvilCorp"],
      });
      expect(p.isBlacklisted("Job at EvilCorp")).toBe(true);
    });
  });

  // ── isLocationExcluded() ──
  describe("isLocationExcluded()", () => {
    it("returns true when excluded location appears and no remote option exists", () => {
      const p = new ContentPreprocessor({
        keywords: [],
        blacklist: [],
        excludedLocations: ["HCM", "Da Nang"],
      });

      expect(p.isLocationExcluded("Hiring Frontend dev in HCM office")).toBe(
        true,
      );
    });

    it("returns false for mixed location options containing Remote", () => {
      const p = new ContentPreprocessor({
        keywords: [],
        blacklist: [],
        excludedLocations: ["HCM", "Da Nang"],
      });

      expect(p.isLocationExcluded("[Da Nang/HCM/Remote]")).toBe(false);
    });

    it("returns false when a post includes both excluded and remote-only positions", () => {
      const p = new ContentPreprocessor({
        keywords: [],
        blacklist: [],
        excludedLocations: ["HCM"],
      });

      expect(p.isLocationExcluded("Backend (HCM)\nFrontend (Remote)")).toBe(
        false,
      );
    });

    it("returns false when no excluded locations are matched", () => {
      const p = new ContentPreprocessor({
        keywords: [],
        blacklist: [],
        excludedLocations: ["HCM"],
      });

      expect(p.isLocationExcluded("Frontend role in Ha Noi")).toBe(false);
    });
  });
});
