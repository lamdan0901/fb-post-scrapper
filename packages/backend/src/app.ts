import express from "express";
import cors from "cors";
import { authMiddleware } from "./middleware/auth.js";
import { apiLimiter } from "./middleware/rate-limit.js";
import { errorHandler } from "./middleware/error-handler.js";
import { jobsRouter } from "./routes/jobs.js";
import { settingsRouter } from "./routes/settings.js";
import { scraperRouter } from "./routes/scraper.js";
import { cookiesRouter } from "./routes/cookies.js";

/**
 * Build and return the configured Express application.
 * Called by both the production server entry point and tests.
 */
export function createApp(): express.Express {
  // Derive allowed CORS origins from env (comma-separated list).
  // Defaults to localhost:5173 (Vite dev server) when not set.
  const allowedOrigins: string[] = (
    process.env["ALLOWED_ORIGINS"] ?? "http://localhost:5173"
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const app = express();

  // Global middleware
  app.use(cors({ origin: allowedOrigins }));
  // Explicit body-size limit guards against oversized payload attacks.
  app.use(express.json({ limit: "32kb" }));

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
  api.use("/scraper", scraperRouter); // scraperLimiter is applied inline on POST /run
  api.use("/cookies", cookiesRouter);
  app.use("/api", api);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}
