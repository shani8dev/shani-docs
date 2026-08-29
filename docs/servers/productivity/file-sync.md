---
title: Productivity — File Sync (Nextcloud, Syncthing & More)
section: Self-Hosting & Servers
updated: 2026-08-28
---

## Key Concepts

#### Internal Developer Platforms (IDPs) — what they solve
Without an IDP, every developer needs to know: how to provision infrastructure (Terraform), how to set up CI/CD (Woodpecker/GitHub Actions), how to configure observability (Prometheus + Grafana), how to manage secrets (OpenBao), and how to deploy (Helm + ArgoCD). An IDP (Backstage, Port) wraps all of this in a self-service UI with golden path templates. A developer fills in a form and gets a GitHub repo, CI pipeline, Kubernetes namespace, database, and Grafana dashboard — all wired together. This is what "platform engineering" means in practice.

#### Document-as-code vs knowledge wiki
"Docs-as-code" treats documentation like source code — Markdown files in Git, reviewed via PRs, versioned alongside the code they describe, rendered by a static site generator (Docusaurus). This contrasts with wikis (Confluence, BookStack) where docs live in a database, aren't version-controlled with code, and aren't part of the review process. Best practice: API docs and runbooks live in the code repo; architectural decision records (ADRs) also live in Git; long-form internal knowledge in a wiki.

#### Architecture Decision Records (ADRs)
Lightweight documents that capture the context, decision, and consequences of a significant technical decision. Stored in `docs/adr/` in the repo. Format: (1) Status (proposed/accepted/deprecated/superseded), (2) Context (what problem, what constraints), (3) Decision (what was chosen), (4) Consequences (trade-offs). ADRs let future engineers understand *why* a decision was made, not just *what* was decided. Essential for remote teams and long-lived systems.

#### Webhook-driven automation patterns
A webhook is an HTTP POST that an event source sends to a configured URL when something happens. Gitea sends a webhook on push → Woodpecker CI starts a pipeline. GitHub sends a webhook on PR merge → n8n workflow updates a Jira ticket. Webhooks are stateless and fire-and-forget — the source doesn't wait for the receiver. For reliability, the receiver should acknowledge immediately (HTTP 200) and process asynchronously. Webhook security: always verify the HMAC-SHA256 signature in the `X-Gitea-Signature` or `X-Hub-Signature-256` header.

#### S3-compatible storage in the modern stack
Understanding the S3 API is a core DevOps skill because it's used by: Velero (Kubernetes backups), Restic/Kopia (file backups), Thanos (Prometheus long-term storage), Loki (log storage), MLflow (model artifacts), and dozens of other tools. The key operations: PutObject, GetObject, DeleteObject, ListObjectsV2. Presigned URLs (time-limited, signature-authenticated URLs for direct client access) come up in interview questions about secure file sharing.

#### Self-hosted vs SaaS trade-offs — the honest framing
Self-hosting gives you data sovereignty, no per-seat pricing, and customisation. The real costs: operational overhead (updates, backups, uptime), security responsibility (you patch the CVEs, not the vendor), and feature gaps (SaaS products have larger engineering teams). The right answer depends on data sensitivity (medical/legal → self-host), team size (one person managing 20 self-hosted apps is a maintenance burden), and internet reliability (self-hosted services go down when your home internet does).

#### Nextcloud as a platform, not just file sync
Nextcloud's app ecosystem makes it more than Dropbox. Talk (video calls + chat), Calendar (CalDAV), Contacts (CardDAV), Notes, Deck (Kanban), and Forms extend it toward a self-hosted Google Workspace. The key architecture decision: high-performance backend (Redis for caching, PostgreSQL over SQLite, preview generation workers) makes the difference between a slow clunky app and one that feels like a real SaaS product. External storage mounts (S3, SFTP, SMB) let you use Nextcloud as a unified frontend for data that lives elsewhere.

#### Workflow automation — n8n vs Zapier mental model
n8n is a self-hosted Zapier/Make alternative: visual, node-based automation flows triggered by webhooks, schedules, or events. Each node is an action (HTTP request, database query, email send, Slack message). The key concept is the data flow between nodes — each node receives the previous node's output as JSON. Useful patterns: nightly report from Prometheus data → formatted Markdown → sent to Telegram; new row in Nextcloud spreadsheet → create task in Vikunja; RSS item with keyword → saved to Wallabag. For DevOps automation (CI/CD, Kubernetes), prefer purpose-built tools; n8n is best for glue code between productivity apps.

**CalDAV and CardDAV — the open calendar/contacts standard:** These protocols (extensions of WebDAV) are how Nextcloud, Radicale, and Baikal expose calendars and contacts to any client (iOS, Android, Thunderbird, GNOME Calendar). Understanding them matters because: (1) any self-hosted calendar server can replace Google Calendar if your clients support CalDAV, (2) when debugging sync issues, the protocol is the same regardless of server, (3) event data lives in iCalendar format (.ics) — human-readable, version-controllable.

#### Documentation as institutional memory
The half-life of tribal knowledge is the tenure of the person who holds it. A wiki (BookStack, Outline, Wiki.js) only provides value if it's kept current and actually consulted. Two practices that work: (1) runbooks linked from Grafana alerts — the person paged opens the alert and sees the runbook URL immediately, so runbooks get used and therefore get maintained; (2) ADRs committed alongside code — the PR that adds a service also adds a doc/adr explaining why.

#### Internal developer portals — what Backstage actually solves
Software catalog sprawl: in a company with 50+ microservices, no one knows who owns what, what's deployed where, what APIs exist, or where the runbooks are. Backstage solves this with a software catalog (every service has a `catalog-info.yaml` with owner, links, dependencies) and a TechDocs site (markdown documentation auto-published from the service repo). Plugins add live data: which Kubernetes pods are running for this service, the latest CI build status, Datadog SLOs, PagerDuty on-call. The business value: onboarding time drops from weeks to days when every new engineer can discover services, owners, and documentation from one place.

#### Knowledge management — why wikis fail and how to fix them
Wikis fail because they rot: content goes stale, nobody maintains it, and eventually nobody trusts it. Practices that work: (1) link runbooks directly from Grafana alerts — the person paged opens the alert and sees the runbook URL immediately, so runbooks get used and therefore maintained; (2) ADRs (Architecture Decision Records) committed alongside code — the PR that adds a service also adds `docs/decisions/001-why-postgres.md`; (3) treat documentation as code — PRs required for doc changes, linting for broken links, last-modified dates visible on every page. The failure mode to avoid: a wiki that's separate from the workflow is a wiki nobody reads.

#### Webhook-driven automation — the integration pattern
Webhooks are HTTP POST requests sent by a system when an event occurs. Gitea sends a webhook on every push; Grafana sends one when an alert fires; Stripe sends one when a payment succeeds. n8n, Huginn, and custom endpoints receive these webhooks and trigger workflows. The pattern: system event → webhook POST → automation platform → actions (send Slack message, create Jira ticket, trigger deployment, update spreadsheet). This is the foundation of event-driven integration — cheaper and simpler than polling APIs on a schedule. Webhook security: always validate the HMAC signature in the payload header before processing.

#### S3-compatible storage as a universal integration layer
MinIO's S3-compatible API means any tool that supports S3 works with your self-hosted storage: backup tools (Restic, Kopia), analytics platforms (Trino, DuckDB, Spark), ML frameworks (MLflow artifact store), logging pipelines (Loki, Thanos), and CI artifact storage (Woodpecker). The S3 API has become the universal object storage interface — knowing how to configure IAM-style bucket policies, lifecycle rules, and versioning in MinIO transfers directly to AWS S3 skills, and vice versa.

---

---

## Nextcloud

**Purpose:** Comprehensive self-hosted cloud suite — file sync across all your devices, calendar, contacts, collaborative document editing (via Collabora or OnlyOffice), and a mobile app that feels like Google Drive. Replaces Dropbox, Google Drive, Google Calendar, and Google Contacts simultaneously.

### How WebDAV and CalDAV Work

Nextcloud (and several other tools in this section) expose their file and calendar data via two HTTP-based protocols that are worth understanding:

**WebDAV (Web Distributed Authoring and Versioning):** extends HTTP with additional methods (`PROPFIND`, `MKCOL`, `COPY`, `MOVE`, `LOCK`) that let clients browse, upload, download, and manage files over HTTPS — without a proprietary sync agent. Any WebDAV client (Nautilus, Finder, Cyberduck, rclone, Windows Explorer) can mount a WebDAV share as a filesystem. Nextcloud exposes WebDAV at:
```
https://files.home.local/remote.php/dav/files/<username>/
```

**CalDAV:** is a similar extension for calendar data — it adds iCalendar (`.ics`) create/read/update/delete operations over HTTP. Any CalDAV-compatible calendar app (GNOME Calendar, Apple Calendar, Thunderbird, Android via DAVx⁵) syncs directly with your Nextcloud calendar. Nextcloud's CalDAV endpoint:
```
https://files.home.local/remote.php/dav/calendars/<username>/
```

**CardDAV:** is the same concept for contacts (`.vcf` / vCard format). These three protocols together are why Nextcloud can replace an entire Google Workspace for file, calendar, and contacts sync — they're open standards, not proprietary APIs.

##### Mounting Nextcloud via rclone (WebDAV)

```bash
# Configure in rclone config (type: webdav, vendor: nextcloud)
rclone copy nextcloud:/Documents ~/local-backup/

# Or mount as a local filesystem
rclone mount nextcloud:/ ~/mnt/nextcloud/ --daemon
```

```yaml
# ~/nextcloud/compose.yaml
services:
  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootpass
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nc
      MYSQL_PASSWORD: ncpass
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  nextcloud:
    image: nextcloud:30
    ports: ["127.0.0.1:8888:80"]
    environment:
      MYSQL_HOST: db
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nc
      MYSQL_PASSWORD: ncpass
      REDIS_HOST: redis
      NEXTCLOUD_ADMIN_USER: admin
      NEXTCLOUD_ADMIN_PASSWORD: changeme
      NEXTCLOUD_TRUSTED_DOMAINS: files.home.local
    volumes: [nc_data:/var/www/html]
    depends_on: [db, redis]
    restart: unless-stopped

volumes:
  db_data:
  nc_data:
```

```bash
cd ~/nextcloud && podman-compose up -d
```

**Caddy:**
```caddyfile
files.home.local { tls internal; reverse_proxy localhost:8888 }
```

##### Run background jobs (required for performance)

```bash
# Add to a systemd timer — every 5 minutes
podman exec -u www-data nextcloud php /var/www/html/cron.php
```

#### Common operations
```bash
# Run Nextcloud cron (add to systemd timer — every 5 minutes)
podman exec -u www-data nextcloud php /var/www/html/cron.php

# Run OCC commands (Nextcloud's admin CLI)
podman exec -u www-data nextcloud php occ status
podman exec -u www-data nextcloud php occ user:list
podman exec -u www-data nextcloud php occ files:scan --all
podman exec -u www-data nextcloud php occ maintenance:mode --on
podman exec -u www-data nextcloud php occ maintenance:mode --off
podman exec -u www-data nextcloud php occ upgrade
podman exec -u www-data nextcloud php occ app:install photos
podman exec -u www-data nextcloud php occ app:list
podman exec -u www-data nextcloud php occ db:add-missing-indices

# Add a trusted domain
podman exec -u www-data nextcloud php occ config:system:set trusted_domains 2 --value=files.home.local

# View Nextcloud logs
podman exec -u www-data nextcloud php occ log:tail

# Check background jobs are running
podman exec -u www-data nextcloud php occ background:cron
```

#### Recommended apps to install
Nextcloud Office (Collabora), Contacts, Calendar, Notes, Passwords, Talk (video calls).

---

## Syncthing

**Purpose:** Decentralised, peer-to-peer file sync with no central server. Devices sync directly with each other — encrypted, open-source, and completely private. Ideal for syncing folders across your laptop, phone, and server without a cloud account.

```yaml
# ~/syncthing/compose.yaml
services:
  syncthing:
    image: syncthing/syncthing:latest
    ports:
      - 127.0.0.1:8384:8384
      - 22000:22000/tcp
      - 22000:22000/udp
      - 21027:21027/udp
    volumes:
      - /home/user/syncthing/config:/var/syncthing/config:Z
      - /home/user/sync:/var/syncthing/Sync:Z
    environment:
      PUID: "1000"
      PGID: "1000"
    restart: unless-stopped
```

```bash
cd ~/syncthing && podman-compose up -d
```

#### Common operations
```bash
# View logs
podman logs -f syncthing

# Get device ID (needed to pair with other devices)
podman exec syncthing syncthing --device-id

# List paired devices and their status via API
curl -s -H "X-API-Key: $(grep apikey /home/user/syncthing/config/config.xml | grep -oP '(?<=>)[^<]+')"   http://localhost:8384/rest/system/connections | python3 -m json.tool

# Check folder sync status
curl -s -H "X-API-Key: YOUR_API_KEY"   http://localhost:8384/rest/db/status?folder=default | python3 -m json.tool

# Force a full rescan
curl -X POST -H "X-API-Key: YOUR_API_KEY"   "http://localhost:8384/rest/db/scan?folder=default"

# Get server version and stats
curl -s http://localhost:8384/rest/system/version
```

**Firewall:** (for syncing with external devices):
```bash
sudo firewall-cmd --add-port=22000/tcp --add-port=22000/udp --add-port=21027/udp --permanent
sudo firewall-cmd --reload
```

Access the web UI at `http://localhost:8384`. Add remote devices using their Device ID (found in the UI).

---

## Filebrowser

**Purpose:** Lightweight web-based file manager. Browse, upload, download, rename, and edit files on your server from any browser. Useful for quick file access without needing an SSH client or a full Nextcloud setup.

```yaml
# ~/filebrowser/compose.yaml
services:
  filebrowser:
    image: filebrowser/filebrowser:s6
    ports:
      - 127.0.0.1:8085:80
    volumes:
      - /home/user:/srv:Z
      - /home/user/filebrowser.db:/database.db:Z
    restart: unless-stopped
```

```bash
cd ~/filebrowser && podman-compose up -d
```

Default login: admin / admin. Change the password immediately after first login.

---

## Paperless-ngx

**Purpose:** Document management system with OCR. Scan paper documents, automatically index and tag their contents, and make everything full-text searchable. Drop a PDF into the consume folder and it is automatically processed and filed.

```yaml
# ~/paperless/compose.yaml
services:
  broker:
    image: redis:7-alpine
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: paperless
      POSTGRES_USER: paperless
      POSTGRES_PASSWORD: paperless
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  webserver:
    image: ghcr.io/paperless-ngx/paperless-ngx:latest
    ports: ["127.0.0.1:8000:8000"]
    environment:
      PAPERLESS_REDIS: redis://broker:6379
      PAPERLESS_DBHOST: db
      PAPERLESS_OCR_LANGUAGE: eng
      PAPERLESS_TIME_ZONE: Asia/Kolkata
      PAPERLESS_ADMIN_USER: admin
      PAPERLESS_ADMIN_PASSWORD: changeme
    volumes:
      - /home/user/paperless/data:/usr/src/paperless/data:Z
      - /home/user/paperless/media:/usr/src/paperless/media:Z
      - /home/user/Documents/inbox:/usr/src/paperless/consume:Z
      - /home/user/paperless/export:/usr/src/paperless/export:Z
    depends_on: [broker, db]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/paperless && podman-compose up -d
```

#### Common operations
```bash
# Trigger a manual document consumption scan
curl -X POST http://localhost:8000/api/documents/post_document/   -H "Authorization: Token YOUR_API_TOKEN"   -F "document=@/path/to/file.pdf"

# List recent documents
curl http://localhost:8000/api/documents/?ordering=-created   -H "Authorization: Token YOUR_API_TOKEN" | python3 -m json.tool | head -50

# Run management commands
podman exec webserver python manage.py document_index reindex
podman exec webserver python manage.py document_thumbnails
podman exec webserver python manage.py check

# Search documents from CLI
curl "http://localhost:8000/api/documents/?query=invoice&format=json"   -H "Authorization: Token YOUR_API_TOKEN"

# Create a superuser
podman exec webserver python manage.py createsuperuser

# Export all documents
podman exec webserver python manage.py document_exporter /usr/src/paperless/export

# View logs
podman logs -f webserver
```

> Drop documents into `~/Documents/inbox` — Paperless will automatically OCR, index, and file them within minutes.

### Share Documents via Email

Paperless-ngx can send documents as email attachments directly from the UI or via automation. This requires configuring SMTP settings in the environment.

#### 1. Add SMTP settings to the compose environment
```yaml
environment:
  # ... existing vars ...
  PAPERLESS_EMAIL_HOST: host.containers.internal   # or your SMTP relay / Mailrise
  PAPERLESS_EMAIL_PORT: "25"
  PAPERLESS_EMAIL_HOST_USER: ""            # blank for unauthenticated local relay
  PAPERLESS_EMAIL_HOST_PASSWORD: ""
  PAPERLESS_EMAIL_USE_TLS: "false"
  PAPERLESS_EMAIL_USE_SSL: "false"
  PAPERLESS_FROM_EMAIL: paperless@home.local
```

For an authenticated SMTP provider (e.g., Brevo, Mailgun, Gmail SMTP):
```yaml
  PAPERLESS_EMAIL_HOST: smtp.brevo.com
  PAPERLESS_EMAIL_PORT: "587"
  PAPERLESS_EMAIL_HOST_USER: your@email.com
  PAPERLESS_EMAIL_HOST_PASSWORD: your-smtp-password
  PAPERLESS_EMAIL_USE_TLS: "true"
```

#### 2. Configure a mail rule to send on consume (optional automation)

In the Paperless UI → **Settings → Mail Rules → Add Rule**:
- Action: **Assign tags / correspondent** (or trigger a workflow)

> Full email-out automation is available via the **Workflows** feature (Paperless-ngx 2.x+). Go to **Settings → Workflows → Add Workflow** → Trigger: *Document Added* → Action: *Send Email*.

#### 3. Send a document manually from the UI

Open any document → click the **⋮ menu → Share / Send** → enter a recipient address. Paperless attaches the original PDF and sends via the configured SMTP relay.

#### 4. Send via API
```bash
# Share document ID 42 by email
curl -X POST http://localhost:8000/api/documents/42/share_link/ \
  -H "Authorization: Token YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"expiration": null}'
# Returns a share link — paste into an email manually
```

> For a simple local SMTP relay without an external account, pair Paperless with **Mailrise** or **Maddy** (both documented in the Mail section) — configure Paperless to use `host.containers.internal:25` as the relay.

---

