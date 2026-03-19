# Facebook DOM Selectors Reference

> Extracted from snapshot: `[IT JOBS] REMOTE - SHORT TERM - PART TIME - Otingting Network _ Facebook.html`
> **WARNING:** Facebook frequently changes DOM structure. These selectors WILL break.
> All selectors are stored in a config file so they can be updated without code changes.

## Key Architectural Notes

1. Facebook uses **obfuscated CSS class names** (e.g., `x1yztbdb`, `xdt5ytf`) that change between deployments.
2. **Stable attributes** to rely on: `role`, `aria-label`, `data-*`, `tabindex`, element structure.
3. **Avoid** relying on class names as primary selectors — use them only as secondary/fallback.
4. The feed is **virtualized** — not all posts are in the DOM at once. Scrolling loads more.

## Selector Strategy (Priority Order)

### 1. Feed Container

```
[role="feed"]
```

The main feed is wrapped in a `<div role="feed">`.

### 2. Post Elements

Posts inside the feed are **not** standard `role="article"` for top-level posts.
They are `<div>` elements inside the feed with specific structure:

- Each post is wrapped in an `aria-posinset` div for virtualization
- The actual post content is nested several levels deep

Strategy: Select all direct children of the `role="feed"` container, then drill into each for content.

```
[role="feed"] > div > div
```

### 3. "See More" Button

```
div[role="button"]:has-text("See more")
// or for Vietnamese:
div[role="button"]:has-text("Xem thêm")
```

From snapshot: The "See more" button uses `role="button"` with inner text content.

### 4. Post Text Content

Post text is inside `<div>` elements with `dir="auto"` attribute within the post body.
Look for text content containers after the poster header section.

```
div[data-ad-preview="message"]
// Fallback: iterate div[dir="auto"] within post container
```

### 5. Poster Name & Profile Link

The poster's name is an `<a>` tag (link) near the top of each post, typically with:

- A strong/span containing the name text
- `href` pointing to the poster's profile

Strategy: Find the first `<a>` with `role="link"` inside the post header area.

### 6. Timestamp / Permalink

Timestamps appear as `<a>` links containing relative time text (e.g., "5h", "2d").
These links also serve as the **permalink** to the individual post.

Look for:

- `<a>` tags with `href` containing `/groups/{groupId}/posts/` or `/permalink/`
- These are typically in the post header, near the poster name
- The `aria-label` on the timestamp link often contains a more detailed time string

```
a[href*="/posts/"], a[href*="/permalink/"]
```

### 7. Login Detection (Session Validation)

To check if cookies are valid (logged in):

- **Logged in:** Look for `[aria-label="Facebook"]` in the nav, or `[data-at-shortcutkeys]` on the body container
- **Not logged in:** Login form present — `input[name="email"]` or `div[data-testid="royal_login_form"]`

## Selector Config File Structure

Store in `packages/scraper/src/selectors.ts`:

```ts
export const SELECTORS = {
  feed: '[role="feed"]',
  seeMore: 'div[role="button"]',
  seeMoreText: ["See more", "Xem thêm"],
  postLink: 'a[href*="/posts/"], a[href*="/permalink/"]',
  loginForm: 'input[name="email"]',
  loggedInIndicator: '[aria-label="Facebook"]',
};
```

## Notes from Snapshot Analysis

- The page uses dark mode (`__fb-dark-mode` class on `<html>`)
- Posts have a virtualized rendering (`data-virtualized="true"`, `aria-posinset`)
- Comments have `role="article"` with `aria-label="Comment by {name} {time} ago"` — useful to distinguish comments from posts
- The feed has a `suspended-feed` div (`style="display: none;"`) that appears during loading
- Keyboard shortcuts are defined via `data-at-shortcutkeys` attribute on a container div
