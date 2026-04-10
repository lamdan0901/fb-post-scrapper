import type {
  Role,
  Level,
  Status,
  FeedbackType,
  RoleKeywords,
  RoleRules,
  RoleExclusionKeywords,
} from "@job-alert/shared";

const BASE_URL = "/api";

// ── Types ──

export interface Job {
  id: number;
  fb_post_id: string | null;
  content: string;
  post_url: string;
  poster_name: string;
  poster_url: string | null;
  post_url_hash: string;
  content_hash: string;
  role: Role;
  level: Level;
  yoe: number | null;
  score: number;
  reason: string;
  is_freelance: boolean;
  status: Status;
  source: string;
  created_time_raw: string | null;
  created_time_utc: string | null;
  first_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface JobsResponse {
  jobs: Job[];
  total: number;
  page: number;
  totalPages: number;
}

export interface JobsQuery {
  page?: number;
  limit?: number;
  role?: Role;
  level?: Level;
  is_freelance?: boolean;
  status?: Status;
  source?: string;
  search?: string;
}

export interface Settings {
  id: number;
  target_groups: string[];
  target_keywords: string[];
  blacklist: string[];
  allowed_roles: Role[];
  allowed_levels: Level[];
  role_keywords: RoleKeywords;
  role_exclusion_keywords: RoleExclusionKeywords;
  common_rules: string;
  role_rules: RoleRules;
  max_yoe: number;
  cron_schedule: string;
  scrape_lookback_hours: number | null;
  scrape_date_from: string | null;
  scrape_date_to: string | null;
  max_posts_per_group: number;
  excluded_locations: string[];
}

export interface UpdateSettingsBody {
  target_groups: string[];
  target_keywords: string[];
  blacklist: string[];
  allowed_roles: Role[];
  allowed_levels: Level[];
  role_keywords: RoleKeywords;
  role_exclusion_keywords: RoleExclusionKeywords;
  common_rules: string;
  role_rules: RoleRules;
  max_yoe: number;
  cron_schedule: string;
  scrape_lookback_hours: number | null;
  scrape_date_from: string | null;
  scrape_date_to: string | null;
  max_posts_per_group: number;
  excluded_locations: string[];
}

export interface ScraperRunResponse {
  runId: string;
  status: string;
}

export interface TriggerScraperBody {
  useLastManualRunWindow?: boolean;
}

export interface ScraperStatus {
  status: string;
  runId?: string;
  source?: "manual" | "cron";
  runType?: "scraper" | "filter-only";
  startedAt?: string;
  completedAt?: string;
  error?: string;
  result?: {
    scrape: {
      groupsAttempted: number;
      groupsSucceeded: number;
      groupsFailed: number;
      totalScraped: number;
      totalNew: number;
    };
    ai: {
      total: number;
      processed: number;
      matched: number;
      skipped: number;
      apiCallsUsed: number;
    };
    savedCount: number;
  };
}

export interface CancelScraperBody {
  runId?: string;
}

export interface CookieUploadResponse {
  valid: boolean;
  message: string;
  expires_at: string | null;
}

export interface CookieInfo {
  exists: boolean;
  expires_at: string | null;
  is_expired: boolean;
}

export interface CookieVerifyResponse {
  valid: boolean;
  message: string;
  expires_at: string | null;
}

export interface CronStatus {
  active: boolean;
  expression: string | null;
}

export interface RunTimes {
  lastManualRun: string | null;
  lastCronRun: string | null;
}

// ── API Client ──

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("api_token") ?? "";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...getAuthHeaders(), ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ── Raw Posts ──

export interface RawPost {
  id: number;
  fb_post_id: string | null;
  content: string;
  post_url: string;
  poster_name: string;
  poster_url: string;
  post_url_hash: string;
  content_hash: string;
  group_url: string;
  scrape_date: string;
  created_time_raw: string;
  created_time_utc: string | null;
  first_seen_at: string;
  created_at: string;
  // AI filter fields
  filter_role: string | null;
  filter_level: string | null;
  filter_yoe: number | null;
  filter_score: number | null;
  filter_reason: string | null;
  rejection_reason: string | null;
}

export interface RawPostsDatesResponse {
  dates: string[];
}

export interface RawPostsResponse {
  posts: RawPost[];
  total: number;
  page: number;
  totalPages: number;
}

export interface RawPostsQuery {
  date?: string;
  page?: number;
  limit?: number;
}

// ── Jobs ──

export function fetchJobs(query: JobsQuery = {}): Promise<JobsResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return request<JobsResponse>(`/jobs${qs ? `?${qs}` : ""}`);
}

export function updateJobStatus(id: number, status: Status): Promise<Job> {
  return request<Job>(`/jobs/${id}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export function deleteJob(id: number): Promise<void> {
  return request<void>(`/jobs/${id}`, { method: "DELETE" });
}

export function createFeedback(
  id: number,
  feedbackType: FeedbackType,
): Promise<unknown> {
  return request(`/jobs/${id}/feedback`, {
    method: "POST",
    body: JSON.stringify({ feedback_type: feedbackType }),
  });
}

// ── Settings ──

export function fetchSettings(): Promise<Settings> {
  return request<Settings>("/settings");
}

export function updateSettings(body: UpdateSettingsBody): Promise<Settings> {
  return request<Settings>("/settings", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

// ── Scraper ──

export function triggerScraper(
  body: TriggerScraperBody = {},
): Promise<ScraperRunResponse> {
  return request<ScraperRunResponse>("/scraper/run", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function triggerFilterOnly(): Promise<ScraperRunResponse> {
  return request<ScraperRunResponse>("/scraper/filter-only", {
    method: "POST",
  });
}

export function cancelScraper(
  body: CancelScraperBody = {},
): Promise<ScraperStatus> {
  return request<ScraperStatus>("/scraper/cancel", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchScraperStatus(): Promise<ScraperStatus> {
  return request<ScraperStatus>("/scraper/status");
}

export function fetchRunTimes(): Promise<RunTimes> {
  return request<RunTimes>("/scraper/run-times");
}

export function fetchCronStatus(): Promise<CronStatus> {
  return request<CronStatus>("/scraper/cron/status");
}

export function startCron(): Promise<CronStatus> {
  return request<CronStatus>("/scraper/cron/start", { method: "POST" });
}

export function stopCron(): Promise<CronStatus> {
  return request<CronStatus>("/scraper/cron/stop", { method: "POST" });
}

// ── Cookies ──

export function fetchCookieInfo(): Promise<CookieInfo> {
  return request<CookieInfo>("/cookies/info");
}

export function verifyCookies(): Promise<CookieVerifyResponse> {
  return request<CookieVerifyResponse>("/cookies/verify", { method: "POST" });
}

export function uploadCookies(
  content: string,
  verify = false,
): Promise<CookieUploadResponse> {
  return request<CookieUploadResponse>("/cookies/upload", {
    method: "POST",
    body: JSON.stringify({ content, verify }),
  });
}

// ── Raw Posts ──

export function fetchRawPostDates(): Promise<RawPostsDatesResponse> {
  return request<RawPostsDatesResponse>("/raw-posts/dates");
}

export function fetchRawPosts(
  query: RawPostsQuery = {},
): Promise<RawPostsResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return request<RawPostsResponse>(`/raw-posts${qs ? `?${qs}` : ""}`);
}
