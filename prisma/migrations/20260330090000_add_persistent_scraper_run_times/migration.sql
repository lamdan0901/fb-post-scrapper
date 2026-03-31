-- Persist scraper run timestamps across backend restarts
ALTER TABLE "Settings" ADD COLUMN "last_manual_run" DATETIME;
ALTER TABLE "Settings" ADD COLUMN "last_cron_run" DATETIME;
