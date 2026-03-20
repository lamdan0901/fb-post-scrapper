// PM2 Ecosystem Config — Job Alert (Non-Docker / Bare-Metal)
//
// Usage:
//   pm2 start ecosystem.config.cjs --env production   # Start backend
//   pm2 save                                           # Persist process list
//   pm2 startup                                        # Generate systemd/init script
//
// Remote deploy (git-based):
//   pm2 deploy ecosystem.config.cjs production setup   # First-time setup on server
//   pm2 deploy ecosystem.config.cjs production         # Deploy + migrate + reload
//
// Secrets: do NOT put real values here. Place them in .env at the project root.
// The backend loads .env automatically via `import "dotenv/config"` on startup.

"use strict";

module.exports = {
  // ── Application processes ──────────────────────────────────────────────────
  apps: [
    {
      name: "job-alert-backend",

      // Compiled ESM output — run `pnpm build` (or `pnpm --filter @job-alert/backend build`) first.
      script: "packages/backend/dist/index.js",

      // Run from the monorepo root so relative paths (.env, data/, cookies/) resolve correctly.
      cwd: __dirname,

      // fork mode — do NOT use cluster: the cron scheduler and scraper lock are process-local state.
      exec_mode: "fork",
      instances: 1,

      // Node ≥20 required (ESM, top-level await).
      interpreter: "node",
      interpreter_args: "",

      // Restart policy
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 3000,

      // Restart if heap grows past this threshold (Playwright can leak memory on long runs).
      max_memory_restart: "512M",

      // Give graceful shutdown (SIGTERM handler) time to finish.
      kill_timeout: 5000,
      listen_timeout: 10000,

      // Merge stdout + stderr into a single stream for easier tailing.
      merge_logs: false,
      error_file: "./logs/backend-error.log",
      out_file: "./logs/backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // ── Environment: development ─────────────────────────────────────────
      env: {
        NODE_ENV: "development",
        PORT: 3000,
        // Remaining secrets come from .env in cwd.
      },

      // ── Environment: production ──────────────────────────────────────────
      // Override only what differs from development; secrets still come from .env.
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,

        // Override .env values here if you prefer PM2-managed secrets.
        // DATABASE_URL: "file:/home/user/job-alert-2/data/prod.db",
        // COOKIE_PATH: "/home/user/job-alert-2/cookies/cookies.txt",
        // API_AUTH_TOKEN: "changeme",
        // GEMINI_API_KEY: "changeme",
        // TELEGRAM_BOT_TOKEN: "changeme",
        // TELEGRAM_CHAT_ID: "changeme",
        // DASHBOARD_URL: "https://yourdomain.com",
      },
    },
  ],

  // ── Remote deploy configuration ────────────────────────────────────────────
  // Requires:
  //   1. SSH access from your local machine to the server.
  //   2. Git remote "origin" accessible from the server.
  //   3. PM2 and pnpm installed globally on the server.
  //
  // First-time setup: pm2 deploy ecosystem.config.cjs production setup
  // Deploy:           pm2 deploy ecosystem.config.cjs production
  deploy: {
    production: {
      // SSH target — update to match your server.
      user: "deploy",
      host: "your-server-ip-or-hostname",
      ref: "origin/main",
      repo: "git@github.com:yourname/job-alert-2.git",
      path: "/home/deploy/job-alert-2",

      // SSH options (optional — useful if your server uses a non-standard port).
      // "ssh-options": "Port=2222",

      // Commands run after git pull on the server.
      // Order: install → build → migrate → reload.
      "post-deploy":
        "pnpm install --frozen-lockfile && " +
        "pnpm --filter @job-alert/backend build && " +
        "pnpm --filter @job-alert/frontend build && " +
        "pnpm exec prisma migrate deploy && " +
        "pm2 reload ecosystem.config.cjs --env production",

      // Optional: one-time setup commands run by `pm2 deploy ... setup`.
      "pre-setup":
        "mkdir -p /home/deploy/job-alert-2/logs /home/deploy/job-alert-2/data /home/deploy/job-alert-2/cookies",
    },
  },
};
