import { useState, useCallback, useEffect } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, ExternalLink, RotateCcw, Search } from "lucide-react";
import type { JobsQuery, Job } from "../lib/api";
import { useJobs, useUpdateJobStatus, useDeleteJob } from "../lib/hooks";
import type { Role, Level } from "@job-alert/shared";

// ── Filter bar (no status/source dropdowns for archive) ──

const roles = ["Frontend", "Backend", "Fullstack", "Mobile", "Other"] as const;
const levels = ["Fresher", "Junior", "Middle", "Senior", "Unknown"] as const;

const selectClass =
  "rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function ArchiveFilters({
  filters,
  onChange,
}: {
  filters: JobsQuery;
  onChange: (f: JobsQuery) => void;
}) {
  const [searchInput, setSearchInput] = useState(filters.search ?? "");

  const stableOnChange = useCallback(
    (search: string) => {
      onChange({ ...filters, search: search || undefined, page: 1 });
    },
    [filters, onChange],
  );

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed !== (filters.search ?? "")) stableOnChange(trimmed);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search, stableOnChange]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-50 flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="Search archived jobs…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className={`${selectClass} w-full pl-9`}
        />
      </div>

      <select
        value={filters.role ?? ""}
        onChange={(e) =>
          onChange({
            ...filters,
            role: (e.target.value as Role) || undefined,
            page: 1,
          })
        }
        className={selectClass}
      >
        <option value="">All Roles</option>
        {roles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      <select
        value={filters.level ?? ""}
        onChange={(e) =>
          onChange({
            ...filters,
            level: (e.target.value as Level) || undefined,
            page: 1,
          })
        }
        className={selectClass}
      >
        <option value="">All Levels</option>
        {levels.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Archive Job Card (simplified: restore + delete only) ──

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

const roleBadgeColors: Record<string, string> = {
  Frontend: "bg-blue-500/20 text-blue-300",
  Backend: "bg-green-500/20 text-green-300",
  Fullstack: "bg-purple-500/20 text-purple-300",
  Mobile: "bg-orange-500/20 text-orange-300",
  Other: "bg-gray-500/20 text-gray-300",
};

const levelBadgeColors: Record<string, string> = {
  Fresher: "bg-teal-500/20 text-teal-300",
  Junior: "bg-sky-500/20 text-sky-300",
  Middle: "bg-amber-500/20 text-amber-300",
  Senior: "bg-red-500/20 text-red-300",
  Unknown: "bg-gray-500/20 text-gray-300",
};

function ArchiveCard({ job }: { job: Job }) {
  const updateStatus = useUpdateJobStatus();
  const deleteJobMutation = useDeleteJob();

  function handleRestore() {
    updateStatus.mutate(
      { id: job.id, status: "new" },
      {
        onSuccess: () => toast.success("Job restored"),
        onError: (err) => toast.error(`Failed to restore: ${err.message}`),
      },
    );
  }

  function handleDelete() {
    if (!window.confirm("Permanently delete this job? This cannot be undone."))
      return;
    deleteJobMutation.mutate(job.id, {
      onSuccess: () => toast.success("Job deleted"),
      onError: (err) => toast.error(`Failed to delete: ${err.message}`),
    });
  }

  const timestamp = job.created_time_utc ?? job.first_seen_at;

  return (
    <div className="rounded-xl border border-gray-800/60 bg-gray-900/70 p-4 opacity-80 transition-colors hover:border-gray-700">
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-gray-200">
          {job.poster_name}
        </span>
        <span className="shrink-0 text-xs text-gray-500">
          {timeAgo(timestamp)}
        </span>
      </div>

      {/* Badges */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadgeColors[job.role] ?? roleBadgeColors.Other}`}
        >
          {job.role}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${levelBadgeColors[job.level] ?? levelBadgeColors.Unknown}`}
        >
          {job.level}
        </span>
      </div>

      {/* Content snippet */}
      <p className="mb-3 line-clamp-3 whitespace-pre-line text-sm text-gray-400">
        {job.content}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-gray-800 pt-3">
        <a
          href={job.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
        >
          <ExternalLink className="size-3.5" />
          View Post
        </a>
        <button
          onClick={handleRestore}
          disabled={updateStatus.isPending}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-green-600 hover:text-green-300 disabled:opacity-50"
        >
          <RotateCcw className="size-3.5" />
          Restore
        </button>
        <div className="flex-1" />
        <button
          onClick={handleDelete}
          disabled={deleteJobMutation.isPending}
          className="flex items-center gap-1 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-red-700 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
          title="Delete permanently"
        >
          <Trash2 className="size-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Pagination (reused) ──

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

// ── Page ──

export default function ArchivePage() {
  const [filters, setFilters] = useState<JobsQuery>({
    page: 1,
    limit: 20,
    status: "archived",
  });

  const { data, isLoading, isError, error, refetch } = useJobs(filters, {
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Archive</h1>
        {data && (
          <span className="text-sm text-gray-500">
            {data.total} archived job{data.total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Filters */}
      <ArchiveFilters filters={filters} onChange={setFilters} />

      {/* Loading */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-gray-800 bg-gray-900 p-4"
            >
              <div className="mb-3 h-4 w-24 rounded bg-gray-800" />
              <div className="mb-3 flex gap-2">
                <div className="h-5 w-16 rounded-full bg-gray-800" />
                <div className="h-5 w-14 rounded-full bg-gray-800" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-gray-800" />
                <div className="h-3 w-4/6 rounded bg-gray-800" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-6 text-center">
          <p className="text-sm text-red-400">
            Failed to load archive: {error.message}
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
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center">
          <p className="text-lg font-medium text-gray-400">No archived jobs</p>
          <p className="mt-1 text-sm text-gray-600">
            Jobs you archive will appear here.
          </p>
        </div>
      )}

      {/* Cards grid */}
      {data && data.jobs.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {data.jobs.map((job) => (
              <ArchiveCard key={job.id} job={job} />
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
