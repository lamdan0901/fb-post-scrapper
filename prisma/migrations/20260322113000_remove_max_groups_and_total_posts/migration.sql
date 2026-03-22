-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "target_groups" TEXT NOT NULL,
    "target_keywords" TEXT NOT NULL,
    "blacklist" TEXT NOT NULL,
    "allowed_roles" TEXT NOT NULL DEFAULT '["Frontend","Backend","Fullstack","Mobile","Other"]',
    "allowed_levels" TEXT NOT NULL DEFAULT '["Fresher","Junior","Middle","Unknown"]',
    "max_yoe" INTEGER NOT NULL DEFAULT 5,
    "cron_schedule" TEXT NOT NULL DEFAULT '0 */4 * * *',
    "scrape_lookback_hours" INTEGER,
    "scrape_date_from" TEXT,
    "scrape_date_to" TEXT,
    "max_posts_per_group" INTEGER NOT NULL DEFAULT 50
);
INSERT INTO "new_Settings" ("id", "target_groups", "target_keywords", "blacklist", "allowed_roles", "allowed_levels", "max_yoe", "cron_schedule", "scrape_lookback_hours", "scrape_date_from", "scrape_date_to", "max_posts_per_group")
    SELECT "id", "target_groups", "target_keywords", "blacklist", "allowed_roles", "allowed_levels", "max_yoe", "cron_schedule", "scrape_lookback_hours", "scrape_date_from", "scrape_date_to", "max_posts_per_group" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
