import { randomInt } from "node:crypto";
import type { Page, LaunchOptions } from "playwright";

// ── User-Agent Pool ──

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
] as const;

// ── Delays ──

/** Wait a random amount of time between `min` and `max` milliseconds. */
export function randomDelay(min = 2000, max = 5000): Promise<void> {
  const ms = randomInt(min, max + 1);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Viewport ──

/** Generate a random viewport size (width 1200–1920, height 800–1080). */
export function randomViewport(): { width: number; height: number } {
  return {
    width: randomInt(1200, 1921),
    height: randomInt(800, 1081),
  };
}

// ── Scrolling ──

/**
 * Scroll the page by `distance` pixels using small increments with random
 * pauses in between, mimicking a human scrolling through a feed.
 */
export async function smoothScroll(
  page: Page,
  distance: number,
): Promise<void> {
  let scrolled = 0;
  while (scrolled < distance) {
    const step = Math.min(randomInt(100, 301), distance - scrolled);
    await page.evaluate((px) => window.scrollBy(0, px), step);
    scrolled += step;
    // Small pause between scroll increments (50–200 ms)
    await new Promise((resolve) => setTimeout(resolve, randomInt(50, 201)));
  }
}

// ── Mouse Movement ──

/** Move the mouse to 2–4 random positions within the viewport. */
export async function randomMouseMovement(page: Page): Promise<void> {
  const vp = page.viewportSize();
  if (!vp) return;

  const moves = randomInt(2, 5);
  for (let i = 0; i < moves; i++) {
    const x = randomInt(0, vp.width);
    const y = randomInt(0, vp.height);
    await page.mouse.move(x, y, { steps: randomInt(5, 15) });
    await new Promise((resolve) => setTimeout(resolve, randomInt(100, 400)));
  }
}

// ── Browser Configuration ──

/** Pick a random user-agent string from the pool. */
export function getRandomUserAgent(): string {
  return USER_AGENTS[randomInt(0, USER_AGENTS.length)];
}

/**
 * Playwright launch options with automation-detection flags disabled.
 * Uses `headless: false` by default. On a VPS with xvfb, switch to `'new'`.
 */
export function getBrowserLaunchOptions(): LaunchOptions {
  return {
    headless: process.env.HEADLESS === "true",
    args: ["--disable-blink-features=AutomationControlled"],
  };
}

/**
 * Convenience helper that returns context options with a random user-agent
 * and random viewport, ready to pass to `browser.newContext()`.
 */
export function getContextOptions() {
  return {
    userAgent: getRandomUserAgent(),
    viewport: randomViewport(),
  } as const;
}
