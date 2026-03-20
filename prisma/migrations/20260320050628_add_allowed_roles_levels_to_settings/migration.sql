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
    "cron_schedule" TEXT NOT NULL DEFAULT '0 */4 * * *'
);
INSERT INTO "new_Settings" ("blacklist", "cron_schedule", "id", "max_yoe", "target_groups", "target_keywords") SELECT "blacklist", "cron_schedule", "id", "max_yoe", "target_groups", "target_keywords" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
