-- CreateTable
CREATE TABLE "Job" (
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
    "created_time_raw" TEXT NOT NULL,
    "created_time_utc" DATETIME,
    "first_seen_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "target_groups" TEXT NOT NULL,
    "target_keywords" TEXT NOT NULL,
    "blacklist" TEXT NOT NULL,
    "max_yoe" INTEGER NOT NULL DEFAULT 5,
    "cron_schedule" TEXT NOT NULL DEFAULT '0 */4 * * *'
);

-- CreateTable
CREATE TABLE "UserFeedback" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "job_id" INTEGER NOT NULL,
    "feedback_type" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserFeedback_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "Job" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_post_url_hash_key" ON "Job"("post_url_hash");

-- CreateIndex
CREATE INDEX "Job_content_hash_idx" ON "Job"("content_hash");

-- CreateIndex
CREATE INDEX "Job_fb_post_id_idx" ON "Job"("fb_post_id");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_role_idx" ON "Job"("role");

-- CreateIndex
CREATE INDEX "Job_level_idx" ON "Job"("level");

-- CreateIndex
CREATE INDEX "Job_created_at_idx" ON "Job"("created_at");

-- CreateIndex
CREATE INDEX "UserFeedback_job_id_idx" ON "UserFeedback"("job_id");
