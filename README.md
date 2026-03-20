# Job Alert — AI-Powered Facebook Job Scraper

Automatically scrapes IT job posts from Facebook groups, classifies them with Google Gemini AI, and delivers curated results to a React dashboard and Telegram notifications.

---

## Features

- **Playwright scraper** — cookie-based authentication, anti-detection (random delays, viewport, scroll, user-agent rotation), chronological feed navigation
- **Two-stage AI filter** — code-level keyword/blacklist pre-filter (no API call), then Gemini `gemini-2.0-flash` classification (role, level, YOE, relevance score)
- **Deduplication** — SHA-256 hashes of post URL and content prevent re-processing resurfaced posts
- **React dashboard** — filter by role/level/freelance/status, keyword highlighting, status transitions (Apply / Save / Archive), feedback buttons
- **Telegram notifications** — run summary with top 10 matched jobs; alerts for session expiry and scraper failures
- **Configurable scheduler** — cron expression stored in DB, default every 4 hours; re-registers on settings update
- **Two deployment paths** — Docker Compose (with certbot) or PM2 bare-metal

---

## Tech Stack

| Layer             | Technology                                                        |
| ----------------- | ----------------------------------------------------------------- |
| Scraper / Backend | Node.js ≥ 20, TypeScript, Express 5, Playwright                   |
| AI                | Google Gemini API (`gemini-2.0-flash`, temp 0.2)                  |
| Database          | SQLite + Prisma ORM                                               |
| Frontend          | React 19, Vite, Tailwind CSS v4, TanStack Query 5, React Router 7 |
| Notifications     | Telegram Bot API                                                  |
| Deployment        | Docker Compose **or** PM2 + Nginx                                 |

---

## Prerequisites

- **Node.js ≥ 20** and **pnpm ≥ 9**
- A Facebook account with saved Netscape-format cookies (see [Cookie Setup](#cookie-setup))
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)
- A Telegram bot token and chat ID (optional but recommended)

---

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/yourname/job-alert-2.git
cd job-alert-2
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in every value:

| Variable             | Description                                  |
| -------------------- | -------------------------------------------- |
| `DATABASE_URL`       | SQLite path, e.g. `file:./dev.db`            |
| `GEMINI_API_KEY`     | Google Gemini API key                        |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token                           |
| `TELEGRAM_CHAT_ID`   | Telegram chat/channel ID                     |
| `COOKIE_PATH`        | Path to Facebook cookies file                |
| `PORT`               | Backend port (default `3000`)                |
| `NODE_ENV`           | `development` or `production`                |
| `API_AUTH_TOKEN`     | **Required.** Secret token for all API calls |
| `DASHBOARD_URL`      | Optional. Appended to Telegram notifications |

> **`API_AUTH_TOKEN` is required.** The backend will crash on startup if it is not set.

### 3. Migrate & seed the database

```bash
pnpm exec prisma migrate dev
pnpm exec prisma db seed
```

The seed creates a default `Settings` row with 5 sample Facebook groups, keywords, and a blacklist.

### 4. Run locally

```bash
# In two separate terminals:
pnpm dev:backend    # http://localhost:3000
pnpm dev:frontend   # http://localhost:5173
```

The frontend Vite dev server proxies `/api/*` to the backend automatically.

---

## Cookie Setup

The scraper authenticates via saved Facebook cookies — no password is used.

1. Log into Facebook in Chrome using a dedicated dummy account.
2. Install the [**Get cookies.txt LOCALLY**](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) extension.
3. Export cookies for `facebook.com` in **Netscape format** (`.txt`).
4. Place the file at the path set in `COOKIE_PATH` (e.g. `./cookies/cookies.txt`).

Alternatively, upload the file via the Settings page in the dashboard (`POST /api/cookies/upload`).

The scraper validates that `c_user` and `xs` cookies are present on startup and sends a Telegram alert if the session has expired.

---

## API Reference

All endpoints except `GET /api/health` require an `Authorization: Bearer <API_AUTH_TOKEN>` header.

| Method | Path                     | Description                                                                             |
| ------ | ------------------------ | --------------------------------------------------------------------------------------- |
| `GET`  | `/api/health`            | Health check (unauthenticated)                                                          |
| `GET`  | `/api/jobs`              | List jobs — query: `page`, `limit`, `role`, `level`, `is_freelance`, `status`, `search` |
| `PUT`  | `/api/jobs/:id`          | Update job status (`new` / `applied` / `saved` / `archived`)                            |
| `POST` | `/api/jobs/:id/feedback` | Submit feedback (`relevant` / `irrelevant`)                                             |
| `GET`  | `/api/settings`          | Get current settings                                                                    |
| `PUT`  | `/api/settings`          | Update settings (groups, keywords, blacklist, max YOE, cron)                            |
| `POST` | `/api/scraper/run`       | Trigger a scrape run (async)                                                            |
| `GET`  | `/api/scraper/status`    | Current run status / last run result                                                    |
| `POST` | `/api/cookies/upload`    | Upload Facebook cookies file                                                            |

---

## Configuration (Settings)

Settings are stored in the database and editable via the Settings page or `PUT /api/settings`.

| Field             | Default         | Description                               |
| ----------------- | --------------- | ----------------------------------------- |
| `target_groups`   | 5 sample groups | Facebook group URLs to scrape             |
| `target_keywords` | Tech keywords   | Pre-filter: post must match at least one  |
| `blacklist`       | Company names   | Posts matching these are discarded        |
| `max_yoe`         | `5`             | Max years of experience for standard jobs |
| `cron_schedule`   | `0 */4 * * *`   | Scrape frequency (cron expression)        |

Changes to `cron_schedule` take effect immediately — the scheduler re-registers without a restart.

---

## AI Classification

Posts pass through two stages before being saved:

1. **Pre-filter (code-level):** checks blacklist → discards; checks tech keywords → discards if none match. No API call.
2. **Gemini classify:** sends normalized post content (≤ 2 000 chars) and returns:

```json
{
  "is_match": true,
  "is_freelance": false,
  "role": "Frontend",
  "level": "Junior",
  "yoe": 2,
  "score": 85,
  "reason": "React role, Junior level, 2 YOE"
}
```

**Accept conditions:**

- Freelance posts → always accepted (bypass role/level filter)
- Standard jobs → role must match settings + level ≤ Middle + YOE ≤ `max_yoe`
- Missing level/YOE → still matched if role matches, flagged for review

Max 50 Gemini API calls per run. Run halts if the budget is exhausted.

---

## Deployment

### Option A — Docker Compose (recommended)

```bash
# Build images and start all services (backend + nginx/frontend + certbot)
docker compose up -d --build

# View logs
docker compose logs -f backend
```

Update `docker/nginx.conf`: replace `yourdomain.com` with your domain before building.
Run `docker/init-letsencrypt.sh` once to obtain the initial certificate.

### Option B — PM2 + Nginx (bare-metal)

```bash
# 1. Build
pnpm build

# 2. Run DB migrations
pnpm exec prisma migrate deploy

# 3. Start backend with PM2
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup   # follow the printed command to register with systemd
```

**Nginx:** edit `docker/nginx.conf` and apply the two bare-metal substitutions marked in the file:

- `root` line → point to `packages/frontend/dist`
- `proxy_pass` → use `http://127.0.0.1:3000/api`

**Remote git deploy (optional):**

1. Fill in `deploy.production` in `ecosystem.config.cjs` (user, host, repo, path).
2. `pm2 deploy ecosystem.config.cjs production setup` — first-time server prep
3. `pm2 deploy ecosystem.config.cjs production` — deploys, migrates, and reloads

### Logs (PM2)

```bash
pm2 logs job-alert-backend          # live tail
cat logs/backend-error.log          # errors
cat logs/backend-out.log            # stdout
```

---

## Project Structure

```
job-alert-2/
├─ packages/
│  ├─ backend/      # Express API + cron scheduler + pipeline runner
│  ├─ scraper/      # Playwright scraper, cookie manager, deduplicator
│  ├─ ai-filter/    # Gemini client, pre-filter, classification pipeline
│  ├─ notifier/     # Telegram bot client and message formatter
│  └─ frontend/     # React 19 + Vite dashboard
├─ prisma/          # Schema, migrations, seed
├─ shared/          # Shared TypeScript types
├─ docker/          # nginx.conf, entrypoint scripts, Let's Encrypt helper
├─ data/            # SQLite database file (prod.db — gitignored)
├─ cookies/         # Facebook cookies file (gitignored)
├─ logs/            # PM2 log output (gitignored)
├─ ecosystem.config.cjs   # PM2 config
├─ docker-compose.yml
├─ Dockerfile.backend
├─ Dockerfile.frontend
└─ .env.example
```

---

## Development Scripts

| Command                        | Description                               |
| ------------------------------ | ----------------------------------------- |
| `pnpm dev:backend`             | Start backend in watch mode (`tsx watch`) |
| `pnpm dev:frontend`            | Start Vite dev server                     |
| `pnpm build`                   | Build all packages                        |
| `pnpm typecheck`               | Run `tsc --noEmit` across all packages    |
| `pnpm clean`                   | Remove all `dist/` directories            |
| `pnpm exec prisma studio`      | Open Prisma Studio (DB GUI)               |
| `pnpm exec prisma migrate dev` | Create and apply a new migration          |
| `pnpm exec prisma db seed`     | Re-seed the database                      |

---

## Security Notes

- `API_AUTH_TOKEN` is enforced on all API routes via bearer token middleware. Use a strong random value in production.
- Cookie files are stored outside the web root and should have permissions `600`.
- The Nginx config sets HSTS, `X-Frame-Options: DENY`, CSP, and other hardening headers by default.
- Never commit `.env` or cookie files — both are in `.gitignore`.
