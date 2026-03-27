import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { Briefcase } from "lucide-react";
import type { JobsQuery } from "../lib/api";
import { useJobs, useRunTimes, useScraperStatus } from "../lib/hooks";
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
          : "Run a scrape from the Settings page to start collecting jobs."}
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
