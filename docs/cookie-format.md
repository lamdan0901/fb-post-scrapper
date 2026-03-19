# Cookie Format Reference

## Source

Extension: **"Get cookies.txt LOCALLY"** (Chrome Web Store)

## Format: Netscape HTTP Cookie File (NOT JSON)

The extension exports cookies in the standard Netscape/cURL cookie format (`.txt`), not JSON.
This is a **change from the original plan** which assumed JSON. The `CookieManager` must parse this format.

## File Structure

```
# Netscape HTTP Cookie File
# https://curl.haxx.se/rfc/cookie_spec.html
# This is a generated file! Do not edit.

<domain>	<include_subdomains>	<path>	<secure>	<expiry>	<name>	<value>
```

Each line is **tab-separated** with 7 fields:

| #   | Field              | Example           | Notes                            |
| --- | ------------------ | ----------------- | -------------------------------- |
| 1   | Domain             | `.facebook.com`   | Leading dot = include subdomains |
| 2   | Include subdomains | `TRUE`            | Always TRUE for `.facebook.com`  |
| 3   | Path               | `/`               | Cookie path scope                |
| 4   | Secure             | `TRUE`            | HTTPS only flag                  |
| 5   | Expiry             | `1804319317`      | Unix timestamp (0 = session)     |
| 6   | Name               | `c_user`          | Cookie name                      |
| 7   | Value              | `100009192508323` | Cookie value                     |

## Required Cookies for Authentication

The `CookieManager` must validate that these cookies exist:

| Cookie Name | Purpose                     |
| ----------- | --------------------------- |
| `c_user`    | Facebook user ID            |
| `xs`        | Session token (URL-encoded) |

Optional but helpful: `datr`, `sb`, `fr`

## Parsing Rules

1. Skip lines starting with `#` (comments)
2. Skip empty lines
3. Split each line by `\t` (tab character)
4. Convert to Playwright cookie format:

```ts
// Input (Netscape line):
// .facebook.com	TRUE	/	TRUE	1805448235	c_user	100009192508323

// Output (Playwright format):
{
  name: "c_user",
  value: "100009192508323",
  domain: ".facebook.com",
  path: "/",
  expires: 1805448235,
  httpOnly: false,
  secure: true,  // from field 4
  sameSite: "None"
}
```

## Implementation Note

The plan says "Accept JSON cookie file" in the cookie upload endpoint.
Update: Accept **both** `.txt` (Netscape format) and `.json` formats.
The primary format will be Netscape `.txt` from the browser extension.
