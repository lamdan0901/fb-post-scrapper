import { Router, type Router as RouterType } from "express";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod/v4";
import { SessionExpiredError } from "@job-alert/scraper";
import { ValidationError } from "../errors.js";

// ── Validation ──

const REQUIRED_COOKIES = ["c_user", "xs"] as const;

const uploadSchema = z.object({
  content: z
    .string()
    .min(1, "Cookie file content is required")
    .max(30_000, "Cookie file too large (max 30 000 characters)"),
  verify: z.boolean().optional().default(false),
});

/**
 * Parse Netscape cookie lines and return Facebook cookie names found.
 * Throws `ValidationError` if format is completely invalid.
 */
function parseAndValidateCookies(content: string): void {
  const lines = content.split("\n");
  const cookieNames = new Set<string>();
  let parsedCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const fields = trimmed.split("\t");
    if (fields.length < 7) continue;

    const [domain, , , , , name] = fields;
    if (domain.includes("facebook.com")) {
      cookieNames.add(name);
      parsedCount++;
    }
  }

  if (parsedCount === 0) {
    throw new ValidationError(
      "No valid Facebook cookies found. Ensure the file is in Netscape cookie format (.txt) and contains Facebook cookies.",
    );
  }

  const missing = REQUIRED_COOKIES.filter((n) => !cookieNames.has(n));
  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required Facebook session cookies: ${missing.join(", ")}. Export cookies while logged into Facebook.`,
    );
  }
}

/**
 * Extract the earliest expiry date of key session cookies (c_user, xs) from
 * Netscape cookie file content. Returns null if no expiry can be determined.
 */
function extractKeyExpiry(content: string): Date | null {
  const KEY_COOKIES = new Set(["c_user", "xs"]);
  const lines = content.split("\n");
  let minExpiry: number | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const fields = trimmed.split("\t");
    if (fields.length < 7) continue;
    const [domain, , , , expiryStr, name] = fields;
    if (!domain.includes("facebook.com")) continue;
    if (!KEY_COOKIES.has(name)) continue;
    const expiry = parseInt(expiryStr, 10);
    if (Number.isNaN(expiry) || expiry === 0) continue;
    if (minExpiry === null || expiry < minExpiry) minExpiry = expiry;
  }

  return minExpiry !== null ? new Date(minExpiry * 1000) : null;
}

// ── Router ──

export const cookiesRouter: RouterType = Router();

// GET /cookies/info — return expiry info for the currently stored cookie file
cookiesRouter.get("/info", async (_req, res) => {
  const cookiePath = process.env["COOKIE_PATH"];
  if (!cookiePath) {
    throw new Error("COOKIE_PATH environment variable not set");
  }

  let content: string;
  try {
    content = await readFile(cookiePath, "utf-8");
  } catch {
    res.json({ exists: false, expires_at: null, is_expired: false });
    return;
  }

  const expiryDate = extractKeyExpiry(content);
  const expiresAt = expiryDate ? expiryDate.toISOString() : null;
  const isExpired = expiryDate !== null && expiryDate <= new Date();

  res.json({ exists: true, expires_at: expiresAt, is_expired: isExpired });
});

// POST /cookies/verify — run a live session check against Facebook using the stored cookie
cookiesRouter.post("/verify", async (_req, res) => {
  const cookiePath = process.env["COOKIE_PATH"];
  if (!cookiePath) {
    throw new Error("COOKIE_PATH environment variable not set");
  }

  let content: string;
  try {
    content = await readFile(cookiePath, "utf-8");
  } catch {
    res
      .status(404)
      .json({
        valid: false,
        message: "No cookie file found. Please upload cookies first.",
      });
    return;
  }

  const expiryDate = extractKeyExpiry(content);
  const expiresAt = expiryDate ? expiryDate.toISOString() : null;

  try {
    const { CookieManager } = await import("@job-alert/scraper");
    const cookieManager = new CookieManager();
    await cookieManager.loadCookies(cookiePath);

    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      await cookieManager.applyCookies(context);
      const page = await context.newPage();
      await cookieManager.validateSession(page);
    } finally {
      await browser.close();
    }

    res.json({
      valid: true,
      message: "Session is active and verified.",
      expires_at: expiresAt,
    });
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      res.json({
        valid: false,
        message:
          "Session is expired. Please re-export fresh cookies from Facebook.",
        expires_at: expiresAt,
      });
      return;
    }
    res.json({
      valid: false,
      message:
        "Could not verify session (Playwright unavailable or network error).",
      expires_at: expiresAt,
    });
  }
});

// POST /cookies/upload — accept Netscape cookie file content, validate, save to disk
cookiesRouter.post("/upload", async (req, res) => {
  const { content, verify } = uploadSchema.parse(req.body);

  // Validate cookie structure
  parseAndValidateCookies(content);

  // Resolve save path
  const cookiePath = process.env["COOKIE_PATH"];
  if (!cookiePath) {
    throw new Error("COOKIE_PATH environment variable not set");
  }

  // Save to disk with restrictive permissions (owner read/write only)
  await mkdir(dirname(cookiePath), { recursive: true });
  await writeFile(cookiePath, content, { mode: 0o600 });

  const expiryDate = extractKeyExpiry(content);
  const expiresAt = expiryDate ? expiryDate.toISOString() : null;

  // Optional Playwright session validity check
  if (verify) {
    let validityMessage: string;
    try {
      const { CookieManager } = await import("@job-alert/scraper");

      const cookieManager = new CookieManager();
      await cookieManager.loadCookies(cookiePath);

      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext();
        await cookieManager.applyCookies(context);
        const page = await context.newPage();
        await cookieManager.validateSession(page);
        validityMessage = "Cookies uploaded and session verified.";
      } finally {
        await browser.close();
      }
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        res.json({
          valid: false,
          message:
            "Cookies saved but session is expired. Please re-export fresh cookies from Facebook.",
          expires_at: expiresAt,
        });
        return;
      }
      // Playwright unavailable or other non-session error — cookies still saved
      validityMessage =
        "Cookies saved. Session validity could not be verified.";
    }

    res.json({ valid: true, message: validityMessage, expires_at: expiresAt });
    return;
  }

  res.json({
    valid: true,
    message: "Cookies uploaded successfully.",
    expires_at: expiresAt,
  });
});
