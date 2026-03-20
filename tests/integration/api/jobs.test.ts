/**
 * 9.3.3 — API Integration Tests: /api/jobs endpoints
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { SuperTest, Test } from "supertest";
import { createTestAgent, AUTH_HEADER } from "../helpers/request.js";

describe("GET /api/jobs", () => {
  let agent: SuperTest<Test>;

  beforeAll(() => {
    agent = createTestAgent() as unknown as SuperTest<Test>;
  });

  it("returns 401 without Authorization header", async () => {
    const res = await agent.get("/api/jobs");
    expect(res.status).toBe(401);
  });

  it("returns paginated jobs with correct shape", async () => {
    const res = await agent.get("/api/jobs").set("Authorization", AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      jobs: expect.any(Array),
      total: expect.any(Number),
      page: 1,
      totalPages: expect.any(Number),
    });
    expect(res.body.jobs.length).toBeGreaterThan(0);
  });

  it("filters by role=Frontend", async () => {
    const res = await agent
      .get("/api/jobs?role=Frontend")
      .set("Authorization", AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(
      res.body.jobs.every((j: { role: string }) => j.role === "Frontend"),
    ).toBe(true);
  });

  it("filters by status=applied", async () => {
    const res = await agent
      .get("/api/jobs?status=applied")
      .set("Authorization", AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(
      res.body.jobs.every((j: { status: string }) => j.status === "applied"),
    ).toBe(true);
  });

  it("filters by is_freelance=true and returns only freelance jobs", async () => {
    const res = await agent
      .get("/api/jobs?is_freelance=true")
      .set("Authorization", AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(
      res.body.jobs.every(
        (j: { is_freelance: boolean }) => j.is_freelance === true,
      ),
    ).toBe(true);
  });

  it("searches content by keyword", async () => {
    const res = await agent
      .get("/api/jobs?search=React")
      .set("Authorization", AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(
      res.body.jobs.every((j: { content: string }) =>
        j.content.toLowerCase().includes("react"),
      ),
    ).toBe(true);
  });

  it("paginates correctly: limit=1 returns one job", async () => {
    const res = await agent
      .get("/api/jobs?limit=1&page=1")
      .set("Authorization", AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.page).toBe(1);
  });

  it("returns 400 for invalid page < 1", async () => {
    const res = await agent
      .get("/api/jobs?page=0")
      .set("Authorization", AUTH_HEADER);
    expect(res.status).toBe(400);
  });

  it("returns 400 for limit > 100", async () => {
    const res = await agent
      .get("/api/jobs?limit=101")
      .set("Authorization", AUTH_HEADER);
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/jobs/:id", () => {
  let agent: SuperTest<Test>;

  beforeAll(() => {
    agent = createTestAgent() as unknown as SuperTest<Test>;
  });

  it("returns 401 without Authorization header", async () => {
    const res = await agent.put("/api/jobs/1").send({ status: "applied" });
    expect(res.status).toBe(401);
  });

  it("updates job status and returns the updated job", async () => {
    const res = await agent
      .put("/api/jobs/1")
      .set("Authorization", AUTH_HEADER)
      .send({ status: "saved" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.status).toBe("saved");
  });

  it("returns 400 for an invalid status value", async () => {
    const res = await agent
      .put("/api/jobs/1")
      .set("Authorization", AUTH_HEADER)
      .send({ status: "unknown-status" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a non-existent job id", async () => {
    const res = await agent
      .put("/api/jobs/99999")
      .set("Authorization", AUTH_HEADER)
      .send({ status: "applied" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/jobs/:id/feedback", () => {
  let agent: SuperTest<Test>;

  beforeAll(() => {
    agent = createTestAgent() as unknown as SuperTest<Test>;
  });

  it("returns 401 without Authorization header", async () => {
    const res = await agent
      .post("/api/jobs/1/feedback")
      .send({ feedback_type: "relevant" });
    expect(res.status).toBe(401);
  });

  it("creates a 'relevant' feedback and returns 201", async () => {
    const res = await agent
      .post("/api/jobs/1/feedback")
      .set("Authorization", AUTH_HEADER)
      .send({ feedback_type: "relevant" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      job_id: 1,
      feedback_type: "relevant",
    });
  });

  it("creates an 'irrelevant' feedback and returns 201", async () => {
    const res = await agent
      .post("/api/jobs/2/feedback")
      .set("Authorization", AUTH_HEADER)
      .send({ feedback_type: "irrelevant" });
    expect(res.status).toBe(201);
    expect(res.body.feedback_type).toBe("irrelevant");
  });

  it("returns 400 for an invalid feedback_type", async () => {
    const res = await agent
      .post("/api/jobs/1/feedback")
      .set("Authorization", AUTH_HEADER)
      .send({ feedback_type: "dunno" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a non-existent job id", async () => {
    const res = await agent
      .post("/api/jobs/99999/feedback")
      .set("Authorization", AUTH_HEADER)
      .send({ feedback_type: "relevant" });
    expect(res.status).toBe(404);
  });
});
