import { useState } from "react";
import { toast } from "sonner";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { Role, Level } from "@job-alert/shared";
import type { UpdateSettingsBody } from "../lib/api";
import {
  useSettings,
  useUpdateSettings,
  useTriggerScraper,
  useScraperStatus,
  useCronStatus,
  useStartCron,
  useStopCron,
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

// ── Cron Control ──

function CronControl() {
  const { data: cronStatus, isLoading } = useCronStatus();
  const startCron = useStartCron();
  const stopCron = useStopCron();

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
    </Section>
  );
}

// ── Scraper Status ──

function ScraperControl() {
  const trigger = useTriggerScraper();
  const { data: status } = useScraperStatus({
    refetchInterval: (query) => {
      const d = query.state.data;
      return d?.status === "running" ? 3000 : false;
    },
  });

  const isRunning = status?.status === "running";

  return (
    <Section
      title="Manual Scrape"
      description="Trigger a scraping run manually."
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={isRunning || trigger.isPending}
          onClick={() =>
            trigger.mutate(undefined, {
              onSuccess: () => toast.success("Scraper started"),
              onError: (err) =>
                toast.error(`Failed to start scraper: ${err.message}`),
            })
          }
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning
            ? "Running…"
            : trigger.isPending
              ? "Starting…"
              : "Run Scraper"}
        </button>

        {status?.status === "idle" && (
          <span className="text-sm text-gray-500">No runs yet</span>
        )}
      </div>

      {trigger.error && (
        <div className="mt-3 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-400">
          {trigger.error.message}
        </div>
      )}

      {status && status.status !== "idle" && (
        <div
          className={`mt-4 rounded-lg border p-4 text-sm ${
            status.status === "running"
              ? "border-blue-800 bg-blue-950/30"
              : status.status === "completed"
                ? "border-green-800 bg-green-950/30"
                : "border-red-800 bg-red-950/30"
          }`}
        >
          <div className="flex items-start gap-2">
            {status.status === "running" && (
              <span className="mt-0.5 inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            )}
            <span
              className={`break-all ${
                status.status === "running"
                  ? "text-blue-300"
                  : status.status === "completed"
                    ? "text-green-400"
                    : "text-red-400"
              }`}
            >
              {status.status === "running"
                ? "Scraping in progress…"
                : status.status === "completed"
                  ? "Last run completed"
                  : `Last run failed: ${status.error ?? "Unknown error"}`}
            </span>
          </div>

          {status.stats && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["Processed", status.stats.processed],
                  ["Matched", status.stats.matched],
                  ["Skipped", status.stats.skipped],
                  ["API Calls", status.stats.apiCallsUsed],
                ] as const
              ).map(([label, val]) => (
                <div
                  key={label}
                  className="rounded-md bg-gray-800/50 px-3 py-2 text-center"
                >
                  <div className="text-lg font-semibold text-gray-200">
                    {val}
                  </div>
                  <div className="text-xs text-gray-500">{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// ── Post Time Filter ──

type TimeFilterMode = "none" | "lookback" | "range";

function PostTimeFilter({
  lookbackHours,
  dateFrom,
  dateTo,
  error,
  onChange,
}: {
  lookbackHours: number | null;
  dateFrom: string | null;
  dateTo: string | null;
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
    if (dateFrom != null || dateTo != null) return "range";
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
    } else {
      // Switch to range — clear lookback but leave date fields for user to fill
      onChange({
        scrape_lookback_hours: null,
        scrape_date_from: dateFrom,
        scrape_date_to: dateTo,
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
            ["range", "Date range"],
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

      {/* Date range inputs */}
      {mode === "range" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">From</label>
            <DatePicker
              selected={dateFrom ? new Date(dateFrom) : null}
              onChange={(date: Date | null) =>
                onChange({
                  scrape_lookback_hours: null,
                  scrape_date_from: date
                    ? `${date.toISOString().slice(0, 10)}T00:00:00.000Z`
                    : null,
                  scrape_date_to: dateTo,
                })
              }
              selectsStart
              startDate={dateFrom ? new Date(dateFrom) : undefined}
              endDate={dateTo ? new Date(dateTo) : undefined}
              maxDate={dateTo ? new Date(dateTo) : undefined}
              dateFormat="yyyy-MM-dd"
              placeholderText="Start date"
              isClearable
              className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-600"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">To</label>
            <DatePicker
              selected={dateTo ? new Date(dateTo) : null}
              onChange={(date: Date | null) =>
                onChange({
                  scrape_lookback_hours: null,
                  scrape_date_from: dateFrom,
                  scrape_date_to: date
                    ? `${date.toISOString().slice(0, 10)}T23:59:59.000Z`
                    : null,
                })
              }
              selectsEnd
              startDate={dateFrom ? new Date(dateFrom) : undefined}
              endDate={dateTo ? new Date(dateTo) : undefined}
              minDate={dateFrom ? new Date(dateFrom) : undefined}
              dateFormat="yyyy-MM-dd"
              placeholderText="End date"
              isClearable
              className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-600"
            />
          </div>
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
    max_yoe: settings.max_yoe,
    cron_schedule: settings.cron_schedule,
    scrape_lookback_hours: settings.scrape_lookback_hours,
    scrape_date_from: settings.scrape_date_from,
    scrape_date_to: settings.scrape_date_to,
    max_posts_per_group: settings.max_posts_per_group,
  }));
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  function validate(data: UpdateSettingsBody): Record<string, string> {
    const errs: Record<string, string> = {};
    if (data.target_groups.length === 0)
      errs.target_groups = "At least one group is required";
    if (data.target_keywords.length === 0)
      errs.target_keywords = "At least one keyword is required";
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
        "Cannot set both a lookback window and a date range simultaneously";
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
        dateFrom={form.scrape_date_from}
        dateTo={form.scrape_date_to}
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

      {/* Keywords */}
      <Section
        title="Target Keywords"
        description="Posts must contain at least one of these keywords to be processed."
      >
        <TagInput
          tags={form.target_keywords}
          onChange={(v) => updateField("target_keywords", v)}
          placeholder="Add a keyword…"
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

      {/* Allowed Roles */}
      <Section
        title="Allowed Roles"
        description="Only match jobs with these roles."
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
        <CookieUpload />
      </Section>
    </div>
  );
}
