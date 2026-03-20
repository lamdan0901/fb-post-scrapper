import { Router, type Router as RouterType } from "express";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod/v4";
import { SessionExpiredError } from "@job-alert/scraper";
import { ValidationError } from "../errors.js";

// ── Validation ──

const REQUIRED_COOKIES = ["c_user", "xs"] as const;

const uploadSchema = z.object({
  content: z.string().min(1, "Cookie file content is required"),
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

// ── Router ──

export const cookiesRouter: RouterType = Router();

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
        });
        return;
      }
      // Playwright unavailable or other non-session error — cookies still saved
      validityMessage =
        "Cookies saved. Session validity could not be verified.";
    }

    res.json({ valid: true, message: validityMessage });
    return;
  }

  res.json({
    valid: true,
    message: "Cookies uploaded successfully.",
  });
});
