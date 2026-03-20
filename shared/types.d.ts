export declare const Role: {
    readonly Frontend: "Frontend";
    readonly Backend: "Backend";
    readonly Fullstack: "Fullstack";
    readonly Mobile: "Mobile";
    readonly Other: "Other";
};
export type Role = (typeof Role)[keyof typeof Role];
export declare const Level: {
    readonly Fresher: "Fresher";
    readonly Junior: "Junior";
    readonly Middle: "Middle";
    readonly Senior: "Senior";
    readonly Unknown: "Unknown";
};
export type Level = (typeof Level)[keyof typeof Level];
export declare const Status: {
    readonly New: "new";
    readonly Applied: "applied";
    readonly Saved: "saved";
    readonly Archived: "archived";
};
export type Status = (typeof Status)[keyof typeof Status];
export declare const FeedbackType: {
    readonly Relevant: "relevant";
    readonly Irrelevant: "irrelevant";
};
export type FeedbackType = (typeof FeedbackType)[keyof typeof FeedbackType];
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
export interface ClassificationResult {
    isMatch: boolean;
    isFreelance: boolean;
    role: Role;
    level: Level;
    yoe: number | null;
    score: number;
    reason: string;
}
//# sourceMappingURL=types.d.ts.map