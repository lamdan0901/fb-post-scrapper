import type { Settings } from "@job-alert/generated-prisma";
import type { Role, Level } from "@job-alert/shared";

export interface ParsedSettings {
  id: number;
  target_groups: string[];
  target_keywords: string[];
  blacklist: string[];
  allowed_roles: Role[];
  allowed_levels: Level[];
  max_yoe: number;
  cron_schedule: string;
  scrape_lookback_hours: number | null;
  scrape_date_from: string | null;
  scrape_date_to: string | null;
  max_posts_per_group: number;
}

export function parseSettingsRow(row: Settings): ParsedSettings {
  return {
    id: row.id,
    target_groups: JSON.parse(row.target_groups) as string[],
    target_keywords: JSON.parse(row.target_keywords) as string[],
    blacklist: JSON.parse(row.blacklist) as string[],
    allowed_roles: JSON.parse(row.allowed_roles) as Role[],
    allowed_levels: JSON.parse(row.allowed_levels) as Level[],
    max_yoe: row.max_yoe,
    cron_schedule: row.cron_schedule,
    scrape_lookback_hours: row.scrape_lookback_hours ?? null,
    scrape_date_from: row.scrape_date_from ?? null,
    scrape_date_to: row.scrape_date_to ?? null,
    max_posts_per_group: row.max_posts_per_group,
  };
}
