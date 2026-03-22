-- CreateTable
CREATE TABLE "RawPost" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fb_post_id" TEXT,
    "content" TEXT NOT NULL,
    "post_url" TEXT NOT NULL,
    "poster_name" TEXT NOT NULL,
    "poster_url" TEXT NOT NULL,
    "post_url_hash" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "group_url" TEXT NOT NULL,
    "created_time_raw" TEXT NOT NULL,
    "created_time_utc" DATETIME,
    "first_seen_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "RawPost_post_url_hash_key" ON "RawPost"("post_url_hash");

-- CreateIndex
CREATE INDEX "RawPost_content_hash_idx" ON "RawPost"("content_hash");

-- CreateIndex
CREATE INDEX "RawPost_fb_post_id_idx" ON "RawPost"("fb_post_id");
