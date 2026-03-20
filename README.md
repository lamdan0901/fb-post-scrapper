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

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Running Locally](#running-locally)
3. [Cookie Setup](#cookie-setup)
4. [Telegram Bot Setup](#telegram-bot-setup)
5. [API Reference](#api-reference)
6. [Configuration](#configuration-settings)
7. [AI Classification](#ai-classification)
8. [Testing](#testing)
9. [Deploy to Digital Ocean](#deploy-to-digital-ocean)
10. [Project Structure](#project-structure)
11. [Development Scripts](#development-scripts)
12. [Security Notes](#security-notes)

---

## Prerequisites

- **Node.js ≥ 20** and **pnpm ≥ 9**
- A Facebook account with saved Netscape-format cookies (see [Cookie Setup](#cookie-setup))
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)
- A Telegram bot token and chat ID (optional but recommended)

---

## Running Locally

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

| Variable             | Required | Description                                    |
| -------------------- | -------- | ---------------------------------------------- |
| `DATABASE_URL`       | ✅       | SQLite path, e.g. `file:./dev.db`              |
| `GEMINI_API_KEY`     | ✅       | Google Gemini API key                          |
| `API_AUTH_TOKEN`     | ✅       | Secret bearer token for all API calls          |
| `COOKIE_PATH`        | ✅       | Path to Facebook cookies file                  |
| `PORT`               | —        | Backend port (default `3000`)                  |
| `NODE_ENV`           | —        | `development` or `production`                  |
| `TELEGRAM_BOT_TOKEN` | —        | Telegram bot token (notifications)             |
| `TELEGRAM_CHAT_ID`   | —        | Telegram chat/channel ID                       |
| `DASHBOARD_URL`      | —        | Full URL appended to Telegram notifications    |
| `ALLOWED_ORIGINS`    | —        | Comma-separated CORS origins (default `:5173`) |

> **`API_AUTH_TOKEN` is required.** The backend will crash on startup if it is not set.

### 3. Migrate & seed the database

```bash
pnpm exec prisma migrate dev
pnpm exec prisma db seed
```

The seed creates a default `Settings` row with 5 sample Facebook groups, keywords, and a blacklist.

### 4. Place your Facebook cookies

Follow steps in [Cookie Setup](#cookie-setup) and place the exported `.txt` file at the path you set in `COOKIE_PATH`.

### 5. Start the dev servers

Open two terminals:

```bash
# Terminal 1 — backend (auto-restarts on file changes)
pnpm dev:backend          # http://localhost:3000

# Terminal 2 — frontend Vite dev server
pnpm dev:frontend         # http://localhost:5173
```

The Vite dev server proxies `/api/*` requests to the backend automatically — open `http://localhost:5173` in your browser.

### 6. Trigger your first scrape

Either wait for the cron (default: every 4 hours) or hit the **Manual Scrape** button on the Settings page, or make a direct API call:

```bash
curl -X POST http://localhost:3000/api/scraper/run \
  -H "Authorization: Bearer <API_AUTH_TOKEN>"
```

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

## Telegram Bot Setup

Telegram notifications are optional but strongly recommended — they deliver a run summary with the top 10 matched jobs and alert you immediately on session expiry or scraper failures.

### 1. Create the bot

1. Open Telegram and search for **[@BotFather](https://t.me/BotFather)**.
2. Send `/newbot` and follow the prompts (choose any name and username).
3. BotFather replies with a token like `123456789:ABCdef...` — this is your `TELEGRAM_BOT_TOKEN`.

### 2. Get your Chat ID

You need the ID of the chat (personal DM or group/channel) where notifications will be sent.

**Personal DM (simplest):**

1. Start a conversation with your new bot by sending it any message (e.g. `/start`).
2. Open this URL in your browser (replace `<TOKEN>` with your bot token):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
3. Find `"chat":{"id":` in the response — that number is your `TELEGRAM_CHAT_ID`.

**Group or channel:**

1. Add the bot to the group/channel and give it permission to post messages.
2. Send any message in the group, then fetch `getUpdates` as above.
3. The `chat.id` for a group is a negative number (e.g. `-1001234567890`).

> **Tip:** For a private channel, make the bot an **Administrator** with the _Post Messages_ permission.

### 3. Add to .env

```ini
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
TELEGRAM_CHAT_ID=123456789
DASHBOARD_URL=https://yourdomain.com   # optional — appended to run summaries
```

### What gets sent

| Event                        | Message                                                       |
| ---------------------------- | ------------------------------------------------------------- |
| Run complete (matches found) | Summary with stats + top 10 job snippets + dashboard link     |
| Run complete (no matches)    | Short "no new jobs" notice                                    |
| Session expired              | Alert with instructions to re-upload cookies                  |
| Scraper group failure        | Per-group error alert; scraping continues on remaining groups |

If `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` are not set, notifications are silently skipped — the scraper and scheduler still run normally.

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

| Field             | Default                                       | Description                               |
| ----------------- | --------------------------------------------- | ----------------------------------------- |
| `target_groups`   | 5 sample groups                               | Facebook group URLs to scrape             |
| `target_keywords` | Tech keywords                                 | Pre-filter: post must match at least one  |
| `blacklist`       | Company names                                 | Posts matching these are discarded        |
| `allowed_roles`   | `Frontend, Backend, Fullstack, Mobile, Other` | Only jobs with these roles are accepted   |
| `allowed_levels`  | `Fresher, Junior, Middle, Unknown`            | Only jobs with these levels are accepted  |
| `max_yoe`         | `5`                                           | Max years of experience for standard jobs |
| `cron_schedule`   | `0 */4 * * *`                                 | Scrape frequency (cron expression)        |

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

## Testing

```bash
# Unit tests only (fast, no external dependencies)
pnpm test:unit

# Integration tests (API + snapshot + AI calibration)
# Requires GEMINI_API_KEY in .env for the calibration test
pnpm test:integration

# Run everything
pnpm test
```

The integration suite:

- Spins up a fresh `tests/test.db` SQLite database before the run and deletes it after.
- Tests all API endpoints with supertest against a real in-process Express app.
- Loads the saved Facebook HTML snapshot into headless Chromium and asserts DOM selectors.
- Runs all 38 fixture posts through Gemini and asserts ≥ 95% classification accuracy (requires `GEMINI_API_KEY`).

---

## Deploy to Digital Ocean

Two deployment paths are supported. **Option A (Docker Compose)** is the recommended path for a clean Droplet. **Option B (PM2)** is for servers where Docker is not available or you prefer bare-metal control.

### Provision a Droplet

1. Create a **Ubuntu 24.04 LTS** Droplet — **Basic, 2 GB RAM / 1 vCPU** is sufficient (`s-1vcpu-2gb`).
   - Enable the firewall via the Digital Ocean dashboard (or `ufw`) and open ports **22**, **80**, and **443**.
2. Point your domain's DNS **A record** to the Droplet's IP. Let's Encrypt validation will fail if DNS is not propagated before the next step.
3. SSH in as `root`:

```bash
ssh root@<droplet-ip>
```

---

### Option A — Docker Compose (recommended)

#### 1. Install Docker

```bash
apt-get update && apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

#### 2. Clone the repo

```bash
git clone https://github.com/yourname/job-alert-2.git /opt/job-alert
cd /opt/job-alert
```

#### 3. Create the .env file

```bash
cp .env.example .env
nano .env   # fill in all required values
```

Key settings for production:

```ini
DATABASE_URL=file:/app/data/prod.db   # overridden by docker-compose.yml
COOKIE_PATH=/app/cookies/cookies.txt  # overridden by docker-compose.yml
NODE_ENV=production
PORT=3000
API_AUTH_TOKEN=<generate with: openssl rand -hex 32>
GEMINI_API_KEY=<your key>
TELEGRAM_BOT_TOKEN=<your bot token>
TELEGRAM_CHAT_ID=<your chat id>
DASHBOARD_URL=https://yourdomain.com
```

> `DATABASE_URL` and `COOKIE_PATH` are overridden in `docker-compose.yml` to use mounted volumes — the values in `.env` are ignored for those two variables in Docker mode.

#### 4. Update the domain in nginx.conf

```bash
# Replace every occurrence of "yourdomain.com" with your actual domain
sed -i 's/yourdomain.com/example.com/g' docker/nginx.conf
```

#### 5. Upload your Facebook cookies

```bash
mkdir -p cookies
# Copy your exported cookies.txt from your local machine:
scp ./cookies.txt root@<droplet-ip>:/opt/job-alert/cookies/cookies.txt
chmod 600 /opt/job-alert/cookies/cookies.txt
```

#### 6. Issue the initial Let's Encrypt certificate

DNS must already be pointing to the Droplet before this step.

```bash
chmod +x docker/init-letsencrypt.sh
# Edit the DOMAIN and EMAIL variables at the top of the script first
nano docker/init-letsencrypt.sh

./docker/init-letsencrypt.sh
```

#### 7. Build and start the stack

```bash
docker compose up -d --build
```

This starts:

- **backend** — Express API + cron scheduler + Playwright scraper
- **frontend** — Nginx serving the Vite build + SSL termination + reverse proxy
- **certbot** — Auto-renews certificates every 12 hours

#### 8. Run database migrations

```bash
docker compose exec backend node -e "
  import('@prisma/adapter-better-sqlite3').then(({PrismaBetterSqlite3}) => {
    console.log('Use prisma migrate deploy instead');
  });
"
# Simpler: run migrate deploy via the host's pnpm
DATABASE_URL="file:/opt/job-alert/data/prod.db" \
  pnpm exec prisma migrate deploy
```

Or install Node on the host and run it directly:

```bash
# On the Droplet (if Node is available):
DATABASE_URL="file:/opt/job-alert/data/prod.db" \
  npx prisma migrate deploy --schema=./prisma/schema.prisma
```

> **Tip:** The backend's `docker-entrypoint.sh` already runs `prisma migrate deploy` on startup — if you're using the `Dockerfile.backend` as-is, migrations apply automatically.

#### 9. Verify

```bash
# Check all containers are healthy
docker compose ps

# Tail backend logs
docker compose logs -f backend

# Quick health check
curl https://yourdomain.com/api/health
```

The dashboard is available at `https://yourdomain.com`. Use your `API_AUTH_TOKEN` as the password when prompted (or set it in the frontend `.env`).

#### Updating the app

```bash
cd /opt/job-alert
git pull
docker compose up -d --build
```

---

### Option B — PM2 + Nginx (bare-metal)

Use this path if you prefer not to install Docker, or if you want tighter OS-level control.

#### 1. Install dependencies

```bash
# Node.js 22 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs nginx

# pnpm
npm install -g pnpm

# PM2
npm install -g pm2

# Playwright system dependencies (Chromium)
apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
  libx11-xcb1 libxcb1 libx11-6 libxext6 libxfixes3 libxi6 \
  libxrender1 libxtst6 libdbus-1-3 libglib2.0-0 \
  fonts-liberation fonts-noto-color-emoji ca-certificates
```

#### 2. Clone, install, and build

```bash
git clone https://github.com/yourname/job-alert-2.git /opt/job-alert
cd /opt/job-alert
pnpm install --frozen-lockfile
pnpm build

# Download Playwright's Chromium binary
pnpm exec playwright install chromium
```

#### 3. Configure environment

```bash
cp .env.example .env
nano .env    # fill in all values

# Create required directories
mkdir -p data cookies logs
chmod 700 cookies
```

#### 4. Migrate the database and seed

```bash
pnpm exec prisma migrate deploy
pnpm exec prisma db seed
```

#### 5. Upload Facebook cookies

```bash
# From your local machine:
scp ./cookies.txt root@<droplet-ip>:/opt/job-alert/cookies/cookies.txt
chmod 600 /opt/job-alert/cookies/cookies.txt
```

#### 6. Start with PM2

```bash
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup   # copy and run the printed command to register with systemd
```

Verify the backend is running:

```bash
pm2 list
curl http://localhost:3000/api/health
```

#### 7. Configure Nginx

```bash
# Generate a config file in sites-available
cp /opt/job-alert/docker/nginx.conf /etc/nginx/sites-available/job-alert

# Apply the two bare-metal substitutions marked in the file:
nano /etc/nginx/sites-available/job-alert
```

Two lines need changing (marked `# BARE-METAL:` in the file):

```nginx
# Change this:
root  /usr/share/nginx/html;
# To:
root  /opt/job-alert/packages/frontend/dist;

# Change this:
proxy_pass http://backend:3000/api/;
# To:
proxy_pass http://127.0.0.1:3000/api/;
```

Also replace `yourdomain.com` with your actual domain throughout the file.

```bash
ln -s /etc/nginx/sites-available/job-alert /etc/nginx/sites-enabled/job-alert
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

#### 8. Issue an SSL certificate

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Certbot will automatically update your Nginx config and set up a systemd timer for auto-renewal.

#### 9. Build the frontend and deploy

```bash
cd /opt/job-alert
pnpm --filter @job-alert/frontend build

# Nginx serves from packages/frontend/dist (set in step 7)
```

> The frontend uses a relative `/api` base URL so it works behind any Nginx reverse proxy without any env var needed at build time.

#### Updating the app

```bash
cd /opt/job-alert
git pull
pnpm install --frozen-lockfile
pnpm build
pnpm exec prisma migrate deploy
pm2 reload job-alert-backend
```

#### Logs

```bash
pm2 logs job-alert-backend          # live tail
cat logs/backend-error.log          # errors
cat logs/backend-out.log            # stdout
journalctl -u nginx -f              # Nginx logs
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
├─ tests/           # Unit and integration tests
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
| `pnpm test:unit`               | Run unit tests only (fast)                |
| `pnpm test:integration`        | Run API + snapshot + calibration tests    |
| `pnpm test`                    | Run all tests                             |
| `pnpm typecheck`               | Run `tsc --noEmit` across all packages    |
| `pnpm clean`                   | Remove all `dist/` directories            |
| `pnpm exec prisma studio`      | Open Prisma Studio (DB GUI)               |
| `pnpm exec prisma migrate dev` | Create and apply a new migration          |
| `pnpm exec prisma db seed`     | Re-seed the database                      |

---

## Security Notes

- `API_AUTH_TOKEN` is enforced on all API routes via bearer token middleware. Generate a strong value with `openssl rand -hex 32`.
- Cookie files are stored outside the web root with permissions `600`.
- The Nginx config sets HSTS, `X-Frame-Options: DENY`, CSP, and other hardening headers by default.
- Never commit `.env` or cookie files — both are in `.gitignore`.
