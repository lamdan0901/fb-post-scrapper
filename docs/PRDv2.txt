# 📄 Project Requirements Document

## AI-Powered Facebook Job Scraper

---

# 1. Project Overview

This project is an automated system that:

* Scrapes posts from specified Facebook IT job groups using a secondary (dummy) account
* Filters and classifies posts using Google Gemini AI
* Identifies relevant **frontend / fullstack / mobile jobs**
* Filters by **experience level (≤ Middle or <5 YOE)**
* Stores results in a local database (SQLite)
* Displays results via a React dashboard
* Sends notifications via Telegram

The system prioritizes:

* **Accuracy (AI filtering)**
* **Resilience (against Facebook changes)**
* **Cost control (Gemini usage limits)**

---

# 2. System Constraints

* Target groups: **5–10 Facebook groups**
* Posts per run: **10–50 posts**
* Scraping frequency: **every 4 hours**
* Gemini API calls: **max 50 per run**
* Deployment: **Single VPS (DigitalOcean)**

---

# 3. Tech Stack

### Backend & Scraper

* Node.js + TypeScript
* Playwright (browser automation)

### AI

* Google Gemini API

### Database

* SQLite
* ORM: Prisma or Drizzle

### Frontend

* React 19 + Vite
* Tailwind CSS

### Notifications

* Telegram Bot API

### Deployment

* DigitalOcean VPS
* PM2 or Docker
* Nginx (reverse proxy)

---

# 4. Core System Components

---

## A. Playwright Scraper (Crawler)

### Authentication

* Uses **uploaded Facebook cookies** from a dummy account
* No login via credentials (to avoid CAPTCHA)

---

### Anti-Detection Strategy

* Run browser in **non-headless mode**
* Randomized behavior:

  * Delay between actions: **2–5 seconds**
  * Incremental scrolling (simulate human)
  * Random viewport size
* Limit scraping:

  * Max **50 posts per run**
  * Max **10 groups per cycle**

---

### Navigation

* Visit group URLs with:

```
?sorting_setting=CHRONOLOGICAL
```

* Ensures newest posts appear first

---

### Scraping Logic

Extract:

* Post content (full text, including "See more")
* Post URL
* Poster name
* Poster profile URL
* Raw timestamp string

---

### Time Handling

Facebook timestamps may be:

* Relative: `2h`, `3d`
* Absolute: `Yesterday`, `March 10`

System will:

Store:

```ts
created_time_raw   // original string
created_time_utc   // parsed timestamp (UTC)
first_seen_at      // crawler timestamp
```

**Important rule:**

* Use `first_seen_at` to prevent resurfaced posts from reprocessing

---

### Failure Handling

* Retry scraping once if failed
* If still failing:

  * Send Telegram alert:

    ```
    ⚠️ Scraper failed: Possible DOM change or login issue
    ```

---

### Cookie Expiration Handling

* On invalid session:

  * Stop crawler
  * Notify:

    ```
    ⚠️ Facebook session expired. Please re-upload cookies.
    ```

---

## B. AI Filtering System (Gemini)

---

### Processing Pipeline

#### Stage 1: Pre-filter (Code-Level)

* Check if post contains:

  * General tech-related keywords (broad match)
* Check blacklist:

  * `tinhvan`, `cmcglobal`, `viettel`, etc.

👉 If blacklist matched → discard immediately
👉 If not tech-related → skip Gemini call

---

#### Stage 2: Gemini AI Classification

Gemini acts as **final decision authority**

---

### AI Capabilities

Must handle:

* English + Vietnamese
* Mixed-language posts

Examples:

* “cần dev react 2 năm”
* “looking for frontend 1–3 years”

---

### Decision Logic

#### Pathway 1: Freelance / Project-Based

If detected:

* Automatically accepted
* Bypass role/level restrictions

---

#### Pathway 2: Standard Job

Must satisfy:

* Role:

  * Frontend / React / Next.js / Fullstack / Mobile
* Level:

  * Fresher / Junior / Middle
* YOE:

  * ≤ 5 years

---

### Handling Missing Info

* If no level/YOE:

  * Keep if role matches
  * Mark for manual review

---

### Gemini Constraints

* Max **50 API calls per run**
* Stop processing when limit reached

---

### Output Schema

```json
{
  "is_match": true,
  "is_freelance": false,
  "role": "Frontend | Backend | Fullstack | Mobile | Other",
  "level": "Fresher | Junior | Middle | Senior | Unknown",
  "yoe": 2,
  "score": 85,
  "reason": "Matches frontend role and junior level"
}
```

---

### Output Validation

* Enforce strict JSON format
* Retry up to **2 times** if invalid
* Use low temperature:

```
temperature = 0.2
```

---

## C. Deduplication Strategy

To ensure zero duplicates:

Store:

```ts
fb_post_id        // optional
post_url_hash     // required, unique
content_hash      // fallback
```

### Dedup Logic

1. Match `fb_post_id` if available
2. Else match `post_url_hash`
3. Else fallback to `content_hash`

---

## D. Backend API

---

### Job Endpoints

#### GET /api/jobs

* Pagination
* Filters:

  * role
  * level
  * freelance
  * status
* Sorting: newest first

---

#### PUT /api/jobs/:id

Update job status:

* new
* applied
* saved
* archived

---

### Settings Endpoints

#### GET /api/settings

Returns:

* target groups
* keywords
* blacklist
* max YOE
* cron schedule

---

#### PUT /api/settings

* Update configuration
* Validate inputs

---

### Scraper Control

#### POST /api/scraper/run

* Manually trigger scraping

---

## E. Database Schema

---

### Jobs Table

```ts
id
fb_post_id
content
post_url
poster_url
post_url_hash
content_hash
role
level
yoe
score
reason
is_freelance
status
created_time_utc
first_seen_at
created_at
```

---

### Settings Table

```ts
id
target_groups (JSON)
target_keywords (JSON)
blacklist (JSON)
max_yoe
cron_schedule
```

---

### UserFeedback Table (Learning System)

```ts
id
job_id
feedback_type ("relevant" | "irrelevant")
created_at
```

---

## F. Learning System

* When user marks a job as irrelevant:

  * Store in `UserFeedback`

Future enhancement:

* Inject negative examples into Gemini prompt
* Improve filtering accuracy over time

---

## G. React Dashboard

---

### Features

* Job list (newest first)
* Actions:

  * Mark as applied
  * Save
  * Archive

---

### Filters

* Role
* Level
* Freelance
* Status

---

### Search

* Full-text search (content)

---

### Display Fields

* Job snippet
* Role
* Level
* YOE
* Score
* AI reason
* Links:

  * Facebook post
  * Poster profile

---

### Enhancements

* Highlight keywords:

  * react, nextjs, salary, YOE

---

### Settings Page

* Manage:

  * Facebook groups
  * Keywords
  * Blacklist
  * Cookie upload

---

### Cookie Upload UX

* Upload JSON cookie file
* Validate immediately
* Show:

  * ✅ Valid
  * ❌ Expired

---

## H. Telegram Notifier

---

### Behavior

* Trigger after each scraping run
* Send **1 summary message**

---

### Format

```
🚀 Found 18 new matching jobs

Top 10:
1. Frontend (React) – link
2. Fullstack – link
...

View more → Dashboard
```

---

### Anti-Spam

* Max 10 jobs per message
* Always include summary count

---

# 5. Scheduling

* Cron job:

```
Every 4 hours
```

---

# 6. Testing Strategy

---

## Phase 1: Static Dataset

* Create `test_jobs.json` (30–50 posts)
* Include:

  * valid jobs
  * invalid jobs
  * Vietnamese/English mix
  * blacklist cases

---

## Phase 2: AI Calibration

* Run dataset through Gemini
* Tune prompt until:

  * ≥95% accuracy

---

## Phase 3: Scraper Testing

* Use saved HTML snapshots
* Test:

  * content extraction
  * timestamp parsing
  * “See more” expansion

---

## Phase 4: E2E Testing

* Run full pipeline:

  * scrape → filter → store → notify

---

# 7. Deployment Strategy

---

### VPS Setup

* Ubuntu server
* Install:

  * Node.js
  * PM2 or Docker
  * Nginx

---

### Services

* Backend API
* Scraper worker
* React frontend

---

### Security

* Store cookies securely
* Protect API endpoints (basic auth or token)

---

# 🧠 Final Summary

This system is:

* **Resilient** against Facebook changes
* **Cost-controlled** (Gemini limits)
* **Accurate** (AI + feedback loop)
* **Scalable** (small → medium workload)
