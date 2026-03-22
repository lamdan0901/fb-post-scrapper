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
  createFeedback,
  fetchSettings,
  updateSettings,
  triggerScraper,
  fetchScraperStatus,
  fetchCronStatus,
  startCron,
  stopCron,
  uploadCookies,
  type JobsQuery,
  type JobsResponse,
  type Job,
  type Settings,
  type UpdateSettingsBody,
  type ScraperRunResponse,
  type ScraperStatus,
  type CronStatus,
  type CookieUploadResponse,
} from "./api";

// ── Query Keys ──

export const queryKeys = {
  jobs: (query: JobsQuery) => ["jobs", query] as const,
  settings: ["settings"] as const,
  scraperStatus: ["scraper-status"] as const,
  cronStatus: ["cron-status"] as const,
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

export function useTriggerScraper() {
  const queryClient = useQueryClient();
  return useMutation<ScraperRunResponse, Error>({
    mutationFn: triggerScraper,
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
  return useMutation<
    CookieUploadResponse,
    Error,
    { content: string; verify?: boolean }
  >({
    mutationFn: ({ content, verify }) => uploadCookies(content, verify),
  });
}
