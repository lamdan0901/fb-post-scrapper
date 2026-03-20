import { useState } from "react";
import { toast } from "sonner";
import type { Job } from "../lib/api";
import { useUpdateJobStatus, useCreateFeedback } from "../lib/hooks";
import type { Status } from "@job-alert/shared";

// ── Keyword highlighting ──

const HIGHLIGHT_KEYWORDS = [
  "react",
  "nextjs",
  "next\\.js",
  "typescript",
  "javascript",
  "node",
  "nodejs",
  "node\\.js",
  "angular",
  "vue",
  "svelte",
  "python",
  "java",
  "golang",
  "go",
  "rust",
  "c\\+\\+",
  "c#",
  "\\.net",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "flutter",
  "react native",
  "docker",
  "kubernetes",
  "aws",
  "gcp",
  "azure",
  "devops",
  "ci/cd",
  "frontend",
  "front-end",
  "backend",
  "back-end",
  "fullstack",
  "full-stack",
  "mobile",
  "remote",
  "hybrid",
  "onsite",
  "on-site",
  "salary",
  "yoe",
  "years of experience",
  "sql",
  "mongodb",
  "postgresql",
  "redis",
  "graphql",
  "rest api",
  "microservices",
  "freelance",
];

const keywordRegex = new RegExp(
  `(${[...HIGHLIGHT_KEYWORDS].sort((a, b) => b.length - a.length).join("|")})`,
  "gi",
);

function highlightText(text: string) {
  const parts = text.split(keywordRegex);
  return parts.map((part, i) => {
    keywordRegex.lastIndex = 0;
    return keywordRegex.test(part) ? (
      <span key={i} className="rounded bg-yellow-500/20 px-0.5 text-yellow-300">
        {part}
      </span>
    ) : (
      part
    );
  });
}

// ── Badge colors ──

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

function scoreBadge(score: number) {
  if (score >= 70) return "bg-green-500/20 text-green-300";
  if (score >= 40) return "bg-yellow-500/20 text-yellow-300";
  return "bg-red-500/20 text-red-300";
}

// ── Relative time ──

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

// ── Component ──

const SNIPPET_LENGTH = 200;

const statusActions: { label: string; status: Status; icon: string }[] = [
  { label: "Apply", status: "applied", icon: "✓" },
  { label: "Save", status: "saved", icon: "★" },
  { label: "Archive", status: "archived", icon: "▼" },
];

export default function JobCard({ job }: { job: Job }) {
  const [expanded, setExpanded] = useState(false);
  const updateStatus = useUpdateJobStatus();
  const createFeedback = useCreateFeedback();

  function handleStatusChange(status: Status, label: string) {
    updateStatus.mutate(
      { id: job.id, status },
      {
        onSuccess: () => toast.success(`Marked as ${label}`),
        onError: (err) =>
          toast.error(`Failed to update status: ${err.message}`),
      },
    );
  }

  function handleFeedback(feedbackType: "relevant" | "irrelevant") {
    createFeedback.mutate(
      { id: job.id, feedbackType },
      {
        onSuccess: () => toast.success("Feedback submitted"),
        onError: (err) =>
          toast.error(`Failed to submit feedback: ${err.message}`),
      },
    );
  }

  const needsTruncation = job.content.length > SNIPPET_LENGTH;
  const displayContent = expanded
    ? job.content
    : needsTruncation
      ? job.content.slice(0, SNIPPET_LENGTH) + "…"
      : job.content;

  const timestamp = job.created_time_utc ?? job.first_seen_at;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 transition-colors hover:border-gray-700">
      {/* Header: poster + time */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-medium text-gray-200">
            {job.poster_name}
          </span>
          {job.poster_url && (
            <a
              href={job.poster_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-xs text-blue-400 hover:underline"
            >
              Profile ↗
            </a>
          )}
        </div>
        <span className="shrink-0 text-xs text-gray-500">
          {timeAgo(timestamp)}
        </span>
      </div>

      {/* Badges row */}
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
        <span className="rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-300">
          {job.yoe !== null ? `${job.yoe} YOE` : "N/A"}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${scoreBadge(job.score)}`}
        >
          Score: {job.score}
        </span>
        {job.is_freelance && (
          <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs font-medium text-indigo-300">
            Freelance
          </span>
        )}
      </div>

      {/* Content */}
      <div className="mb-2 whitespace-pre-line text-sm leading-relaxed text-gray-300">
        {highlightText(displayContent)}
        {needsTruncation && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-1 text-xs font-medium text-blue-400 hover:underline"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {/* AI Reason */}
      <p className="mb-3 text-xs italic text-gray-500">AI: {job.reason}</p>

      {/* Actions row */}
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-800 pt-3">
        {/* View post link */}
        <a
          href={job.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
        >
          View Post ↗
        </a>

        {/* Status action buttons */}
        {statusActions.map((action) => (
          <button
            key={action.status}
            disabled={job.status === action.status || updateStatus.isPending}
            onClick={() => handleStatusChange(action.status, action.label)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              job.status === action.status
                ? "border-blue-600 bg-blue-600/20 text-blue-300"
                : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {action.icon} {action.label}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Feedback buttons */}
        <button
          onClick={() => handleFeedback("relevant")}
          disabled={createFeedback.isPending}
          className="rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-green-500/10 hover:text-green-400 disabled:opacity-50"
          title="Relevant"
        >
          👍
        </button>
        <button
          onClick={() => handleFeedback("irrelevant")}
          disabled={createFeedback.isPending}
          className="rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
          title="Irrelevant"
        >
          👎
        </button>
      </div>
    </div>
  );
}
