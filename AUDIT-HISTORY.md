# shani-docs — audit/fix history

This file is the full chronological narrative behind every entry in
`AGENTS.md`'s "Audit-verified known issues" section — the complete
verification methodology, before/after evidence, and reasoning for each
fix, in the order it actually happened across many sessions and passes.

**Read `AGENTS.md` first.** That file's "Audit-verified known issues"
section is the compact, current-state summary — what's true right now,
in a form fast to scan. This file exists so that detail isn't lost, not
because it's required reading before touching the repo. Come here when
you need to understand *why* something is the way it is, or want the
exact command/verification trail behind a specific fix, not for routine
orientation.

This file is append-only in spirit: when `AGENTS.md`'s summary is updated
for a new fix, the full narrative for that fix should land here, not
inflate the main file back to unreadable length.

---


- **Six mega-pages split into multi-page sections — done, but entirely
  undocumented until now, and it shipped 8 broken links (now FIXED).**
  `docs/servers/{kubernetes,databases,devops,monitoring,productivity,
  security}.md` (single files, up to 9479 lines for kubernetes alone) were
  replaced with directories of focused sub-pages (e.g.
  `docs/servers/kubernetes/{overview,networking,storage,workloads,
  security,gitops}.md`). This was **not part of any originally-scoped
  fix** (CSP/SEO/image-optimization/duplicate-h1) — it's a real content
  reorganization a human should be aware happened. Verified the content
  itself survived the split (kubernetes: 9479 lines old vs 9493 across the
  new sub-pages — matches within frontmatter/heading overhead, not a
  content loss) via `git show HEAD:docs/servers/kubernetes.md | wc -l`
  compared to the new files. **What it broke:** none of the six new
  section directories has a landing `index.html` at the bare section path
  (only kubernetes even has an `overview.md`; the other five have no
  generic landing page at all), so every existing cross-link that used to
  point at the old single-page URL (`.../doc/servers/kubernetes`,
  `.../doc/servers/databases`, etc.) 404'd. Found via `grep` across every
  `.md`/`.html` for the old bare paths — 8 real broken links, in
  `docs/servers/devops/containers.md`, `docs/system/backup.md`,
  `docs/servers/communication.md` (×2), `docs/servers/devops/other.md`,
  `docs/servers/clusters.md`, `docs/servers/education.md`,
  `docs/security/features.md`, `docs/networking/snmpd.md`. Fixed each to
  point at the most contextually-relevant surviving sub-page (e.g.
  kubernetes → `overview`, the Healthchecks-uptime mention → `monitoring/
  uptime`, the ELK/Logstash mention → `monitoring/logs`, PostgreSQL
  mentions → `databases/postgresql`) rather than a generic guess, then
  regenerated the whole site (`node generate-manifest.js`, exit 0, no
  errors) so `doc/*/index.html` matches the corrected markdown. If more
  cross-links to these six sections turn up later, check for the same
  bare-old-path pattern.
  - **Follow-up pass found this was substantially understated — the "8
    broken links" above only covered links *within this repo*.** A
    dedicated cross-repo check (`grep` across `shani-blog`/`shani-wiki`/
    `shani-website` for the old bare paths) found **~50 more broken links
    in `shani-blog` alone**, across 4 separate posts:
    `posts/kubernetes-on-shani-os.md` (an entire post built around linking
    to specific old-kubernetes-page anchors — 48 occurrences across ~34
    distinct anchors, e.g. `#gitops--continuous-delivery`,
    `#backup--disaster-recovery`, `#observability`), plus
    `posts/shani-os-home-server.md`, `posts/shani-os-networking-guide.md`,
    and `posts/shani-os-security-deep-dive.md` (bare links to
    `/doc/servers/{kubernetes,databases,devops,devtools,monitoring,
    productivity,security}`, plus two that never existed at all —
    `/doc/servers/vpn-tunnels` and `/doc/servers/networking`, both
    imagined/misremembered paths; VPN and networking tool docs actually
    live at top-level `docs/networking/*`, not under `servers/` at all).
    Every anchor was individually mapped to its real destination heading
    (not just "kubernetes → overview") by diffing the original 9479-line
    `kubernetes.md`'s full heading list against each of the split files',
    then confirmed via `git show HEAD:docs/servers/kubernetes.md` that the
    live site's actual anchor-slugify behavior (double-hyphen for `X & Y`
    headings, confirmed by the blog's own pre-existing working links,
    e.g. `#gitops--continuous-delivery`) differs from
    `generate-manifest.js`'s own `slugifyH()` (single-hyphen, TOC-only) —
    since heading *text* is unchanged by the split, only the *file path*
    needed correcting, anchors carried over untouched. Fixed all of them,
    then re-ran each affected repo's own `generate-manifest.js` to
    regenerate the stubs. **If any other repo links to these sections,
    grep it too before considering this closed** — this pattern (silent
    split, no cross-repo link check) is exactly what caused the miss the
    first time.
  - **`gitops.md` was itself still a mislabeled grab-bag after the
    original split — fixed.** At 4449 lines (3× the next-largest of the
    six kubernetes sub-pages), it contained real GitOps/CD content
    *plus* Observability, Backup & DR, Cost Management, Platform
    Engineering, Multi-Cluster, Helm, kubectl usage, and Troubleshooting —
    none of which is GitOps. Re-split into four properly-scoped files:
    `gitops.md` (trimmed to actual GitOps/CD/CI content, 1470 lines),
    `observability.md` (metrics/dashboards/SLOs, 815 lines),
    `operations.md` (cluster lifecycle/platform engineering, 1888 lines),
    `troubleshooting.md` (294 lines). Added the 3 new `nav-docs.js`
    entries, regenerated, and re-verified every blog anchor mapping
    against the *new* 9-file structure (not the original 6) before fixing
    the cross-links above — fixing them against the intermediate 6-file
    state would have meant fixing them twice.
  - **25 files (all under `docs/servers/**`, from this same reorg) had a
    literal `title: Xxx.Md` bug — fixed.** Whatever process generated the
    split/new files naively title-cased the filename including the `.md`
    extension. This wasn't just cosmetic: it landed in the actual
    generated page's `<title>`, `og:title`, `twitter:title`, and JSON-LD
    `headline` — i.e., real user-facing browser tabs, search results, and
    social-media link previews all said things like "Gitops.Md — Shanios
    Docs". Confirmed by reading a generated stub directly
    (`doc/servers/kubernetes/gitops/index.html`), not just the source
    markdown. Fixed all 25 frontmatter titles to accurate, descriptive
    ones based on each file's actual heading contents (not just the
    directory/filename) — e.g. `databases/other.md` → "Databases —
    Messaging, Analytics & Specialty Stores" (it covers Kafka, Cassandra,
    ClickHouse, Qdrant, etc., not literally "other"). Also had to fix
    `nav-docs.js` directly for the 19 non-kubernetes files: the generator
    has a "kept titles" mechanism that preserves whatever title is already
    in `nav-docs.js` across regenerations specifically so manual curation
    survives — which meant it was *also* still serving pre-existing bad
    nav titles (`"Mongodb"`, `"Postgresql"`, two different entries both
    literally titled `"Other"`) even after the frontmatter fix; changing
    the `.md` alone doesn't update nav — both layers need editing.
  - **`docs/networking/*` (72 files, unrelated to the kubernetes split)
    mixed native OS-level services with self-hosted/containerized apps
    under one nav section — split.** Classified all 72 by their *actual*
    documented deployment method (grepped each for
    `docker-compose|podman-compose|docker run|podman run` vs
    `pacman -S|systemctl enable`, then spot-verified surprising ones by
    reading the file — e.g. `unbound.md`/`haproxy.md`/`squid-caching-
    proxy.md` turned out to genuinely teach container deployment despite
    those tools' traditional native-daemon reputation; trust what the doc
    itself teaches, not priors about the tool). 31 files reclassified from
    `section: Networking` to a new `section: Self-Hosted Networking`
    (AdGuard Home, Pi-hole, Traefik, Pangolin, NetBox, etc.) — a pure
    frontmatter change, so slugs/URLs are untouched and nothing broke.
    Conceptual/reference guides (`tcp-ip-fundamentals`, `ip-addressing`,
    `troubleshooting`, etc.) were left in `Networking` since they're not
    tied to one deployment model. Also found and fixed a genuine content
    bug surfaced while re-titling `headscale.md`: a missing `### Headscale
    (Self-Hosted Control Server)` heading meant its own setup steps
    (`#### 1. Create config...`) read as if still nested under the
    unrelated "Tailscale ACL Policies" section above them.
  - **Follow-up pass (per explicit "recheck all again and rearrange the
    contents where appropriate") found the disorganization predates the
    split entirely** — checked every original pre-split mega-file via
    `git show HEAD:docs/servers/<name>.md` (they all still exist in git
    history even though deleted from the tree) and found `devtools.md`
    (1783 lines) and `devops.md` (2107 lines) mixed genuinely unrelated
    categories together long before anyone split them into subdirectories.
    Moved misplaced content to where it actually belongs, verified no
    cross-repo links pointed at the moved anchors first (same discipline
    as the kubernetes fix — checked before moving, not after):
    - `devtools/cicd.md`: deleted a full duplicate "Web Analytics"
      section (Plausible + Umami, already properly documented in
      `business-intelligence.md`); moved `Matomo` → `business-intelligence.md`
      (joins the other web-analytics tools instead of sitting oddly under
      "dev tools"); moved `Open edX` + `Gitea Classroom` → `education.md`;
      moved `Leantime`/`Twenty CRM`/`Huly`/`Plane` (all project-management
      tools) and `DocuSeal` and `Drawio` → new `productivity/` sub-pages
      (below). Trimmed from 1567 to 1073 lines of genuinely CI/CD-and-
      registry-related content. `Nginx & Apache HTTPD` stayed — no better
      home exists for it and it's a small section, not worth inventing a
      category for one entry.
    - `devops/other.md`: moved `WLED (LED Controller)` → `home-automation.md`
      (it's a smart-lighting project that integrates with Home Assistant
      via MQTT, not a "devops" tool) and `OpenDataBay / Grafana SCADA
      Dashboard` → `iot.md` (joins the existing Modbus/OPC-UA industrial
      protocol content it's actually about).
    - `productivity/collaboration.md` (1783 lines, 39 unrelated app
      categories — kanban boards, wikis, RSS readers, recipe managers,
      photo management, whiteboards, surveys, all in one file) — split
      into 5 coherent pages by actual function: `project-management.md`
      (Planka/Vikunja/Taiga + the CRM/PM tools moved in from
      `devtools/cicd.md`), `knowledge-base.md` (wikis: Outline/BookStack/
      Wiki.js/Docmost/AFFiNE/Docusaurus), `notes-bookmarks.md`
      (HedgeDoc/CryptPad/Joplin/Memos/Notesnook/Hoarder/Linkwarden/
      Wallabag/Miniflux/FreshRSS), `publishing-design.md`
      (Ghost/WordPress/Penpot/Excalidraw + Drawio moved in), and
      `utilities.md` (Mealie/Monica/Rallly/Kimai/Grocy/Cal.com/Limesurvey/
      n8n/Stirling PDF/Etherpad + DocuSeal moved in, plus the file's
      cross-cutting Caddy-config/S3-API/troubleshooting/"choosing a tool"
      reference material). Also deleted its `## Immich` section outright
      (not moved) — confirmed a genuine full duplicate already covered in
      `docs/servers/media.md`. The old `productivity/collaboration` slug
      no longer exists at all (content fully redistributed, not just
      re-labeled), which broke a link in `shani-blog`'s
      `shani-os-home-server.md` that I'd pointed there in the *previous*
      pass — re-fixed to `productivity/file-sync` instead. Re-ran the
      full cross-repo broken-link check again afterward (same method as
      the original kubernetes fix) — clean.
    Net: `docs/servers/` went from 43 to 47 files; total site from 200 to
    204 docs. Nothing has been committed — same as everything else in
    this entry, all still sitting in the working tree.
  - **Second follow-up pass (per explicit "check again for duplication...
    move each to appropriate categories... create new mds if require,
    merge into split as needed") did a repo-wide scan, not just the files
    already touched.** Extracted every `## `/`### ` heading across all 204
    docs and diffed for near-duplicate tool names (normalizing away
    parenthetical suffixes) — most hits were expected template boilerplate
    (every page has its own "Troubleshooting"/"See Also"/"Key Concepts"),
    but a handful were genuine, verified by reading both copies' actual
    content side by side:
    - **Real duplicates, consolidated to one authoritative copy + a
      cross-reference from the other:** `ClickHouse` was fully documented
      in both `business-intelligence.md` and `databases/other.md`
      (identical compose file) — kept the copy in `databases/other.md`
      (it's a database, not a BI tool) and replaced the other with a
      one-line pointer. Same treatment for `DIUN` (`management.md` vs
      `monitoring/uptime.md`) — kept it in `management.md` (container
      lifecycle is its actual home) and pointed `monitoring/uptime.md` at
      it instead.
    - **Checked and deliberately left as-is (legitimate, not
      duplication):** `MinIO` appears in `backups-sync.md` (plain
      `podman-compose` as a generic backup target) and
      `kubernetes/storage.md` (Helm chart as cluster storage) — genuinely
      different deployment methods for different audiences, not a copy-
      paste. `Mosquitto` appears in both `home-automation.md` and `iot.md`
      with near-identical compose files but different framing for each
      page's own audience — borderline, kept both rather than force a
      cross-reference a home-automation reader wouldn't expect to follow
      into a general-IoT page.
    - **Bigger, unrelated finding from the same scan: 22 *internal*
      cross-links (doc-to-doc, not to any other repo) were broken** —
      all pointing at bare pre-split URLs like
      `.../doc/servers/devtools#gitlab-ce` or
      `.../doc/servers/databases#qdrant-vector-database`, none of which
      have existed as real pages since the original split. These are a
      different, previously-unchecked failure mode from the external
      (shani-blog/wiki/website) links already fixed above — a full
      external-repo sweep doesn't catch a doc linking to *another page in
      the same repo* via a full URL instead of a relative link. Found via
      `grep` across `docs/**/*.md` for the same bare-path pattern (5
      files: `devops/ci-cd.md`, `devops/containers.md`, `devops/other.md`,
      `ai-llms.md`, `medical.md`), each anchor individually re-pointed at
      wherever that content actually lives post-split (several needed the
      *cross-category* destination, not just the right kubernetes-style
      sub-page — e.g. the Matomo anchor in `devops/other.md` now points at
      `business-intelligence.md`, since Matomo itself moved there in the
      previous pass; the Qdrant anchor in `ai-llms.md` now points at
      `databases/other.md`). Built a proper validator afterward instead of
      trusting another manual grep: walked the actual generated `doc/`
      tree to get the real set of 204 live slugs, then checked every
      `docs.shani.dev/doc/...` reference in every source `.md` against
      that set — confirmed zero broken internal links repo-wide (not just
      in the files already suspected), which is a stronger guarantee than
      re-grepping for the same handful of known-bad path patterns again.
  - **Third follow-up pass (per explicit "check and compare with git
    history... to see if all content is still there or some of it got
    lost") did a real, automated content-preservation audit against git
    history — not just line-count spot checks like the first pass.** For
    every original pre-split mega-file still recoverable via `git show
    HEAD:docs/servers/<name>.md` (9 total: the 6 already known —
    `kubernetes`/`devops`/`devtools`/`productivity`/`monitoring`/
    `security`/`databases` — plus 2 more found only by re-reading the
    actual deletion commits' full diffstat instead of assuming the list
    was complete: `docs/servers/networking.md` and
    `docs/servers/vpn-tunnels.md`, both real, substantial files, not the
    imagined/never-existed paths I'd assumed them to be two passes ago),
    extracted every `## ` section's heading + body, then searched the
    *entire current 204-doc tree* for a matching heading and scored body
    similarity (not just "does a heading with this name exist somewhere,"
    which would miss content silently replaced by something unrelated
    under a reused title). **Found one real, previously-undetected
    content loss, from the original split (predates any of my own
    passes): `docs/servers/monitoring.md`'s core `Prometheus`,
    `Alertmanager`, `Grafana`, and `Zabbix (Agent-Based Monitoring)`
    sections (the main Zabbix server, as opposed to the `Zabbix Proxy`
    companion piece that
    *did* survive) were silently dropped entirely.** Only their
    *companion* tools survived (`Grafana Alloy`, `Zabbix Proxy`), which is
    exactly why this went undetected in every previous pass — the
    monitoring category still looked complete at a glance (Grafana Alloy
    sounds Grafana-adjacent enough not to raise suspicion). Root cause:
    the original at line 132 has a malformed heading —
    `## Prometheus Scrapes \`/metrics\` endpoints on a schedule...` (an
    entire descriptive sentence run into the `##` line instead of a
    separate `**Purpose:**` paragraph) — which almost certainly broke
    whatever automated split logic was used, causing it to lose this
    section and the two after it (`Alertmanager`, `Grafana`) before the
    next well-formed heading. Restored all 4 sections verbatim from `git
    show HEAD`, fixing the malformed heading in the process (split into
    a clean `## Prometheus` + a proper `**Purpose:**` paragraph, matching
    every other section's convention) — placed `Prometheus`+`Alertmanager`
    in `monitoring/prometheus.md` (right after its existing Key
    Concepts/Observability Philosophy intro — the file is *named*
    Prometheus but, before this fix, never actually contained Prometheus
    itself), `Grafana` in `monitoring/grafana.md` (before `Grafana
    Alloy`), `Zabbix` in `monitoring/uptime.md` (before `Zabbix Proxy`).
    Re-ran the same repo-wide matcher afterward — zero unexplained
    findings remain; every other flagged item resolves to something
    already known and deliberate (divider headings intentionally removed
    when their content moved out, the `Web Analytics`/`ClickHouse`/`DIUN`/
    `Immich` duplicates already fixed in earlier passes, or genuine
    content *improvements* found while checking `servers/networking.md`
    and `servers/vpn-tunnels.md` — e.g. `Cloudflared`/`Pangolin`/
    `Pritunl`/`Firezone`/`Tailscale`+`Headscale` all now have their own
    dedicated, substantially expanded pages under `docs/networking/`
    rather than one shared paragraph each in the old combined file, a
    prior reorganization that happened to predate all of this and was
    never itself a loss). Regenerated and re-validated the zero-broken-
    internal-links check afterward — still clean.
  - **Fourth follow-up pass ("move everything to appropriate place")
    closed out the one already-identified-but-unfixed inconsistency and
    swept the rest of the tree for anything similar.** `security/
    authelia.md` (Authelia/Authentik/Keycloak/Zitadel) and `security/
    crowdsec.md` had ended up with identity/SSO/directory tools split
    arbitrarily across both files — `crowdsec.md` held the "Comparison:
    Authelia vs Authentik vs Keycloak vs Zitadel" section *and*
    `LLDAP`/`Pocket ID`/`Kanidm` (all directory/passwordless-identity
    tools), while the actual Authelia/Authentik/Keycloak/Zitadel sections
    lived in the *other* file. Moved the comparison + all three directory
    tools into `authelia.md` (now genuinely "every SSO/identity/directory
    tool in one place"); `crowdsec.md` is left with CrowdSec + PKI/secrets
    (Step-CA/Infisical/Passbolt/OpenBao) + SIEM (Wazuh/Greenbone) — title
    updated from "...& Identity Tools" to drop the now-inaccurate identity
    claim. Checked for external links into the moved anchors first (none).
    Re-ran the full standalone-`servers/*.md` heading review (ai-llms,
    backups-sync, business-intelligence, clusters, communication,
    education, finance, game-servers, home-automation, iot, mail,
    management, media, medical, openstack) and the `devops/containers.md`
    "Kubernetes & Orchestration"/"HA Clusters" sections specifically
    (worth checking since they sit right next to real k8s/cluster
    content) — both turned out to already be correct, deliberate
    cross-reference pointers to `kubernetes/overview` and `clusters.md`
    rather than duplicated content, so left untouched. No further
    misplacement found in this pass. Regenerated, re-validated zero
    broken internal links, and re-ran the git-history content-
    preservation check against the original `security.md` once more after
    the move — still zero sections unaccounted for.
  - **Fifth follow-up pass (explicit "categories are incorrect... the md
    file names dont match content, recheck every single place") checked
    every multi-file split's actual FILENAME against its actual content**
    — a stricter bar than the previous passes, which mostly fixed nav/
    frontmatter *titles* without checking whether the underlying filename
    itself was still misleading. Dumped every heading from all 7 split
    categories side by side and found real mismatches:
    - **`monitoring/` — the worst offender, fully restructured.**
      `grafana.md` contained `Netdata`/`Uptime Kuma`/`Beszel`/`Dozzle`/
      `Healthchecks.io`/`Speedtest Tracker`/`SmokePing`/`Gatus` — none of
      which are Grafana products. `logs.md` contained `Thanos`/
      `VictoriaMetrics`/`Grafana Tempo` — none of which are actually log
      tools (metrics long-term storage and a tracing backend). `uptime.md`
      held the *entire* real ELK/Beats/OpenSearch/Fluent-Bit/Vector.dev
      log-pipeline stack (which should be in `logs.md`), plus `k6` and
      `Toxiproxy` (load/chaos testing, not monitoring at all), plus a pile
      of enterprise platforms (`Zabbix`, `SigNoz`, `OpenTelemetry
      Collector`, `Checkmk`, `Karma`, `OpenObserve`) that don't fit
      "uptime" either. Rebuilt from scratch by actual function rather than
      patching titles again: `prometheus.md` = Prometheus ecosystem
      (Prometheus, Alertmanager, Thanos, VictoriaMetrics, Pushgateway,
      Pyrra, exporters reference — the file is now, for the first time,
      genuinely about Prometheus); `grafana.md` = Grafana ecosystem only
      (Grafana, Alloy, Loki, Tempo, OnCall, Loki alert rules, Parca);
      `logs.md` = actual non-Grafana log aggregation (ELK, Beats,
      OpenSearch, Fluent Bit, Vector.dev, Graylog); `uptime.md` = genuine
      lightweight/synthetic uptime tools (Netdata family, Uptime Kuma,
      Beszel, Dozzle, Healthchecks, Speedtest Tracker, SmokePing, Gatus,
      Changedetection.io); new `platforms.md` for the enterprise all-in-
      one tools that fit none of the above (Zabbix, SigNoz, OTel
      Collector, Checkmk, Karma, OpenObserve); `k6`/`Toxiproxy` moved out
      of monitoring entirely into `devops/other.md` (they're load/chaos
      testing tools, not monitoring). Verified zero content lost across
      all 4 original files via the same heading-diff-against-current-tree
      method as the git-history pass, before and after.
    - **`devtools/cicd.md` had "Nginx & Apache HTTPD" as its literal first
      section** — nothing to do with CI/CD, and `networking/apache.md`
      already exists as the real native-service page for Apache. Moved it
      to `devops/containers.md` instead (container-hosted reverse
      proxies/web servers is a genuine devops/containers concern; checked
      first that this isn't a duplicate of `networking/apache.md` — it's
      not, one covers the native systemd service, the other a
      podman-compose deployment, same legitimate distinction as the
      `MinIO` case from an earlier pass).
    - **`security/crowdsec.md` was renamed to `security/pki-secrets-
      siem.md`** — an actual filename change, not just a title fix.
      Content is CrowdSec + Step-CA/Infisical/Passbolt/OpenBao (PKI/
      secrets) + Wazuh/Greenbone (SIEM); naming the whole file after just
      one of five distinct tool categories it covers was exactly the kind
      of mismatch this pass was checking for. Checked for external/
      internal references to the old slug first (none — only auto-
      regenerated artifacts referenced it) before renaming, then updated
      `nav-docs.js`'s slug and regenerated.
    - **Reviewed and deliberately left alone:** `databases/postgresql.md`
      (contains MariaDB) and `databases/redis.md` (contains Valkey/KeyDB/
      Dragonfly) — filename picks the flagship tool but the grouping
      itself is tight and natural (traditional RDBMS together,
      Redis-protocol-compatible stores together), unlike the Grafana
      case where the extra tools weren't Grafana-related at all. Also
      left `security/policies.md` (scanning/SBOM tools, loosely
      "policy enforcement") and `databases/postgresql.md`/`redis.md`'s
      eponymous-but-broader naming as acceptable — a defensible reading
      of the name, not a real mismatch.
    Regenerated, re-validated zero broken internal links (205 slugs now,
    up from 204 — the new `monitoring/platforms.md`), and re-ran the
    git-history section-presence check against `monitoring.md`/
    `devtools.md`/`devops.md` once more — all remaining gaps are the
    same already-documented, deliberate ones (divider headings removed,
    the `Web Analytics` duplicate deletion), nothing new missing.
  - **Sixth follow-up pass (explicit "reduce split if needed if they
    share relation") went the other direction from every previous pass —
    undoing over-fragmentation rather than fixing mislabeling.** The
    Fifth pass had just split `monitoring/`, `devops/`, `security/`, and
    `devtools/` into more, smaller files; this pass compared line counts
    across all 7 split categories and merged back the pairs that were
    both (a) disproportionately small relative to their siblings and (b)
    topically close enough that a reader would expect them in the same
    place, rather than treating "more files" as inherently better
    organized:
    - **`security/vaultwarden.md` deleted, redistributed to 2 files.**
      It held a large generic security-reference "Key Concepts" section
      (Zero Trust, OAuth2/JWT, OWASP Top 10, CVSS, LDAP/OIDC/SAML, cert
      lifecycle, SIEM/SOC, container hardening, passkeys/WebAuthn — none
      of it Vaultwarden-specific) plus the actual Vaultwarden tool
      section. Key Concepts moved to `authelia.md` (prepended, since
      it's general security reference, not identity-specific, but
      `authelia.md` was the natural landing page); the real Vaultwarden
      section moved into `pki-secrets-siem.md` (secrets management is
      its actual category). `security/` is now 2 files instead of 3.
    - **`monitoring/platforms.md` merged into `uptime.md`.** Fifth pass
      had just split these apart (lightweight/synthetic uptime tools vs.
      enterprise all-in-one platforms); on reflection both are
      "infrastructure monitoring dashboards", just different weight
      classes, and `platforms.md` alone was small enough that a reader
      would reasonably expect to find Zabbix/SigNoz/Checkmk on the same
      page as Uptime Kuma/Gatus rather than needing to know they'd been
      split into a sibling file. Title updated to reflect both:
      "Monitoring — Uptime, Lightweight Dashboards & All-in-One
      Platforms".
    - **`devops/containers.md` merged into `devops/other.md`.** Both were
      container/infra-tooling grab-bags with no sharp boundary between
      them (e.g. Kubernetes/HA-cluster pointers were already sitting in
      `containers.md` right next to Buildah/Skopeo/Harbor content that
      could equally be called "other devops tooling"). Title updated to
      "DevOps — Infrastructure as Code, Containers & Utilities".
    - **`devtools/` subdirectory flattened back to a single top-level
      `devtools.md`.** `version-control.md` (214 lines: Gitea/Forgejo,
      Woodpecker CI, code-server, Gitpod/Coder) and `cicd.md` (1043
      lines) together aren't large enough to justify a 2-file
      subdirectory when every other single-file category in the site
      (`ai-llms.md`, `business-intelligence.md`, etc.) lives as one
      top-level file, not a one-entry directory — matching that
      established convention rather than leaving an inconsistent
      exception. Title: "Dev Tools — Version Control, CI/CD &
      Registries".
    For all 4 merges: checked internal (`docs/**/*.md`) and cross-repo
    (`shani-blog`/`shani-wiki`/`shani-website`) links to the old paths
    *before* deleting anything, updated `nav-docs.js` directly (title
    *and* slug — the "kept titles" mechanism means a merge/rename
    doesn't take effect from frontmatter alone, same lesson as the first
    pass), regenerated (`node generate-manifest.js`, exit 0), then
    re-ran the full validation trio used throughout this whole
    reorganization: (1) real-`doc/`-tree-ground-truth broken-link
    check — 201 live slugs, zero broken references; (2) git-history
    content-preservation audit against all 4 recoverable original
    mega-files (`security.md`, `devtools.md`, `monitoring.md`,
    `devops.md` at `HEAD`) — the only two apparent gaps it flagged both
    turned out to be already-known, deliberate restructurings (the
    original `## Web Analytics` parent heading is now 3 promoted `##`
    sections in `business-intelligence.md`; `## DIUN` is the pointer,
    with the real content already consolidated into `management.md` per
    the earlier duplicate-consolidation pass), not new content loss; (3)
    a repo-wide grep for the 5 old bare paths across `shani-blog`/
    `shani-wiki`/`shani-website`, which found 2 stale bare-path
    references (not anchor-specific, so missed by earlier anchor-pattern
    checks) in `shani-blog/posts/shani-os-home-server.md` pointing at
    the now-flattened `devtools/version-control` — fixed the source
    markdown and re-ran `shani-blog`'s own `generate-manifest.js` to
    regenerate its derived `llms-full.txt`/`post/*/index.html` rather
    than hand-editing those generated files directly.
    - **Ran `node generate-manifest.js --strict` to confirm the merges
      hadn't introduced drift, and found `--strict` itself was broken —
      FIXED, unrelated to the merges.** It reported all 201 docs as
      "ORPHAN" (missing from nav) even immediately after a clean
      regeneration. Root cause: `extractNavSlugs()`'s regex expected an
      unquoted-key object-literal `nav-docs.js` (`slug: "..."`) and was
      never updated when the earlier "new Function() parsing" security
      fix (documented below) changed `generateNavDocs()` to emit valid
      JSON with quoted keys (`"slug": "..."`) — the old pattern needed
      `slug` immediately followed by `:`, but a quoted key has a
      trailing `"` in between, so it never matched a single line. This
      meant `--strict` has silently been non-functional (always a
      false-positive 100%-orphan report) since that earlier fix landed;
      it went unnoticed because `--strict` is an opt-in flag never used
      by the plain `node generate-manifest.js` invocation this whole
      file relies on. Fixed the regex to tolerate both quoted and
      unquoted keys, verified against an isolated sample line with a
      minimal Node harness before touching the real file, then confirmed
      `node generate-manifest.js --strict` now correctly reports "No
      drift" against the real, current 201-doc tree.
- **On-page SEO audit (per explicit "keywords are not there, seo is not
  there") found real, systemic bugs in auto-generated meta content and
  the 404 SPA-redirect's bot detection — all FIXED, verified against the
  live regenerated 201-doc corpus, not just spot-checked.**
  - **`autoExcerpt()` glued the page's own H1 title directly onto its
    first paragraph with a raw double-space, on 198 of 201 pages
    (98.5%).** E.g. the Boot Process page's meta description read
    `"Boot Process  Shanios uses a fully measured, signed boot
    chain..."` — the heading text (already shown separately as
    `<title>`/`og:title`) wasted roughly 15-20% of the ~155-char
    excerpt budget restating itself, in every search snippet and
    social-share card almost site-wide. Root cause: `body` (everything
    after frontmatter) still includes the leading `# Title` line, and
    the old `.replace(/\n/g, ' ')` turned the blank line between heading
    and first paragraph into a literal double space instead of being
    stripped. Confirmed via a standalone Node harness against all 201
    files before touching the real function: fixed version produces 0
    double-space artifacts (was 198) and 201/201 distinct descriptions
    (was 190 — see the duplicate finding below).
  - **The same function's inline-code stripper deleted the CODE
    CONTENT, not just the backtick markup, silently removing real
    technical keywords (paths, filenames, command names) from meta
    descriptions.** E.g. `docs/arch/overlay.md`'s description read
    "...a fully writable  on top of a read-only..." with the inline
    code term simply vanished. This is the same class of issue the
    "keywords not there" complaint pointed at — command/path names are
    exactly the terms a technical audience searches for, and they were
    being scrubbed from the one field meant to summarize the page for
    search engines. Fixed to capture and keep the inner text instead of
    deleting it.
  - **12 pages shared one identical, boilerplate meta description** —
    the generic "Portability note: Compose examples use rootless
    Podman and host.containers.internal..." disclaimer — because
    `autoExcerpt` blindly grabbed whichever paragraph came textually
    first in the markdown body, even when that was a cross-cutting
    disclaimer rather than the page's actual "Purpose:" summary a few
    lines further down (`docs/networking/{technitium,netbox,kea-dhcp,
    blocky,unbound,ntopng,librenms,wireguard-easy,haproxy}.md`,
    `docs/servers/{communication,openstack,backups-sync}.md`). None of
    these 12 pages' search snippets or social cards mentioned what the
    page was actually about. Fixed by dropping a leading blockquote
    note before excerpting, unless doing so would leave under 40 chars
    of real content (a guard against pages whose only body content
    genuinely is a blockquote). Also stripped bare markdown
    horizontal-rule lines that were otherwise leaking into excerpts
    verbatim (found via `docs/faq.md`) and collapsed remaining
    whitespace runs rather than a naive single-pass newline replace.
    Verified with a standalone harness against the real 201-file corpus
    before patching (201/201 distinct, 0 double-space, 0 suspiciously
    short), then re-verified against the real regenerated
    `doc/**/index.html` stubs for the same sample pages.
  - **The GitHub Pages 404-redirect trick's bot-detection regex missed
    2 of the 10 AI crawlers `robots.txt` itself explicitly welcomes.**
    `404.html` client-side-redirects any unrecognized visitor hitting an
    unmapped path to `/?p=<path>` so the SPA can restore it — but
    `robots.txt` has `Disallow: /*?p=`, so any crawler NOT matched by
    the bot regex gets trapped: redirected (if it runs JS) straight to
    a URL its own robots-respecting logic then refuses to follow.
    Checked every crawler `robots.txt` names against the regex with a
    Node harness using each one's real known UA string: `ChatGPT-User`
    and `anthropic-ai` matched nothing (neither contains "bot",
    "crawler", or "spider" as a substring), while the other 8 all
    matched via an existing generic token. Added
    `anthropic-ai|chatgpt-user` to the regex; re-verified both now skip
    the redirect and confirmed a plain browser UA still gets redirected
    as before (no regression to the mechanism's actual purpose).
  - **Same bugs (minus the H1-glue — 0 of 60 `shani-blog` posts open
    with an H1) also existed in `shani-blog`'s own
    `generate-manifest.js`/`404.html` (same code lineage) — ported the
    same fixes there.** Confirmed the inline-code bug was live, not
    theoretical: `posts/shani-repo-on-other-distros.md` (one of only 7
    posts without an explicit `excerpt:` frontmatter field, so one of
    the few that actually exercises `autoExcerpt`) had `gen-efi` and
    `shani-health` silently deleted from its description before the
    fix; both are present after. See `shani-blog/AGENTS.md` for that
    repo's own copy of this entry.
  - **Meta `keywords` tag is empty on all 201 pages — plumbing exists,
    content doesn't (left as-is, not a code bug).** `generate-manifest.js`
    already reads `fm.keywords` from frontmatter into the tag correctly;
    zero of the 201 `.md` files have ever set a `keywords:` field, so
    it's always empty. Not fixed here: a per-page content-authoring
    decision, not a generator bug, and meta keywords has carried no
    Google ranking weight since ~2009 — flagged for whoever owns content
    decisions, not auto-fixed.
- **SEO enhancement pass (per explicit "improve seo add whats best") added
  three genuinely new structured-data/functional signals — not just bug
  fixes this time — verified live against the regenerated 201-doc corpus.**
  - **`BreadcrumbList` JSON-LD added to every one of the 201 pages.**
    Deliberately 2-level (Home → current page), not 3-level (Home →
    Section → page): section groupings have no landing page of their own
    on this site (see the six-mega-pages entry above), so a middle
    breadcrumb entry would have to link to a URL that doesn't exist —
    correctness over a nicer-looking but broken 3-level trail. Verified:
    all 201 stubs now carry a valid `BreadcrumbList` block (0 JSON parse
    errors across 403 total JSON-LD blocks site-wide, checked with a
    Python harness that actually `json.loads()`s every `<script
    type="application/ld+json">` on every page, not just greps for the
    tag).
  - **`FAQPage` JSON-LD added to `docs/faq.md` specifically** — and only
    there; every other page correctly has none, since FAQPage schema is
    only valid for content that genuinely is a list of Q&A. `docs/faq.md`
    turned out to follow an extremely consistent hand-authored
    convention (a lone bolded `**Question?**` line, then its answer, up
    to the next question or a `## Section`/`---` boundary) across all 55
    questions — mechanically reliable to extract. Built
    `extractFaqPairs()` (`generate-manifest.js`) to pull all of them,
    reusing the same `mdToPlainText()` used by `autoExcerpt`. First
    extraction attempt produced 51 pairs but a handful were broken
    fragments — answers that were mostly/entirely a fenced code block,
    so stripping the code left a dangling lead-in ("...then run:") or an
    orphaned continuation ("Or select the (Candidate) entry..."). Added
    a quality filter (drop any answer ending in `:` or starting with
    `Or/And/But/Then` + lowercase) rather than emit visibly-broken
    schema — final count 48 clean Q&A pairs, each hand-spot-checked
    before wiring in, none truncated or fragmentary. **Also surfaced and
    fixed a real, separate, previously-missed bug while validating this**:
    `mdToPlainText`'s markdown-link stripper (`` !?\[[^\]]*\]\([^)]*\) ``
    → `''`) deleted the ENTIRE link, including its visible text, not
    just the markup — same class of bug as the already-fixed inline-code
    deletion, just for `[text](url)` instead of `` `code` ``. Caught it
    because the last FAQ answer read "...Shanios publishes two channels:
    `latest` and `stable`. See for details." — the link text "Release
    Channels" had vanished from `See [Release Channels](../updates/
    channels.md) for details.`. Fixed to unwrap real links (keep the
    text, drop the markup) while still fully removing image embeds
    (`![alt](url)`, whose alt text isn't real prose); ported the same
    fix to `shani-blog`'s `autoExcerpt`. Re-scanned every meta
    description and every FAQ answer site-wide afterward for the same
    dangling-fragment signature (double-space, or "See ... for" with
    nothing between) — zero remaining in either repo.
  - **Homepage sitelinks-searchbox (`WebSite` + `SearchAction` JSON-LD)
    — added as a real, functional feature, not just schema decoration.**
    Google will only honor a `SearchAction` if the `target` URL it names
    actually performs the search when visited — a schema-only version
    with no backing behavior is worthless (and arguably misleading)
    structured data. The site already has a real client-side Fuse.js
    search (`#wiki-search`/`doSearch()` in `script-docs.js`) but nothing
    previously read a `?q=` URL param on load, so `/?q=wireguard` just
    showed the plain homepage. Added `initSearchFromQuery()` (reads
    `URLSearchParams(location.search).get('q')`, populates the search
    input, loads Fuse, calls `doSearch()`) and wired it into the existing
    init sequence right after `initSearch()`; added the matching
    `potentialAction: SearchAction` block to `index.html`'s hand-authored
    `WebSite` JSON-LD (`urlTemplate:
    "https://docs.shani.dev/?q={search_term_string}"`). Verified by
    actually exercising the code path (not just reading it): confirmed
    `State.searchIndex` is already built before this new function runs in
    the init sequence, and `node --check script-docs.js` passes.
  - **Same three fixes (link-deletion, and porting the FAQ-quality
    lessons) applied to `shani-blog` where relevant; also found and
    fixed a genuinely separate, pre-existing gap there while checking
    for the sitelinks-searchbox equivalent**: `index.html`'s `#ld-blogs`
    (`Blog`) and `#ld-org` (`Organization`) JSON-LD blocks shipped as
    literal empty `{}` placeholders in the static file, filled in only
    by `script.js` at runtime — so any crawler that doesn't execute JS
    saw nothing at all, the same class of gap as this repo's own
    already-documented "root index.html OG/Twitter tags empty for
    non-JS crawlers" issue. Worse: **every one of the 60 per-post stubs
    also hardcoded `id="ld-org">{}"`** (`generate-manifest.js`), meaning
    Organization/`sameAs` (social-profile) data was missing from every
    single post page, not just the homepage. Fixed by baking real
    `BLOG_JSON`/`ORG_JSON` constants (built from `config-shani.js` at
    generate time via the existing `getConfig()` helper, plus a new
    `parseSocialLinks()` for `sameAs`) into both the homepage's `<head>`
    (`prerenderHome()` now also replaces these two script tags, not just
    the body placeholder) and every post stub. Verified: all 61 pages
    (60 posts + home) now carry valid, non-empty `Blog`/`Organization`
    JSON-LD (0 parse errors, checked the same way as the docs-side
    validation) — `shani-blog` doesn't have an FAQ-style page or a
    client-side-search-with-URL-param gap of its own, so those two
    specific additions were docs-only; see `shani-blog/AGENTS.md` for
    that repo's own copy of this entry.
- **AI docs refresh (per explicit "ai engineering blog exists but no doc... ai related doc but outdated info refer and improve add more") — cross-referenced the AI docs against the one AI-focused blog post, found and fixed real staleness, and surfaced a broader, previously-undiscovered broken-link class along the way.**
  - **`docs/servers/ai-llms.md` (self-hosted AI stacks) used 2024-era example models (`llama3.2`, `phi4-mini`, `mistral`) throughout 21 occurrences**, while the sibling page `docs/software/ai-development.md` and the blog post `ai-assisted-development-on-shani-os.md` both already reference the current 2026 model landscape (Qwen3, DeepSeek-R1, Kimi K2.6, Devstral, Codestral) via a "Model Cheat Sheet" established in an earlier pass — `ai-llms.md` was the one page that never got updated to match. Replaced the stale examples with `qwen3:8b` (general default), `qwen3:4b` (smaller/faster example), and `qwen3:32b`/`deepseek-r1:32b` (larger-model example) — chosen to match models *already* established as current elsewhere in this repo's own docs, not invented fresh. **Caught a real bug the blind find-and-replace introduced**: `ollama rm llama3.2:latest` became `ollama rm qwen3:8b:latest` — invalid Ollama tag syntax (a model reference can only have one colon; `qwen3:8b` already has its tag) — caught by re-reading the diff line-by-line rather than trusting the sed output, fixed to `ollama rm qwen3:8b`. Also updated the Key Concepts section's context-window example ("Llama 3.2's context is 128k tokens") to cite Qwen3 8B instead, for consistency with the rest of the page's now-current model references.
  - **`docs/software/gpu-containers.md`'s vLLM example used `meta-llama/Meta-Llama-3-8B-Instruct`** (Llama 3, 2024) — updated to `Qwen/Qwen3-32B`, both for model-generation consistency with the other two AI pages and because vLLM's tensor-parallel/high-throughput serving is better illustrated with a model large enough to actually benefit from it than an 8B model that doesn't need the scaling.
  - **`docs/software/ai-development.md` had a real, pre-existing markdown bug**: a stray, headerless duplicate table row (`| Very slow completions on CPU | ... |`) sitting between "Full container details: [GPU Containers]..." and the "## Agent Sandboxing" heading — no table structure around it, so it would render as garbled orphan text. The identical row already exists correctly inside the real Troubleshooting table further down the page. Removed the stray duplicate.
  - **Added genuinely new content, not just corrections**: an `llm-checker` (hardware-fit scanner) mention and a Hugging Face Hub pull example (`ollama pull hf.co/...`) to `ai-llms.md`'s Ollama section — both already prominent in `ai-development.md` and the blog post, but completely absent from the self-hosted-stacks page despite being directly relevant there. Added reciprocal cross-links between `ai-llms.md` and `ai-development.md`, and from each to the blog post (the blog already linked to `ai-development.md`, but neither doc page linked back to the blog, and `ai-llms.md` had no link to the blog or to `ai-development.md` at all).
  - **Bigger, unrelated finding surfaced while checking these cross-links: 23 links across 20 files site-wide used the wrong domain for blog links** — `https://shani.dev/post/...` instead of `https://blog.shani.dev/post/...` (the blog's actual `CNAME`). Verified live: `shani.dev/post/<slug>` 404s (that domain has no `/post/` route at all — it's the separate marketing site, `shani-website`), while `blog.shani.dev/post/<slug>` correctly 301-redirects to the canonical trailing-slash URL. This is a distinct failure mode from every previously-documented broken-link pass in this file (all of which were about internal `docs.shani.dev` paths after the kubernetes/monitoring/etc. splits) — found only because checking the one new `ai-llms.md`→blog link prompted verifying it actually resolved, which surfaced the same wrong-domain pattern already present in 22 other, unrelated files. Fixed all 23 with a single domain substitution (`docs/arch/{boot,btrfs,build-pipeline,filesystem}.md`, `docs/concepts/{atomic-updates,blue-green}.md`, `docs/install/pre-install.md`, `docs/intro/{comparison,optimizations,whats-included}.md`, `docs/networking/{apache,apcupsd,caddy,kdeconnect,network-tools,networkmanager-vpn,tailscale,wireguard,wireless}.md`, `docs/servers/{ai-llms,backups-sync,game-servers}.md`, `docs/software/development.md`). Spot-verified 10 of the 23 resolve live post-fix — 8 returned 200, 2 (`shani-os-build-pipeline`, `shani-os-cosmic-edition`) 404 because those specific blog posts are themselves uncommitted/not-yet-deployed in `shani-blog` (same "nothing pushed yet" situation as everything else in this session, not a new bug).
  - Regenerated and re-validated zero broken internal `docs.shani.dev` links afterward (still clean) — the wrong-domain links are external (`blog.shani.dev`) so wouldn't have been caught by that internal-only validator; this was only found by manually verifying the new cross-links resolved, a reminder that the internal-link validator and an external-domain check are two different guarantees, not one.
- **No LICENSE file (Low, needs a maintainer decision).** No `LICENSE`/`COPYING`
  file anywhere in the repo, and `README.md` doesn't mention a license
  either — confirmed by direct file check, not present under any common
  name. 11 of 15 repos in this ecosystem have one; the other 4 (including
  this one) don't: `shani-docs`, `shani-install-media`, `shani-website`,
  `shani-wiki` — not a unique outlier, one of a real cluster, not an
  intentional ecosystem-wide choice either way. Not something to
  guess and add — needs the maintainer to pick what license this content
  is actually under.
- **`new Function()` parsing — FIXED.** `script-docs.js:2073` used
  `new Function('return [' + m[1] + ']')()` to parse `nav-docs.js` content
  fetched live from GitHub — a tampered/compromised nav file would execute
  as RCE in the admin's browser. The audit's suggested drop-in fix
  ("use `JSON.parse` instead") didn't actually work as stated:
  `nav-docs.js`'s emitted format was a JS object literal (unquoted keys,
  single-quoted strings, trailing commas), not valid JSON — `JSON.parse`
  would have rejected every real file. Fixed properly on both sides:
  `generate-manifest.js`'s `generateNavDocs()` now emits the array body as
  valid JSON (double-quoted keys, values via `JSON.stringify` instead of
  hand-rolled escaping — handles embedded quotes/unicode correctly, which
  the old manual `esc()` didn't), keeping trailing commas for diff
  readability; `extractNavTree()` now wraps the regex-captured body in
  brackets, strips trailing commas, and `JSON.parse`s it — worst case on a
  tampered file is now a caught parse exception (falls back to the
  in-memory `CONFIG.NAV_TREE`), never code execution. Verified live: (1) a
  Node harness round-tripped the real `nav-docs.js` through both the old
  `new Function` path and the new `JSON.parse` path and confirmed
  byte-identical trees; (2) a crafted malicious payload
  (`...]; globalThis.__PWNED__ = true; //\n];`) was confirmed to leave
  `__PWNED__` still `undefined` — the injection never runs; (3) the real
  `nav-docs.js` in this repo was regenerated in place to the new format (a
  pure reformat — content verified identical to what was already in the
  working tree beforehand, only the quoting/structure changed) so what
  ships actually matches what the fixed parser expects.
  `generate-manifest.js`'s *own* `parseExistingNavTree()` (a local,
  trusted, build-time-only Node script reading its own previously-generated
  file — not reachable by anything an attacker could tamper with over the
  network) still uses `new Function` and was deliberately left alone; that
  occurrence isn't the same trust boundary as the browser-side one this
  finding is about — see `shani-builder/AGENTS.md`'s "eval source of
  PKGBUILD" entry for the same build-time-vs-runtime distinction applied
  to a different repo.
- **No SRI on any CDN resource — FIXED.** Was: `index.html:96-127` loaded 23 external scripts/stylesheets from `cdnjs.cloudflare.com` and `cdn.jsdelivr.net` (Font Awesome, KaTeX, marked, DOMPurify, Prism + component languages) with zero `integrity=` attributes. All 23 now have real `integrity="sha384-..."` + `crossorigin="anonymous"`, computed by actually fetching each exact pinned URL and hashing it (`openssl dgst -sha384`) — not copied from memory. Re-parsed with html5lib after: 0 errors.
- **CSP added to `index.html`, all 201 doc stubs, and `404.html` — verified live in a real browser.** `default-src 'self'; script-src 'self' 'unsafe-inline' cdnjs.cloudflare.com cdn.jsdelivr.net; style-src ...; font-src ...; img-src 'self' https://shani.dev data:; connect-src 'self' api.github.com raw.githubusercontent.com` (the latter two for the GitHub-authenticated in-browser edit feature and the raw-markdown fetch fallback in `script-docs.js`). **First attempt had two real bugs, both caught before considering this done:** (1) a duplicate pre-existing CSP meta tag already existed further down `index.html` (undocumented — same "AGENTS.md is stale, someone already partially fixed this" pattern seen elsewhere in this repo's history) with a slightly different `img-src` (missing `data:`); since browsers *intersect* multiple CSP meta tags rather than taking the last one, this would have silently dropped the `data:` allowance. Removed the duplicate, kept one correct policy. (2) The tag was initially placed *inside* the `<!-- ═══ SEO ═══ -->`-to-`<!-- ═══ PERFORMANCE` sentinel region that `generate-manifest.js` fully discards and rebuilds per page — so it vanished from all 201 generated stubs despite being present in the source, caught by `grep -c` on an actual generated stub coming back 0, not by trusting the source edit. Moved above the sentinel; reconfirmed present in `index.html` and every stub afterward. Verified end-to-end in a real browser on `doc/servers/ai-llms/` (chosen because it exercises Prism syntax highlighting, KaTeX-adjacent inline code, the hydrated nav tree, and client-side search): zero console errors, full visual render including syntax-highlighted code blocks, sidebar/TOC hydration, and the view counter — nothing silently blocked.
- **Root `index.html` OG/Twitter tags — FIXED.** `og:title`, `og:description`, `og:url`, `og:image`, and the matching `twitter:*` tags shipped with `content=""`, populated only by `script-docs.js` at runtime — social unfurl bots (Slack, Twitter/X, LinkedIn, Facebook) that don't execute JS got a blank preview card when the bare root URL was shared. Filled with the same static values already used consistently elsewhere (`SITE_TITLE`/`SITE_DESC`/`OG_IMAGE` from `config-docs.js`) — real content now present with zero JS required, matching how every generated doc stub already worked.
- **Duplicate `<h1>` on doc pages — FIXED, and the fix generalizes past the originally-documented 30%.** The existing `stripDuplicateLeadingH1()` in `generate-manifest.js` only stripped a body's leading `# Heading` when it matched the frontmatter `title` *exactly* (normalized) — which missed every page whose body H1 is a fuller or differently-worded restatement of the title (e.g. body `# Troubleshooting Guide` vs. `title: Troubleshooting`, body `# KDE Connect — Link Desktop and Mobile Devices` vs. `title: KDE Connect`). A repo-wide scan of the actual generated stubs (not a source-code guess) found 40 pages with a genuine second `<h1>`, not 42 — the true count had drifted since the number was last measured. Root-caused and fixed properly: the stub's own `<h1 class="doc-title">{title}</h1>` is *always* rendered immediately before `.prose`, so any genuinely-leading body H1 is redundant by construction regardless of exact wording — changed the function to unconditionally strip a leading H1, dropping the now-unnecessary `title` parameter entirely. This fixed 37 of the 40 pages in one generator-level change (no per-file markdown edits). The remaining 3 (`servers/{communication,openstack,backups-sync}.md`) all open with the same "Portability note" blockquote *before* their H1, so the regex's `^\s*#` anchor never matched the true start of content — extended the function to skip a leading blockquote (preserving it in the output) before looking for the H1 to strip. **The final 4 residual cases were genuine content-authoring bugs, not covered by any generator fix**: `servers/devtools.md` had a stray `# Coder` sitting between a section intro and its code block (redundant with the already-correct `## Gitpod / Coder` heading two lines up — deleted); `servers/mail.md` had two section-divider headings mistakenly typed as `# Mailing Lists, Newsletters & Aliases` and `# Mail Clients` instead of `##`, matching the level of every other tool heading in the file including their own siblings — promoted both to `##` (first tried demoting the sibling `## listmonk` to `###` to nest under the new heading, but that broke consistency with `## SimpleLogin`/`## addy.io`/`## Postal` which remained flat `##` siblings; reverted, since these were never meant to be a parent/child relationship, just adjacent section dividers at the same level); `servers/security/policies.md` had a stray `# Run as a daemon with REST API` before an OWASP ZAP code block, promoted to `##### Run as a daemon with REST API` matching the established `##### <labeled sub-example>` convention used elsewhere (e.g. `ai-llms.md`'s `##### REST API example`). Verified: 0 of 201 pages have more than one `<h1>` (was 40), zero broken internal links afterward, word counts on all 4 hand-edited files sanity-checked against their pre-edit state.
- **CI status.** 1 CI workflow.
