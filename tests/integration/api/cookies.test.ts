/**
 * 9.3.3 — API Integration Tests: /api/cookies endpoints
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { SuperTest, Test } from "supertest";
import { createTestAgent, AUTH_HEADER } from "../helpers/request.js";

// Minimal valid Netscape cookie file containing both required Facebook cookies
const VALID_COOKIE_CONTENT = [
  "# Netscape HTTP Cookie File",
  "# This is a test cookie file",
  ".facebook.com\tTRUE\t/\tTRUE\t2147483647\tc_user\t100000000",
  ".facebook.com\tTRUE\t/\tTRUE\t2147483647\txs\tabc123:def456:1",
  ".facebook.com\tTRUE\t/\tFALSE\t2147483647\tdatr\tsome-datr-value",
].join("\n");

// Cookie file missing the required 'c_user' cookie
const MISSING_C_USER_CONTENT = [
  "# Netscape HTTP Cookie File",
  ".facebook.com\tTRUE\t/\tTRUE\t2147483647\txs\tabc123:def456:1",
].join("\n");

// Cookie file that has no valid Facebook cookies at all
const NO_FACEBOOK_COOKIES = [
  "# Netscape HTTP Cookie File",
  ".google.com\tTRUE\t/\tFALSE\t2147483647\tSID\tsome-value",
].join("\n");

describe("POST /api/cookies/upload", () => {
  let agent: SuperTest<Test>;

  beforeAll(() => {
    agent = createTestAgent() as unknown as SuperTest<Test>;
  });

  it("returns 401 without Authorization header", async () => {
    const res = await agent
      .post("/api/cookies/upload")
      .send({ content: VALID_COOKIE_CONTENT, verify: false });
    expect(res.status).toBe(401);
  });

  it("accepts a valid Netscape cookie file with required cookies (no verify)", async () => {
    const res = await agent
      .post("/api/cookies/upload")
      .set("Authorization", AUTH_HEADER)
      .send({ content: VALID_COOKIE_CONTENT, verify: false });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ valid: true });
  });

  it("returns 400 when c_user cookie is missing", async () => {
    const res = await agent
      .post("/api/cookies/upload")
      .set("Authorization", AUTH_HEADER)
      .send({ content: MISSING_C_USER_CONTENT, verify: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("c_user");
  });

  it("returns 400 when no Facebook cookies are present", async () => {
    const res = await agent
      .post("/api/cookies/upload")
      .set("Authorization", AUTH_HEADER)
      .send({ content: NO_FACEBOOK_COOKIES, verify: false });
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is an empty string", async () => {
    const res = await agent
      .post("/api/cookies/upload")
      .set("Authorization", AUTH_HEADER)
      .send({ content: "", verify: false });
    expect(res.status).toBe(400);
  });

  it("returns 400 when content field is missing from body", async () => {
    const res = await agent
      .post("/api/cookies/upload")
      .set("Authorization", AUTH_HEADER)
      .send({ verify: false });
    expect(res.status).toBe(400);
  });
});
