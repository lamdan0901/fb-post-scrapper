import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import type { Status, FeedbackType } from "@job-alert/shared";
import {
  fetchJobs,
  updateJobStatus,
  deleteJob,
  createFeedback,
  fetchSettings,
  updateSettings,
  triggerScraper,
  triggerFilterOnly,
  cancelScraper,
  fetchScraperStatus,
  fetchRunTimes,
  fetchCronStatus,
  startCron,
  stopCron,
  fetchCookieInfo,
  uploadCookies,
  fetchRawPostDates,
  fetchRawPosts,
  type JobsQuery,
  type JobsResponse,
  type Job,
  type Settings,
  type UpdateSettingsBody,
  type ScraperRunResponse,
  type ScraperStatus,
  type CancelScraperBody,
  type RunTimes,
  type CronStatus,
  type CookieUploadResponse,
  type CookieInfo,
  type CookieVerifyResponse,
  type RawPostsDatesResponse,
  type RawPostsResponse,
  type RawPostsQuery,
  verifyCookies,
} from "./api";

// ── Query Keys ──

export const queryKeys = {
  jobs: (query: JobsQuery) => ["jobs", query] as const,
  settings: ["settings"] as const,
  scraperStatus: ["scraper-status"] as const,
  runTimes: ["run-times"] as const,
  cronStatus: ["cron-status"] as const,
  cookieInfo: ["cookie-info"] as const,
  rawPostDates: ["raw-post-dates"] as const,
  rawPosts: (query: RawPostsQuery) => ["raw-posts", query] as const,
};

// ── Jobs ──

export function useJobs(
  query: JobsQuery = {},
  options?: Partial<UseQueryOptions<JobsResponse>>,
) {
  return useQuery({
    queryKey: queryKeys.jobs(query),
    queryFn: () => fetchJobs(query),
    ...options,
  });
}

export function useUpdateJobStatus() {
  const queryClient = useQueryClient();
  return useMutation<Job, Error, { id: number; status: Status }>({
    mutationFn: ({ id, status }) => updateJobStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) => deleteJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useCreateFeedback() {
  const queryClient = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { id: number; feedbackType: FeedbackType }
  >({
    mutationFn: ({ id, feedbackType }) => createFeedback(id, feedbackType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

// ── Settings ──

export function useSettings(options?: Partial<UseQueryOptions<Settings>>) {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: fetchSettings,
    ...options,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation<Settings, Error, UpdateSettingsBody>({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}

// ── Scraper ──

export function useScraperStatus(
  options?: Partial<UseQueryOptions<ScraperStatus>>,
) {
  return useQuery({
    queryKey: queryKeys.scraperStatus,
    queryFn: fetchScraperStatus,
    ...options,
  });
}

export function useRunTimes(options?: Partial<UseQueryOptions<RunTimes>>) {
  return useQuery({
    queryKey: queryKeys.runTimes,
    queryFn: fetchRunTimes,
    ...options,
  });
}

export function useTriggerScraper() {
  const queryClient = useQueryClient();
  return useMutation<ScraperRunResponse, Error>({
    mutationFn: triggerScraper,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scraperStatus });
    },
  });
}

export function useTriggerFilterOnly() {
  const queryClient = useQueryClient();
  return useMutation<ScraperRunResponse, Error>({
    mutationFn: triggerFilterOnly,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scraperStatus });
    },
  });
}

export function useCancelScraper() {
  const queryClient = useQueryClient();
  return useMutation<ScraperStatus, Error, CancelScraperBody>({
    mutationFn: (body) => cancelScraper(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scraperStatus });
    },
  });
}

// ── Cron ──

export function useCronStatus(options?: Partial<UseQueryOptions<CronStatus>>) {
  return useQuery({
    queryKey: queryKeys.cronStatus,
    queryFn: fetchCronStatus,
    ...options,
  });
}

export function useStartCron() {
  const queryClient = useQueryClient();
  return useMutation<CronStatus, Error>({
    mutationFn: startCron,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cronStatus });
    },
  });
}

export function useStopCron() {
  const queryClient = useQueryClient();
  return useMutation<CronStatus, Error>({
    mutationFn: stopCron,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cronStatus });
    },
  });
}

// ── Cookies ──

export function useUploadCookies() {
  const queryClient = useQueryClient();
  return useMutation<
    CookieUploadResponse,
    Error,
    { content: string; verify?: boolean }
  >({
    mutationFn: ({ content, verify }) => uploadCookies(content, verify),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cookieInfo });
    },
  });
}

export function useCookieInfo(options?: Partial<UseQueryOptions<CookieInfo>>) {
  return useQuery({
    queryKey: queryKeys.cookieInfo,
    queryFn: fetchCookieInfo,
    ...options,
  });
}

export function useVerifyCookies() {
  return useMutation<CookieVerifyResponse, Error>({
    mutationFn: verifyCookies,
  });
}

// ── Raw Posts ──

export function useRawPostDates(
  options?: Partial<UseQueryOptions<RawPostsDatesResponse>>,
) {
  return useQuery({
    queryKey: queryKeys.rawPostDates,
    queryFn: fetchRawPostDates,
    ...options,
  });
}

export function useRawPosts(
  query: RawPostsQuery = {},
  options?: Partial<UseQueryOptions<RawPostsResponse>>,
) {
  return useQuery({
    queryKey: queryKeys.rawPosts(query),
    queryFn: () => fetchRawPosts(query),
    ...options,
  });
}
