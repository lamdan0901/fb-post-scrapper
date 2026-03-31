import { useEffect, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { Briefcase } from "lucide-react";
import { toast } from "sonner";
import type { JobsQuery } from "../lib/api";
import {
  useJobs,
  useRunTimes,
  useScraperStatus,
  useTriggerScraper,
  useCancelScraper,
  useSettings,
  useUpdateSettings,
} from "../lib/hooks";
import FilterBar from "../components/FilterBar";
import JobCard from "../components/JobCard";

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  // Build page numbers: show up to 5 around current
  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-1.5 pt-4">
      <button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        ← Prev
      </button>
      {pages[0] > 1 && (
        <>
          <button
            onClick={() => onPageChange(1)}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 hover:border-gray-600 hover:text-white"
          >
            1
          </button>
          {pages[0] > 2 && <span className="px-1 text-gray-600">…</span>}
        </>
      )}
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
            p === page
              ? "border-blue-600 bg-blue-600/20 text-blue-300"
              : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white"
          }`}
        >
          {p}
        </button>
      ))}
      {pages[pages.length - 1] < totalPages && (
        <>
          {pages[pages.length - 1] < totalPages - 1 && (
            <span className="px-1 text-gray-600">…</span>
          )}
          <button
            onClick={() => onPageChange(totalPages)}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 hover:border-gray-600 hover:text-white"
          >
            {totalPages}
          </button>
        </>
      )}
      <button
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next →
      </button>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-4 w-24 rounded bg-gray-800" />
        <div className="h-3 w-12 rounded bg-gray-800" />
      </div>
      <div className="mb-3 flex gap-2">
        <div className="h-5 w-16 rounded-full bg-gray-800" />
        <div className="h-5 w-14 rounded-full bg-gray-800" />
        <div className="h-5 w-12 rounded-full bg-gray-800" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-gray-800" />
        <div className="h-3 w-5/6 rounded bg-gray-800" />
        <div className="h-3 w-4/6 rounded bg-gray-800" />
      </div>
      <div className="mt-4 border-t border-gray-800 pt-3">
        <div className="flex gap-2">
          <div className="h-7 w-20 rounded-lg bg-gray-800" />
          <div className="h-7 w-16 rounded-lg bg-gray-800" />
          <div className="h-7 w-14 rounded-lg bg-gray-800" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  hasFilters,
  onClearFilters,
}: {
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-800">
        <Briefcase className="h-7 w-7 text-gray-500" />
      </div>
      <p className="text-lg font-medium text-gray-400">
        {hasFilters ? "No matching jobs" : "No jobs yet"}
      </p>
      <p className="mt-1 text-sm text-gray-600">
        {hasFilters
          ? "Try adjusting your filters to see more results."
          : "Run a scrape from the panel above to start collecting jobs."}
      </p>
      {hasFilters && (
        <button
          onClick={onClearFilters}
          className="mt-4 rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function JobsScraperPanel() {
  const trigger = useTriggerScraper();
  const cancelTrigger = useCancelScraper();
  const { data: settings } = useSettings();
  const { data: runTimes } = useRunTimes();
  const updateSettingsMutation = useUpdateSettings();
  const { data: status } = useScraperStatus({
    refetchInterval: (query) => {
      const d = query.state.data;
      return d?.status === "running" || d?.status === "cancelling"
        ? 3000
        : false;
    },
  });

  const isRunning =
    status?.status === "running" || status?.status === "cancelling";
  const isCancelling = status?.status === "cancelling";

  const lookbackHours = settings?.scrape_lookback_hours ?? null;
  const hasLegacyDateRange =
    (settings?.scrape_date_from ?? null) != null ||
    (settings?.scrape_date_to ?? null) != null;
  const [draftLookbackValue, setDraftLookbackValue] = useState<number>(() =>
    lookbackHours == null
      ? 4
      : lookbackHours % 24 === 0
        ? lookbackHours / 24
        : lookbackHours,
  );
  const [draftLookbackUnit, setDraftLookbackUnit] = useState<"hours" | "days">(
    () =>
      lookbackHours == null
        ? "hours"
        : lookbackHours % 24 === 0
          ? "days"
          : "hours",
  );
  const [runFilterMode, setRunFilterMode] = useState<
    "savedFilter" | "lastManualRunWindow"
  >("savedFilter");
  const hasLastManualRun = Boolean(runTimes?.lastManualRun);

  function updatePostAgeFilter(hours: number | null, silent = false) {
    if (!settings || updateSettingsMutation.isPending) return;
    updateSettingsMutation.mutate(
      {
        ...settings,
        scrape_lookback_hours: hours,
        scrape_date_from: null,
        scrape_date_to: null,
      },
      {
        onSuccess: () => {
          if (!silent) toast.success("Post age filter updated");
        },
        onError: (err) => {
          toast.error(`Failed to update filter: ${err.message}`);
        },
      },
    );
  }

  useEffect(() => {
    if (!settings || updateSettingsMutation.isPending) return;
    if (lookbackHours == null && hasLegacyDateRange) {
      updateSettingsMutation.mutate(
        {
          ...settings,
          scrape_lookback_hours: null,
          scrape_date_from: null,
          scrape_date_to: null,
        },
        {
          onError: (err) => {
            toast.error(`Failed to clear legacy date filter: ${err.message}`);
          },
        },
      );
    }
  }, [settings, lookbackHours, hasLegacyDateRange, updateSettingsMutation]);

  function commitDraftLookback() {
    const safeValue = Math.max(1, draftLookbackValue || 1);
    const hours = draftLookbackUnit === "days" ? safeValue * 24 : safeValue;
    updatePostAgeFilter(hours);
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      {!isRunning && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={trigger.isPending || cancelTrigger.isPending}
            onClick={() => {
              if (
                runFilterMode === "lastManualRunWindow" &&
                !hasLastManualRun
              ) {
                toast.warning(
                  "No manual run found yet. Run once first or use saved filter.",
                );
                return;
              }
              trigger.mutate(
                runFilterMode === "lastManualRunWindow"
                  ? { useLastManualRunWindow: true }
                  : undefined,
                {
                  onSuccess: () => toast.success("Scraper started"),
                  onError: (err) =>
                    toast.error(`Failed to start scraper: ${err.message}`),
                },
              );
            }}
            className="w-fit rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {trigger.isPending ? "Starting…" : "Run Scraper"}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Scrape window
            </span>
            <button
              type="button"
              disabled={trigger.isPending || cancelTrigger.isPending}
              onClick={() => setRunFilterMode("savedFilter")}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                runFilterMode === "savedFilter"
                  ? "border-blue-600 bg-blue-600/20 text-blue-300"
                  : "border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              Use saved filter
            </button>
            <button
              type="button"
              disabled={
                trigger.isPending ||
                cancelTrigger.isPending ||
                !hasLastManualRun
              }
              onClick={() => setRunFilterMode("lastManualRunWindow")}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                runFilterMode === "lastManualRunWindow"
                  ? "border-blue-600 bg-blue-600/20 text-blue-300"
                  : "border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              Most recent manual run → now
            </button>
          </div>
        </div>
      )}

      {isRunning && (
        <>
          <button
            type="button"
            disabled={cancelTrigger.isPending || isCancelling}
            onClick={() => {
              cancelTrigger.mutate(
                { runId: status?.runId },
                {
                  onSuccess: () => toast.success("Cancellation requested"),
                  onError: (err) =>
                    toast.error(`Failed to cancel run: ${err.message}`),
                },
              );
            }}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelTrigger.isPending || isCancelling
              ? "Cancelling…"
              : "Cancel Scraper"}
          </button>
          <span className="text-sm text-gray-400">Scraper run is active</span>
        </>
      )}

      <div className="flex gap-2 items-center">
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!settings || updateSettingsMutation.isPending}
            onClick={() => updatePostAgeFilter(null)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              lookbackHours == null && !hasLegacyDateRange
                ? "border-blue-600 bg-blue-600/20 text-blue-300"
                : "border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
            }`}
          >
            No filter
          </button>
          <button
            type="button"
            disabled={!settings || updateSettingsMutation.isPending}
            onClick={commitDraftLookback}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              lookbackHours != null
                ? "border-blue-600 bg-blue-600/20 text-blue-300"
                : "border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
            }`}
          >
            Lookback
          </button>
        </div>

        {lookbackHours != null && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-gray-400">Last</span>
            <input
              type="number"
              min={1}
              value={draftLookbackValue}
              disabled={!settings || updateSettingsMutation.isPending}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10) || 1;
                setDraftLookbackValue(v);
              }}
              onBlur={commitDraftLookback}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitDraftLookback();
              }}
              className="w-24 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-600 disabled:opacity-50"
            />
            <select
              value={draftLookbackUnit}
              disabled={!settings || updateSettingsMutation.isPending}
              onChange={(e) => {
                const unit = e.target.value as "hours" | "days";
                setDraftLookbackUnit(unit);
              }}
              onBlur={commitDraftLookback}
              className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-600 disabled:opacity-50"
            >
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-gray-500">
        {runFilterMode === "lastManualRunWindow"
          ? `Run Scraper will process posts from ${
              runTimes?.lastManualRun
                ? `${new Date(runTimes.lastManualRun).toLocaleString()} to now`
                : "the most recent manual run to now when available"
            }.`
          : "Run Scraper will use your saved Post Age Filter settings."}
      </p>
    </div>
  );
}

export default function JobsPage() {
  const [filters, setFilters] = useState<JobsQuery>({ page: 1, limit: 20 });
  const { data, isLoading, isError, error, refetch } = useJobs(filters, {
    placeholderData: keepPreviousData,
  });
  const { data: runTimes } = useRunTimes();
  const { data: scraperStatus } = useScraperStatus({
    refetchInterval: (query) => {
      const current = query.state.data;
      return current?.status === "running" ? 3000 : false;
    },
  });

  const lastManualRunNewJobs =
    scraperStatus?.status === "completed" && scraperStatus.source === "manual"
      ? (scraperStatus.result?.savedCount ?? 0)
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jobs</h1>
          {runTimes && (
            <div className="mt-1 flex flex-wrap gap-4 text-xs text-gray-500">
              <span>
                Last manual run:{" "}
                {runTimes.lastManualRun
                  ? timeAgo(runTimes.lastManualRun)
                  : "never"}
              </span>
              <span>
                Last auto run:{" "}
                {runTimes.lastCronRun ? timeAgo(runTimes.lastCronRun) : "never"}
              </span>
              {lastManualRunNewJobs !== null && (
                <span>
                  Last run completed: {lastManualRunNewJobs} new post
                  {lastManualRunNewJobs !== 1 ? "s" : ""} added
                </span>
              )}
            </div>
          )}
        </div>
        {data && (
          <span className="text-sm text-gray-500">
            {data.total} job{data.total !== 1 ? "s" : ""} found
          </span>
        )}
      </div>

      {/* Filters */}
      <FilterBar filters={filters} onChange={setFilters} />

      <JobsScraperPanel />

      {/* Loading */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-6 text-center">
          <p className="text-sm text-red-400">
            Failed to load jobs: {error.message}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {data && data.jobs.length === 0 && (
        <EmptyState
          hasFilters={
            !!(
              filters.role ||
              filters.level ||
              filters.status ||
              filters.source ||
              filters.is_freelance !== undefined ||
              filters.search
            )
          }
          onClearFilters={() => setFilters({ page: 1, limit: 20 })}
        />
      )}

      {/* Job cards grid */}
      {data && data.jobs.length > 0 && (
        <>
          <div className="columns-1 gap-4 md:columns-2">
            {data.jobs.map((job) => (
              <div key={job.id} className="break-inside-avoid mb-4">
                <JobCard job={job} />
              </div>
            ))}
          </div>

          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            onPageChange={(p) => setFilters((prev) => ({ ...prev, page: p }))}
          />
        </>
      )}
    </div>
  );
}
