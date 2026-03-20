/**
 * Centralized Facebook DOM selectors.
 *
 * Facebook uses obfuscated CSS class names that change between deployments.
 * All selectors here rely on stable attributes (role, aria-*, data-*, href patterns).
 * Update this file when Facebook changes its DOM structure.
 */
export const SELECTORS = {
  /** Main feed container wrapping all posts. */
  feed: '[role="feed"]',

  /** Post containers — direct children of the feed. */
  postItems: '[role="feed"] > div',

  /** "See more" button base selector (filter by text separately). */
  seeMore: 'div[role="button"]',

  /** Accepted text labels for the "See more" button (English + Vietnamese). */
  seeMoreText: ["See more", "Xem thêm"] as readonly string[],

  /** Permalink / timestamp links that contain the post URL. */
  postLink: 'a[href*="/posts/"], a[href*="/permalink/"]',

  /** Primary post text content container. */
  postContent: 'div[data-ad-preview="message"]',

  /** Fallback content selector when data-ad-preview is absent. */
  postContentFallback: 'div[dir="auto"]',

  /** Poster name & profile link (narrow: targets links inside <strong> or <h3>). */
  posterLink: 'strong a[role="link"], h3 a[role="link"]',

  /** Broad fallback for poster link when narrow selector doesn't match. */
  posterLinkFallback: 'a[role="link"]',

  /** Login form indicator — present when session is expired. */
  loginForm: 'input[name="email"]',

  /** Logged-in indicator — present when session is valid. */
  loggedInIndicator: '[aria-label="Facebook"]',
} as const;
