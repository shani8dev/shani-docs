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

## Rule: open it and actually check, don't just read the diff

1. Serve the repo locally (`python3 -m http.server 8000` from the repo
   root) and load the page in a browser — check the **console for
   errors**.
2. If you touch any CDN `<script>`/`<link>` tag, confirm every
   `integrity=` (SRI) hash actually matches the pinned file version
   (`openssl dgst -sha384 -binary <file> | openssl base64 -A` against the
   real URL) — a wrong hash silently blocks script execution with no
   visible error unless you check the console.
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

- **Content structure**: 201 docs total. `Self-Hosting & Servers` (44
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
  compromised-nav-file risk). All 23 CDN resources now have verified SRI
  hashes. CSP added to `index.html`, all 201 doc stubs, and `404.html`
  (`default-src 'self'` + explicit CDN/API allowances) — verified live in
  a real browser, zero console errors, full functional render.
- **Root `index.html` OG/Twitter tags — FIXED.** Were shipping
  `content=""`, populated only by client JS; now have real static values,
  matching how every doc stub already worked.
- **404.html bot-detection regex — FIXED.** The GitHub-Pages SPA-redirect
  trick's UA-sniffing regex missed `anthropic-ai` and `chatgpt-user` (both
  explicitly welcomed in `robots.txt`) — since `robots.txt` also disallows
  the redirect's `?p=` target, this trapped exactly the crawlers the site
  says it wants indexed. Both now recognized.
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
  mention one. 11 of 15 repos in this ecosystem have one; the other 4
  (including this one) don't: `shani-docs`, `shani-install-media`,
  `shani-website`, `shani-wiki` — one of a real cluster, not a unique
  outlier. Needs the maintainer to pick a license, not something to guess.
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

Brand CSS, `sw.js`, `generate-manifest.js`, and nav JS are **copy-pasted**
across this repo and its three siblings (`shani-blog`, `shani-website`,
`shani-wiki`) — there is no shared package. A bug fix in one of these
shared-shaped files almost certainly exists in the other three copies
too. Check all four repos before considering the fix complete.

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
| **Networking** | 41 | Apache, apcupsd, arpwatch, avahi, bind, bluetooth, Caddy, Cloudflared, dnscrypt-proxy, dnsmasq, exim, fail2ban, firewalld, GPSd, how-container-networking-works, IP addressing, iptables/nftables, KDE Connect, Kerberos, modemmanager, NBD, network-debugging, network-tools, NetworkManager VPN, NFS, openresolv, OpenSSH, PowerDNS, remote desktop, rsyncd, Samba, slapd, snmpd, SSHFS, Tailscale, TCP/IP fundamentals, troubleshooting, virtual networking, WireGuard, wireguard-road-warrior, wireless — native/system services, `pacman -S` + `systemctl enable`, confirmed per-file |
| **Self-Hosted Networking** | 31 | AdGuard Home, Blocky, ddns-updater, Firezone, frp, FRRouting, Gluetun, HAProxy, Headscale, hysteria-2, kea-dhcp, LibreNMS, nebula, NetBird, NetBox, nginx-proxy-manager, ntopng, OpenVPN, Outline VPN, pangolin, phpIPAM, Pi-hole, pritunl, SearXNG, Squid, Technitium, Traefik, Unbound, wireguard-easy, Xray/V2Ray, ZeroTier — split out of Networking (was one mixed 72-doc section): all `docker-compose`/`podman-compose`-first per their own doc content, confirmed per-file not by tool-name assumption |
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
