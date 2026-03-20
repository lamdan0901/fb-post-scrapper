/**
 * Vitest global setup for integration tests.
 *
 * Runs ONCE before all integration test workers start.
 * - Creates `tests/test.db` via prisma migrate deploy
 * - Seeds a Settings row + sample Job rows for API tests
 *
 * Runs ONCE after all tests complete.
 * - Deletes `tests/test.db`
 */
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const TEST_DB_URL = "file:./tests/test.db";
const testDbPath = path.resolve(rootDir, "tests/test.db");

export async function setup(): Promise<void> {
  // Apply all migrations to the test database
  execSync("pnpm prisma migrate deploy", {
    cwd: rootDir,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });

  // Seed test data
  const adapter = new PrismaBetterSqlite3({ url: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    // Clean slate
    await prisma.userFeedback.deleteMany();
    await prisma.job.deleteMany();
    await prisma.settings.deleteMany();

    // Settings row (id = 1 by schema default)
    await prisma.settings.create({
      data: {
        id: 1,
        target_groups: JSON.stringify([
          "https://www.facebook.com/groups/itjobs",
        ]),
        target_keywords: JSON.stringify(["react", "frontend", "typescript"]),
        blacklist: JSON.stringify(["blacklisted-company"]),
        allowed_roles: JSON.stringify([
          "Frontend",
          "Backend",
          "Fullstack",
          "Mobile",
          "Other",
        ]),
        allowed_levels: JSON.stringify([
          "Fresher",
          "Junior",
          "Middle",
          "Unknown",
        ]),
        max_yoe: 5,
        cron_schedule: "0 */4 * * *",
      },
    });

    // Sample Jobs for API tests
    const now = new Date();
    await prisma.job.createMany({
      data: [
        {
          content: "Remote Frontend React job – Junior level, 1–2 YOE",
          post_url: "https://www.facebook.com/groups/test/posts/1001",
          poster_name: "Test Recruiter",
          poster_url: "https://www.facebook.com/testrecruiter",
          post_url_hash: "test-url-hash-1",
          content_hash: "test-content-hash-1",
          role: "Frontend",
          level: "Junior",
          yoe: 1,
          score: 80,
          reason: "React frontend match",
          is_freelance: false,
          status: "new",
          created_time_raw: "2h",
          first_seen_at: now,
        },
        {
          content: "Backend Nodejs position, remote, 2–3 YOE",
          post_url: "https://www.facebook.com/groups/test/posts/1002",
          poster_name: "Test Recruiter 2",
          poster_url: "https://www.facebook.com/testrecruiter2",
          post_url_hash: "test-url-hash-2",
          content_hash: "test-content-hash-2",
          role: "Backend",
          level: "Middle",
          yoe: 2,
          score: 75,
          reason: "Node backend match",
          is_freelance: false,
          status: "applied",
          created_time_raw: "1d",
          first_seen_at: now,
        },
        {
          content: "Freelance React/TS project, short-term, remote",
          post_url: "https://www.facebook.com/groups/test/posts/1003",
          poster_name: "Test Freelance Poster",
          poster_url: "https://www.facebook.com/testfreelance",
          post_url_hash: "test-url-hash-3",
          content_hash: "test-content-hash-3",
          role: "Fullstack",
          level: "Unknown",
          yoe: null,
          score: 70,
          reason: "Freelance fullstack",
          is_freelance: true,
          status: "saved",
          created_time_raw: "3h",
          first_seen_at: now,
        },
      ],
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function teardown(): Promise<void> {
  rmSync(testDbPath, { force: true });
}
