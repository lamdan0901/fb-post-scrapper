# Task Board — AI-Powered Facebook Job Scraper

> Generated from [`plan.md`](../plan.md) for execution tracking. Always refer to the full plan for detailed requirements, field definitions, and implementation notes.
> Status legend: `[ ]` Not Started · `[~]` In Progress · `[x]` Done

---

## Epic 1: Project Scaffolding & Database Setup

> **Priority:** Critical — Blocking all other epics
> **Dependencies:** None

### Story 1.1: Initialize Monorepo Structure

- [x] 1.1.1 — Initialize root `package.json` with pnpm workspaces config
- [x] 1.1.2 — Create `packages/backend/` directory with `package.json` and `tsconfig.json`
- [x] 1.1.3 — Create `packages/scraper/` directory with `package.json` and `tsconfig.json`
- [x] 1.1.4 — Create `packages/ai-filter/` directory with `package.json` and `tsconfig.json`
- [x] 1.1.5 — Create `packages/notifier/` directory with `package.json` and `tsconfig.json`
- [x] 1.1.6 — Create `packages/frontend/` directory (Vite + React 19 + TypeScript)
- [x] 1.1.7 — Create `tsconfig.base.json` with strict mode shared config
- [x] 1.1.8 — Create `shared/types.ts` for shared TypeScript types
- [x] 1.1.9 — Verify `pnpm install` runs cleanly across all packages

### Story 1.2: Database Schema (Prisma + SQLite)

- [x] 1.2.1 — Install Prisma and initialize `prisma/schema.prisma` with SQLite datasource
- [x] 1.2.2 — Define `Jobs` model with all fields (fb_post_id, content, post_url, poster_name, poster_url, post_url_hash, content_hash, role, level, yoe, score, reason, is_freelance, status, timestamps)
- [x] 1.2.3 — Define `Role` enum (Frontend, Backend, Fullstack, Mobile, Other)
- [x] 1.2.4 — Define `Level` enum (Fresher, Junior, Middle, Senior, Unknown)
- [x] 1.2.5 — Define `Status` enum (new, applied, saved, archived)
- [x] 1.2.6 — Define `Settings` model (target_groups, target_keywords, blacklist, max_yoe, cron_schedule)
- [x] 1.2.7 — Define `UserFeedback` model with FK to Jobs and `FeedbackType` enum
- [x] 1.2.8 — Add indexes on Jobs: post_url_hash, content_hash, fb_post_id, status, role, level, created_at
- [x] 1.2.9 — Create `prisma/seed.ts` with default Settings (5 sample groups, keywords, blacklist)
- [x] 1.2.10 — Run `npx prisma migrate dev` and verify migration + seed

### Story 1.3: Environment Configuration

- [x] 1.3.1 — Create `.env.example` with all required variables (DATABASE_URL, GEMINI_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, COOKIE_PATH, PORT, NODE_ENV, API_AUTH_TOKEN)
- [x] 1.3.2 — Setup `dotenv` loading in backend entry point
- [x] 1.3.3 — Add `.env` to `.gitignore`

---

## Epic 2: Playwright Scraper (Crawler)

> **Priority:** Critical
> **Dependencies:** Epic 1

### Story 2.1: Cookie-Based Authentication Module

- [x] 2.1.1 — Create `CookieManager` class in `packages/scraper/src/cookie-manager.ts`
- [x] 2.1.2 — Implement `loadCookies(filePath)` — read Netscape .txt file, validate `c_user` and `xs` cookies exist
- [x] 2.1.3 — Implement `applyCookies(context)` — inject cookies into Playwright BrowserContext
- [x] 2.1.4 — Implement `validateSession(page)` — navigate to facebook.com, verify logged-in state
- [x] 2.1.5 — Define and throw `SessionExpiredError` on invalid session

### Story 2.2: Anti-Detection Utilities

- [x] 2.2.1 — Create `HumanBehavior` module in `packages/scraper/src/human-behavior.ts`
- [x] 2.2.2 — Implement `randomDelay(min=2000, max=5000)`
- [x] 2.2.3 — Implement `randomViewport()` — generate viewport 1200–1920 width, 800–1080 height
- [x] 2.2.4 — Implement `smoothScroll(page, distance)` — incremental scroll with random pauses
- [x] 2.2.5 — Implement `randomMouseMovement(page)`
- [x] 2.2.6 — Configure browser launch: disable automation flags, random user-agent rotation (5–10 UAs)

### Story 2.3: Group Navigation & Post Extraction

- [x] 2.3.1 — Create `GroupScraper` class in `packages/scraper/src/group-scraper.ts`
- [x] 2.3.2 — Implement navigation to group URL with `?sorting_setting=CHRONOLOGICAL`
- [x] 2.3.3 — Implement feed wait + incremental scrolling to collect post elements
- [x] 2.3.4 — Implement "See more" click handling with retry logic
- [x] 2.3.5 — Extract per-post data: full text, post URL, poster name, poster profile URL, raw timestamp
- [x] 2.3.6 — Define `RawPost` type and return array of `RawPost`
- [x] 2.3.7 — Implement stop conditions: `maxPosts` reached or no more posts loading

### Story 2.4: Timestamp Parsing

- [x] 2.4.1 — Create `TimestampParser` in `packages/scraper/src/timestamp-parser.ts`
- [x] 2.4.2 — Handle relative formats: `2h`, `3d`, `1w`, `Just now`, `2 hrs`, `3 mins`
- [x] 2.4.3 — Handle absolute formats: `Yesterday at 10:00 AM`, `March 10 at 2:00 PM`, `March 10, 2026`
- [x] 2.4.4 — Handle Vietnamese timestamp formats
- [x] 2.4.5 — Output UTC datetime; store `created_time_raw`, `created_time_utc`, `first_seen_at`

### Story 2.5: Deduplication Module

- [x] 2.5.1 — Create `Deduplicator` in `packages/scraper/src/deduplicator.ts`
- [x] 2.5.2 — Implement `generatePostUrlHash(url)` — SHA-256 of normalized URL
- [x] 2.5.3 — Implement `generateContentHash(content)` — SHA-256 of normalized content (lowercase, strip whitespace)
- [x] 2.5.4 — Implement `isDuplicate(post)` with priority checks: fb_post_id → post_url_hash → content_hash
- [x] 2.5.5 — Use `first_seen_at` to prevent resurfaced post reprocessing

### Story 2.6: Scraper Orchestrator & Error Handling

- [x] 2.6.1 — Create `ScraperOrchestrator` in `packages/scraper/src/orchestrator.ts`
- [x] 2.6.2 — Load target groups and settings from DB
- [x] 2.6.3 — Implement per-group scrape loop with retry-once on failure
- [x] 2.6.4 — Run deduplication against DB for each group's posts
- [x] 2.6.5 — Handle `SessionExpiredError` → stop all scraping, trigger Telegram alert
- [x] 2.6.6 — Handle group scrape failure → log, continue to next group, send Telegram alert
- [x] 2.6.7 — Handle DOM change detection (no posts found) → alert
- [x] 2.6.8 — Enforce limits: max 50 posts per run, max 10 groups per cycle

---

## Epic 3: AI Filtering System (Gemini)

> **Priority:** Critical
> **Dependencies:** Epic 1 (can be built in parallel with Epic 2)

### Story 3.1: Content Preprocessor

- [x] 3.1.1 — Create `ContentPreprocessor` in `packages/ai-filter/src/preprocessor.ts`
- [x] 3.1.2 — Implement `normalize(text)` — trim to 2000 chars, collapse whitespace, deduplicate emojis, normalize tech terms
- [x] 3.1.3 — Implement `containsTechKeywords(text)` — case-insensitive match against settings keywords
- [x] 3.1.4 — Implement `isBlacklisted(text)` — match against blacklist terms from settings

### Story 3.2: Pre-Filter (Code-Level, No API Call)

- [x] 3.2.1 — Create `PreFilter` in `packages/ai-filter/src/pre-filter.ts`
- [x] 3.2.2 — Implement blacklist check → discard with reason "Blacklisted company"
- [x] 3.2.3 — Implement tech keyword check → skip with reason "Not tech-related"
- [x] 3.2.4 — Return `{ shouldCallAI: boolean, skipReason?: string }`

### Story 3.3: Gemini API Client

- [x] 3.3.1 — Create `GeminiClient` in `packages/ai-filter/src/gemini-client.ts`
- [x] 3.3.2 — Initialize with API key, model `gemini-2.0-flash`, temperature `0.2`
- [x] 3.3.3 — Implement 3-layer prompt assembly (system instruction, dynamic context, post content)
- [x] 3.3.4 — Create `PromptBuilder` in `packages/ai-filter/src/prompt-builder.ts`
- [x] 3.3.5 — Implement `classify(post, filterCriteria)` — call Gemini API with JSON response format
- [x] 3.3.6 — Validate response against Zod schema, retry up to 2 times on invalid JSON
- [x] 3.3.7 — Track API call count per run, enforce max 50 calls limit

### Story 3.4: Classification Result Schema

- [x] 3.4.1 — Create `schemas.ts` in `packages/ai-filter/src/schemas.ts`
- [x] 3.4.2 — Define `ClassificationResult` Zod schema (is_match, is_freelance, role, level, yoe, score, reason)
- [x] 3.4.3 — Export TypeScript type from Zod schema

### Story 3.5: AI Pipeline Orchestrator

- [x] 3.5.1 — Create `AIFilterPipeline` in `packages/ai-filter/src/pipeline.ts`
- [x] 3.5.2 — Accept array of `RawPost`, iterate with pre-filter → Gemini classify flow
- [x] 3.5.3 — Implement freelance auto-accept (bypass role/level restrictions)
- [x] 3.5.4 — Implement standard job matching: role + level + YOE ≤ max_yoe
- [x] 3.5.5 — Handle missing level/YOE: still match if role matches, mark for review
- [x] 3.5.6 — Check API call budget before each Gemini call, stop if exhausted
- [x] 3.5.7 — Return stats: `{ processed, matched, skipped, apiCallsUsed }`

---

## Epic 4: Backend API

> **Priority:** Critical
> **Dependencies:** Epic 1 (can be built in parallel with Epics 2–3)

### Story 4.1: Server Setup

- [x] 4.1.1 — Create Express app entry point in `packages/backend/src/index.ts`
- [x] 4.1.2 — Add middleware: CORS, JSON parsing
- [x] 4.1.3 — Create bearer token auth middleware in `packages/backend/src/middleware/auth.ts`
- [x] 4.1.4 — Create global error handling middleware with proper HTTP status codes
- [x] 4.1.5 — Create Prisma client singleton in `packages/backend/src/lib/db.ts`

### Story 4.2: Job Endpoints

- [x] 4.2.1 — Create `packages/backend/src/routes/jobs.ts`
- [x] 4.2.2 — Implement `GET /api/jobs` with query params: page, limit, role, level, is_freelance, status, search (full-text)
- [x] 4.2.3 — Implement pagination response: `{ jobs, total, page, totalPages }`
- [x] 4.2.4 — Implement `PUT /api/jobs/:id` — update job status with validation
- [x] 4.2.5 — Implement `POST /api/jobs/:id/feedback` — insert UserFeedback record
- [x] 4.2.6 — Add Zod request validation for all endpoints

### Story 4.3: Settings Endpoints

- [x] 4.3.1 — Create `packages/backend/src/routes/settings.ts`
- [x] 4.3.2 — Implement `GET /api/settings` — return settings with JSON fields parsed to arrays
- [x] 4.3.3 — Implement `PUT /api/settings` — validate inputs (URL format, positive max_yoe, valid cron), update row

### Story 4.4: Scraper Control Endpoints

- [x] 4.4.1 — Create `packages/backend/src/routes/scraper.ts`
- [x] 4.4.2 — Implement `POST /api/scraper/run` — trigger async scraping, return run ID
- [x] 4.4.3 — Implement `GET /api/scraper/status` — return current status / last run result

### Story 4.5: Cookie Management Endpoint

- [x] 4.5.1 — Create `packages/backend/src/routes/cookies.ts`
- [x] 4.5.2 — Implement `POST /api/cookies/upload` — accept JSON cookie file
- [x] 4.5.3 — Validate cookie structure (must contain Facebook session cookies)
- [x] 4.5.4 — Save cookie file to secure location on disk (outside web root)
- [x] 4.5.5 — Test validity via quick Playwright session check
- [x] 4.5.6 — Return `{ valid: boolean, message: string }`

---

## Epic 5: Telegram Notifier

> **Priority:** High
> **Dependencies:** Epic 1 (can be built in parallel with Epics 2–4)

### Story 5.1: Telegram Bot Client

- [x] 5.1.1 — Create `TelegramNotifier` in `packages/notifier/src/telegram.ts`
- [x] 5.1.2 — Implement `sendMessage(chatId, text)` — HTTP POST to Telegram Bot API
- [x] 5.1.3 — Use `parse_mode: "HTML"` for rich formatting
- [x] 5.1.4 — Handle API errors gracefully (log, don't crash)

### Story 5.2: Notification Formatter

- [x] 5.2.1 — Create `NotificationFormatter` in `packages/notifier/src/formatter.ts`
- [x] 5.2.2 — Implement `formatRunSummary(stats, topJobs)` — emoji-formatted summary with top 10 jobs + dashboard link
- [x] 5.2.3 — Implement anti-spam: max 10 jobs per message, include total count

### Story 5.3: Alert Messages

- [x] 5.3.1 — Create `alerts.ts` in `packages/notifier/src/alerts.ts`
- [x] 5.3.2 — Define template: session expired alert
- [x] 5.3.3 — Define template: scraper failure alert
- [x] 5.3.4 — Define template: run complete (no matches) alert

---

## Epic 6: Scheduling & Pipeline Orchestration

> **Priority:** High
> **Dependencies:** Epics 2, 3, 4, 5

### Story 6.1: Main Pipeline Runner

- [x] 6.1.1 — Create `PipelineRunner` class
- [x] 6.1.2 — Load settings from DB at run start
- [x] 6.1.3 — Call `ScraperOrchestrator` → get new raw posts
- [x] 6.1.4 — Call `AIFilterPipeline` → get matched jobs
- [x] 6.1.5 — Save matched jobs to DB
- [x] 6.1.6 — Send Telegram notification with run results
- [x] 6.1.7 — Log run statistics

### Story 6.2: Cron Scheduling

- [x] 6.2.1 — Install and integrate `node-cron`
- [x] 6.2.2 — Read cron expression from settings (default: `0 */4 * * *`)
- [x] 6.2.3 — Register cron job on app start
- [x] 6.2.4 — Re-register cron job on settings update
- [x] 6.2.5 — Implement concurrent run prevention (lock / flag mechanism)

---

## Epic 7: React Dashboard

> **Priority:** High
> **Dependencies:** Epic 4 (can be built in parallel with Epics 5–6)

### Story 7.1: Frontend Project Setup

- [ ] 7.1.1 — Initialize Vite + React 19 + TypeScript project in `packages/frontend/`
- [ ] 7.1.2 — Install and configure Tailwind CSS v4
- [ ] 7.1.3 — Install and configure React Router
- [ ] 7.1.4 — Install and configure TanStack Query (React Query)
- [ ] 7.1.5 — Create API client wrapper in `packages/frontend/src/lib/api.ts`
- [ ] 7.1.6 — Create React Query hooks in `packages/frontend/src/lib/hooks.ts`

### Story 7.2: Layout & Navigation

- [ ] 7.2.1 — Create app shell with sidebar or top nav in `App.tsx`
- [ ] 7.2.2 — Add route: `/` → Jobs page
- [ ] 7.2.3 — Add route: `/settings` → Settings page
- [ ] 7.2.4 — Implement responsive design (desktop-first, mobile-usable)

### Story 7.3: Jobs List Page

- [ ] 7.3.1 — Create `JobsPage.tsx`
- [ ] 7.3.2 — Create `FilterBar.tsx` with: role dropdown, level dropdown, freelance toggle, status dropdown, search input (debounced 300ms)
- [ ] 7.3.3 — Create `JobCard.tsx` with: content snippet (200 chars, expandable), role/level badges, YOE, score indicator, AI reason
- [ ] 7.3.4 — Add external links: Facebook post, Poster profile
- [ ] 7.3.5 — Add action buttons: Apply, Save, Archive (status transitions)
- [ ] 7.3.6 — Add feedback buttons: 👍 Relevant, 👎 Irrelevant
- [ ] 7.3.7 — Implement keyword highlighting in content (react, nextjs, salary, yoe, etc.)
- [ ] 7.3.8 — Implement pagination with page numbers, previous/next

### Story 7.4: Settings Page

- [ ] 7.4.1 — Create `SettingsPage.tsx`
- [ ] 7.4.2 — Facebook Groups list: add/remove with URL validation
- [ ] 7.4.3 — Keywords: tag-style input for add/remove
- [ ] 7.4.4 — Blacklist: tag-style input for add/remove
- [ ] 7.4.5 — Max YOE: number input with validation
- [ ] 7.4.6 — Cron Schedule: input with human-readable preview
- [ ] 7.4.7 — Create `CookieUpload.tsx` — drag-and-drop file upload → call API → show valid/expired status
- [ ] 7.4.8 — Manual Scrape button: trigger `POST /api/scraper/run`, show progress/status

### Story 7.5: UI Polish

- [ ] 7.5.1 — Add loading states (skeleton loaders)
- [ ] 7.5.2 — Add error states with retry button
- [ ] 7.5.3 — Add toast notifications for actions (status change, settings saved)
- [ ] 7.5.4 — Add empty states (no jobs found, no results matching filters)

---

## Epic 8: Deployment & Production Readiness

> **Priority:** Medium
> **Dependencies:** All previous epics

### Story 8.1: Docker Setup

- [ ] 8.1.1 — Create `Dockerfile` for backend (Node.js + Playwright deps + xvfb)
- [ ] 8.1.2 — Create `Dockerfile` for frontend (Vite build → Nginx serve)
- [ ] 8.1.3 — Create `docker-compose.yml` with backend + frontend services, shared volumes for SQLite DB and cookies

### Story 8.2: Nginx Configuration

- [ ] 8.2.1 — Configure reverse proxy: `/` → frontend, `/api` → backend
- [ ] 8.2.2 — Setup HTTPS with Let's Encrypt (certbot)
- [ ] 8.2.3 — Add security headers (X-Frame-Options, CSP, etc.)

### Story 8.3: PM2 Alternative (Non-Docker)

- [ ] 8.3.1 — Create `ecosystem.config.js` for PM2 (backend API + scraper/scheduler process)
- [ ] 8.3.2 — Configure frontend static build served via Nginx

### Story 8.4: Security Hardening

- [ ] 8.4.1 — Verify API auth: bearer token from env var checked via middleware
- [ ] 8.4.2 — Set cookie file permissions to 600
- [ ] 8.4.3 — Add rate limiting on API endpoints
- [ ] 8.4.4 — Add input sanitization on all endpoints
- [ ] 8.4.5 — Audit: no credentials in logs

---

## Epic 9: Testing

> **Priority:** High
> **Dependencies:** Parallel with all implementation epics

### Story 9.1: Static Test Dataset

- [ ] 9.1.1 — Create `tests/fixtures/test_jobs.json`
- [ ] 9.1.2 — Add 15 valid job posts (various roles, levels, Vietnamese + English)
- [ ] 9.1.3 — Add 10 invalid posts (non-job, off-topic)
- [ ] 9.1.4 — Add 5 blacklisted company posts
- [ ] 9.1.5 — Add 5 edge cases (missing YOE, mixed language, freelance)
- [ ] 9.1.6 — Add 5 senior/lead posts (should be rejected)

### Story 9.2: Unit Tests

- [ ] 9.2.1 — Test `TimestampParser` — all format variations
- [ ] 9.2.2 — Test `ContentPreprocessor` — normalization, trimming
- [ ] 9.2.3 — Test `PreFilter` — blacklist matching, keyword matching
- [ ] 9.2.4 — Test `Deduplicator` — hash generation, duplicate detection
- [ ] 9.2.5 — Test Gemini response validation — valid/invalid JSON cases
- [ ] 9.2.6 — Test API Zod schemas — validation rules

### Story 9.3: Integration Tests

- [ ] 9.3.1 — AI calibration: run test dataset through Gemini, measure accuracy (target ≥95%)
- [ ] 9.3.2 — Scraper: test content extraction against saved HTML snapshots
- [ ] 9.3.3 — API: test all endpoints with supertest

### Story 9.4: E2E Test

- [ ] 9.4.1 — Full pipeline: scrape (from snapshot) → filter → store → notify
- [ ] 9.4.2 — Verify correct jobs stored in DB
- [ ] 9.4.3 — Verify Telegram notification sent

---

## Summary

| Epic  | Name                       | Stories | Subtasks | Blocked By |
| ----- | -------------------------- | ------- | -------- | ---------- |
| 1     | Scaffolding & Database     | 3       | 22       | —          |
| 2     | Playwright Scraper         | 6       | 28       | Epic 1     |
| 3     | AI Filtering (Gemini)      | 5       | 21       | Epic 1     |
| 4     | Backend API                | 5       | 20       | Epic 1     |
| 5     | Telegram Notifier          | 3       | 10       | Epic 1     |
| 6     | Scheduling & Orchestration | 2       | 12       | Epics 2–5  |
| 7     | React Dashboard            | 5       | 27       | Epic 4     |
| 8     | Deployment & Production    | 4       | 13       | Epics 1–7  |
| 9     | Testing                    | 4       | 15       | Parallel   |
| **Σ** |                            | **37**  | **168**  |            |

## Execution Order (Recommended)

```
Sprint 1:  Epic 1 (all stories)
Sprint 2:  Epic 2 + Epic 3 + Epic 4 + Epic 5 (in parallel)
Sprint 3:  Epic 6 + Epic 7 (in parallel)
Sprint 4:  Epic 8 + Epic 9 (finalize)
```
