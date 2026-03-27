import rateLimit from "express-rate-limit";

/** General API rate limit: 100 requests per minute per IP. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/** Strict rate limit for scraper trigger: 2 requests per minute. */
export const scraperLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 2,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many scraper requests, please try again later" },
});

/** Cancel rate limit: allow more frequent cancel attempts than run triggers. */
export const scraperCancelLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many cancel requests, please try again later" },
});
