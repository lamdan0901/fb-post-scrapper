import { describe, it, expect } from "vitest";
import {
  listJobsQuerySchema,
  updateJobStatusSchema,
  createFeedbackSchema,
} from "../../../packages/backend/src/routes/jobs.js";
import { updateSettingsSchema } from "../../../packages/backend/src/routes/settings.js";

// ── listJobsQuerySchema ──
describe("listJobsQuerySchema", () => {
  it("parses a minimal query (empty object) using defaults", () => {
    const result = listJobsQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("coerces string page and limit to numbers", () => {
    const result = listJobsQuerySchema.parse({ page: "2", limit: "10" });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });

  it("parses all optional filter fields", () => {
    const result = listJobsQuerySchema.parse({
      role: "Frontend",
      level: "Junior",
      is_freelance: "true",
      status: "new",
      search: "react developer",
    });
    expect(result.role).toBe("Frontend");
    expect(result.level).toBe("Junior");
    expect(result.is_freelance).toBe(true);
    expect(result.status).toBe("new");
    expect(result.search).toBe("react developer");
  });

  it("coerces is_freelance: 'true' → true", () => {
    const result = listJobsQuerySchema.parse({ is_freelance: "true" });
    expect(result.is_freelance).toBe(true);
  });

  it("coerces is_freelance: 'false' → false", () => {
    const result = listJobsQuerySchema.parse({ is_freelance: "false" });
    expect(result.is_freelance).toBe(false);
  });

  it("throws when limit > 100", () => {
    expect(() => listJobsQuerySchema.parse({ limit: "101" })).toThrow();
  });

  it("throws when limit < 1", () => {
    expect(() => listJobsQuerySchema.parse({ limit: "0" })).toThrow();
  });

  it("throws when page < 1", () => {
    expect(() => listJobsQuerySchema.parse({ page: "0" })).toThrow();
  });

  it("throws when role is invalid", () => {
    expect(() => listJobsQuerySchema.parse({ role: "DevOps" })).toThrow();
  });

  it("throws when level is invalid", () => {
    expect(() => listJobsQuerySchema.parse({ level: "Expert" })).toThrow();
  });

  it("throws when status is invalid", () => {
    expect(() => listJobsQuerySchema.parse({ status: "pending" })).toThrow();
  });

  it("throws when search exceeds 200 chars", () => {
    expect(() =>
      listJobsQuerySchema.parse({ search: "a".repeat(201) }),
    ).toThrow();
  });
});

// ── updateJobStatusSchema ──
describe("updateJobStatusSchema", () => {
  it.each(["new", "applied", "saved", "archived"])(
    'accepts valid status "%s"',
    (status) => {
      expect(() => updateJobStatusSchema.parse({ status })).not.toThrow();
    },
  );

  it("throws for an unknown status value", () => {
    expect(() => updateJobStatusSchema.parse({ status: "pending" })).toThrow();
  });

  it("throws when status is missing", () => {
    expect(() => updateJobStatusSchema.parse({})).toThrow();
  });
});

// ── createFeedbackSchema ──
describe("createFeedbackSchema", () => {
  it("accepts 'relevant'", () => {
    expect(() =>
      createFeedbackSchema.parse({ feedback_type: "relevant" }),
    ).not.toThrow();
  });

  it("accepts 'irrelevant'", () => {
    expect(() =>
      createFeedbackSchema.parse({ feedback_type: "irrelevant" }),
    ).not.toThrow();
  });

  it("throws for an unknown feedback type", () => {
    expect(() =>
      createFeedbackSchema.parse({ feedback_type: "spam" }),
    ).toThrow();
  });

  it("throws when feedback_type is missing", () => {
    expect(() => createFeedbackSchema.parse({})).toThrow();
  });
});

// ── updateSettingsSchema ──
describe("updateSettingsSchema", () => {
  const VALID = {
    target_groups: ["https://www.facebook.com/groups/123456"],
    target_keywords: ["React", "Node"],
    blacklist: ["MLM", "Scam"],
    allowed_roles: ["Frontend", "Backend"],
    allowed_levels: ["Junior", "Middle"],
    role_keywords: {},
    common_rules: "",
    role_rules: {},
    max_yoe: 3,
    cron_schedule: "0 */4 * * *",
    max_posts_per_group: 50,
  };

  it("accepts a fully valid settings object", () => {
    expect(() => updateSettingsSchema.parse(VALID)).not.toThrow();
  });

  it("accepts empty blacklist array", () => {
    expect(() =>
      updateSettingsSchema.parse({ ...VALID, blacklist: [] }),
    ).not.toThrow();
  });

  it("throws when target_groups is empty", () => {
    expect(() =>
      updateSettingsSchema.parse({ ...VALID, target_groups: [] }),
    ).toThrow();
  });

  it("throws when a target_group is not a valid URL", () => {
    expect(() =>
      updateSettingsSchema.parse({ ...VALID, target_groups: ["not-a-url"] }),
    ).toThrow();
  });

  it("throws when target_keywords is empty", () => {
    expect(() =>
      updateSettingsSchema.parse({ ...VALID, target_keywords: [] }),
    ).toThrow();
  });

  it("throws when max_yoe is <= 0", () => {
    expect(() =>
      updateSettingsSchema.parse({ ...VALID, max_yoe: 0 }),
    ).toThrow();
  });

  it("throws when max_yoe is negative", () => {
    expect(() =>
      updateSettingsSchema.parse({ ...VALID, max_yoe: -1 }),
    ).toThrow();
  });

  it("throws when max_yoe is not an integer", () => {
    expect(() =>
      updateSettingsSchema.parse({ ...VALID, max_yoe: 2.5 }),
    ).toThrow();
  });

  it("throws when allowed_roles is empty", () => {
    expect(() =>
      updateSettingsSchema.parse({ ...VALID, allowed_roles: [] }),
    ).toThrow();
  });

  it("throws when allowed_levels is empty", () => {
    expect(() =>
      updateSettingsSchema.parse({ ...VALID, allowed_levels: [] }),
    ).toThrow();
  });

  describe("cron_schedule validation (via updateSettingsSchema)", () => {
    it.each([
      "0 */4 * * *",
      "*/15 * * * *",
      "0 8 * * 1-5",
      "30 6 * * *",
      "0 0 1 * *",
      "0 0 * * 0",
    ])('accepts valid cron "%s"', (cron_schedule) => {
      expect(() =>
        updateSettingsSchema.parse({ ...VALID, cron_schedule }),
      ).not.toThrow();
    });

    it("throws when cron has only 4 fields", () => {
      expect(() =>
        updateSettingsSchema.parse({ ...VALID, cron_schedule: "0 * * *" }),
      ).toThrow();
    });

    it("throws when cron has 6 fields", () => {
      expect(() =>
        updateSettingsSchema.parse({ ...VALID, cron_schedule: "0 * * * * *" }),
      ).toThrow();
    });

    it("throws when minute field is out of range (60)", () => {
      expect(() =>
        updateSettingsSchema.parse({ ...VALID, cron_schedule: "60 * * * *" }),
      ).toThrow();
    });

    it("throws when hour field is out of range (24)", () => {
      expect(() =>
        updateSettingsSchema.parse({ ...VALID, cron_schedule: "0 24 * * *" }),
      ).toThrow();
    });

    it("throws when month field is out of range (13)", () => {
      expect(() =>
        updateSettingsSchema.parse({ ...VALID, cron_schedule: "0 0 1 13 *" }),
      ).toThrow();
    });

    it("throws when day-of-week is out of range (7)", () => {
      expect(() =>
        updateSettingsSchema.parse({ ...VALID, cron_schedule: "0 0 * * 7" }),
      ).toThrow();
    });

    it("throws when field contains invalid characters", () => {
      expect(() =>
        updateSettingsSchema.parse({ ...VALID, cron_schedule: "0 0 ? * *" }),
      ).toThrow();
    });

    it("throws when cron_schedule is empty string", () => {
      expect(() =>
        updateSettingsSchema.parse({ ...VALID, cron_schedule: "" }),
      ).toThrow();
    });
  });
});
