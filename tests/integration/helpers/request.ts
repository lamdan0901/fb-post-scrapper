/**
 * Supertest helper for integration API tests.
 *
 * Creates a configured supertest agent against the Express app
 * with the test auth token pre-applied.
 */
import supertest from "supertest";
import { createApp } from "../../../packages/backend/src/app.js";

/** Returns a supertest agent bound to a fresh app instance. */
export function createTestAgent() {
  const app = createApp();
  return supertest(app);
}

/** Returns the Authorization header value for the test token. */
export const AUTH_HEADER = "Bearer test-token";
