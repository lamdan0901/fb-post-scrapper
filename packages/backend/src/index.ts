import "dotenv/config";

import { prisma } from "./lib/db.js";
import { scheduler } from "./lib/scheduler.js";
import { createApp } from "./app.js";

// ── Startup validation ──
const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
if (Number.isNaN(PORT) || PORT < 0 || PORT > 65535) {
  throw new Error(`Invalid PORT: ${process.env["PORT"]}`);
}
if (!process.env["API_AUTH_TOKEN"]) {
  throw new Error("API_AUTH_TOKEN environment variable must be set");
}

const app = createApp();

const server = app.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);

  // ── Initialize cron scheduler from DB settings ──
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    if (settings?.cron_schedule) {
      scheduler.start(settings.cron_schedule);
    }
  } catch (err) {
    console.error("Failed to initialize cron scheduler:", err);
  }
});

// ── Graceful shutdown ──
function shutdown() {
  console.log("Shutting down…");
  scheduler.stop();
  server.close(() => {
    prisma.$disconnect().then(() => process.exit(0));
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
