-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RawPost" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fb_post_id" TEXT,
    "content" TEXT NOT NULL,
    "post_url" TEXT NOT NULL,
    "poster_name" TEXT NOT NULL,
    "poster_url" TEXT NOT NULL,
    "post_url_hash" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "group_url" TEXT NOT NULL,
    "scrape_date" TEXT NOT NULL DEFAULT '',
    "created_time_raw" TEXT NOT NULL,
    "created_time_utc" DATETIME,
    "first_seen_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_RawPost" ("content", "content_hash", "created_at", "created_time_raw", "created_time_utc", "fb_post_id", "first_seen_at", "group_url", "id", "post_url", "post_url_hash", "poster_name", "poster_url") SELECT "content", "content_hash", "created_at", "created_time_raw", "created_time_utc", "fb_post_id", "first_seen_at", "group_url", "id", "post_url", "post_url_hash", "poster_name", "poster_url" FROM "RawPost";
DROP TABLE "RawPost";
ALTER TABLE "new_RawPost" RENAME TO "RawPost";
CREATE UNIQUE INDEX "RawPost_post_url_hash_key" ON "RawPost"("post_url_hash");
CREATE INDEX "RawPost_content_hash_idx" ON "RawPost"("content_hash");
CREATE INDEX "RawPost_fb_post_id_idx" ON "RawPost"("fb_post_id");
CREATE INDEX "RawPost_scrape_date_idx" ON "RawPost"("scrape_date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
