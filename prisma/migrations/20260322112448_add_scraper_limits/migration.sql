-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
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
    "max_posts_per_group" INTEGER NOT NULL DEFAULT 50,
    "max_groups" INTEGER NOT NULL DEFAULT 10,
    "max_total_posts" INTEGER NOT NULL DEFAULT 50
);
INSERT INTO "new_Settings" ("allowed_levels", "allowed_roles", "blacklist", "cron_schedule", "id", "max_yoe", "scrape_date_from", "scrape_date_to", "scrape_lookback_hours", "target_groups", "target_keywords") SELECT "allowed_levels", "allowed_roles", "blacklist", "cron_schedule", "id", "max_yoe", "scrape_date_from", "scrape_date_to", "scrape_lookback_hours", "target_groups", "target_keywords" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
