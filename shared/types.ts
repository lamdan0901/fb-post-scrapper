// ── Enums (as const unions, mirroring future Prisma enums) ──

export const Role = {
  Frontend: "Frontend",
  Backend: "Backend",
  Fullstack: "Fullstack",
  Mobile: "Mobile",
  Other: "Other",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Level = {
  Fresher: "Fresher",
  Junior: "Junior",
  Middle: "Middle",
  Senior: "Senior",
  Unknown: "Unknown",
} as const;
export type Level = (typeof Level)[keyof typeof Level];

export const Status = {
  New: "new",
  Applied: "applied",
  Saved: "saved",
  Archived: "archived",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const FeedbackType = {
  Relevant: "relevant",
  Irrelevant: "irrelevant",
} as const;
export type FeedbackType = (typeof FeedbackType)[keyof typeof FeedbackType];

// ── Scraper → AI Filter pipeline types ──

export interface RawPost {
  fbPostId?: string;
  content: string;
  postUrl: string;
  posterName: string;
  posterProfileUrl: string;
  createdTimeRaw: string;
  createdTimeUtc?: Date;
  firstSeenAt: Date;
  groupUrl: string;
}

// ── AI Classification result (Gemini response) ──

export interface ClassificationResult {
  isMatch: boolean;
  isFreelance: boolean;
  role: Role;
  level: Level;
  yoe: number | null;
  score: number; // 0–100
  reason: string;
}
