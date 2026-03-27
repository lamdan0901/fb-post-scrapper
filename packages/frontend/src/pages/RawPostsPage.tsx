import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { Database, ExternalLink, UserCircle, CalendarDays } from "lucide-react";
import { useRawPostDates, useRawPosts } from "../lib/hooks";
import type { RawPost } from "../lib/api";

// ── Helpers ──

/** Format a full ISO datetime into a human-friendly label, e.g. "Mar 25, 14:32" */
function formatScrapeDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso; // fallback for legacy bare-date strings
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  return `${Math.floor(days / 7)}w ago`;
}

// ── Raw Post Card ──

const SNIPPET_LENGTH = 200;

function RawPostCard({ post }: { post: RawPost }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = post.content.length > SNIPPET_LENGTH;
  const displayContent =
    expanded || !needsTruncation
      ? post.content
      : post.content.slice(0, SNIPPET_LENGTH) + "…";
  const timestamp = post.created_time_utc ?? post.first_seen_at;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 transition-colors">
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-medium text-gray-200">
            {post.poster_name}
          </span>
          {post.poster_url && (
            <a
              href={post.poster_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-0.5 text-xs text-blue-400 hover:underline"
            >
              <UserCircle className="size-3" />
              Profile
            </a>
          )}
        </div>
        <span className="shrink-0 text-xs text-gray-500">
          {timeAgo(timestamp)}
        </span>
      </div>

      {/* Group URL badge */}
      <div className="mb-3">
        <span className="inline-block rounded-full bg-gray-800 px-2.5 py-0.5 text-xs text-gray-400 truncate max-w-full">
          {post.group_url.replace(
            "https://www.facebook.com/groups/",
            "fb/groups/",
          )}
        </span>
      </div>

      {/* Content */}
      <div className="mb-3 whitespace-pre-line text-sm leading-relaxed text-gray-300">
        {displayContent}
        {needsTruncation && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-1 text-xs font-medium text-blue-400 hover:underline"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-gray-800 pt-3">
        <a
          href={post.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
        >
          <ExternalLink className="size-3.5" />
          View Post
        </a>
        {post.created_time_raw && (
          <span className="text-xs text-gray-500">{post.created_time_raw}</span>
        )}
      </div>
    </div>
  );
}

// ── Pagination ──

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-1 pt-4">
      <button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        ← Prev
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
            p === page
              ? "border-blue-600 bg-blue-600/20 text-blue-300"
              : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white"
          }`}
        >
          {p}
        </button>
      ))}
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

export default function RawPostsPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data: datesData, isLoading: datesLoading } = useRawPostDates();
  const dates = datesData?.dates ?? [];

  // Auto-select the first date when dates load
  const activeDate = selectedDate ?? dates[0] ?? null;

  const { data, isLoading, isError } = useRawPosts(
    activeDate ? { date: activeDate, page, limit: 20 } : {},
    { placeholderData: keepPreviousData, enabled: !!activeDate },
  );

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Database className="size-6 text-gray-400 shrink-0" />
        <div>
          <h1 className="text-xl font-semibold text-white">Raw Posts</h1>
          <p className="text-sm text-gray-400">
            All scraped posts before AI filtering, grouped by scrape date
          </p>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Date list sidebar */}
        <aside className="w-48 shrink-0">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Scrape Dates
          </h2>
          {datesLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-9 rounded-lg bg-gray-800 animate-pulse"
                />
              ))}
            </div>
          ) : dates.length === 0 ? (
            <p className="text-sm text-gray-500">No scrape dates yet.</p>
          ) : (
            <ul className="space-y-1">
              {dates.map((date) => (
                <li key={date}>
                  <button
                    onClick={() => handleSelectDate(date)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      date === activeDate
                        ? "bg-blue-600/20 text-blue-300 border border-blue-600"
                        : "text-gray-400 hover:bg-gray-800 hover:text-white border border-transparent"
                    }`}
                  >
                    <CalendarDays className="size-3.5 shrink-0" />
                    {formatScrapeDate(date)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Raw posts list */}
        <div className="flex-1 min-w-0">
          {!activeDate && !datesLoading && (
            <p className="text-sm text-gray-500">
              No scrape runs recorded yet.
            </p>
          )}

          {activeDate && (
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-gray-400">
                {isLoading
                  ? "Loading…"
                  : `${data?.total ?? 0} posts — ${formatScrapeDate(activeDate)}`}
              </span>
            </div>
          )}

          {isLoading && activeDate && (
            <div className="grid gap-4 md:grid-cols-2">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-40 rounded-xl bg-gray-900 animate-pulse border border-gray-800"
                />
              ))}
            </div>
          )}

          {isError && (
            <p className="text-sm text-red-400">Failed to load raw posts.</p>
          )}

          {data && data.posts.length === 0 && !isLoading && (
            <p className="text-sm text-gray-500">No posts for this date.</p>
          )}

          {data && data.posts.length > 0 && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {data.posts.map((post) => (
                  <RawPostCard key={post.id} post={post} />
                ))}
              </div>
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                onPageChange={setPage}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
