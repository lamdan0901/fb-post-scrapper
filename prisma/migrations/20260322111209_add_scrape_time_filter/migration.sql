-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "scrape_date_from" TEXT;
ALTER TABLE "Settings" ADD COLUMN "scrape_date_to" TEXT;
ALTER TABLE "Settings" ADD COLUMN "scrape_lookback_hours" INTEGER;
