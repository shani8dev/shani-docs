# Security Policy

## Trust Model

`shani-docs` is the authored Markdown documentation site for Shanios
(`docs.shani.dev`). It is a static SPA that reads `docs/` at runtime and
renders them as HTML. The trust model is simple:

- **No authentication, no user data.** The site serves public documentation only.
- **Client-side rendering.** All content is rendered in the browser from
  Markdown source; there is no server-side processing of user input.
- **CDN dependencies.** External scripts/styles are loaded from CDNs with
  SRI `integrity=` hashes where configured.

## Key Security Mechanisms

| Mechanism | Implementation |
|-----------|----------------|
| Content rendering | Markdown parsed and rendered client-side (`script-docs.js`) |
| CDN integrity | SRI `integrity=` hashes on external CDN tags |
| Navigation parsing | `nav-docs.js` parsed via `JSON.parse` (not `new Function()`) |

## Known Limitations

- **`new Function()` parsing.** `script-docs.js:2073` uses `new Function()` to parse `nav-docs.js` as code. A tampered nav file would execute as RCE in the user's browser. Use `JSON.parse` instead.
- **No server-side input validation.** All content is trusted at render time. A compromised build/generation step that injects malicious Markdown would execute in every visitor's browser.

## Reporting a Vulnerability

If you discover a security vulnerability in any Shanios project, please report it
responsibly by opening a private security advisory on GitHub.

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 72 hours and provide a detailed response
within 7 days. Thank you for helping keep Shanios secure.
