# Agent instructions — shani-docs

This file applies to any AI coding assistant working in this repository
(Claude Code, opencode, Kilo Code, Cursor, Aider, or similar). Read this
before editing, and follow the verification steps before calling any change
done.

## What this repo is

A no-build-step static site (`docs.shani.dev`) serving authored Markdown
documentation, with an in-browser editor page that holds a live GitHub
write token (`script-docs.js`). Treat the editor page as authenticated
surface, not static content.

## Empirical verification (mandatory)

**Reading code is analysis; running code is verification.** A change is not
verified by reading the diff, running `bash -n`, or confirming it "looks
correct." It is verified by observing the actual behavior of the real
thing in the real environment — built, served, deployed, signed, running.
If you haven't seen it work (or fail) for real, it isn't verified.

## Rule: open it and actually check, don't just read the diff

1. Serve the repo locally (`python3 -m http.server 8000` from the repo
   root) and load the page in a browser — check the **console for
   errors**.
2. If you touch any CDN `<script>`/`<link>` tag, confirm every
   `integrity=` (SRI) hash actually matches the pinned file version
   (`openssl dgst -sha384 -binary <file> | openssl base64 -A` against the
   real URL) — a wrong hash silently blocks script execution with no
   visible error unless you check the console. **Exception: `#prism-theme`
   intentionally has NO `integrity=`** (its `href` swaps between two CDN
   theme files at runtime and SRI can't cover both — see "Prism light-mode
   rendering" in the known-issues section). Do not "fix" SRI back onto it,
   or light mode's code blocks will silently lose their styling again.
3. If you touch `script-docs.js`'s token handling (`getToken`/`setToken`),
   confirm the token only ever round-trips through `sessionStorage` —
   don't leave or reintroduce a `localStorage` fallback, even a
   currently-unreachable one; it signals persistence beyond the session
   and widens the window if the page is ever compromised.
4. If you touch anything that parses content the nav/config supplies
   (e.g. `nav-docs.js`), use `JSON.parse` or an equivalent safe parser —
   never `new Function(...)` or `eval` on content that isn't fully
   trusted, even if it currently only comes from this repo's own files;
   a build/generation step that later pulls that content from anywhere
   less trusted turns a `new Function` parse into remote code execution
   in the admin's browser.

## Audit-verified known issues (confirmed present)

**For the full narrative, verification methodology, and before/after
evidence behind every line below, see `AUDIT-HISTORY.md`.** This section
is deliberately just the current-state summary — what's true right now,
not how it got that way.

- **`generate-manifest.js` date parsing was timezone-dependent — FIXED
  (2026-09-18), and it was LIVE here (unlike `shani-blog`'s matching
  bug).** Same root cause as `shani-blog/AGENTS.md`'s matching entry
  (shared-shape file): `new Date(doc.updated + 'T00:00:00')` has no
  timezone designator, so it's parsed as local time, not UTC. This
  repo's committed doc stubs had actually been generated on a non-UTC
  (IST) machine, so all 202 docs' `datePublished`/`dateModified` JSON-LD
  were off by 5.5 hours from true UTC — e.g. a doc with `updated:
  2026-08-28` shipped `"datePublished":"2026-08-27T18:30:00.000Z"`
  (reads as Aug 27 in UTC, a full calendar day off) instead of the
  correct `2026-08-28T00:00:00.000Z`. This was live, served-to-crawlers
  structured data on docs.shani.dev, not just a local dev artifact.
  Fixed `buildStub()`'s one call site to append `Z`; regenerated all 202
  stubs. Verified: 405 JSON-LD blocks across the corpus parse via a real
  `python3 json.loads()` sweep (0 errors), every `datePublished`/
  `dateModified` now UTC-suffixed and correct; the generator's own
  internal "no drift" nav-consistency check still passes.
- **Content structure**: 201 docs total. `Self-Hosting & Servers` (75
  files) went through a multi-pass reorganization — six original
  mega-pages (kubernetes/monitoring/devops/devtools/productivity/security)
  were split by actual function, mislabeled splits were re-fixed, content
  losses from the original split were restored from git history, and a
  final pass merged back over-fragmented splits (devtools flattened,
  monitoring/platforms + devops/containers + security/vaultwarden merged
  into siblings). Zero broken internal links and zero content loss,
  verified repo-wide as of the last pass.
- **Duplicate `<h1>` — FIXED, 0 of 201 pages remaining** (was 40).
  `stripDuplicateLeadingH1()` in `generate-manifest.js` now unconditionally
  strips a genuinely-leading body H1 (handles a leading blockquote note
  first, preserving it) rather than only stripping on an exact title
  match — the template's own `<h1 class="doc-title">` makes any leading
  body H1 redundant regardless of wording.
- **SEO/meta-content bugs — FIXED, verified against the regenerated
  201-doc corpus.** `autoExcerpt()` no longer glues the H1 title onto the
  first paragraph (was 198/201 pages), no longer deletes inline-code or
  link *content* when stripping markup (was silently scrubbing real
  keywords/paths), and no longer produces 12 pages sharing one
  boilerplate description. Result: 201/201 pages now have distinct,
  accurate meta descriptions. Meta `keywords` is still empty on all 201
  pages — the frontmatter→tag plumbing works, but no file has ever set a
  `keywords:` field; that's a content-authoring gap, not a code bug
  (Google has ignored meta keywords for ranking since ~2009 — low
  priority if it's ever addressed).
- **Structured data — added, verified valid (0 JSON parse errors across
  403 blocks).** `BreadcrumbList` on all 201 pages (2-level: Home → page,
  not 3-level, since section groupings have no landing page to link to).
  `FAQPage` on `docs/faq.md` only (48 mechanically-extracted, hand-verified
  Q&A pairs). Homepage sitelinks searchbox (`WebSite`/`SearchAction`) is
  real and functional — `?q=` on the root URL actually triggers the
  existing client-side search, not decorative schema.
- **Security — FIXED.** `new Function()` parsing of `nav-docs.js` (fetched
  live from GitHub) replaced with `JSON.parse` (was a stored-XSS-via-
  compromised-nav-file risk). All CDN resources now have verified SRI
  hashes — **with one deliberate exception**: `#prism-theme` carries no
  `integrity=`. That single `<link>` is swapped between two different CDN
  theme files (`prism-tomorrow.min.css` dark vs `prism.min.css` light) at
  runtime, and SRI is validated against the parse-time attribute value, so
  it can never validly cover both — a static hash silently blocks whichever
  theme's stylesheet doesn't match (unstyled code blocks in light mode, a
  bug just root-caused and fixed). This matches the sibling
  `shani-blog`'s `#prism-theme`, which was already correct. All other CDN
  `<script>`/`<link>` resources keep their byte-verified SRI hashes. CSP
  added to `index.html`, all 201 doc stubs, and `404.html`
  (`default-src 'self'` + explicit CDN/API allowances).
- **Prism light-mode rendering — FIXED.** Prior to this the `#prism-theme`
  `<link>` pinned `integrity="sha384-wFjoQjtV1y5jVHbt0p35Ui8aV8GVpEZkyF99OXWqP/eNJDU93D3Ugxkoyh6Y2I4A"`
  (the dark theme's hash) in static HTML, while `initTheme()` swapped only
  `href` to the light stylesheet. Because SRI is bound at parse time, the
  browser kept validating the swapped light URL against the dark hash and
  rejected it — code blocks rendered unstyled (single monochrome text color)
  in light mode, with a `Failed to find a valid digest...` console error.
  Fixed by removing the `integrity` from the `#prism-theme` link in
  `index.html` and all 201 generated stubs, and simplifying `initTheme()` in
  `script-docs.js` to swap only `href` (plus `crossorigin="anonymous"`), the
  same scheme the blog already used. `generate-manifest.js`'s `buildStub()`
  inherits the head from root `index.html`, so regeneration keeps the fixed
  pattern. Verified live in a browser: both themes now render distinct
  multi-color Prism token highlighting and **zero console errors**.
- **Root `index.html` OG/Twitter tags — FIXED.** Were shipping
  `content=""`, populated only by client JS; now have real static values,
  matching how every doc stub already worked.
- **404.html bot-detection regex — FIXED.** The GitHub-Pages SPA-redirect
  trick's UA-sniffing regex missed `anthropic-ai` and `chatgpt-user` (both
  explicitly welcomed in `robots.txt`) — since `robots.txt` also disallows
  the redirect's `?p=` target, this trapped exactly the crawlers the site
  says it wants indexed. Both now recognized.
- **Live-content hydration broken when a page is opened at its literal
  `index.html` URL — FIXED.** `getSlugFromHash()` derived the slug straight
  from `location.pathname`, so a page loaded at its actual file path
  (`/doc/<slug>/index.html`, which is exactly what `python3 -m http.server`
  local preview produces) yielded a slug of `<slug>/index.html`. `loadDoc()`
  then fetched `docs/<slug>/index.html.md` → 404 (plus a
  raw.githubusercontent fallback that also 404s), and silently fell back to
  the prerendered stub with a console error on **every** doc page (201/201
  under local preview). Production was unaffected because GitHub Pages
  serves `/doc/<slug>/` (trailing slash, no `index.html`). Root cause and
  fix are shared with the blog — see the matching entry in
  `shani-blog/AGENTS.md` (their `Router.getSlug()` had the identical defect,
  and the blog giscus comment thread term inherited it too). Fixed by
  normalizing the slug in `getSlugFromHash()` to strip both trailing
  slashes and a trailing `/index.html`, so `/doc/<slug>/` and
  `/doc/<slug>/index.html` resolve identically. Verified live: full
  203-page corpus sweep (201 docs + home + 404) reports **0 pages with
  issues** after the fix (was 201). `cleanSlug()` is the shared normalizer;
  do not revert the `index.html` strip when "simplifying" the function.
- **AI docs — refreshed.** `ai-llms.md`, `ai-development.md`, and
  `gpu-containers.md` used 2024-era example models (`llama3.2`,
  `phi4-mini`, `mistral`, `Meta-Llama-3`) inconsistent with the
  established current-model cheat sheet elsewhere in the same docs;
  updated to the current set (`qwen3:8b`, `deepseek-r1`, `Qwen3-32B`).
  Added `llm-checker`/Hugging Face mentions and cross-links between the
  AI pages and the AI blog post.
- **23 cross-repo blog links used the wrong domain — FIXED.**
  `https://shani.dev/post/...` (404s — that domain has no `/post/` route)
  corrected to `https://blog.shani.dev/post/...` across 20 files.
- **No LICENSE file (Low, needs a maintainer decision).** No
  `LICENSE`/`COPYING` file anywhere in the repo, and `README.md` doesn't
  mention one. The ecosystem cluster currently lacking one (audit-verified
  2026-09-17): `shani-chronoa`, `shani-docs`, `shani-wiki`, `shani-website`.
  (`shani-install-media` gained a GPL-3.0 LICENSE on 2026-09-16 and
  `shani-settings` on 2026-09-17 — both closed; see master roadmap #31.)
  Needs the maintainer to pick a license, not something to guess.
- **CI status.** 1 workflow (`build-manifest.yml`), triggered on pushes
  touching `docs/**.md`/`config-docs.js`. Re-runs `node generate-manifest.js`
  and auto-commits the regenerated `manifest.json`/stubs back to the
  branch; a doc edit that makes the generator throw fails the workflow
  before that commit, so a red run here means "run
  `node generate-manifest.js` locally and read the actual error." Does
  not validate content, only that the generator completes.

## If you have Superpowers / oh-my-opencode / ultrawork / similar available

If your environment provides Claude Code's **Superpowers** plugin, OpenCode's
**oh-my-opencode**, an **ultrawork**-style parallel execution mode, or an
equivalent skill/subagent framework — use it to check the SRI-hash and
token-storage items above concurrently, and to actually drive a real or
headless browser rather than reasoning about DOM/JS behavior from source
alone.

## Cross-repo impact — check before calling a fix complete

Brand CSS (`brand-shani.css`), `sw.js`, and `generate-manifest.js` are **copy-pasted**
between this repo and `shani-blog` only — there is no shared package.
`shani-website` and `shani-wiki` carry no such shared chrome (audit-verified
2026-09-17), and nav JS (`nav-docs.js`) is unique to this repo. A bug fix in one
of these shared-shaped files almost certainly exists in the other copy too.
Check both repos before considering the fix complete.

## Where things are documented

`README.md` explains the site's architecture and its relationship to
`shani-wiki` (a separate, longer-lived documentation site) — don't
conflate the two when deciding where a change belongs. `AUDIT-HISTORY.md`
has the full narrative behind every entry in "Audit-verified known issues"
above.

## Content map (all 201 docs)

### Sections and page counts

| Section | Pages | Covers |
|---|---|---|
| **Introduction** | 8 | What is Shanios, comparison, getting started, migrating, optimizations, switching from Windows, user config, what's included |
| **Installation** | 4 | Requirements, pre-install, steps, first boot |
| **Concepts** | 4 | Atomic updates, blue-green, immutability, persistence |
| **Architecture** | 6 | Boot, Btrfs, build pipeline, dracut, filesystem, overlay |
| **Security** | 14 | AppArmor, audit, features, fwupd, gen-efi, gocryptfs, hardware auth, keyring, LUKS, lynis, permissions, rkhunter, secure boot, TPM2 |
| **Networking** | 11 | Apache, avahi, bind, bluetooth, dnsmasq, exim, firewalld, iptables/nftables, OpenSSH, Samba,wireless — native/system services, `pacman -S` + `systemctl enable`, confirmed per-file. (31 self-hosted network apps such as AdGuard Home, Tailscale, Pi-hole, Traefik, etc. were moved to the `Self-Hosting & Servers` section.) |
| **Self-Hosting & Servers** | 75 | 44 original server application docs (Kubernetes, databases, monitoring, mail, media, etc.) + 31 containerized network apps (AdGuard Home, Tailscale, Pi-hole, Traefik, etc.) folded in from the former Networking section, all confirmed per-file |
| **System** | 16 | Accessibility, audio, backup, cheatsheet, cronie, GPU, hardware, kernel modules, logging, permissions, power, printing, process management, storage, systemd, users & groups |
| **Self-Hosting & Servers** | 44 | AI/LLMs, backups-sync, BI (now incl. Matomo), clusters, communication, databases (MongoDB, PostgreSQL, Redis, other), devops (CI/CD, other — containers merged into other), devtools (single top-level file: version control + CI/CD/registries, flattened from a 2-file subdirectory), education (now incl. Open edX, Gitea Classroom), finance, game servers, home automation (now incl. WLED), IoT (now incl. SCADA), Kubernetes (gitops, networking, observability, operations, overview, security, storage, troubleshooting, workloads — 9 sub-pages), mail, management, media, medical, monitoring (Grafana, logs, Prometheus, uptime — now incl. all-in-one platforms), OpenStack, productivity (file-sync, knowledge-base, notes-bookmarks, project-management, publishing-design, utilities — 6 sub-pages), security (Authelia — now incl. Vaultwarden + general security Key Concepts, pki-secrets-siem, policies — 3 files, down from 4) |
| **Software** | 19 | AI dev, AppImage, Apptainer, bottles, containers, development, distrobox, flatpak, gaming, GPU containers, homebrew, LXC/LXD, Nix, shani-pkgbuilds, shani-repo, snaps, systemd-nspawn, VMs, Waydroid |
| **Enterprise** | 4 | Cloud images, compliance, fleet monitoring, OEM & fleet deployment |
| **Updates** | 7 | Channels, config, shani-health, shani-reset, shell, system, user-setup |
| **FAQ** | 1 | General FAQ |
| **Troubleshooting** | 1 | Troubleshooting guide |

### Content gaps identified (need adding)

- **shani-platform API reference** — no dedicated doc with full endpoint reference (fleet-monitoring.md documents the fleet endpoints, but a complete API reference covering all auth/billing/SSO routes is still missing)

### Frontmatter conventions

Every page uses YAML frontmatter:
```markdown
---
title: Page Title
section: Section Name
updated: 2026-08-28
---
```

The `section` field must match an existing nav section. New files are auto-appended to their section by `generate-manifest.js`.

### Quality conventions

- Every page ends with a `## See Also` section linking related docs and blog posts
- Internal links are relative (`../networking/wireguard`); external cross-site links use full URLs
- Code blocks always declare a language tag
- Factual claims about packages/flags should match ground truth in `shani-install-media` (package lists, script `--help` output)

## Garuda Cross-Reference Findings (added 2026-09-17)

Based on a full scan of the garuda clones mapped against shani — **29 repos** (not 34; several user-listed names don't exist — see `../garuda-catalog.md` §Discrepancies). See `../garuda-mapping-analysis.md`, `../deep-analysis.md`, `../shani-catalog.md`, and `../garuda-catalog.md` for full details. garuda-ng (Angular component library) is the most directly comparable repo in terms of the shared-web-code problem this repo faces.

### 🟡 HIGH: CI/CD gap (shared across ALL repos)

1. **Shared CI templates** (estimated 2-3 days, affects ALL repos).
   - Garuda's `gitlab-ci-commons` provides reusable templates (commitizen, flake-check, pre-commit, tag-to-release). Each repo `include:`s from it.
   - Shani repos run on GitHub Actions (no `.gitlab-ci.yml` anywhere) — 8 repos (blog, builder, docs, fleet, insights, install-media, pkgbuilds, platform) carry hand-written `.github/workflows/*.yml` with duplicated patterns.
   - **Action**: Create `shani-ci-commons` (GitHub Actions reusable workflows / composite actions) with templates for lint, test, build, security scan. Each repo references them via `uses: shani8dev/shani-ci-commons/...` instead of copy-pasting.
   - **Affects**: All 15 shani repos.

### 🟡 HIGH: Dependency management gap

2. **Add automated dependency updates** (estimated 4 hours, affects ALL repos).
   - Garuda uses `renovate-runner` running hourly against all repos with `renovate.json` files.
   - Shani repos have no automated dependency updating.
   - **Action**: Set up Renovate (self-hosted or gitlab.com) with a fleet-wide config. Each repo adds a minimal `renovate.json`.

### 🟢 MEDIUM: Code quality

3. **Conventional commit enforcement** (estimated 2 hours, affects ALL repos).
   - Every garuda repo has a `[commitizen]` badge; `cz commit` is enforced.
   - Shani repos have no commit message standardization.

### 🟢 MEDIUM: Shared web components

4. **Shared web component library** (estimated 2-3 days, affects shani-website/docs/blog).
   - Garuda's `garuda-ng` is an Angular library shared across all web projects (published via pnpm).
   - Shani web repos share CSS/JS by copy-paste between `shani-docs` and `shani-blog` ONLY (per the correction below — `shani-website`/`shani-wiki` have no shared web files). Structural debt — divergence accumulates silently.
   - **Action**: Create a lightweight shared component library (even just a CSS token file + a few React/Vue components). Or standardize on a CSS framework.
   - **Note**: `shani-website` and `shani-wiki` have NO `sw.js`, brand CSS, or nav/content-fetch JS — the shared-shaped files (brand-shani.css, sw.js, generate-manifest.js) exist only in `shani-docs` and `shani-blog` (nav JS `nav-docs.js` is docs-only). Do not expect to share those with all 4 repos.

### 🔍 Re-Scan Findings (2026-09-17)

Re-scanned against `garuda-catalog.md` (29 repos, not 34) and `shani-catalog.md` (16 repos). **Confirmed mapping: `garuda-ng`** (EXISTS in `garuda-clones/` — Angular component library, TypeScript/Angular 22/Nx/pnpm, npm `@garudalinux/core`, themed variants, AnalogJS/Vite docs site, GitHub Actions, `renovate.json`, Git-Cliff, GPL-3.0-or-later). It is the most directly comparable reference for the shared-web-code problem. shani-docs is a **multi-page technical docs site with a `generate-manifest.js` build step** (201 docs across 13 sections).

**New gaps from the garuda side:**
1. **No content/browser test coverage** — `garuda-ng` has Vitest + Playwright e2e; shani-docs' only CI (`build-manifest.yml`) validates that the generator completes, not content correctness or browser behavior (confirmed in `shani-catalog.md` §13).
2. **No dependency-update automation** — `garuda-ng` has `renovate.json`; shani-docs has none (and no `renovate.json` anywhere in the 16 shani repos per `shani-catalog.md` global patterns).
3. **No changelog/contribution docs** — `garuda-ng` has Git-Cliff changelog, CONTRIBUTING.md, CODE_OF_CONDUCT.md; shani-docs has no LICENSE (4-repo cluster), no CONTRIBUTING, no changelog.
4. **Shared files still copy-pasted** — `brand-shani.css`, `sw.js`, `generate-manifest.js` are copy-pasted between `shani-docs` and `shani-blog` ONLY (nav JS `nav-docs.js` is docs-only; per `shani-catalog.md` §13 and the AGENTS.md correction); `garuda-ng` solves this with a real published npm package (`@garudalinux/core`).
5. **No deploy pipeline** — `garuda-ng` has GitHub Actions CD to Cloudflare Pages; shani-docs' CSP/robots.txt/sitemap.xml are generated and **deployed** (commit `217a599`, 2026-08-29 — verified live this session: `docs.shani.dev/robots.txt` returns real content, `sitemap.xml` returns the per-page listing, and `curl https://docs.shani.dev/` returns the CSP meta tag). Prior "not deployed" finding is closed.

**Shani advantages:**
1. **No-build-step static site** — no Angular 22/Nx/pnpm toolchain to maintain; `generate-manifest.js` is the only Node dependency.
2. **SRI on all CDN resources** (except the deliberate `#prism-theme` runtime-swap exception) + CSP meta tag + `JSON.parse` nav (fixed from `new Function()`) — hardening `garuda-ng`'s docs site doesn't document.
3. **Content depth** — 201 docs with distinct auto-generated meta descriptions and BreadcrumbList/FAQPage structured data; `garuda-ng`'s docs site is a component showcase, not authored documentation.

**Qt GUI gap note:** not applicable — static docs site; garuda's Qt GUI apps are unrelated.

### 📋 Implementation Roadmap (2026-09-17)

Implementation priorities are per `../IMPLEMENTATION-ROADMAP.md` (master roadmap for the whole shani ecosystem).

1. ~~**Deploy `robots.txt` + `sitemap.xml` (P0, 5 min).**~~ **DONE — closed 2026-09-17.** Both are generated by `generate-manifest.js`, committed in `217a599` (2026-08-29) and pushed. Verified live: `https://docs.shani.dev/robots.txt` serves real content and `/sitemap.xml` the per-page listing (not GitHub Pages' 404).

2. ~~**Deploy CSP meta tags (P1).**~~ **DONE — closed 2026-09-17.** CSP is generated into `index.html`, all 201 doc stubs, and `404.html`, committed in `217a599` (2026-08-29) and pushed. Verified live: `curl https://docs.shani.dev/` returns the CSP meta tag in served HTML.

3. **Add LICENSE (P3, 5 min).** Master-roadmap item #31, not #26 (web-shared-components is #27; #26 is shani-gui welcome content). Match `shani-blog` — the only web sibling that has a LICENSE, and it is **MIT** (audit-verified 2026-09-17), not GPL-3.0 — unless the maintainer decides web repos should follow the OS-side GPL-3.0 standard instead; this repo is one of the 4-repo cluster missing it.

4. **Shared component library for `brand-shani.css`/`sw.js`/`generate-manifest.js` (P3, 2-3 days).** Master-roadmap item #27 (nav JS `nav-docs.js` is unique to this repo, not part of the shared set). These files are copy-pasted between `shani-docs` and `shani-blog` only, and divergence accumulates silently. ADOPT the shared-library PATTERN from garuda-ng — never the Angular code; shani's plain-HTML/CSS approach is the right call for this ecosystem, it just needs a shared package (or git submodule) instead of copy-paste.

5. **CI content validation (P1).** `build-manifest.yml` only checks that the generator completes, not content validity. Add HTML validation of generated stubs, a broken-internal-link check, and a duplicate-title check to the existing workflow (or via `shani-ci-commons` templates, item #7).

6. **Conventional commits + `renovate.json` (P1).** Ecosystem-wide commit convention (item #9) and Renovate (item #8) — `generate-manifest.js` is the only Node dependency, so Renovate scope is small but real.
