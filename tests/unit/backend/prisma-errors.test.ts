import { describe, it, expect } from "vitest";
import { isUniqueConstraintError } from "../../../packages/backend/src/lib/prisma-errors.js";

describe("isUniqueConstraintError", () => {
  it("returns true for Prisma P2002-style errors", () => {
    const error = Object.assign(new Error("duplicate"), { code: "P2002" });

    expect(isUniqueConstraintError(error)).toBe(true);
  });

  it("returns true for legacy sqlite unique-constraint messages", () => {
    const error = new Error("SQLITE_ERROR: UNIQUE constraint failed: RawPost.post_url_hash");

    expect(isUniqueConstraintError(error)).toBe(true);
  });

  it("returns true for modern Prisma unique-constraint messages", () => {
    const error = new Error(
      "Unique constraint failed on the fields: (`post_url_hash`)",
    );

    expect(isUniqueConstraintError(error)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isUniqueConstraintError(new Error("boom"))).toBe(false);
    expect(isUniqueConstraintError({ code: "P2003" })).toBe(false);
  });
});