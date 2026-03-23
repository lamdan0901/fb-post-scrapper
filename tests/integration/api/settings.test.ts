/**
 * 9.3.3 — API Integration Tests: /api/settings endpoints
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { SuperTest, Test } from "supertest";
import { createTestAgent, AUTH_HEADER } from "../helpers/request.js";

const VALID_SETTINGS = {
  target_groups: ["https://www.facebook.com/groups/testgroup"],
  target_keywords: ["react", "typescript"],
  blacklist: ["blacklisted-company"],
  allowed_roles: ["Frontend", "Fullstack", "Mobile"],
  allowed_levels: ["Fresher", "Junior", "Middle", "Unknown"],
  role_keywords: { Frontend: ["react", "nextjs"] },
  common_rules: "",
  role_rules: {},
  max_yoe: 4,
  cron_schedule: "0 */6 * * *",
  max_posts_per_group: 50,
};

describe("GET /api/settings", () => {
  let agent: SuperTest<Test>;

  beforeAll(() => {
    agent = createTestAgent() as unknown as SuperTest<Test>;
  });

  it("returns 401 without Authorization header", async () => {
    const res = await agent.get("/api/settings");
    expect(res.status).toBe(401);
  });

  it("returns settings with JSON fields parsed to arrays", async () => {
    const res = await agent
      .get("/api/settings")
      .set("Authorization", AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 1,
      target_groups: expect.any(Array),
      target_keywords: expect.any(Array),
      blacklist: expect.any(Array),
      allowed_roles: expect.any(Array),
      allowed_levels: expect.any(Array),
      role_keywords: expect.any(Object),
      common_rules: expect.any(String),
      role_rules: expect.any(Object),
      max_yoe: expect.any(Number),
      cron_schedule: expect.any(String),
    });
    // Arrays must be real arrays, not raw JSON strings
    expect(Array.isArray(res.body.target_groups)).toBe(true);
    expect(Array.isArray(res.body.target_keywords)).toBe(true);
    expect(Array.isArray(res.body.blacklist)).toBe(true);
  });
});

describe("PUT /api/settings", () => {
  let agent: SuperTest<Test>;

  beforeAll(() => {
    agent = createTestAgent() as unknown as SuperTest<Test>;
  });

  it("returns 401 without Authorization header", async () => {
    const res = await agent.put("/api/settings").send(VALID_SETTINGS);
    expect(res.status).toBe(401);
  });

  it("updates settings with valid payload and returns 200", async () => {
    const res = await agent
      .put("/api/settings")
      .set("Authorization", AUTH_HEADER)
      .send(VALID_SETTINGS);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      target_groups: VALID_SETTINGS.target_groups,
      max_yoe: VALID_SETTINGS.max_yoe,
      cron_schedule: VALID_SETTINGS.cron_schedule,
    });
  });

  it("returns 400 for an invalid cron expression", async () => {
    const res = await agent
      .put("/api/settings")
      .set("Authorization", AUTH_HEADER)
      .send({ ...VALID_SETTINGS, cron_schedule: "not a cron" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a cron expression with out-of-range values", async () => {
    const res = await agent
      .put("/api/settings")
      .set("Authorization", AUTH_HEADER)
      .send({ ...VALID_SETTINGS, cron_schedule: "60 25 32 13 7" }); // all out of range
    expect(res.status).toBe(400);
  });

  it("returns 400 for negative max_yoe", async () => {
    const res = await agent
      .put("/api/settings")
      .set("Authorization", AUTH_HEADER)
      .send({ ...VALID_SETTINGS, max_yoe: -1 });
    expect(res.status).toBe(400);
  });

  it("returns 400 for zero max_yoe", async () => {
    const res = await agent
      .put("/api/settings")
      .set("Authorization", AUTH_HEADER)
      .send({ ...VALID_SETTINGS, max_yoe: 0 });
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty target_groups array", async () => {
    const res = await agent
      .put("/api/settings")
      .set("Authorization", AUTH_HEADER)
      .send({ ...VALID_SETTINGS, target_groups: [] });
    expect(res.status).toBe(400);
  });

  it("returns 400 for target_groups containing an invalid URL", async () => {
    const res = await agent
      .put("/api/settings")
      .set("Authorization", AUTH_HEADER)
      .send({ ...VALID_SETTINGS, target_groups: ["not-a-url"] });
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty target_keywords array", async () => {
    const res = await agent
      .put("/api/settings")
      .set("Authorization", AUTH_HEADER)
      .send({ ...VALID_SETTINGS, target_keywords: [] });
    expect(res.status).toBe(400);
  });

  it("accepts an empty blacklist array", async () => {
    const res = await agent
      .put("/api/settings")
      .set("Authorization", AUTH_HEADER)
      .send({ ...VALID_SETTINGS, blacklist: [] });
    expect(res.status).toBe(200);
  });
});
