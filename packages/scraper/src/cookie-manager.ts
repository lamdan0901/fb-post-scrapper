import { readFile } from "node:fs/promises";
import type { BrowserContext, Page } from "playwright";
import { SessionExpiredError } from "./errors.js";

type PlaywrightCookie = Parameters<BrowserContext["addCookies"]>[0][number];

const REQUIRED_COOKIES = ["c_user", "xs"] as const;

export class CookieManager {
  private cookies: PlaywrightCookie[] | null = null;

  /**
   * Read a Netscape `.txt` cookie file, parse it into Playwright cookie format,
   * and validate that required Facebook session cookies (`c_user`, `xs`) are present.
   */
  async loadCookies(filePath: string): Promise<PlaywrightCookie[]> {
    const raw = await readFile(filePath, "utf-8");

    const cookies: PlaywrightCookie[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const fields = trimmed.split("\t");
      if (fields.length < 7) continue;

      const [domain, , path, secure, expiry, name, value] = fields;

      // Only keep Facebook cookies
      if (!domain.includes("facebook.com")) continue;

      cookies.push({
        name,
        value,
        domain,
        path,
        expires: Number(expiry),
        httpOnly: false,
        secure: secure === "TRUE",
        sameSite: "None",
      });
    }

    const cookieNames = new Set(cookies.map((c) => c.name));
    const missing = REQUIRED_COOKIES.filter((n) => !cookieNames.has(n));
    if (missing.length > 0) {
      throw new Error(`Missing required cookies: ${missing.join(", ")}`);
    }

    this.cookies = cookies;
    return cookies;
  }

  /** Inject previously loaded cookies into a Playwright BrowserContext. */
  async applyCookies(context: BrowserContext): Promise<void> {
    if (!this.cookies) {
      throw new Error(
        "No cookies loaded. Call loadCookies() before applyCookies().",
      );
    }
    await context.addCookies(this.cookies);
  }

  /**
   * Navigate to facebook.com and verify the session is valid.
   * Throws `SessionExpiredError` if the login form is detected.
   */
  async validateSession(page: Page): Promise<void> {
    await page.goto("https://www.facebook.com/", {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    const loginForm = await page
      .locator('input[name="email"], form#login_form')
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (loginForm) {
      throw new SessionExpiredError();
    }
  }
}
