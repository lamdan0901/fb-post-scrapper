-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Job" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fb_post_id" TEXT,
    "content" TEXT NOT NULL,
    "post_url" TEXT NOT NULL,
    "poster_name" TEXT NOT NULL,
    "poster_url" TEXT NOT NULL,
    "post_url_hash" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "yoe" INTEGER,
    "score" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "is_freelance" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_time_raw" TEXT NOT NULL,
    "created_time_utc" DATETIME,
    "first_seen_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Job" ("content", "content_hash", "created_at", "created_time_raw", "created_time_utc", "fb_post_id", "first_seen_at", "id", "is_freelance", "level", "post_url", "post_url_hash", "poster_name", "poster_url", "reason", "role", "score", "status", "yoe") SELECT "content", "content_hash", "created_at", "created_time_raw", "created_time_utc", "fb_post_id", "first_seen_at", "id", "is_freelance", "level", "post_url", "post_url_hash", "poster_name", "poster_url", "reason", "role", "score", "status", "yoe" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE UNIQUE INDEX "Job_post_url_hash_key" ON "Job"("post_url_hash");
CREATE INDEX "Job_content_hash_idx" ON "Job"("content_hash");
CREATE INDEX "Job_fb_post_id_idx" ON "Job"("fb_post_id");
CREATE INDEX "Job_status_idx" ON "Job"("status");
CREATE INDEX "Job_role_idx" ON "Job"("role");
CREATE INDEX "Job_level_idx" ON "Job"("level");
CREATE INDEX "Job_created_at_idx" ON "Job"("created_at");
CREATE INDEX "Job_source_idx" ON "Job"("source");
CREATE TABLE "new_UserFeedback" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "job_id" INTEGER NOT NULL,
    "feedback_type" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserFeedback_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserFeedback" ("created_at", "feedback_type", "id", "job_id") SELECT "created_at", "feedback_type", "id", "job_id" FROM "UserFeedback";
DROP TABLE "UserFeedback";
ALTER TABLE "new_UserFeedback" RENAME TO "UserFeedback";
CREATE INDEX "UserFeedback_job_id_idx" ON "UserFeedback"("job_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
