import { defineConfig } from "vitest/config";
import { config as loadDotenv } from "dotenv";

// Load .env so env vars like GEMINI_API_KEY are available when building the
// integration project's env block.
loadDotenv();

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 120_000,
          globalSetup: ["./tests/integration/global-setup.ts"],
          maxWorkers: 1, // SQLite doesn't support concurrent writes
          env: {
            DATABASE_URL: "file:./tests/test.db",
            API_AUTH_TOKEN: "test-token",
            ALLOWED_ORIGINS: "*",
            PORT: "3001",
            COOKIE_PATH: "./tests/test-cookies.txt",
            // Pass through GEMINI_API_KEY from .env for the calibration test
            ...(process.env["GEMINI_API_KEY"]
              ? { GEMINI_API_KEY: process.env["GEMINI_API_KEY"] }
              : {}),
          },
        },
      },
    ],
  },
});
