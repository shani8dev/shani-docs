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

- **`new Function()` parsing (High).** `script-docs.js:2073` uses `new Function()` to parse `nav-docs.js` — a tampered nav file would execute as RCE in the user's browser. Use `JSON.parse` instead.
- **CI status.** 1 CI workflow (`build-manifest.yml`).
- **Cross-repo.** Brand CSS, `sw.js`, `generate-manifest.js`, and nav JS are copy-pasted across this repo and its three siblings (`shani-blog`, `shani-website`, `shani-wiki`) — there is no shared package. A bug fix in one almost certainly exists in the other three copies too.