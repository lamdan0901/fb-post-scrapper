# Implementation Plan — AI-Powered Facebook Job Scraper

---

## Overview

Build an end-to-end system: Playwright scrapes Facebook job groups → Gemini AI classifies posts → SQLite stores results → React dashboard displays them → Telegram sends notifications. Structured into 9 phases with clear dependencies.

### Supplementary Docs

| Document                                         | Purpose                                          |
| ------------------------------------------------ | ------------------------------------------------ |
| [taskboard.md](taskboard.md)                     | Execution tracking (epics → stories → subtasks)  |
| [seed-data.md](seed-data.md)                     | Default groups, keywords, blacklist values       |
| [cookie-format.md](cookie-format.md)             | Netscape cookie format spec & parsing rules      |
| [dom-selectors.md](dom-selectors.md)             | Facebook DOM selectors reference (from snapshot) |
| [PRDv2.txt](PRDv2.txt)                           | Full product requirements                        |
| [prompt design v1.txt](prompt%20design%20v1.txt) | Gemini prompt design                             |
| `../tests/fixtures/test_jobs.json`               | 20 test posts with expected classifications      |
| `../snapshot/`                                   | Saved Facebook group HTML snapshot               |

---

## Phase 1: Project Scaffolding & Database Setup

_No dependencies — starting point_

### Step 1.1: Initialize Monorepo Structure

```
/
├── packages/
│   ├── backend/        # Node.js + TypeScript (Express)
│   ├── scraper/        # Playwright crawler
│   ├── ai-filter/      # Gemini integration
│   ├── notifier/       # Telegram bot
│   └── frontend/       # React 19 + Vite
├── prisma/             # Schema & migrations
├── tests/              # Shared test fixtures
├── package.json        # Workspace root
├── tsconfig.base.json  # Shared TS config
└── .env.example
```

- Use pnpm workspaces for monorepo management
- Shared TypeScript config with strict mode enabled

### Step 1.2: Database Schema (Prisma + SQLite)

Define Prisma schema with 3 tables:

**Jobs**

| Field            | Type              | Notes                                     |
| ---------------- | ----------------- | ----------------------------------------- |
| id               | Int (PK, autoInc) |                                           |
| fb_post_id       | String?           | Optional, extracted from URL              |
| content          | String            | Full post text                            |
| post_url         | String            |                                           |
| poster_name      | String            |                                           |
| poster_url       | String            |                                           |
| post_url_hash    | String (unique)   | SHA-256 of normalized URL                 |
| content_hash     | String            | SHA-256 of normalized content             |
| role             | Enum              | Frontend/Backend/Fullstack/Mobile/Other   |
| level            | Enum              | Fresher/Junior/Middle/Senior/Unknown      |
| yoe              | Int?              | Nullable                                  |
| score            | Int               | 0–100                                     |
| reason           | String            | AI explanation                            |
| is_freelance     | Boolean           |                                           |
| status           | Enum              | new/applied/saved/archived (default: new) |
| created_time_raw | String            | Original Facebook timestamp string        |
| created_time_utc | DateTime?         | Parsed UTC timestamp                      |
| first_seen_at    | DateTime          | Crawler processing timestamp              |
| created_at       | DateTime          | DB insert timestamp (default: now)        |

Indexes: `post_url_hash`, `content_hash`, `fb_post_id`, `status`, `role`, `level`, `created_at`

**Settings**

| Field           | Type   | Notes                         |
| --------------- | ------ | ----------------------------- |
| id              | Int    | Single row                    |
| target_groups   | String | JSON array of group URLs      |
| target_keywords | String | JSON array of keyword strings |
| blacklist       | String | JSON array of blacklist terms |
| max_yoe         | Int    | Default: 5                    |
| cron_schedule   | String | Default: `0 */4 * * *`        |

**UserFeedback**

| Field         | Type     | Notes                 |
| ------------- | -------- | --------------------- |
| id            | Int      |                       |
| job_id        | Int (FK) | References Jobs.id    |
| feedback_type | Enum     | relevant / irrelevant |
| created_at    | DateTime |                       |

Seed Settings with defaults: 5 sample groups, default keywords, default blacklist (`tinhvan`, `cmcglobal`, `viettel`).

### Step 1.3: Environment Configuration

Create `.env.example`:

```env
DATABASE_URL="file:./dev.db"
GEMINI_API_KEY=""
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""
COOKIE_PATH="./cookies.json"
PORT=3001
NODE_ENV="development"
API_AUTH_TOKEN=""
```

Use `dotenv` for local dev, system env vars in production.

---

## Phase 2: Playwright Scraper (Crawler)

_Depends on: Phase 1 (database schema)_

### Step 2.1: Cookie-Based Authentication Module

Create `CookieManager` class:

- `loadCookies(filePath: string)` — Read Netscape `.txt` cookie file (tab-separated, from "Get cookies.txt LOCALLY" Chrome extension), parse into Playwright cookie format. Validate `c_user` and `xs` cookies exist. See [cookie-format.md](cookie-format.md) for full spec.
- `applyCookies(context: BrowserContext)` — Inject parsed cookies into Playwright browser context
- `validateSession(page: Page)` — Navigate to facebook.com, check if logged in (look for absence of login form)
- On invalid session: throw `SessionExpiredError` (caught upstream to trigger Telegram alert)

### Step 2.2: Anti-Detection Utilities

Create `HumanBehavior` module:

- `randomDelay(min=2000, max=5000)` — Random wait between actions
- `randomViewport()` — Generate viewport between 1200–1920 width, 800–1080 height
- `smoothScroll(page, distance)` — Incremental scroll with small random pauses
- `randomMouseMovement(page)` — Occasional random mouse moves

Browser launch config:

- `headless: false` (or `headless: 'new'` for VPS with xvfb)
- Disable automation flags: `--disable-blink-features=AutomationControlled`
- Random user-agent rotation (maintain list of 5–10 recent Chrome UAs)

### Step 2.3: Group Navigation & Post Extraction

Create `GroupScraper` class:

- `scrapeGroup(groupUrl: string, maxPosts: number)`:
  1. Navigate to `{groupUrl}?sorting_setting=CHRONOLOGICAL`
  2. Wait for feed to load (selector-based wait)
  3. Scroll incrementally, collecting post elements
  4. For each post:
     - Click "See more" if present (with retry)
     - Extract: full text content, post URL (from permalink/timestamp link), poster name, poster profile URL, raw timestamp string
  5. Stop when `maxPosts` reached or no more posts loading
- Return array of `RawPost` objects

### Step 2.4: Timestamp Parsing

Create `TimestampParser`:

- Handle relative formats: `2h`, `3d`, `1w`, `Just now`, `2 hrs`, `3 mins`
- Handle absolute: `Yesterday at 10:00 AM`, `March 10 at 2:00 PM`, `March 10, 2026`
- Handle Vietnamese timestamps if encountered
- Always produce UTC datetime
- Store: `created_time_raw` (original), `created_time_utc` (parsed), `first_seen_at` (current time)

### Step 2.5: Deduplication Module

Create `Deduplicator`:

- `generatePostUrlHash(url)` — SHA-256 hash of normalized post URL
- `generateContentHash(content)` — SHA-256 hash of normalized content (lowercase, strip whitespace)
- `isDuplicate(post: RawPost)` — Check DB in priority order:
  1. Match `fb_post_id` (if extractable from URL)
  2. Match `post_url_hash`
  3. Match `content_hash`
- Use `first_seen_at` to prevent resurfaced posts from reprocessing

### Step 2.6: Orchestrator & Error Handling

Create `ScraperOrchestrator`:

- Load settings from DB (target groups, max posts per run)
- For each group:
  1. Scrape posts (with retry once on failure)
  2. Deduplicate against DB
  3. Return new posts for AI processing
- Error handling:
  - `SessionExpiredError` → stop all scraping, trigger Telegram alert: `⚠️ Facebook session expired. Please re-upload cookies.`
  - Group scrape failure (after retry) → log error, continue to next group, send Telegram alert: `⚠️ Scraper failed: {reason}`
  - DOM change detection (no posts found after scroll) → alert
- Enforce limits: max 50 posts per run, max 10 groups per cycle

---

## Phase 3: AI Filtering System (Gemini)

_Depends on: Phase 1 (database). Can be built in parallel with Phase 2._

### Step 3.1: Content Preprocessor

Create `ContentPreprocessor`:

- `normalize(text: string)`:
  - Trim to max 2000 chars
  - Remove excessive whitespace (collapse multiple newlines/spaces)
  - Remove repeated emojis (keep max 1 of each)
  - Normalize tech terms: `ReactJS` → `React`, `Next.js` → `Nextjs`
- `containsTechKeywords(text: string)` — Broad match against tech keywords from settings (case-insensitive)
- `isBlacklisted(text: string)` — Check against blacklist terms from settings

### Step 3.2: Pre-Filter (Code-Level, No API Call)

Create `PreFilter`:

- Stage 1 checks (before Gemini):
  1. Check blacklist → if matched, discard with reason "Blacklisted company"
  2. Check tech keywords → if no tech relevance, skip with reason "Not tech-related"
- Return: `{ shouldCallAI: boolean, skipReason?: string }`

### Step 3.3: Gemini API Client

Create `GeminiClient`:

- Initialize with API key, model (`gemini-3-flash-preview`), temperature: `0.2`
- `classify(post: string, filteringCriteria: FilterCriteria)`:
  1. Assemble 3-layer prompt:
     - **Layer 1** — System instruction (fixed rules from prompt design doc)
     - **Layer 2** — Dynamic context (allowed roles, levels, max_yoe from settings)
     - **Layer 3** — Post content (preprocessed)
  2. Call Gemini API with JSON response format
  3. Validate response against Zod schema
  4. Retry up to 2 times if JSON invalid
  5. Return typed `ClassificationResult`
- Track API call count per run, enforce max 50 calls limit

### Step 3.4: Classification Result Schema

Define `ClassificationResult`:

```ts
{
  is_match: boolean;
  is_freelance: boolean;
  role: "Frontend" | "Backend" | "Fullstack" | "Mobile" | "Other";
  level: "Fresher" | "Junior" | "Middle" | "Senior" | "Unknown";
  yoe: number | null;
  score: number; // 0–100
  reason: string;
}
```

Validate with Zod schema. On validation failure → retry Gemini (max 2 retries).

### Step 3.5: AI Pipeline Orchestrator

Create `AIFilterPipeline`:

- Input: array of new `RawPost` from scraper
- For each post:
  1. Run pre-filter → skip if not relevant (no API call)
  2. Check API call budget remaining → stop if exhausted
  3. Call Gemini classification
  4. If `is_match` → save to DB with all classification fields
  5. If not match → log/discard
- Return: `{ processed, matched, skipped, apiCallsUsed }`

**Key classification logic (from PRD):**

- Freelance/project-based → auto-accept, bypass role/level restrictions
- Standard job → must match allowed roles + levels + YOE ≤ max_yoe
- Missing level/YOE but role matches → still match, mark for review

---

## Phase 4: Backend API

_Depends on: Phase 1 (database schema). Can be built in parallel with Phases 2–3._

### Step 4.1: Server Setup

- Express.js + TypeScript
- Middleware: CORS, JSON parsing, bearer token auth (from env var)
- Error handling middleware with proper HTTP status codes
- Request validation using Zod

### Step 4.2: Job Endpoints

**GET /api/jobs**

- Query params: `page` (default 1), `limit` (default 20), `role`, `level`, `is_freelance`, `status`, `search` (full-text on content)
- Sort by `created_at DESC` (newest first)
- Response: `{ jobs: Job[], total: number, page: number, totalPages: number }`

**PUT /api/jobs/:id**

- Body: `{ status: "new" | "applied" | "saved" | "archived" }`
- Validate job exists, update status

**POST /api/jobs/:id/feedback**

- Body: `{ feedback_type: "relevant" | "irrelevant" }`
- Insert into UserFeedback table

### Step 4.3: Settings Endpoints

**GET /api/settings**

- Return current settings (parse JSON fields into arrays)

**PUT /api/settings**

- Validate inputs: groups must be valid URLs, max_yoe must be positive, cron must be valid expression
- Update settings row

### Step 4.4: Scraper Control Endpoint

**POST /api/scraper/run**

- Trigger manual scraping run (async execution)
- Return immediately with run ID

**GET /api/scraper/status**

- Return current scraper status / last run result

### Step 4.5: Cookie Management Endpoint

**POST /api/cookies/upload**

- Accept JSON cookie file (multipart or JSON body)
- Validate cookie structure (must contain Facebook session cookies)
- Save to secure location on disk (outside web root)
- Test validity via quick Playwright session check
- Return: `{ valid: boolean, message: string }`

---

## Phase 5: Telegram Notifier

_Depends on: Phase 1 (env config). Can be built in parallel with Phases 2–4._

### Step 5.1: Telegram Bot Client

Create `TelegramNotifier`:

- `sendMessage(chatId, text)` — HTTP POST to `https://api.telegram.org/bot{token}/sendMessage`
- Use `parse_mode: "HTML"` for formatting
- Handle API errors gracefully (log, don't crash)

### Step 5.2: Notification Formatter

Create `NotificationFormatter`:

- `formatRunSummary(stats, topJobs)`:

  ```
  🚀 Found {count} new matching jobs

  Top 10:
  1. Frontend (React) – link
  2. Fullstack – link
  ...

  View more → {dashboard_url}
  ```

- Anti-spam: max 10 jobs per message, always include total count

### Step 5.3: Alert Messages

Predefined templates:

- Session expired: `⚠️ Facebook session expired. Please re-upload cookies.`
- Scraper failure: `⚠️ Scraper failed: {reason}`
- Run complete (no matches): `✅ Scraping complete. No new matching jobs found.`

---

## Phase 6: Scheduling & Pipeline Orchestration

_Depends on: Phases 2, 3, 4, 5_

### Step 6.1: Main Pipeline Runner

Create `PipelineRunner`:

1. Load settings from DB
2. Run `ScraperOrchestrator` → get new raw posts
3. Run `AIFilterPipeline` → get matched jobs
4. Save matched jobs to DB
5. Send Telegram notification with results
6. Log run statistics

### Step 6.2: Cron Scheduling

- Use `node-cron` library
- Read cron expression from settings (default: `0 */4 * * *` = every 4 hours)
- On app start: register cron job
- On settings update: re-register cron with new schedule
- Prevent concurrent runs (use a lock/flag)

---

## Phase 7: React Dashboard

_Depends on: Phase 4 (API endpoints defined). Can be built in parallel with Phases 5–6._

### Step 7.1: Project Setup

- Vite + React 19 + TypeScript
- Tailwind CSS v4
- React Router for navigation
- TanStack Query (React Query) for data fetching & caching
- Axios or fetch wrapper for API calls

### Step 7.2: Layout & Navigation

- App shell with sidebar or top nav:
  - **Jobs** (main view)
  - **Settings**
- Responsive design (desktop-first, usable on mobile)

### Step 7.3: Jobs List Page

**Filter bar (top):**

- Role dropdown: All, Frontend, Fullstack, Mobile, Backend, Other
- Level dropdown: All, Fresher, Junior, Middle, Senior, Unknown
- Freelance toggle
- Status dropdown: All, New, Applied, Saved, Archived
- Search input (full-text, debounced 300ms)

**View modes:** Support both **card layout** (like Trello/LinkedIn) and **table rows** (like a spreadsheet). Toggle via view switcher button.

**Job cards/rows:**

- Content snippet (first 200 chars, expandable)
- Role badge, Level badge, YOE display
- Score (visual indicator — colored bar or badge)
- AI reason text
- Links: Facebook post (external), Poster profile (external)
- Action buttons: Apply, Save, Archive (status transitions)
- Feedback buttons: 👍 Relevant, 👎 Irrelevant

**Keyword highlighting:**

- Highlight configured keywords in content: `react`, `nextjs`, `salary`, `yoe`, etc.

**Pagination:**

- Page numbers with previous/next
- Sort: newest first (default)

### Step 7.4: Settings Page

- **Facebook Groups** — list with add/remove, URL validation
- **Keywords** — tag-style input for adding/removing
- **Blacklist** — tag-style input for adding/removing
- **Max YOE** — number input with validation
- **Cron Schedule** — input with human-readable preview (e.g., "Every 4 hours")
- **Cookie Upload** — drag-and-drop file upload zone → call API → show ✅ Valid / ❌ Expired
- **Manual Scrape** — button to trigger `POST /api/scraper/run`, show progress/status

### Step 7.5: UI Polish

- Loading states (skeleton loaders)
- Error states with retry button
- Toast notifications for actions (status change, settings saved)
- Empty states (no jobs found, no results matching filters)

---

## Phase 8: Deployment & Production Readiness

_Depends on: All previous phases_

### Step 8.1: Docker Setup

- `Dockerfile` for backend — Node.js + Playwright dependencies + xvfb
- `Dockerfile` for frontend — Vite build → Nginx serve
- `docker-compose.yml`:
  - Backend service (API + scraper + scheduler)
  - Frontend service (Nginx)
  - Shared volume for SQLite DB and cookies

### Step 8.2: Nginx Configuration

- Reverse proxy: `/` → frontend, `/api` → backend
- HTTPS with Let's Encrypt (certbot)
- Basic security headers (X-Frame-Options, CSP, etc.)

### Step 8.3: PM2 Alternative (Non-Docker)

- `ecosystem.config.js`:
  - Backend API process
  - Scraper/scheduler process
- Frontend served via Nginx directly (static build)

### Step 8.4: Security Hardening

- API authentication: Bearer token from env var, checked via middleware
- Cookie file stored with restricted permissions (600)
- Rate limiting on API endpoints
- Input sanitization on all endpoints
- No credentials in logs

---

## Phase 9: Testing

_Parallel with implementation phases_

### Step 9.1: Static Test Dataset

Create `tests/fixtures/test_jobs.json` with 30–50 sample posts:

- 15 valid jobs (various roles, levels, Vietnamese + English)
- 10 invalid (non-job posts, off-topic)
- 5 blacklisted company posts
- 5 edge cases (missing YOE, mixed language, freelance)
- 5 senior/lead posts (should be rejected)

### Step 9.2: Unit Tests

- Timestamp parser — all format variations
- Content preprocessor — normalization, trimming
- Pre-filter — blacklist matching, keyword matching
- Deduplicator — hash generation, duplicate detection
- Gemini response validation — valid/invalid JSON cases
- API schemas — Zod validation

### Step 9.3: Integration Tests

- AI calibration: Run test dataset through Gemini, measure accuracy (target ≥95%)
- Scraper: Use saved HTML snapshots for content extraction testing
- API: Test all endpoints with supertest

### Step 9.4: E2E Test

- Full pipeline: scrape (from snapshot) → filter → store → notify
- Verify correct jobs stored and notification sent

---

## File Structure (to be created)

```
/
├── packages/
│   ├── backend/
│   │   └── src/
│   │       ├── index.ts                # Express app entry point
│   │       ├── routes/
│   │       │   ├── jobs.ts             # Job CRUD endpoints
│   │       │   ├── settings.ts         # Settings endpoints
│   │       │   ├── scraper.ts          # Scraper control endpoint
│   │       │   └── cookies.ts          # Cookie upload endpoint
│   │       ├── middleware/
│   │       │   └── auth.ts             # Bearer token auth
│   │       └── lib/
│   │           └── db.ts               # Prisma client singleton
│   │
│   ├── scraper/
│   │   └── src/
│   │       ├── cookie-manager.ts       # Cookie load/validate/inject
│   │       ├── human-behavior.ts       # Anti-detection utilities
│   │       ├── group-scraper.ts        # Post extraction from groups
│   │       ├── timestamp-parser.ts     # Timestamp parsing
│   │       ├── deduplicator.ts         # Hash-based dedup
│   │       └── orchestrator.ts         # Top-level scraping coordinator
│   │
│   ├── ai-filter/
│   │   └── src/
│   │       ├── preprocessor.ts         # Content normalization
│   │       ├── pre-filter.ts           # Keyword/blacklist filtering
│   │       ├── gemini-client.ts        # Gemini API wrapper
│   │       ├── prompt-builder.ts       # 3-layer prompt assembly
│   │       ├── pipeline.ts             # AI filtering orchestrator
│   │       └── schemas.ts             # Zod schemas
│   │
│   ├── notifier/
│   │   └── src/
│   │       ├── telegram.ts             # Telegram Bot API client
│   │       ├── formatter.ts            # Message formatting
│   │       └── alerts.ts               # Predefined alert templates
│   │
│   └── frontend/
│       └── src/
│           ├── App.tsx                 # Root component + router
│           ├── pages/
│           │   ├── JobsPage.tsx        # Job list + filters
│           │   └── SettingsPage.tsx    # Settings management
│           ├── components/
│           │   ├── JobCard.tsx          # Single job display
│           │   ├── FilterBar.tsx       # Filter controls
│           │   └── CookieUpload.tsx    # Cookie file upload
│           └── lib/
│               ├── api.ts              # API client wrapper
│               └── hooks.ts            # React Query hooks
│
├── shared/
│   └── types.ts                        # Shared TypeScript types
│
├── prisma/
│   ├── schema.prisma                   # Database schema
│   └── seed.ts                         # Seed data
│
├── tests/
│   ├── fixtures/
│   │   └── test_jobs.json              # 30–50 sample posts
│   ├── unit/                           # Unit tests
│   └── integration/                    # Integration tests
│
├── docker-compose.yml
├── package.json
├── tsconfig.base.json
└── .env.example
```

---

## Dependency Graph

```
Phase 1 (Scaffolding + DB)
  ├── Phase 2 (Scraper)
  ├── Phase 3 (AI Filter)     ← parallel with Phase 2
  ├── Phase 4 (Backend API)   ← parallel with Phases 2–3
  └── Phase 5 (Notifier)      ← parallel with Phases 2–4
          │
          ▼
      Phase 6 (Scheduling)    ← depends on Phases 2–5
          │
          ▼
      Phase 7 (Dashboard)     ← depends on Phase 4, parallel with Phase 6
          │
          ▼
      Phase 8 (Deployment)    ← depends on all

Phase 9 (Testing) runs in parallel with all phases
```

---

## Verification Checklist

| #   | Check                                                 | Pass Criteria                                    |
| --- | ----------------------------------------------------- | ------------------------------------------------ |
| 1   | `npx prisma migrate dev` runs successfully            | Migration applied, seed data present             |
| 2   | Scraper extracts posts from saved HTML snapshot       | ≥5 posts with correct fields                     |
| 3   | Pre-filter discards blacklisted and non-tech posts    | Zero Gemini API calls for rejected posts         |
| 4   | Gemini classifies 50-post test dataset                | ≥95% accuracy (≥48/50 correct)                   |
| 5   | All API endpoints respond correctly                   | Correct status codes and data shapes (supertest) |
| 6   | Duplicate post insertion is blocked                   | Second insert of same post fails/skips           |
| 7   | Telegram notification is received                     | Message arrives in configured chat               |
| 8   | Cron triggers pipeline at interval                    | Verified with 1-min test interval                |
| 9   | Dashboard loads, filters work, status changes persist | UI functional, data round-trips to API           |
| 10  | Cookie upload validates correctly                     | Valid → ✅, Invalid → ❌                         |
| 11  | Full E2E pipeline produces results                    | Jobs in dashboard + Telegram sent                |
| 12  | `docker-compose up` starts all services               | Accessible via browser                           |

---

## Key Decisions

| Decision                                   | Rationale                                                           |
| ------------------------------------------ | ------------------------------------------------------------------- |
| Prisma over Drizzle                        | Better migration tooling, wider ecosystem, good SQLite support      |
| Monorepo with `packages/`                  | Clean separation of concerns, shared types and config               |
| Express for API                            | Simpler for this scale, large community (Fastify is equally viable) |
| Single backend process for API + scheduler | Simplifies deployment; scraper runs as async task in-process        |
| Cookie-only auth                           | No Facebook login automation — avoids CAPTCHA per PRD               |
| Gemini 2.0 Flash                           | Cost-efficient for classification; upgrade to Pro if accuracy < 95% |
| TanStack Query for frontend                | Handles caching, pagination, refetching elegantly                   |
| Learning system v1: store feedback only    | Prompt injection of negative examples is a future enhancement       |

---

## Notes & Considerations

1. **VPS Requirements** — Playwright needs xvfb + minimum 2GB RAM on DigitalOcean. Alternative: use `headless: 'new'` mode (less detectable than old headless, no xvfb needed).

2. **Facebook DOM Stability** — Facebook frequently changes DOM structure. Build a selector abstraction layer where selectors are defined in a config file for easy updates without code changes. Include DOM change detection alerts when expected elements aren't found.

3. **Gemini Model Selection** — Start with `gemini-3-flash-preview` for cost efficiency. Upgrade to `gemini-2.0-pro` only if calibration accuracy falls below 95%.

4. **Scope Exclusions** — No real-time websockets, no multi-user support, no advanced analytics. These are future enhancements if needed.

5. **Cost Control** — Pre-filter aggressively before Gemini. Max 50 API calls per run. Token optimization via content trimming (2000 char cap).

6. **Cookie Format Change** — Original plan assumed JSON cookie files. Actual format is **Netscape HTTP Cookie File (.txt)** from the "Get cookies.txt LOCALLY" Chrome extension. See [cookie-format.md](cookie-format.md). Accept both `.txt` and `.json` formats in the upload endpoint.

7. **Dashboard View Modes** — Jobs list supports dual view: card layout (default) and table rows. User can toggle between them.
