import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { Role, Level } from "@job-alert/shared";
import type { RoleKeywords, RoleRules, RoleExclusionKeywords } from "@job-alert/shared";
import type { UpdateSettingsBody } from "../lib/api";
import {
  useSettings,
  useUpdateSettings,
  useTriggerScraper,
  useTriggerFilterOnly,
  useCancelScraper,
  useScraperStatus,
  useRunTimes,
  useCronStatus,
  useStartCron,
  useStopCron,
  useCookieInfo,
  useVerifyCookies,
} from "../lib/hooks";
import TagInput from "../components/TagInput";
import CookieUpload from "../components/CookieUpload";

// ── Helpers ──

const ALL_ROLES = Object.values(Role) as Role[];
const ALL_LEVELS = Object.values(Level) as Level[];

function cronToHuman(expr: string): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts;

  // Every N minutes: */N * * * *
  if (
    min.startsWith("*/") &&
    hour === "*" &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return `Every ${min.slice(2)} minutes`;
  }
  // Every N hours: 0 */N * * *
  if (
    min === "0" &&
    hour.startsWith("*/") &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return `Every ${hour.slice(2)} hours`;
  }
  // Specific time daily: M H * * *
  if (
    /^\d+$/.test(min) &&
    /^\d+$/.test(hour) &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return `Daily at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }
  // Every hour: 0 * * * *
  if (
    min === "0" &&
    hour === "*" &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return "Every hour";
  }
  // Every minute: * * * * *
  if (
    min === "*" &&
    hour === "*" &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return "Every minute";
  }
  return null;
}

function validateUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Must start with http:// or https://";
    }
    return null;
  } catch {
    return "Invalid URL";
  }
}

function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const fieldPattern = /^(\*|\*\/[0-9]+|[0-9,\-/]+)$/;
  const ranges = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 6],
  ] as const;

  for (let i = 0; i < 5; i++) {
    const part = parts[i];
    if (!fieldPattern.test(part)) return false;
    if (part === "*" || part.startsWith("*/")) continue;
    const nums = part
      .replace(/\/\d+$/, "")
      .split(/[,-]/)
      .map(Number);
    const [min, max] = ranges[i];
    if (nums.some((n) => Number.isNaN(n) || n < min || n > max)) return false;
  }
  return true;
}

// ── Section wrapper ──

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}

// ── Chip toggle ──

function ChipToggle<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: T[];
  selected: T[];
  onChange: (selected: T[]) => void;
}) {
  function toggle(opt: T) {
    if (selected.includes(opt)) {
      if (selected.length <= 1) return; // keep at least one
      onChange(selected.filter((s) => s !== opt));
    } else {
      onChange([...selected, opt]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "border-blue-600 bg-blue-600/20 text-blue-300"
                : "border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ── Role Config Section (keywords + rule per role) ──

function RoleConfigSection({
  role,
  keywords,
  exclusionKeywords,
  rule,
  onKeywordsChange,
  onExclusionKeywordsChange,
  onRuleChange,
}: {
  role: string;
  keywords: string[];
  exclusionKeywords: string[];
  rule: string;
  onKeywordsChange: (keywords: string[]) => void;
  onExclusionKeywordsChange: (keywords: string[]) => void;
  onRuleChange: (rule: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between"
      >
        <div>
          <h2 className="text-lg text-left font-semibold">{role} Role</h2>
          <p className="mt-1 text-left text-sm text-gray-500">
            Keywords and classification rules for {role} jobs.
          </p>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-300">
              Keywords
            </label>
            <p className="mb-2 text-xs text-gray-500">
              Role-specific keywords for pre-filtering.
            </p>
            <TagInput
              tags={keywords}
              onChange={onKeywordsChange}
              placeholder={`Add ${role} keyword\u2026`}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-300">
              Exclusion Keywords
            </label>
            <p className="mb-2 text-xs text-gray-500">
              If a post contains these keywords and is classified as {role}, it will be rejected.
            </p>
            <TagInput
              tags={exclusionKeywords}
              onChange={onExclusionKeywordsChange}
              placeholder={`Add ${role} exclusion keyword\u2026`}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-300">
              Classification Rule
            </label>
            <p className="mb-2 text-xs text-gray-500">
              Free-text rule sent to the AI to guide {role} role classification.
            </p>
            <textarea
              value={rule}
              onChange={(e) => onRuleChange(e.target.value)}
              placeholder={`Add classification rule for ${role}\u2026`}
              rows={3}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-600"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cookie Status ──

function CookieStatus() {
  const { data, isLoading } = useCookieInfo();
  const verify = useVerifyCookies();

  if (isLoading) {
    return <p className="text-sm text-gray-500">Checking cookie status…</p>;
  }

  if (!data || !data.exists) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/40 px-3 py-2 text-sm text-gray-500">
        No cookies uploaded yet.
      </div>
    );
  }

  const isExpired = data.is_expired;
  const verifyResult = verify.data;

  return (
    <div className="space-y-2">
      <div
        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
          isExpired
            ? "border-red-800 bg-red-950/30 text-red-400"
            : "border-green-800 bg-green-950/30 text-green-400"
        }`}
      >
        <div>
          <span className="font-medium">
            {isExpired ? "Cookies expired" : "Cookies active"}
          </span>
          {data.expires_at && (
            <span className="ml-2 text-xs opacity-75">
              — expires{" "}
              {new Date(data.expires_at).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          )}
          {!data.expires_at && (
            <span className="ml-2 text-xs opacity-75">— expiry unknown</span>
          )}
        </div>
        <button
          type="button"
          disabled={verify.isPending}
          onClick={() =>
            verify.mutate(undefined, {
              onSuccess: (res) =>
                res.valid
                  ? toast.success("Session verified — cookies are active")
                  : toast.warning(
                      "Session check failed — cookies may be expired",
                    ),
              onError: (err) => toast.error(`Verify failed: ${err.message}`),
            })
          }
          className="ml-3 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-current/30 px-2.5 py-1 text-xs font-medium opacity-80 transition-opacity hover:opacity-100 disabled:opacity-40"
        >
          <ShieldCheck className="size-3.5" />
          {verify.isPending ? "Checking…" : "Check session"}
        </button>
      </div>

      {verifyResult && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            verifyResult.valid
              ? "border-green-800 bg-green-950/30 text-green-400"
              : "border-yellow-800 bg-yellow-950/30 text-yellow-400"
          }`}
        >
          {verifyResult.message}
        </div>
      )}
    </div>
  );
}

// ── Cron Control ──

function CronControl() {
  const { data: cronStatus, isLoading } = useCronStatus();
  const startCron = useStartCron();
  const stopCron = useStopCron();
  const { data: runTimes } = useRunTimes();

  const isActive = cronStatus?.active ?? false;

  return (
    <Section
      title="Cron Scheduler"
      description="Start or stop the automatic scraping schedule."
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              isLoading
                ? "bg-gray-600"
                : isActive
                  ? "bg-green-500"
                  : "bg-gray-600"
            }`}
          />
          <span className="text-sm text-gray-400">
            {isLoading
              ? "Checking…"
              : isActive
                ? `Active — ${cronStatus?.expression ?? ""}`
                : "Inactive"}
          </span>
        </div>

        {isActive ? (
          <button
            type="button"
            disabled={stopCron.isPending}
            onClick={() =>
              stopCron.mutate(undefined, {
                onSuccess: () => toast.success("Cron scheduler stopped"),
                onError: (err) => toast.error(`Failed to stop: ${err.message}`),
              })
            }
            className="rounded-lg border border-red-700 bg-red-600/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-600/20 disabled:opacity-50"
          >
            {stopCron.isPending ? "Stopping…" : "Stop Scheduler"}
          </button>
        ) : (
          <button
            type="button"
            disabled={startCron.isPending || isLoading}
            onClick={() =>
              startCron.mutate(undefined, {
                onSuccess: () => toast.success("Cron scheduler started"),
                onError: (err) =>
                  toast.error(`Failed to start: ${err.message}`),
              })
            }
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {startCron.isPending ? "Starting…" : "Start Scheduler"}
          </button>
        )}
      </div>
      {runTimes?.lastCronRun && (
        <p className="mt-2 text-xs text-gray-500">
          Last auto run: {new Date(runTimes.lastCronRun).toLocaleString()}
        </p>
      )}
    </Section>
  );
}

// ── Scraper Status ──

function ScraperControl() {
  const trigger = useTriggerScraper();
  const filterTrigger = useTriggerFilterOnly();
  const cancelTrigger = useCancelScraper();
  const { data: status } = useScraperStatus({
    refetchInterval: (query) => {
      const d = query.state.data;
      return d?.status === "running" || d?.status === "cancelling"
        ? 3000
        : false;
    },
  });
  const { data: runTimes } = useRunTimes();

  const isRunning =
    status?.status === "running" || status?.status === "cancelling";
  const isCancelling = status?.status === "cancelling";
  const activeRunType = status?.runType ?? "scraper";
  const activeRunLabel =
    activeRunType === "filter-only" ? "Filter Only" : "Scraper";
  const [runFilterMode, setRunFilterMode] = useState<
    "savedFilter" | "lastManualRunWindow"
  >("savedFilter");
  const hasLastManualRun = Boolean(runTimes?.lastManualRun);

  function cancelRun() {
    cancelTrigger.mutate(
      { runId: status?.runId },
      {
        onSuccess: () => toast.success("Cancellation requested"),
        onError: (err) => toast.error(`Failed to cancel run: ${err.message}`),
      },
    );
  }

  return (
    <Section
      title="Manual Scrape"
      description="Trigger a scraping run manually, or filter existing raw posts."
    >
      <div className="space-y-3">
        {!isRunning && (
          <>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={
                  trigger.isPending ||
                  filterTrigger.isPending ||
                  cancelTrigger.isPending
                }
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
              <button
                type="button"
                disabled={
                  trigger.isPending ||
                  filterTrigger.isPending ||
                  cancelTrigger.isPending
                }
                onClick={() => {
                  filterTrigger.mutate(undefined, {
                    onSuccess: () => toast.success("AI Filter alone started"),
                    onError: (err) =>
                      toast.error(`Failed to start AI filter: ${err.message}`),
                  });
                }}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {filterTrigger.isPending
                  ? "Starting Filter…"
                  : "Run Filter Only"}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Scrape window
              </span>
              <button
                type="button"
                disabled={
                  trigger.isPending ||
                  filterTrigger.isPending ||
                  cancelTrigger.isPending
                }
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
                  filterTrigger.isPending ||
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
          </>
        )}

        {isRunning && (
          <button
            type="button"
            disabled={cancelTrigger.isPending || isCancelling}
            onClick={cancelRun}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelTrigger.isPending || isCancelling
              ? `Cancelling ${activeRunLabel}…`
              : `Cancel ${activeRunLabel}`}
          </button>
        )}

        {status?.status === "idle" && (
          <span className="text-sm text-gray-500">No runs yet</span>
        )}
      </div>

      {(trigger.error || filterTrigger.error || cancelTrigger.error) && (
        <div className="mt-3 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-400">
          {
            (trigger.error || filterTrigger.error || cancelTrigger.error)
              ?.message
          }
        </div>
      )}

      {status && status.status !== "idle" && (
        <div
          className={`mt-4 rounded-lg border p-4 text-sm ${
            status.status === "running"
              ? "border-blue-800 bg-blue-950/30"
              : status.status === "cancelling"
                ? "border-orange-800 bg-orange-950/30"
                : status.status === "completed"
                  ? "border-green-800 bg-green-950/30"
                  : status.status === "cancelled"
                    ? "border-yellow-800 bg-yellow-950/30"
                    : "border-red-800 bg-red-950/30"
          }`}
        >
          <div className="flex items-start gap-2 w-full">
            {status.status === "running" && (
              <span className="mt-0.5 inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            )}
            <div className="flex flex-col gap-1 w-full">
              <span
                className={`break-all ${
                  status.status === "running"
                    ? "text-blue-300"
                    : status.status === "cancelling"
                      ? "text-orange-300"
                      : status.status === "completed"
                        ? "text-green-400"
                        : status.status === "cancelled"
                          ? "text-yellow-300"
                          : "text-red-400"
                }`}
              >
                {status.status === "running"
                  ? activeRunType === "filter-only"
                    ? "Filter-only run in progress…"
                    : "Scraping in progress…"
                  : status.status === "cancelling"
                    ? activeRunType === "filter-only"
                      ? "Cancelling filter-only run…"
                      : "Cancelling scrape run…"
                    : status.status === "completed"
                      ? activeRunType === "filter-only"
                        ? "Last filter-only run completed"
                        : "Last scrape run completed"
                      : status.status === "cancelled"
                        ? activeRunType === "filter-only"
                          ? "Last filter-only run cancelled by user"
                          : "Last scrape run cancelled by user"
                        : activeRunType === "filter-only"
                          ? `Last filter-only run failed: ${status.error ?? "Unknown error"}`
                          : `Last scrape run failed: ${status.error ?? "Unknown error"}`}
              </span>

              {status.status === "completed" && status.result && (
                <>
                  {activeRunType === "filter-only" ? (
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 w-full">
                      {(
                        [
                          ["AI Processed", status.result.ai.processed],
                          ["Matched", status.result.ai.matched],
                          ["Skipped", status.result.ai.skipped],
                          ["Saved", status.result.savedCount],
                        ] as const
                      ).map(([label, val]) => (
                        <div
                          key={label}
                          className="rounded-md bg-gray-900/50 border border-gray-700/50 px-3 py-3 text-center"
                        >
                          <div className="text-xl font-semibold text-gray-200">
                            {val}
                          </div>
                          <div className="text-xs font-medium text-gray-500 mt-1 uppercase tracking-wider">
                            {label}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <p className="mt-2 text-xs text-gray-400">
                        Groups Completed is shown as completed/planned for this
                        run.
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 w-full">
                        {(
                          [
                            [
                              "Groups Completed",
                              `${status.result.scrape.groupsSucceeded}/${status.result.scrape.groupsAttempted}`,
                            ],
                            [
                              "Groups Failed",
                              status.result.scrape.groupsFailed,
                            ],
                            ["Scraped", status.result.scrape.totalScraped],
                            ["New Posts", status.result.scrape.totalNew],
                            ["AI Processed", status.result.ai.processed],
                            ["Matched", status.result.ai.matched],
                            ["Skipped", status.result.ai.skipped],
                            ["Saved", status.result.savedCount],
                          ] as const
                        ).map(([label, val]) => (
                          <div
                            key={label}
                            className="rounded-md bg-gray-900/50 border border-gray-700/50 px-3 py-3 text-center"
                          >
                            <div className="text-xl font-semibold text-gray-200">
                              {val}
                            </div>
                            <div className="text-xs font-medium text-gray-500 mt-1 uppercase tracking-wider">
                              {label}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {runTimes?.lastManualRun && (
        <p className="mt-3 text-xs text-gray-500">
          Last manual run: {new Date(runTimes.lastManualRun).toLocaleString()}
        </p>
      )}
      <p className="mt-3 text-xs text-gray-500">
        {runFilterMode === "lastManualRunWindow"
          ? "Run Scraper will process posts from the most recent manual run until now."
          : "Run Scraper will use your saved Post Age Filter settings."}
      </p>
    </Section>
  );
}

// ── Post Time Filter ──

type TimeFilterMode = "none" | "lookback";

function PostTimeFilter({
  lookbackHours,
  error,
  onChange,
}: {
  lookbackHours: number | null;
  error?: string;
  onChange: (patch: {
    scrape_lookback_hours: number | null;
    scrape_date_from: string | null;
    scrape_date_to: string | null;
  }) => void;
}) {
  // Mode is tracked in local state so switching to "range" doesn't
  // immediately revert to "none" just because both date fields are still null.
  const [mode, setMode] = useState<TimeFilterMode>(() => {
    if (lookbackHours != null) return "lookback";
    return "none";
  });

  // Local state for the number + unit (hours / days) in lookback mode
  const [lookbackValue, setLookbackValue] = useState<number>(() => {
    if (lookbackHours == null) return 4;
    return lookbackHours % 24 === 0 ? lookbackHours / 24 : lookbackHours;
  });
  const [lookbackUnit, setLookbackUnit] = useState<"hours" | "days">(() => {
    if (lookbackHours == null) return "hours";
    return lookbackHours % 24 === 0 ? "days" : "hours";
  });

  function switchMode(next: TimeFilterMode) {
    setMode(next);
    if (next === "none") {
      onChange({
        scrape_lookback_hours: null,
        scrape_date_from: null,
        scrape_date_to: null,
      });
    } else if (next === "lookback") {
      const hours =
        lookbackUnit === "days" ? lookbackValue * 24 : lookbackValue;
      onChange({
        scrape_lookback_hours: hours || 1,
        scrape_date_from: null,
        scrape_date_to: null,
      });
    }
  }

  function updateLookback(value: number, unit: "hours" | "days") {
    const hours = unit === "days" ? value * 24 : value;
    onChange({
      scrape_lookback_hours: hours || 1,
      scrape_date_from: null,
      scrape_date_to: null,
    });
  }

  return (
    <Section
      title="Post Age Filter"
      description="Only process posts that fall within a specific time window."
    >
      {/* Mode selector */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["none", "No filter"],
            ["lookback", "Lookback"],
          ] as [TimeFilterMode, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => switchMode(value)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === value
                ? "border-blue-600 bg-blue-600/20 text-blue-300"
                : "border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lookback inputs */}
      {mode === "lookback" && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm text-gray-400">Last</span>
          <input
            type="number"
            min={1}
            value={lookbackValue}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10) || 1;
              setLookbackValue(v);
              updateLookback(v, lookbackUnit);
            }}
            className="w-24 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-600"
          />
          <select
            value={lookbackUnit}
            onChange={(e) => {
              const u = e.target.value as "hours" | "days";
              setLookbackUnit(u);
              updateLookback(lookbackValue, u);
            }}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-600"
          >
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
          {lookbackHours != null && (
            <span className="text-xs text-gray-500">
              ≈ posts from the last{" "}
              {lookbackHours % 24 === 0
                ? `${lookbackHours / 24} day${lookbackHours / 24 !== 1 ? "s" : ""}`
                : `${lookbackHours} hour${lookbackHours !== 1 ? "s" : ""}`}
            </span>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </Section>
  );
}

// ── Main Settings Page ──

export default function SettingsPage() {
  const {
    data: settings,
    isLoading,
    isError,
    error: loadError,
    refetch,
  } = useSettings();

  // Loading
  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-gray-800 bg-gray-900 p-5"
          >
            <div className="h-5 w-32 rounded bg-gray-800" />
            <div className="mt-4 h-10 w-full rounded-lg bg-gray-800" />
          </div>
        ))}
      </div>
    );
  }

  // Error
  if (isError) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-2xl font-bold">Settings</h1>
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-6 text-center">
          <p className="text-sm text-red-400">
            Failed to load settings: {loadError.message}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!settings) return null;

  return <SettingsForm settings={settings} />;
}

// ── Settings Form (rendered only when settings are loaded) ──

function SettingsForm({
  settings,
}: {
  settings: import("../lib/api").Settings;
}) {
  const updateMutation = useUpdateSettings();
  const [form, setForm] = useState<UpdateSettingsBody>(() => ({
    target_groups: settings.target_groups,
    target_keywords: settings.target_keywords,
    blacklist: settings.blacklist,
    allowed_roles: settings.allowed_roles,
    allowed_levels: settings.allowed_levels,
    role_keywords: settings.role_keywords ?? {},
    role_exclusion_keywords: settings.role_exclusion_keywords ?? {},
    common_rules: settings.common_rules ?? "",
    role_rules: settings.role_rules ?? {},
    max_yoe: settings.max_yoe,
    cron_schedule: settings.cron_schedule,
    scrape_lookback_hours: settings.scrape_lookback_hours,
    scrape_date_from: settings.scrape_date_from,
    scrape_date_to: settings.scrape_date_to,
    max_posts_per_group: settings.max_posts_per_group,
    excluded_locations: settings.excluded_locations ?? [],
  }));
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  function validate(data: UpdateSettingsBody): Record<string, string> {
    const errs: Record<string, string> = {};
    if (data.target_groups.length === 0)
      errs.target_groups = "At least one group is required";
    // Check that at least one keyword exists across common + all role keywords
    const totalKeywords =
      data.target_keywords.length +
      Object.values(data.role_keywords).reduce(
        (sum, kws) => sum + (kws?.length ?? 0),
        0,
      );
    if (totalKeywords === 0)
      errs.target_keywords =
        "At least one keyword is required (common or role-specific)";
    if (data.allowed_roles.length === 0)
      errs.allowed_roles = "At least one role is required";
    if (data.allowed_levels.length === 0)
      errs.allowed_levels = "At least one level is required";
    if (!Number.isInteger(data.max_yoe) || data.max_yoe < 1)
      errs.max_yoe = "Must be a positive integer";
    if (!isValidCron(data.cron_schedule))
      errs.cron_schedule = "Must be a valid 5-field cron expression";
    const hasLookback = data.scrape_lookback_hours != null;
    const hasRange =
      data.scrape_date_from != null || data.scrape_date_to != null;
    if (hasLookback && hasRange) {
      errs.scrape_time =
        "Invalid scrape time configuration. Clear one of the active filters.";
    }
    if (
      hasLookback &&
      (!Number.isInteger(data.scrape_lookback_hours) ||
        (data.scrape_lookback_hours ?? 0) < 1)
    ) {
      errs.scrape_time = "Lookback must be a positive integer";
    }
    if (
      !Number.isInteger(data.max_posts_per_group) ||
      data.max_posts_per_group < 1 ||
      data.max_posts_per_group > 200
    )
      errs.max_posts_per_group = "Must be between 1 and 200";
    return errs;
  }

  function handleSave() {
    const errs = validate(form);
    setValidationErrors(errs);
    if (Object.keys(errs).length > 0) return;
    updateMutation.mutate(form, {
      onSuccess: () => toast.success("Settings saved"),
      onError: (err) => toast.error(`Failed to save: ${err.message}`),
    });
  }

  function updateField<K extends keyof UpdateSettingsBody>(
    key: K,
    value: UpdateSettingsBody[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    updateMutation.reset();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="-mx-6 flex items-center justify-between bg-gray-950 px-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {updateMutation.isPending ? "Saving…" : "Save Settings"}
        </button>
      </div>

      {/* Manual Scrape */}
      <ScraperControl />

      {/* Post Age Filter */}
      <PostTimeFilter
        lookbackHours={form.scrape_lookback_hours}
        error={validationErrors.scrape_time}
        onChange={(patch) => {
          setForm((prev) => ({ ...prev, ...patch }));
          setValidationErrors((prev) => {
            const next = { ...prev };
            delete next.scrape_time;
            return next;
          });
          updateMutation.reset();
        }}
      />

      {/* Scraper Limits */}
      <Section
        title="Scraper Limits"
        description="Maximum posts collected per group per run. All configured Facebook Groups are always scraped."
      >
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={200}
            value={form.max_posts_per_group}
            onChange={(e) =>
              updateField(
                "max_posts_per_group",
                parseInt(e.target.value, 10) || 1,
              )
            }
            className="w-32 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-600"
          />
          <span className="text-sm text-gray-400">posts per group</span>
        </div>
        {validationErrors.max_posts_per_group && (
          <p className="mt-1 text-xs text-red-400">
            {validationErrors.max_posts_per_group}
          </p>
        )}
      </Section>

      {/* Facebook Groups */}
      <Section
        title="Facebook Groups"
        description="Target groups to scrape for job postings."
      >
        <TagInput
          tags={form.target_groups}
          onChange={(v) => updateField("target_groups", v)}
          placeholder="Paste a Facebook group URL and press Enter…"
          validate={validateUrl}
        />
        {validationErrors.target_groups && (
          <p className="mt-1 text-xs text-red-400">
            {validationErrors.target_groups}
          </p>
        )}
      </Section>

      {/* Common Keywords */}
      <Section
        title="Common Keywords"
        description="Posts must contain at least one keyword (common or role-specific) to be processed."
      >
        <TagInput
          tags={form.target_keywords}
          onChange={(v) => updateField("target_keywords", v)}
          placeholder="Add a common keyword…"
        />
        {validationErrors.target_keywords && (
          <p className="mt-1 text-xs text-red-400">
            {validationErrors.target_keywords}
          </p>
        )}
      </Section>

      {/* Blacklist */}
      <Section
        title="Blacklist"
        description="Posts containing these terms will be auto-rejected."
      >
        <TagInput
          tags={form.blacklist}
          onChange={(v) => updateField("blacklist", v)}
          placeholder="Add a blacklist term…"
        />
      </Section>

      {/* Excluded Locations */}
      <Section
        title="Excluded Locations"
        description="Posts mentioning any of these cities or regions will be skipped before AI processing."
      >
        <TagInput
          tags={form.excluded_locations}
          onChange={(v) => updateField("excluded_locations", v)}
          placeholder="Add a location to exclude…"
        />
      </Section>

      {/* Allowed Roles */}
      <Section
        title="Allowed Roles"
        description="Only match jobs with these roles. Each role can have its own keywords and classification rule."
      >
        <ChipToggle
          options={ALL_ROLES}
          selected={form.allowed_roles}
          onChange={(v) => updateField("allowed_roles", v)}
        />
        {validationErrors.allowed_roles && (
          <p className="mt-1 text-xs text-red-400">
            {validationErrors.allowed_roles}
          </p>
        )}
      </Section>

      {/* Per-Role Keywords & Rules */}
      {form.allowed_roles.map((role) => (
        <RoleConfigSection
          key={role}
          role={role}
          keywords={form.role_keywords[role] ?? []}
          exclusionKeywords={form.role_exclusion_keywords[role] ?? []}
          rule={form.role_rules[role] ?? ""}
          onKeywordsChange={(keywords) => {
            const updated: RoleKeywords = {
              ...form.role_keywords,
              [role]: keywords,
            };
            updateField("role_keywords", updated);
          }}
          onExclusionKeywordsChange={(exclusionKeywords) => {
            const updated: RoleExclusionKeywords = {
              ...form.role_exclusion_keywords,
              [role]: exclusionKeywords,
            };
            updateField("role_exclusion_keywords", updated);
          }}
          onRuleChange={(rule) => {
            const updated: RoleRules = { ...form.role_rules, [role]: rule };
            updateField("role_rules", updated);
          }}
        />
      ))}

      {/* Common Rules */}
      <Section
        title="Common Rules"
        description="Free-text classification rules sent to the AI for all roles."
      >
        <textarea
          value={form.common_rules}
          onChange={(e) => updateField("common_rules", e.target.value)}
          placeholder="Add common classification rules…"
          rows={3}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-600"
        />
      </Section>

      {/* Allowed Levels */}
      <Section
        title="Allowed Levels"
        description="Only match jobs with these levels."
      >
        <ChipToggle
          options={ALL_LEVELS}
          selected={form.allowed_levels}
          onChange={(v) => updateField("allowed_levels", v)}
        />
        {validationErrors.allowed_levels && (
          <p className="mt-1 text-xs text-red-400">
            {validationErrors.allowed_levels}
          </p>
        )}
      </Section>

      {/* Max YOE, Cron Schedule & Cron Control */}
      <div className="grid gap-6 md:grid-cols-3">
        <Section
          title="Max Years of Experience"
          description="Reject jobs requiring more than this many years."
        >
          <input
            type="number"
            min={1}
            value={form.max_yoe}
            onChange={(e) =>
              updateField("max_yoe", parseInt(e.target.value, 10) || 0)
            }
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-600"
          />
          {validationErrors.max_yoe && (
            <p className="mt-1 text-xs text-red-400">
              {validationErrors.max_yoe}
            </p>
          )}
        </Section>

        <Section
          title="Cron Schedule"
          description="How often to run the scraper automatically."
        >
          <input
            type="text"
            value={form.cron_schedule}
            onChange={(e) => updateField("cron_schedule", e.target.value)}
            placeholder="0 */4 * * *"
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-600"
          />
          {cronToHuman(form.cron_schedule) && (
            <p className="mt-1 text-xs text-gray-500">
              ≈ {cronToHuman(form.cron_schedule)}
            </p>
          )}
          {validationErrors.cron_schedule && (
            <p className="mt-1 text-xs text-red-400">
              {validationErrors.cron_schedule}
            </p>
          )}
        </Section>

        <CronControl />
      </div>

      {/* Cookie Upload */}
      <Section
        title="Facebook Cookies"
        description="Upload your Netscape-format cookie file for Facebook authentication."
      >
        <CookieStatus />
        <div className="mt-4">
          <CookieUpload />
        </div>
      </Section>
    </div>
  );
}
