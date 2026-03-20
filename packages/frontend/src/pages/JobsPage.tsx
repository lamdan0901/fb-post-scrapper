import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import type { JobsQuery } from "../lib/api";
import { useJobs } from "../lib/hooks";
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
        <svg
          className="h-7 w-7 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0"
          />
        </svg>
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

export default function JobsPage() {
  const [filters, setFilters] = useState<JobsQuery>({ page: 1, limit: 20 });
  const { data, isLoading, isError, error, refetch } = useJobs(filters, {
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Jobs</h1>
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
          <div className="grid gap-4 md:grid-cols-2">
            {data.jobs.map((job) => (
              <JobCard key={job.id} job={job} />
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
