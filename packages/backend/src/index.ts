import "dotenv/config";

import express from "express";
import cors from "cors";
import { authMiddleware } from "./middleware/auth.js";
import { apiLimiter, scraperLimiter } from "./middleware/rate-limit.js";
import { errorHandler } from "./middleware/error-handler.js";
import { prisma } from "./lib/db.js";
import { jobsRouter } from "./routes/jobs.js";
import { settingsRouter } from "./routes/settings.js";
import { scraperRouter } from "./routes/scraper.js";
import { cookiesRouter } from "./routes/cookies.js";

// ── Startup validation ──
const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
if (Number.isNaN(PORT) || PORT < 0 || PORT > 65535) {
  throw new Error(`Invalid PORT: ${process.env["PORT"]}`);
}
if (!process.env["API_AUTH_TOKEN"]) {
  throw new Error("API_AUTH_TOKEN environment variable must be set");
}

const app = express();

// Global middleware
app.use(cors());
app.use(express.json());

// Health check (unauthenticated)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Authenticated API routes
const api = express.Router();
api.use(authMiddleware);
api.use(apiLimiter);
api.use("/jobs", jobsRouter);
api.use("/settings", settingsRouter);
api.use("/scraper", scraperLimiter, scraperRouter);
api.use("/cookies", cookiesRouter);
app.use("/api", api);

// Global error handler (must be last)
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// ── Graceful shutdown ──
function shutdown() {
  console.log("Shutting down…");
  server.close(() => {
    prisma.$disconnect().then(() => process.exit(0));
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
