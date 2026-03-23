import { useState, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import { Role, Level, Status } from "@job-alert/shared";
import type { JobsQuery } from "../lib/api";

interface FilterBarProps {
  filters: JobsQuery;
  onChange: (filters: JobsQuery) => void;
}

const roles = Object.values(Role);
const levels = Object.values(Level);
const statuses = Object.values(Status);

const selectClass =
  "rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const [searchInput, setSearchInput] = useState(filters.search ?? "");

  const stableOnChange = useCallback(
    (search: string) => {
      onChange({ ...filters, search: search || undefined, page: 1 });
    },
    [filters, onChange],
  );

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed !== (filters.search ?? "")) {
        stableOnChange(trimmed);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search, stableOnChange]);

  function set(patch: Partial<JobsQuery>) {
    onChange({ ...filters, ...patch, page: 1 });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative min-w-50 flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="Search jobs…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className={`${selectClass} w-full pl-9`}
        />
      </div>

      {/* Role */}
      <select
        value={filters.role ?? ""}
        onChange={(e) => set({ role: (e.target.value as Role) || undefined })}
        className={selectClass}
      >
        <option value="">All Roles</option>
        {roles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      {/* Level */}
      <select
        value={filters.level ?? ""}
        onChange={(e) => set({ level: (e.target.value as Level) || undefined })}
        className={selectClass}
      >
        <option value="">All Levels</option>
        {levels.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>

      {/* Status */}
      <select
        value={filters.status ?? ""}
        onChange={(e) =>
          set({ status: (e.target.value as Status) || undefined })
        }
        className={selectClass}
      >
        <option value="">All Status</option>
        {statuses.map((s) => (
          <option key={s} value={s}>
            {s[0].toUpperCase() + s.slice(1)}
          </option>
        ))}
      </select>

      {/* Freelance toggle */}
      <select
        value={
          filters.is_freelance === undefined
            ? ""
            : filters.is_freelance
              ? "true"
              : "false"
        }
        onChange={(e) =>
          set({
            is_freelance:
              e.target.value === "" ? undefined : e.target.value === "true",
          })
        }
        className={selectClass}
      >
        <option value="">Freelance: All</option>
        <option value="true">Freelance Only</option>
        <option value="false">Non-Freelance</option>
      </select>

      {/* Source */}
      <select
        value={filters.source ?? ""}
        onChange={(e) => set({ source: e.target.value || undefined })}
        className={selectClass}
      >
        <option value="">All Sources</option>
        <option value="manual">Manual</option>
        <option value="cron">Auto (Cron)</option>
      </select>
    </div>
  );
}
