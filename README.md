# shani-docs

Authored Markdown documentation for Shanios — the immutable Linux OS with atomic updates.

## Architecture

`docs/` holds the authored Markdown source; `doc/` holds generated static HTML stubs (written by `generate-manifest.js` and committed by CI) that exist only so GitHub Pages/crawlers get a real page — the live site is an SPA that reads `docs/` at runtime.

**Live site:** [docs.shani.dev](https://docs.shani.dev)

## Relationship to Other Projects

| Project | Domain | Purpose |
|---------|--------|---------|
| [shani-website](https://github.com/shani8dev/shani-website) | [shani.dev](https://shani.dev) | Marketing landing page and download portal |
| [shani-wiki](https://github.com/shani8dev/shani-wiki) | [wiki.shani.dev](https://wiki.shani.dev) | Technical documentation wiki |
| **shani-docs** | [docs.shani.dev](https://docs.shani.dev) | Authored Markdown documentation with generated HTML (this project) |
| [shani-blog](https://github.com/shani8dev/shani-blog) | [blog.shani.dev](https://blog.shani.dev) | Engineering posts and release notes |

## Authoring Docs

Add a Markdown file anywhere under `docs/<section>/` with frontmatter:

```markdown
---
title: My Page Title
section: Networking        # must match an existing nav section
updated: 2026-08-28
---
```

Then regenerate:

```bash
node generate-manifest.js           # rebuilds manifest, sitemap, stubs, nav-docs.js
node generate-manifest.js --strict  # also fails on any nav/content drift
```

The generator preserves hand-curated titles/icons in `nav-docs.js`; new files are appended to their section automatically. A drift check reports ORPHAN files (on disk but not in nav) and PHANTOM nav entries (in nav but no file).

## Local Preview

```bash
node generate-manifest.js && python3 -m http.server 8080
# open http://localhost:8080
```

No build tooling beyond Node.js is required. `--watch` mode re-runs the generator on every `.md` save.

## Conventions

- Every page ends with a `## See Also` section linking related docs and blog posts
- Internal links are relative (`../networking/wireguard`); external cross-site links use full URLs (`https://shani.dev/post/...`)
- Code blocks always declare a language tag
- Factual claims about packages/flags should match ground truth in [shani-install-media](https://github.com/shani8dev/shani-install-media) (package lists, script `--help` output)

## Audit-verified notes (2026-08-28)

- **Security — FIXED.** `new Function()` parsing of `nav-docs.js` in the
  browser (`script-docs.js`) was replaced with `JSON.parse`. The generator
  (`generate-manifest.js`) still uses `new Function` on its own trusted local
  file, documented and split from the browser-side consumer. All CDN resources
  have verified SRI hashes — **with one deliberate exception**: `#prism-theme`
  carries no `integrity=` (its `href` swaps between two CDN theme files at
  runtime and SRI can't cover both — re-adding one silently breaks light-mode
  code-block styling).
- **CI status.** 1 CI workflow (`build-manifest.yml`).
- **Cross-repo.** Brand CSS, `sw.js`, and `generate-manifest.js` are copy-pasted between this repo and `shani-blog` ONLY — there is no shared package (audit-verified 2026-09-17: `shani-website` and `shani-wiki` carry no such shared chrome). A bug fix in one of these shared-shaped files almost certainly exists in the other copy too. Nav JS (`nav-docs.js`) is unique to this repo.