---
title: Productivity & Files
section: Self-Hosting & Servers
updated: 2026-04-22
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.


# Productivity & Files

Self-hosted cloud storage, file sync, document management, task management, knowledge bases, and personal finance tools.

---

## Job-Ready Concepts

### Productivity Tools & Platform Engineering Interview Essentials

**Internal Developer Platforms (IDPs) — what they solve:** Without an IDP, every developer needs to know: how to provision infrastructure (Terraform), how to set up CI/CD (Woodpecker/GitHub Actions), how to configure observability (Prometheus + Grafana), how to manage secrets (OpenBao), and how to deploy (Helm + ArgoCD). An IDP (Backstage, Port) wraps all of this in a self-service UI with golden path templates. A developer fills in a form and gets a GitHub repo, CI pipeline, Kubernetes namespace, database, and Grafana dashboard — all wired together. This is what "platform engineering" means in practice.

**Document-as-code vs knowledge wiki:** "Docs-as-code" treats documentation like source code — Markdown files in Git, reviewed via PRs, versioned alongside the code they describe, rendered by a static site generator (Docusaurus). This contrasts with wikis (Confluence, BookStack) where docs live in a database, aren't version-controlled with code, and aren't part of the review process. Best practice: API docs and runbooks live in the code repo; architectural decision records (ADRs) also live in Git; long-form internal knowledge in a wiki.

**Architecture Decision Records (ADRs):** Lightweight documents that capture the context, decision, and consequences of a significant technical decision. Stored in `docs/adr/` in the repo. Format: (1) Status (proposed/accepted/deprecated/superseded), (2) Context (what problem, what constraints), (3) Decision (what was chosen), (4) Consequences (trade-offs). ADRs let future engineers understand *why* a decision was made, not just *what* was decided. Essential for remote teams and long-lived systems.

**Webhook-driven automation patterns:** A webhook is an HTTP POST that an event source sends to a configured URL when something happens. Gitea sends a webhook on push → Woodpecker CI starts a pipeline. GitHub sends a webhook on PR merge → n8n workflow updates a Jira ticket. Webhooks are stateless and fire-and-forget — the source doesn't wait for the receiver. For reliability, the receiver should acknowledge immediately (HTTP 200) and process asynchronously. Webhook security: always verify the HMAC-SHA256 signature in the `X-Gitea-Signature` or `X-Hub-Signature-256` header.

**S3-compatible storage in the modern stack:** Understanding the S3 API is a core DevOps skill because it's used by: Velero (Kubernetes backups), Restic/Kopia (file backups), Thanos (Prometheus long-term storage), Loki (log storage), MLflow (model artifacts), and dozens of other tools. The key operations: PutObject, GetObject, DeleteObject, ListObjectsV2. Presigned URLs (time-limited, signature-authenticated URLs for direct client access) come up in interview questions about secure file sharing.


**Self-hosted vs SaaS trade-offs — the honest framing:** Self-hosting gives you data sovereignty, no per-seat pricing, and customisation. The real costs: operational overhead (updates, backups, uptime), security responsibility (you patch the CVEs, not the vendor), and feature gaps (SaaS products have larger engineering teams). The right answer depends on data sensitivity (medical/legal → self-host), team size (one person managing 20 self-hosted apps is a maintenance burden), and internet reliability (self-hosted services go down when your home internet does).

**Nextcloud as a platform, not just file sync:** Nextcloud's app ecosystem makes it more than Dropbox. Talk (video calls + chat), Calendar (CalDAV), Contacts (CardDAV), Notes, Deck (Kanban), and Forms extend it toward a self-hosted Google Workspace. The key architecture decision: high-performance backend (Redis for caching, PostgreSQL over SQLite, preview generation workers) makes the difference between a slow clunky app and one that feels like a real SaaS product. External storage mounts (S3, SFTP, SMB) let you use Nextcloud as a unified frontend for data that lives elsewhere.

**Workflow automation — n8n vs Zapier mental model:** n8n is a self-hosted Zapier/Make alternative: visual, node-based automation flows triggered by webhooks, schedules, or events. Each node is an action (HTTP request, database query, email send, Slack message). The key concept is the data flow between nodes — each node receives the previous node's output as JSON. Useful patterns: nightly report from Prometheus data → formatted Markdown → sent to Telegram; new row in Nextcloud spreadsheet → create task in Vikunja; RSS item with keyword → saved to Wallabag. For DevOps automation (CI/CD, Kubernetes), prefer purpose-built tools; n8n is best for glue code between productivity apps.

**CalDAV and CardDAV — the open calendar/contacts standard:** These protocols (extensions of WebDAV) are how Nextcloud, Radicale, and Baikal expose calendars and contacts to any client (iOS, Android, Thunderbird, GNOME Calendar). Understanding them matters because: (1) any self-hosted calendar server can replace Google Calendar if your clients support CalDAV, (2) when debugging sync issues, the protocol is the same regardless of server, (3) event data lives in iCalendar format (.ics) — human-readable, version-controllable.

**Documentation as institutional memory:** The half-life of tribal knowledge is the tenure of the person who holds it. A wiki (BookStack, Outline, Wiki.js) only provides value if it's kept current and actually consulted. Two practices that work: (1) runbooks linked from Grafana alerts — the person paged opens the alert and sees the runbook URL immediately, so runbooks get used and therefore get maintained; (2) ADRs committed alongside code — the PR that adds a service also adds a doc/adr explaining why.
---
---

---

## Nextcloud

**Purpose:** Comprehensive self-hosted cloud suite — file sync across all your devices, calendar, contacts, collaborative document editing (via Collabora or OnlyOffice), and a mobile app that feels like Google Drive. Replaces Dropbox, Google Drive, Google Calendar, and Google Contacts simultaneously.

### How WebDAV and CalDAV Work

Nextcloud (and several other tools in this section) expose their file and calendar data via two HTTP-based protocols that are worth understanding:

**WebDAV (Web Distributed Authoring and Versioning)** extends HTTP with additional methods (`PROPFIND`, `MKCOL`, `COPY`, `MOVE`, `LOCK`) that let clients browse, upload, download, and manage files over HTTPS — without a proprietary sync agent. Any WebDAV client (Nautilus, Finder, Cyberduck, rclone, Windows Explorer) can mount a WebDAV share as a filesystem. Nextcloud exposes WebDAV at:
```
https://files.home.local/remote.php/dav/files/<username>/
```

**CalDAV** is a similar extension for calendar data — it adds iCalendar (`.ics`) create/read/update/delete operations over HTTP. Any CalDAV-compatible calendar app (GNOME Calendar, Apple Calendar, Thunderbird, Android via DAVx⁵) syncs directly with your Nextcloud calendar. Nextcloud's CalDAV endpoint:
```
https://files.home.local/remote.php/dav/calendars/<username>/
```

**CardDAV** is the same concept for contacts (`.vcf` / vCard format). These three protocols together are why Nextcloud can replace an entire Google Workspace for file, calendar, and contacts sync — they're open standards, not proprietary APIs.

**Mounting Nextcloud via rclone (WebDAV):**
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

**Run background jobs (required for performance):**
```bash
# Add to a systemd timer — every 5 minutes
podman exec -u www-data nextcloud php /var/www/html/cron.php
```

**Common operations:**
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

**Recommended apps to install:** Nextcloud Office (Collabora), Contacts, Calendar, Notes, Passwords, Talk (video calls).

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

**Common operations:**
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

**Firewall** (for syncing with external devices):
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

**Common operations:**
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

**1. Add SMTP settings to the compose environment:**
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

**2. Configure a mail rule to send on consume (optional automation):**

In the Paperless UI → **Settings → Mail Rules → Add Rule**:
- Action: **Assign tags / correspondent** (or trigger a workflow)

> Full email-out automation is available via the **Workflows** feature (Paperless-ngx 2.x+). Go to **Settings → Workflows → Add Workflow** → Trigger: *Document Added* → Action: *Send Email*.

**3. Send a document manually from the UI:**

Open any document → click the **⋮ menu → Share / Send** → enter a recipient address. Paperless attaches the original PDF and sends via the configured SMTP relay.

**4. Send via API:**
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

## Planka (Kanban Board)

**Purpose:** Open-source Trello alternative. Real-time collaborative Kanban boards with cards, labels, checklists, due dates, and member assignments.

```yaml
# ~/planka/compose.yaml
services:
  planka:
    image: ghcr.io/plankanban/planka:latest
    ports:
      - 127.0.0.1:3000:3000
    volumes:
      - /home/user/planka/avatars:/app/public/user-avatars:Z
      - /home/user/planka/background:/app/public/project-background-images:Z
      - /home/user/planka/attachments:/app/private/attachments:Z
    environment:
      DATABASE_URL: postgresql://planka:changeme@db:5432/planka
      SECRET_KEY: changeme-run-openssl-rand-hex-64
      BASE_URL: https://planka.home.local
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: planka
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: planka
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/planka && podman-compose up -d
```

> Planka bundles PostgreSQL in the compose file above — no separate database service is needed.

---

## Vikunja (Task Management)

**Purpose:** Self-hosted to-do app and project manager. Supports tasks, projects, teams, Kanban boards, Gantt charts, and CalDAV sync for task syncing with mobile apps. Clean alternative to Todoist.

```yaml
# ~/vikunja/compose.yaml
services:
  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootpass
      MYSQL_DATABASE: vikunja
      MYSQL_USER: vikunja
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

  vikunja:
    image: vikunja/vikunja:latest
    ports: ["127.0.0.1:3456:3456"]
    environment:
      VIKUNJA_DATABASE_HOST: db
      VIKUNJA_DATABASE_TYPE: mysql
      VIKUNJA_DATABASE_USER: vikunja
      VIKUNJA_DATABASE_PASSWORD: changeme
      VIKUNJA_DATABASE_DATABASE: vikunja
      VIKUNJA_SERVICE_JWTSECRET: changeme
      VIKUNJA_SERVICE_FRONTENDURL: https://tasks.home.local
    volumes: [vikunja_files:/app/vikunja/files]
    depends_on: [db]
    restart: unless-stopped

volumes: {db_data: {}, vikunja_files: {}}
```

```bash
cd ~/vikunja && podman-compose up -d
```

---

## Outline (Team Knowledge Base)

**Purpose:** Modern wiki and knowledge base with real-time collaborative editing, a clean Notion-like interface, and full Markdown support. Great for team documentation, runbooks, and personal notes.

```yaml
# ~/outline/compose.yaml
services:
  outline:
    image: outlinewiki/outline:latest
    ports: ["127.0.0.1:3030:3000"]
    environment:
      DATABASE_URL: postgres://outline:changeme@db:5432/outline
      REDIS_URL: redis://redis:6379
      SECRET_KEY: changeme-run-openssl-rand-hex-32
      UTILS_SECRET: changeme-run-openssl-rand-hex-32
      URL: https://wiki.home.local
      PORT: "3000"
      # File storage (local)
      FILE_STORAGE: local
      FILE_STORAGE_LOCAL_ROOT_DIR: /var/lib/outline/data
    volumes: [outline_data:/var/lib/outline/data]
    depends_on: [db, redis]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: outline
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: outline
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes: {pg_data: {}, outline_data: {}}
```

```bash
cd ~/outline && podman-compose up -d
```

> Outline requires an OIDC provider for login. Use Authentik or Zitadel configured with an Outline application.

---

## Mealie (Recipe Manager)

**Purpose:** Self-hosted recipe manager with web scraping (import recipes from any URL), meal planning, shopping list generation, and household sharing.

```yaml
# ~/mealie/compose.yaml
services:
  mealie:
    image: ghcr.io/mealie-recipes/mealie:latest
    ports:
      - 127.0.0.1:9925:9000
    volumes:
      - /home/user/mealie/data:/app/data:Z
    environment:
      BASE_URL: https://recipes.home.local
      DEFAULT_EMAIL: admin@home.local
      DEFAULT_PASSWORD: changeme
    restart: unless-stopped
```

```bash
cd ~/mealie && podman-compose up -d
```

---

## Miniflux (RSS Reader)

**Purpose:** Minimal, fast RSS and Atom feed reader. No tracking, no ads, no algorithmic recommendations — just the articles from sources you choose. Supports Fever and Google Reader APIs for mobile app compatibility (Reeder, NetNewsWire).

```yaml
# ~/miniflux/compose.yaml
services:
  miniflux:
    image: miniflux/miniflux:latest
    ports:
      - 127.0.0.1:8090:8080
    environment:
      DATABASE_URL: postgres://miniflux:changeme@db/miniflux?sslmode=disable
      RUN_MIGRATIONS: "1"
      CREATE_ADMIN: "1"
      ADMIN_USERNAME: admin
      ADMIN_PASSWORD: changeme
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: miniflux
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: miniflux
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/miniflux && podman-compose up -d
```

**Common operations:**
```bash
# Create additional users
podman exec miniflux miniflux -create-admin

# Refresh all feeds now
podman exec miniflux miniflux -refresh-feeds

# Run database migrations
podman exec miniflux miniflux -migrate

# Import OPML file
curl -X POST http://localhost:8090/v1/import   -H "X-Auth-Token: YOUR_API_KEY"   -F "file=@subscriptions.opml"

# Export subscriptions as OPML
curl http://localhost:8090/v1/export   -H "X-Auth-Token: YOUR_API_KEY" -o subscriptions.opml

# View logs
podman logs -f miniflux
```

---

## n8n (Workflow Automation)

**Purpose:** Visual workflow automation with 400+ integrations — webhooks, APIs, databases, AI tools, home automation, and more. Build multi-step automations without code using a drag-and-drop node editor. Self-hosted alternative to Zapier and Make. Pairs well with Nextcloud, Gitea, and Home Assistant for event-driven workflows across your entire self-hosted stack.

```yaml
# ~/n8n/compose.yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    ports:
      - 127.0.0.1:5678:5678
    volumes:
      - /home/user/n8n:/home/node/.n8n:Z
    environment:
      N8N_HOST: n8n.example.com
      N8N_PROTOCOL: https
      WEBHOOK_URL: https://n8n.example.com
    restart: unless-stopped
```

```bash
cd ~/n8n && podman-compose up -d
```

**Caddy:**
```caddyfile
n8n.example.com { reverse_proxy localhost:5678 }
```

> n8n webhooks require a publicly accessible URL. Use a Cloudflare Tunnel or Pangolin for internet-facing webhooks without opening firewall ports — see the [VPN & Tunnels wiki](https://docs.shani.dev/doc/servers/vpn-tunnels).

---

## Stirling PDF

**Purpose:** Web-based PDF Swiss Army knife. Merge, split, compress, convert, rotate, watermark, OCR, edit metadata, and more — all locally, no files uploaded to third-party services.

```yaml
# ~/stirling-pdf/compose.yaml
services:
  stirling-pdf:
    image: stirlingtools/stirling-pdf:latest
    ports:
      - 127.0.0.1:8080:8080
    volumes:
      - /home/user/stirling/trainingData:/usr/share/tessdata:Z
      - /home/user/stirling/extraConfigs:/configs:Z
    environment:
      DOCKER_ENABLE_SECURITY: false
    restart: unless-stopped
```

```bash
cd ~/stirling-pdf && podman-compose up -d
```

---

## Ghost (Publishing & Blogging)

**Purpose:** Modern, open-source publishing platform. Ghost is a focused writing and newsletter tool — clean editor, built-in membership and paid subscriptions (via Stripe), email newsletters, and a polished public-facing blog. The self-hosted alternative to Substack or Medium.

```yaml
# ~/ghost/compose.yaml
services:
  ghost:
    image: ghost:5-alpine
    ports: ["127.0.0.1:2368:2368"]
    environment:
      url: https://blog.example.com
      database__client: mysql
      database__connection__host: db
      database__connection__user: ghost
      database__connection__password: changeme
      database__connection__database: ghost
      mail__transport: SMTP
      mail__options__host: localhost
      mail__options__port: 25
      NODE_ENV: production
    volumes:
      - /home/user/ghost/content:/var/lib/ghost/content:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: ghost
      MYSQL_USER: ghost
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/ghost && podman-compose up -d
```

Access the admin panel at `http://localhost:2368/ghost`. Set up your site, configure the theme, and connect Stripe for paid memberships.

**Caddy:**
```caddyfile
blog.example.com { reverse_proxy localhost:2368 }
```

---

## WordPress

**Purpose:** The world's most widely used CMS. Powers 40% of the web. Massive plugin ecosystem, thousands of themes, WooCommerce for e-commerce, and a huge talent pool. The right choice when you need maximum flexibility or have to integrate with existing WordPress tooling.

```yaml
# ~/wordpress/compose.yaml
services:
  wordpress:
    image: wordpress:6-php8.3-apache
    ports: ["127.0.0.1:8100:80"]
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: changeme
      WORDPRESS_DB_NAME: wordpress
      WORDPRESS_CONFIG_EXTRA: |
        define('WP_HOME', 'https://site.example.com');
        define('WP_SITEURL', 'https://site.example.com');
    volumes:
      - /home/user/wordpress/data:/var/www/html:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/wordpress && podman-compose up -d
```

> For better performance, add Redis object caching: deploy a Redis container and install the `Redis Object Cache` WordPress plugin, pointing it at `host.containers.internal:6379`.

---

## BookStack (Documentation Wiki)

**Purpose:** Simple, elegant wiki and documentation platform. Books, chapters, and pages organise content hierarchically. Supports Markdown and WYSIWYG editing, page revisions, search, diagrams (Draw.io integration), and LDAP/SAML SSO. Excellent for team runbooks, internal documentation, and knowledge bases.

```yaml
# ~/bookstack/compose.yaml
services:
  bookstack:
    image: lscr.io/linuxserver/bookstack:latest
    ports: ["127.0.0.1:6875:80"]
    environment:
      PUID: "1000"
      PGID: "1000"
      TZ: Asia/Kolkata
      APP_URL: https://docs.home.local
      DB_HOST: db
      DB_DATABASE: bookstack
      DB_USERNAME: bookstack
      DB_PASSWORD: changeme
    volumes:
      - /home/user/bookstack/config:/config:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: bookstack
      MYSQL_USER: bookstack
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/bookstack && podman-compose up -d
```

Default login: `admin@admin.com` / `password`. Change immediately after first access.

> **Choosing between BookStack, Outline, and Wiki.js:** BookStack is the most approachable with its book/chapter/page hierarchy. Outline has a Notion-like interface and requires OIDC. Wiki.js supports Git-backed storage and multi-database backends.

---

## Wiki.js

**Purpose:** Powerful, extensible wiki with a Git-backed storage option — every page is a Markdown file committed to a Git repository. Supports 50+ authentication providers, 20+ rendering engines, and full-text search. Good choice when you want your wiki version-controlled.

```yaml
# ~/wikijs/compose.yaml
services:
  wikijs:
    image: ghcr.io/requarks/wiki:2
    ports: ["127.0.0.1:3300:3000"]
    environment:
      DB_TYPE: postgres
      DB_HOST: db
      DB_PORT: 5432
      DB_NAME: wiki
      DB_USER: wiki
      DB_PASS: changeme
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: wiki
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: wiki
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/wikijs && podman-compose up -d
```

Access at `http://localhost:3300` to complete the setup wizard. Enable the Git storage module to sync all pages to a Gitea repository.

---

## HedgeDoc (Collaborative Markdown)

**Purpose:** Real-time collaborative Markdown editor. Multiple people edit simultaneously — useful for meeting notes, shared documents, and technical writing. Each document gets a public shareable link. Think Google Docs but Markdown-based and self-hosted.

```yaml
# ~/hedgedoc/compose.yaml
services:
  hedgedoc:
    image: quay.io/hedgedoc/hedgedoc:latest
    ports: ["127.0.0.1:3400:3000"]
    environment:
      CMD_DOMAIN: notes.home.local
      CMD_URL_ADDPORT: "false"
      CMD_PROTOCOL_USESSL: "true"
      CMD_DB_URL: postgres://hedgedoc:changeme@db:5432/hedgedoc
      CMD_SESSION_SECRET: changeme-run-openssl-rand-hex-32
      CMD_ALLOW_ANONYMOUS: "true"
      CMD_ALLOW_ANONYMOUS_EDITS: "true"
    volumes:
      - /home/user/hedgedoc/uploads:/hedgedoc/public/uploads:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: hedgedoc
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: hedgedoc
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/hedgedoc && podman-compose up -d
```

---

## CryptPad (Encrypted Collaborative Office)

**Purpose:** Zero-knowledge, end-to-end encrypted collaboration suite. Documents, spreadsheets, presentations, kanban, code pads, and whiteboards — all encrypted client-side. The server never sees your content. The self-hosted alternative to Google Docs with privacy as the first principle.

```yaml
# ~/cryptpad/compose.yaml
services:
  cryptpad:
    image: cryptpad/cryptpad:latest
    ports:
      - 127.0.0.1:3500:3000
    volumes:
      - /home/user/cryptpad/data:/cryptpad/data:Z
      - /home/user/cryptpad/customize:/cryptpad/customize.dist:Z
    environment:
      CPAD_MAIN_DOMAIN: pad.home.local
      CPAD_SANDBOX_DOMAIN: sandbox.home.local
    restart: unless-stopped
```

```bash
cd ~/cryptpad && podman-compose up -d
```

> CryptPad requires **two separate subdomains** — one for the main app and one for the sandbox iframe (security requirement). Configure both in Caddy and DNS.

**Caddy:**
```caddyfile
pad.home.local     { tls internal; reverse_proxy localhost:3500 }
sandbox.home.local { tls internal; reverse_proxy localhost:3500 }
```

---

## FreshRSS (RSS Reader)

**Purpose:** Fast, self-hosted RSS and Atom feed aggregator. Multi-user, supports Google Reader and Fever APIs (for mobile apps like Reeder, NetNewsWire, and ReadKit), has a powerful filtering engine, and handles thousands of feeds reliably. A more feature-complete alternative to Miniflux.

```yaml
# ~/freshrss/compose.yaml
services:
  freshrss:
    image: freshrss/freshrss:latest
    ports:
      - 127.0.0.1:8200:80
    volumes:
      - /home/user/freshrss/data:/var/www/FreshRSS/data:Z
      - /home/user/freshrss/extensions:/var/www/FreshRSS/extensions:Z
    environment:
      TZ: Asia/Kolkata
      CRON_MIN: 4,34
    restart: unless-stopped
```

```bash
cd ~/freshrss && podman-compose up -d
```

Access at `http://localhost:8200`. During setup, choose SQLite for simplicity or PostgreSQL for multi-user deployments. Enable the API in Settings → Authentication for mobile app access.

> Mobile apps: **Reeder 5** (iOS), **NetNewsWire** (iOS/macOS), **ReadKit**, and **Fluent Reader** all support the Fever or Google Reader API that FreshRSS exposes.

---

## Wallabag (Read-It-Later)

**Purpose:** Save articles from the web to read later — offline, without ads, in a clean reading view. Browser extensions and mobile apps (iOS, Android) let you save with one tap. Full-text search, tagging, and export to ePub/PDF. Self-hosted Pocket/Instapaper replacement.

```yaml
# ~/wallabag/compose.yaml
services:
  wallabag:
    image: wallabag/wallabag:latest
    ports: ["127.0.0.1:8250:80"]
    environment:
      SYMFONY__ENV__DATABASE_DRIVER: pdo_pgsql
      SYMFONY__ENV__DATABASE_HOST: db
      SYMFONY__ENV__DATABASE_PORT: 5432
      SYMFONY__ENV__DATABASE_NAME: wallabag
      SYMFONY__ENV__DATABASE_USER: wallabag
      SYMFONY__ENV__DATABASE_PASSWORD: changeme
      SYMFONY__ENV__SECRET: changeme-run-openssl-rand-hex-32
      SYMFONY__ENV__DOMAIN_NAME: https://read.home.local
      POPULATE_DATABASE: "True"
    volumes:
      - /home/user/wallabag/images:/var/www/wallabag/web/assets/images:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: wallabag
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: wallabag
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/wallabag && podman-compose up -d
```

Default login: `wallabag` / `wallabag`. Change immediately.

---

## Linkwarden (Bookmark Manager)

**Purpose:** Collaborative bookmark manager with automatic webpage archiving. When you save a link, Linkwarden takes a full-page screenshot and saves the HTML — so bookmarks never go dead. Tags, collections, full-text search, and public sharing.

```yaml
# ~/linkwarden/compose.yaml
services:
  linkwarden:
    image: ghcr.io/linkwarden/linkwarden:latest
    ports: ["127.0.0.1:3210:3000"]
    environment:
      DATABASE_URL: postgresql://linkwarden:changeme@db:5432/linkwarden
      NEXTAUTH_SECRET: changeme-run-openssl-rand-hex-32
      NEXTAUTH_URL: https://links.home.local
      NEXT_PUBLIC_DISABLE_REGISTRATION: "true"
    volumes:
      - /home/user/linkwarden/data:/data/data:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: linkwarden
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: linkwarden
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/linkwarden && podman-compose up -d
```

---

## Monica (Personal CRM)

**Purpose:** Personal relationship manager. Track your contacts, log notes from conversations, set reminders for birthdays and follow-ups, record relationship history, and never forget important details about the people in your life. The self-hosted alternative to remembering things about people you care about.

```yaml
# ~/monica/compose.yaml
services:
  monica:
    image: monica:latest
    ports: ["127.0.0.1:8094:80"]
    environment:
      APP_KEY: base64:changeme-run-php-artisan-key-generate
      APP_URL: https://crm.home.local
      DB_HOST: db
      DB_DATABASE: monica
      DB_USERNAME: monica
      DB_PASSWORD: changeme
    volumes:
      - /home/user/monica/storage:/var/www/html/storage:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: monica
      MYSQL_USER: monica
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/monica && podman-compose up -d
```

**First run:**
```bash
podman exec monica php artisan setup:production --force
```

---

## Rallly (Scheduling & Polls)

**Purpose:** Lightweight Doodle alternative for scheduling meetings. Create a poll with date/time options, share the link, and let participants vote. No accounts required for respondents. Clean, fast, and self-contained.

```yaml
# ~/rallly/compose.yaml
services:
  rallly:
    image: lukevella/rallly:latest
    ports: ["127.0.0.1:3450:3000"]
    environment:
      DATABASE_URL: postgresql://rallly:changeme@db:5432/rallly
      SECRET_PASSWORD: changeme-run-openssl-rand-hex-32
      NEXT_PUBLIC_BASE_URL: https://schedule.home.local
      SUPPORT_EMAIL: admin@home.local
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: rallly
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: rallly
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/rallly && podman-compose up -d
```

---

## Kimai (Time Tracking)

**Purpose:** Open-source time tracking for freelancers and teams. Log time against projects and clients, generate invoices, track budgets, and export timesheets. The self-hosted Toggl/Harvest alternative.

```yaml
# ~/kimai/compose.yaml
services:
  kimai:
    image: kimai/kimai2:apache
    ports: ["127.0.0.1:8300:8001"]
    environment:
      ADMINMAIL: admin@example.com
      ADMINPASS: changeme
      DATABASE_URL: mysql://kimai:changeme@db/kimai
      MAILER_FROM: kimai@example.com
      MAILER_URL: null://localhost
    volumes:
      - /home/user/kimai/data:/opt/kimai/var/data:Z
      - /home/user/kimai/plugins:/opt/kimai/var/plugins:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: kimai
      MYSQL_USER: kimai
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/kimai && podman-compose up -d
```

---

## Grocy (Household Management)

**Purpose:** Grocery and household management system. Track pantry stock, shopping lists, product expiry dates, meal planning, and chores. Integrates with barcode scanners for quick stock updates. Useful for reducing food waste and keeping a well-organised household.

```yaml
# ~/grocy/compose.yaml
services:
  grocy:
    image: lscr.io/linuxserver/grocy:latest
    ports:
      - 127.0.0.1:9283:80
    volumes:
      - /home/user/grocy/data:/var/www/data:Z
    environment:
      PUID: "1000"
      PGID: "1000"
      TZ: Asia/Kolkata
    restart: unless-stopped
```

```bash
cd ~/grocy && podman-compose up -d
```

Access at `http://localhost:9283`. Default credentials: `admin` / `admin`. Change in the settings.

> Grocy has companion Android and iOS apps for on-the-go barcode scanning — point them at your server URL.

---

## Joplin Server (Notes Sync Backend)

**Purpose:** Self-hosted sync server for Joplin — the open-source, end-to-end encrypted note-taking app available on Linux, macOS, Windows, iOS, and Android. Joplin clients store notes locally and sync via your server — no cloud subscription required. Supports notebooks, tags, Markdown, attachments, and end-to-end encryption with your own key.

```yaml
# ~/joplin/compose.yaml
services:
  joplin:
    image: joplin/server:latest
    ports: ["127.0.0.1:22300:22300"]
    environment:
      APP_BASE_URL: https://joplin.home.local
      APP_PORT: 22300
      DB_CLIENT: pg
      POSTGRES_HOST: db
      POSTGRES_PORT: 5432
      POSTGRES_DATABASE: joplin
      POSTGRES_USER: joplin
      POSTGRES_PASSWORD: changeme
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: joplin
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: joplin
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/joplin && podman-compose up -d
```

Access at `http://localhost:22300`. Default admin credentials: `admin@localhost` / `admin` — change immediately. In the Joplin desktop or mobile app, go to Settings → Synchronisation → Joplin Server and enter your server URL with a user account.

---

## Penpot (Open-Source Design Tool)

**Purpose:** Self-hosted, browser-based design and prototyping tool — a Figma alternative. Create UI mockups, design systems, interactive prototypes, and export assets, all in a collaborative environment where multiple users work on the same file simultaneously. Fully vector-based, exports SVG and CSS, and integrates with developer handoff workflows.

```yaml
# ~/penpot/compose.yaml
services:
  penpot-frontend:
    image: penpotapp/frontend:latest
    ports: ["127.0.0.1:9001:80"]
    environment:
      PENPOT_FLAGS: enable-registration enable-login
    restart: unless-stopped

  penpot-backend:
    image: penpotapp/backend:latest
    environment:
      PENPOT_FLAGS: enable-registration enable-login
      PENPOT_PUBLIC_URI: https://design.home.local
      PENPOT_DATABASE_URI: postgresql://penpot:changeme@db/penpot
      PENPOT_REDIS_URI: redis://redis/0
      PENPOT_STORAGE_BACKEND: fs
      PENPOT_STORAGE_FS_DIRECTORY: /opt/data/assets
      PENPOT_SECRET_KEY: changeme-run-openssl-rand-hex-32
    volumes:
      - /home/user/penpot/assets:/opt/data/assets:Z
    depends_on: [db, redis]
    restart: unless-stopped

  penpot-exporter:
    image: penpotapp/exporter:latest
    environment:
      PENPOT_PUBLIC_URI: https://design.home.local
      PENPOT_REDIS_URI: redis://redis/0
    depends_on: [redis]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: penpot
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: penpot
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/penpot && podman-compose up -d
```

Access at `http://localhost:9001`. Create a team workspace, invite collaborators, and design with real-time multiplayer editing.

---

## Memos (Lightweight Personal Notes)

**Purpose:** Fast, Twitter-style self-hosted memo and personal knowledge base. Jot down fleeting notes, ideas, and links in a microblog-style feed — each memo is a short, tagged Markdown entry. No folders, no hierarchy — just a searchable, filterable stream. Much lighter than Outline or BookStack when you just need a scratchpad.

```yaml
# ~/memos/compose.yaml
services:
  memos:
    image: neosmemo/memos:stable
    ports:
      - 127.0.0.1:5230:5230
    volumes:
      - /home/user/memos/data:/var/opt/memos:Z
    environment:
      TZ: Asia/Kolkata
    restart: unless-stopped
```

```bash
cd ~/memos && podman-compose up -d
```

Access at `http://localhost:5230`. Create an account, start writing memos with `#tags` and Markdown. The REST API allows posting from scripts, CLI aliases, or mobile shortcuts — useful for quick capture from anywhere on your Tailscale network.

---

## AFFiNE (Collaborative Knowledge Base)

**Purpose:** A modern, open-source alternative to Notion and Miro combined. AFFiNE merges a block-based document editor, a whiteboard canvas, and a database view into one tool. Pages can switch between document mode (writing) and edgeless mode (infinite canvas/whiteboard) without creating separate files. Self-hosted, offline-capable, and with real-time collaboration via WebSocket. A strong Notion replacement that keeps all data local.

```yaml
# ~/affine/compose.yaml
services:
  affine:
    image: ghcr.io/toeverything/affine-graphql:stable
    ports: ["127.0.0.1:3010:3010"]
    environment:
      NODE_OPTIONS: "--import=./scripts/register.js"
      AFFINE_CONFIG_PATH: /root/.affine/config
      DATABASE_URL: postgresql://affine:changeme@db:5432/affine
      REDIS_SERVER_HOST: redis
    volumes:
      - /home/user/affine/config:/root/.affine/config:Z
      - /home/user/affine/storage:/root/.affine/storage:Z
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: affine
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: affine
    volumes: [pg_data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U affine"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/affine && podman-compose up -d
```

Access at `http://localhost:3010`. Create a workspace, sign in, and start creating pages. Toggle between document and whiteboard mode with the view switcher.

> **vs Outline:** AFFiNE is better for mixed document+canvas work and personal knowledge management. Outline is better for team wikis and structured documentation.

> **Stable release:** AFFiNE has exited beta — the compose above uses `ghcr.io/toeverything/affine-graphql:stable`, which is the production-ready tag. The `latest` tag may include canary features that are not yet stable; prefer `stable` for homelab deployments.

**Caddy:**
```caddyfile
affine.home.local { tls internal; reverse_proxy localhost:3010 }
```

---

## Hoarder (AI-Powered Bookmark Manager)

**Purpose:** A self-hosted bookmark manager that uses a local LLM (via Ollama) to automatically tag and summarise every saved link. Paste a URL, and Hoarder fetches the page, extracts the content, generates tags, and writes a summary — making your bookmarks searchable and organised without any manual effort. Also saves full-page screenshots and supports highlights. A smarter replacement for Linkwarden or Wallabag when you want automatic organisation.

```yaml
# ~/hoarder/compose.yaml
services:
  web:
    image: ghcr.io/hoarder-app/hoarder:latest
    ports: ["127.0.0.1:3055:3000"]
    environment:
      NEXTAUTH_SECRET: changeme-run-openssl-rand-hex-32
      NEXTAUTH_URL: https://hoarder.home.local
      DATA_DIR: /data
      MEILI_ADDR: http://meilisearch:7700
      MEILI_MASTER_KEY: changeme
      BROWSER_WEB_URL: http://chrome:9222
      OLLAMA_BASE_URL: http://host.containers.internal:11434
      INFERENCE_TEXT_MODEL: llama3.2
      INFERENCE_IMAGE_MODEL: llava
      DISABLE_SIGNUPS: "true"
    volumes:
      - /home/user/hoarder/data:/data:Z
    depends_on: [meilisearch, chrome]
    restart: unless-stopped

  chrome:
    image: gcr.io/zenika-hub/alpine-chrome:latest
    command: chromium-browser --disable-gpu --headless --no-sandbox --remote-debugging-address=0.0.0.0 --remote-debugging-port=9222
    restart: unless-stopped

  meilisearch:
    image: getmeili/meilisearch:latest
    environment:
      MEILI_MASTER_KEY: changeme
      MEILI_NO_ANALYTICS: "true"
    volumes: [meili_data:/meili_data]
    restart: unless-stopped

volumes:
  meili_data:
```

```bash
cd ~/hoarder && podman-compose up -d
```

Access at `http://localhost:3055`. Create an account (signups are disabled after the first — set `DISABLE_SIGNUPS: "false"` to allow more users). Save bookmarks via the web UI, browser extension, or mobile share sheet.

> Pull the `llava` multimodal model for screenshot understanding: `podman exec ollama ollama pull llava`. Without it, Hoarder still summarises text content using the text model.

**Caddy:**
```caddyfile
hoarder.home.local { tls internal; reverse_proxy localhost:3055 }
```

---

---

## Excalidraw (Collaborative Whiteboard)

**Purpose:** Self-hosted virtual whiteboard with a hand-drawn aesthetic. Sketch architecture diagrams, wireframes, flowcharts, and brainstorm maps — either solo or with your team in real-time. No account required; drawings are stored in the browser or exported as `.excalidraw` or SVG. Much simpler than Penpot for quick sketches and team whiteboarding sessions.

```yaml
# ~/excalidraw/compose.yaml
services:
  excalidraw:
    image: excalidraw/excalidraw:latest
    ports:
      - 127.0.0.1:3700:80
    restart: unless-stopped
```

```bash
cd ~/excalidraw && podman-compose up -d
```

> Excalidraw is a pure frontend — no database, no persistent server state. All data lives in the browser's local storage or in exported files. For real-time collaboration, the official backend (`@excalidraw/excalidraw-room`) is a separate WebSocket service:

```yaml
# Add to the same compose.yaml for live collaboration
  excalidraw-room:
    image: excalidraw/excalidraw-room:latest
    ports:
      - 127.0.0.1:3701:80
    restart: unless-stopped
```

**Caddy:**
```caddyfile
draw.home.local { tls internal; reverse_proxy localhost:3700 }
```

---

## Cal.com (Scheduling & Booking)

**Purpose:** Self-hosted Calendly alternative with a complete scheduling infrastructure. Define your availability, create booking pages for different meeting types, connect a CalDAV calendar, set buffer times and limits, and let invitees book a slot without back-and-forth emails. Supports team scheduling, round-robin assignment, collective bookings, and webhooks. Much richer than Rallly for full scheduling automation.

```yaml
# ~/calcom/compose.yaml
services:
  calcom:
    image: calcom/cal.com:latest
    ports:
      - 127.0.0.1:3900:3000
    environment:
      DATABASE_URL: postgresql://calcom:changeme@db:5432/calcom
      NEXTAUTH_URL: https://cal.example.com
      NEXTAUTH_SECRET: changeme-run-openssl-rand-hex-32
      CALCOM_LICENSE_KEY: ""   # leave blank for self-hosted Community Edition
      EMAIL_FROM: noreply@example.com
      EMAIL_SERVER_HOST: host.containers.internal
      EMAIL_SERVER_PORT: "25"
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: calcom
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: calcom
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/calcom && podman-compose up -d
```

**Run DB migrations on first start:**
```bash
podman exec calcom npx prisma db push
```

Access at `http://localhost:3900`. Create your first user account, connect a calendar, and set your working hours.

**Caddy:**
```caddyfile
cal.example.com { reverse_proxy localhost:3900 }
```

---

## Limesurvey (Self-Hosted Survey Platform)

**Purpose:** Full-featured, self-hosted survey platform for creating questionnaires with advanced branching logic, quotas, conditions, and multilingual support. Supports a wide range of question types (matrix, ranking, sliders, file upload), exports results to CSV and SPSS, and handles anonymous or token-based respondents. Much more powerful than Rallly — use Rallly for lightweight scheduling polls, use Limesurvey when you need real survey methodology.

```yaml
# ~/limesurvey/compose.yaml
services:
  limesurvey:
    image: martialblog/limesurvey:latest
    ports:
      - 127.0.0.1:8420:8080
    environment:
      DB_TYPE: mysql
      DB_HOST: db
      DB_PORT: "3306"
      DB_NAME: limesurvey
      DB_USERNAME: limesurvey
      DB_PASSWORD: changeme
      ADMIN_USER: admin
      ADMIN_PASSWORD: changeme
      ADMIN_NAME: Admin
      ADMIN_EMAIL: admin@example.com
      BASE_URL: https://survey.home.local
      URL_FORMAT: path
    volumes:
      - /home/user/limesurvey/upload:/var/www/html/upload:Z
      - /home/user/limesurvey/config:/var/www/html/application/config:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:10.11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: limesurvey
      MYSQL_USER: limesurvey
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/limesurvey && podman-compose up -d
```

Access at `http://localhost:8420/admin`. Log in with the admin credentials above.

**Key workflows:**
- **Create a survey:** Surveys → Create a new survey → add question groups and questions.
- **Question types:** Single/multiple choice, free text, matrix, date, file upload, ranking, slider, and more.
- **Branching logic:** Use **Conditions** on individual questions and **Relevance equations** for group-level skip logic.
- **Quota management:** Set response limits per answer option under Survey → Quotas.
- **Tokens:** Enable **Participants** to create a closed survey with invitation tokens — each token is single-use.
- **Export:** Results → Export → CSV (for spreadsheets) or SPSS format (`.sav`) for statistical analysis.

**Caddy:**
```caddyfile
survey.home.local { tls internal; reverse_proxy localhost:8420 }
```

---

## Docusaurus (Docs-as-Code Site Generator)

**Purpose:** Static documentation site generator from Meta, used by React, Webpack, Prettier, and hundreds of major OSS projects. Write docs in Markdown/MDX, version them with your code in Gitea/Forgejo, and publish a fast, searchable, professionally themed documentation site. Pairs perfectly with a Gitea CI pipeline — push to `main`, the site rebuilds automatically. Simpler and more docs-focused than WordPress or Ghost for technical documentation.

```yaml
# ~/docusaurus/compose.yaml — serves a pre-built Docusaurus site
services:
  docusaurus:
    image: nginx:alpine
    ports:
      - 127.0.0.1:8421:80
    volumes:
      - /home/user/docusaurus/build:/usr/share/nginx/html:ro,Z
    restart: unless-stopped
```

**Build the site on your workstation or in a Gitea Actions runner:**
```bash
# Scaffold a new docs site
npx create-docusaurus@latest my-docs classic
cd my-docs

# Write docs in docs/*.md, configure docusaurus.config.js
npm run build        # produces build/ directory
rsync -av build/ user@server:/home/user/docusaurus/build/
```

**Minimal `docusaurus.config.js` for a self-hosted intranet:**
```js
const config = {
  title: 'My Homelab Docs',
  url: 'https://docs.home.local',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  presets: [
    ['classic', {
      docs: { routeBasePath: '/' },  // docs at root, no landing page
      blog: false,
      theme: { customCss: './src/css/custom.css' },
    }],
  ],
};
module.exports = config;
```

**Gitea Actions workflow to auto-deploy on push:**
```yaml
# .gitea/workflows/deploy-docs.yaml
name: Deploy Docs
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci && npm run build
      - name: Deploy to server
        run: rsync -av --delete build/ user@docs-server:/home/user/docusaurus/build/
```

**Caddy:**
```caddyfile
docs.home.local { tls internal; reverse_proxy localhost:8421 }
```

> Docusaurus supports Algolia DocSearch for full-text search in production. For a self-hosted alternative, use the [local search plugin](https://github.com/easyops-cn/docusaurus-search-local) which generates a client-side index at build time — no external service needed.

---

## Taiga (Agile Project Management)

**Purpose:** Mature, full-featured Agile project management platform covering Scrum and Kanban workflows. Supports sprints, epics, user stories, tasks, issues, and a backlog — a true Jira alternative for teams that want open-source self-hosting. Complements Planka (which is lightweight Kanban-only) with proper Scrum ceremonies: sprint planning, backlog refinement, velocity tracking, and burndown charts.

```yaml
# ~/taiga/compose.yaml
services:
  taiga-db:
    image: postgres:12.3
    environment:
      POSTGRES_DB: taiga
      POSTGRES_USER: taiga
      POSTGRES_PASSWORD: changeme
    volumes: [taiga_db:/var/lib/postgresql/data]
    restart: unless-stopped

  taiga-back:
    image: taigaio/taiga-back:latest
    ports: ["127.0.0.1:8003:8000"]
    environment:
      TAIGA_SECRET_KEY: changeme-run-openssl-rand-hex-32
      TAIGA_SITES_DOMAIN: taiga.home.local
      TAIGA_SITES_SCHEME: https
      POSTGRES_DB: taiga
      POSTGRES_USER: taiga
      POSTGRES_PASSWORD: changeme
      POSTGRES_HOST: taiga-db
      RABBITMQ_USER: taiga
      RABBITMQ_PASS: changeme
      RABBITMQ_VHOST: taiga
      RABBITMQ_HOST: taiga-rabbitmq
      RABBITMQ_PORT: "5672"
    depends_on: [taiga-db, taiga-rabbitmq]
    volumes:
      - /home/user/taiga/static:/taiga-back/static:Z
      - /home/user/taiga/media:/taiga-back/media:Z
    restart: unless-stopped

  taiga-front:
    image: taigaio/taiga-front:latest
    ports: ["127.0.0.1:8004:80"]
    environment:
      TAIGA_URL: https://taiga.home.local
      TAIGA_WEBSOCKETS_URL: wss://taiga.home.local
    restart: unless-stopped

  taiga-events:
    image: taigaio/taiga-events:latest
    environment:
      RABBITMQ_USER: taiga
      RABBITMQ_PASS: changeme
      RABBITMQ_VHOST: taiga
      RABBITMQ_HOST: taiga-rabbitmq
      TAIGA_SECRET_KEY: changeme-run-openssl-rand-hex-32
    depends_on: [taiga-rabbitmq]
    restart: unless-stopped

  taiga-async:
    image: taigaio/taiga-back:latest
    entrypoint: ["/taiga-back/docker/async_entrypoint.sh"]
    environment:
      TAIGA_SECRET_KEY: changeme-run-openssl-rand-hex-32
      POSTGRES_DB: taiga
      POSTGRES_USER: taiga
      POSTGRES_PASSWORD: changeme
      POSTGRES_HOST: taiga-db
      RABBITMQ_USER: taiga
      RABBITMQ_PASS: changeme
      RABBITMQ_VHOST: taiga
      RABBITMQ_HOST: taiga-rabbitmq
    depends_on: [taiga-db, taiga-rabbitmq]
    restart: unless-stopped

  taiga-rabbitmq:
    image: rabbitmq:3.8-management-alpine
    environment:
      RABBITMQ_ERLANG_COOKIE: changeme
      RABBITMQ_DEFAULT_USER: taiga
      RABBITMQ_DEFAULT_PASS: changeme
      RABBITMQ_DEFAULT_VHOST: taiga
    restart: unless-stopped

volumes:
  taiga_db:
```

```bash
cd ~/taiga && podman-compose up -d
```

Access the frontend at `http://localhost:8004`. On first load, register an admin account. Default project types include Scrum and Kanban — choose during project creation.

**Key workflows:**
- **Scrum:** Create a project → add User Stories to the backlog → plan sprints → track velocity per sprint on the dashboard.
- **Kanban:** Create a Kanban project → manage the board swimlanes → set WIP limits per column.
- **Epics:** Group related user stories under an Epic for high-level roadmap tracking.
- **Issues:** Track bugs and support requests separately from user stories in the Issues module.

**Caddy:**
```caddyfile
taiga.home.local {
  tls internal
  # Frontend
  reverse_proxy /api/* localhost:8003
  reverse_proxy /admin/* localhost:8003
  reverse_proxy /static/* localhost:8003
  reverse_proxy /media/* localhost:8003
  reverse_proxy /* localhost:8004
}
```

> **Planka vs Taiga:** Use Planka for simple personal Kanban boards with minimal setup. Use Taiga when you need Scrum sprints, epics, velocity charts, and a full agile workflow for a team.

---

**Cross-repository wiki as a standalone CMS:**

For a shared knowledge base that isn't tied to a specific repo, create a dedicated repository called `wiki` or `docs` and use its built-in wiki:

```bash
# Create a bare wiki repository via Gitea API
curl -X POST https://gitea.home.local/api/v1/user/repos \
  -H "Authorization: token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"wiki","private":true,"has_wiki":true}'
```

> The Gitea wiki doesn't support custom themes or plugins — it renders plain Markdown with a fixed layout. For structured, navigable documentation with nested categories and search, use BookStack or Wiki.js. For docs-as-code with a custom site, use Docusaurus.

---

## Docmost (Modern Wiki & Knowledge Base)

**Purpose:** Actively developed, modern wiki and knowledge base with a clean block-based editor (similar to Notion). Supports nested pages, workspaces, real-time collaborative editing, comments, and permissions. Lighter and easier to self-host than Outline, with better out-of-the-box ergonomics — no mandatory OIDC setup, simpler environment variables, and a single-container option. A strong alternative when Outline feels heavyweight or requires too many dependencies.

```yaml
# ~/docmost/compose.yaml
services:
  docmost:
    image: docmost/docmost:latest
    ports:
      - 127.0.0.1:3800:3000
    environment:
      APP_URL: https://wiki.home.local
      APP_SECRET: changeme-run-openssl-rand-hex-32
      DATABASE_URL: postgresql://docmost:changeme@db:5432/docmost
      REDIS_URL: redis://redis:6379
    volumes:
      - /home/user/docmost/storage:/app/data/storage:Z
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: docmost
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: docmost
    volumes: [pg_data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U docmost"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/docmost && podman-compose up -d
```

Access at `http://localhost:3800`. On first run, complete the setup wizard to create your workspace and first admin user.

**Common operations:**
```bash
# View logs
podman logs -f docmost

# Run database migrations manually (after upgrade)
podman exec docmost node ace migration:run

# Backup storage (attachments and uploads)
rsync -av /home/user/docmost/storage/ backup:/docmost-storage/
```

**Key features:**
- Block-based editor with slash commands (`/` to insert headings, tables, code blocks, callouts, embeds)
- Nested page hierarchy — pages can have unlimited child pages
- Real-time multiplayer editing via WebSocket
- Per-workspace and per-page permissions
- Comments and inline mentions
- Full-text search across all pages

**Caddy:**
```caddyfile
wiki.home.local { tls internal; reverse_proxy localhost:3800 }
```

> **Docmost vs Outline:** Docmost requires fewer dependencies (no MinIO/S3 for storage — files go to the local volume), has no mandatory SSO requirement, and is faster to get running. Outline has a more mature ecosystem and stronger integrations. For a solo or small-team homelab wiki, Docmost is the easier starting point.


## Caddy Configuration

```caddyfile
files.home.local     { tls internal; reverse_proxy localhost:8888 }
sync.home.local      { tls internal; reverse_proxy localhost:8384 }
docs.home.local      { tls internal; reverse_proxy localhost:8000 }
tasks.home.local     { tls internal; reverse_proxy localhost:3456 }
wiki.home.local      { tls internal; reverse_proxy localhost:3030 }
recipes.home.local   { tls internal; reverse_proxy localhost:9925 }
pdf.home.local       { tls internal; reverse_proxy localhost:8080 }
n8n.example.com      { reverse_proxy localhost:5678 }
blog.example.com     { reverse_proxy localhost:2368 }
site.example.com     { reverse_proxy localhost:8100 }
bookstack.home.local { tls internal; reverse_proxy localhost:6875 }
wikijs.home.local    { tls internal; reverse_proxy localhost:3300 }
notes.home.local     { tls internal; reverse_proxy localhost:3400 }
pad.home.local       { tls internal; reverse_proxy localhost:3500 }
rss.home.local       { tls internal; reverse_proxy localhost:8200 }
read.home.local      { tls internal; reverse_proxy localhost:8250 }
links.home.local     { tls internal; reverse_proxy localhost:3210 }
crm.home.local       { tls internal; reverse_proxy localhost:8094 }
schedule.home.local  { tls internal; reverse_proxy localhost:3450 }
time.home.local      { tls internal; reverse_proxy localhost:8300 }
grocy.home.local     { tls internal; reverse_proxy localhost:9283 }
joplin.home.local    { tls internal; reverse_proxy localhost:22300 }
design.home.local    { tls internal; reverse_proxy localhost:9001 }
affine.home.local    { tls internal; reverse_proxy localhost:3010 }
hoarder.home.local   { tls internal; reverse_proxy localhost:3055 }
memos.home.local     { tls internal; reverse_proxy localhost:5230 }
draw.home.local      { tls internal; reverse_proxy localhost:3700 }
cal.example.com      { reverse_proxy localhost:3900 }
survey.home.local    { tls internal; reverse_proxy localhost:8420 }
docs-static.home.local { tls internal; reverse_proxy localhost:8421 }
taiga.home.local     { tls internal; reverse_proxy localhost:8004 }
wiki.home.local      { tls internal; reverse_proxy localhost:3800 }
```

---

## The S3 API: A Core Cloud Skill

Several tools in this wiki (MinIO in backups-sync.md, Garage, Cloudflare R2) implement the **S3-compatible API** — originally Amazon S3's interface but now a de facto standard for object storage. Understanding this API is valuable independent of which storage backend you use.

**Core operations:**

| HTTP Method | S3 Operation | What it does |
|------------|-------------|--------------|
| `PUT /bucket/key` | PutObject | Upload a file |
| `GET /bucket/key` | GetObject | Download a file |
| `DELETE /bucket/key` | DeleteObject | Delete a file |
| `GET /bucket?list-type=2` | ListObjectsV2 | List objects in a bucket |
| `POST /bucket/key?uploads` | CreateMultipartUpload | Start a large upload |

**Presigned URLs** — time-limited URLs that grant access to a specific object without requiring the requester to have credentials. The URL embeds an HMAC signature valid for a configured time window. Used for secure direct downloads or uploads from untrusted clients:

```bash
# Generate a presigned URL with MinIO client (mc)
mc alias set local http://localhost:9000 admin changeme123
mc share download local/my-bucket/report.pdf --expire=24h

# Or with the AWS CLI (works against MinIO with --endpoint-url)
aws s3 presign s3://my-bucket/report.pdf \
  --endpoint-url http://localhost:9000 \
  --expires-in 86400
```

**Multipart uploads** — large files (>100MB) are split into parts, uploaded in parallel, and assembled server-side. This is why Rclone's `--s3-chunk-size` flag exists — it controls the part size.

Understanding the S3 API is useful because it's the interface Restic, Rclone, Kopia, Litestream, and most cloud-native tools use for object storage. The same client code works against AWS S3, MinIO, Garage, Cloudflare R2, and Backblaze B2 — just change the endpoint URL.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Nextcloud showing `Untrusted domain` | Add your domain to `NEXTCLOUD_TRUSTED_DOMAINS` env var or `config.php` `trusted_domains` array |
| Nextcloud file sync very slow | Ensure background cron jobs are running (`php cron.php` every 5 minutes via systemd timer) |
| Syncthing devices not finding each other | Ensure ports 22000/tcp and 22000/udp are open in the firewall; verify both devices show the other as Connected |
| Paperless not consuming documents | Check the consume directory path matches the volume mount; verify file permissions allow the container user to read the files |
| Paperless email not sending | Verify `PAPERLESS_EMAIL_HOST` is reachable from inside the container; run `podman exec webserver python manage.py sendtestemail your@email.com` to test the SMTP config |
| Paperless workflow email action missing | Workflow email actions require Paperless-ngx 2.x — update to `ghcr.io/paperless-ngx/paperless-ngx:latest` and run `python manage.py migrate` |
| Miniflux database connection refused | Ensure PostgreSQL is running and the `DATABASE_URL` host/port is reachable from the container |
| Planka `SECRET_KEY must be set` | Generate one with `openssl rand -hex 64` and set it in the environment |
| Outline blank on load | OIDC configuration is likely missing or wrong — check `SECRET_KEY` and `UTILS_SECRET` are both set and non-empty |
| n8n webhook not triggering | Ensure `WEBHOOK_URL` is the publicly accessible URL; check that Caddy or the tunnel is proxying correctly |
| Vikunja CalDAV not syncing | Ensure `VIKUNJA_SERVICE_FRONTENDURL` matches the URL your client connects to; CalDAV endpoint is at `/dav` |
| Ghost `404` on homepage | Verify `url` in the Ghost environment matches the actual domain you're accessing |
| WordPress white screen of death | Check PHP error logs with `podman logs wordpress`; often a plugin conflict — disable plugins from the DB if the admin panel is inaccessible |
| BookStack blank after setup | Check `APP_URL` includes the correct scheme (`https://`); clear cache with `podman exec bookstack php artisan config:cache` |
| Wiki.js page save fails | Ensure the PostgreSQL user has `CREATE` privileges; check `podman logs wikijs` for SQL errors |
| HedgeDoc realtime not working | WebSocket proxying must be enabled — add `reverse_proxy` with `header_up Upgrade {http.request.header.Upgrade}` in Caddy |
| CryptPad sandbox not loading | Ensure both domains (`pad.*` and `sandbox.*`) resolve and are proxied; CryptPad enforces same-origin policy via the sandbox domain |
| FreshRSS feeds not updating | Check `CRON_MIN` is set; verify outbound internet access; check feed URLs are valid in the admin panel |
| Wallabag import fails | Large imports time out — use the background queue: run `podman exec wallabag bin/console wallabag:import:redis-worker` |
| Linkwarden archive not working | The archiving feature requires Chromium — ensure the container has network access to fetch pages |
| Monica `APP_KEY` error | Generate with `podman exec monica php artisan key:generate --show` and set the result as `APP_KEY` |
| Rallly invitees can't vote | Verify `NEXT_PUBLIC_BASE_URL` is accessible from outside your server; voters don't need accounts but do need to reach the URL |
| Kimai time entries not saving | Check `DATABASE_URL` connection string; run `podman exec kimai bin/console kimai:update` after first startup |
| Grocy barcode scanner not finding products | Grocy uses the Open Food Facts database — scan a barcode and manually add the product if it's not found automatically |
| Joplin Server sync fails | Verify `APP_BASE_URL` matches the URL clients connect to; check the user account exists and has the correct password; ensure PostgreSQL is reachable |
| Penpot blank canvas | Clear browser cache; verify the exporter container is running — it handles PDF/PNG export and some rendering tasks |
| Memos notes not persisting | Ensure the `/var/opt/memos` volume is correctly mounted with write permissions; SQLite database lives there |
| AFFiNE blank after startup | Wait 30–60 s for the database migrations to complete; check `podman logs affine` for PostgreSQL connection errors; ensure the DB health check passes before the app starts |
| Hoarder bookmarks not summarising | Ensure Ollama is running and the `llama3.2` model is pulled; check `OLLAMA_BASE_URL` uses `host.containers.internal`; view task logs in the Hoarder admin panel |
| Hoarder screenshots blank | The `chrome` container must be running and port `9222` reachable; check `podman logs chrome` for startup errors |
| Excalidraw real-time collaboration not syncing | Confirm the `excalidraw-room` WebSocket container is running; the frontend must be configured with the room server URL in its environment |
| Cal.com blank page after deploy | Run `podman exec calcom npx prisma db push` to apply DB migrations; check `NEXTAUTH_URL` exactly matches the URL you access it from |
| Cal.com booking emails not sending | Verify `EMAIL_SERVER_HOST` and `EMAIL_SERVER_PORT` point at a working SMTP relay; check Cal.com logs for mailer errors |
| Limesurvey blank page after install | Ensure `BASE_URL` matches the exact URL you're accessing; check `podman logs limesurvey` for PHP errors; verify the MariaDB container is healthy |
| Limesurvey email invitations not sending | Configure SMTP under Global Settings → Email settings in the admin panel; test with the built-in email test button |
| Limesurvey CSV export missing data | Ensure the survey is set to store responses — check Survey → Settings → Responses → check `Save IP address` and `Save timings` options are as expected |
| Docusaurus build fails | Run `npm run build` locally first to catch broken links and MDX syntax errors before deploying; check `onBrokenLinks` is set to `'throw'` to catch issues early |
| Taiga frontend blank / API errors | Verify `TAIGA_URL` in the frontend env matches the domain you're accessing exactly; confirm `taiga-back` is reachable and healthy — check `podman logs taiga-back` |
| Taiga websocket events not updating | The `taiga-events` service must be running and connected to RabbitMQ; check `podman logs taiga-events`; verify the `taiga-rabbitmq` container is healthy |
| Taiga async tasks not processing | The `taiga-async` worker must be running alongside the backend — verify it shows as running with `podman ps`; check RabbitMQ queue depth at `http://localhost:15672` |
| Docmost editor not saving | Verify Redis is running — real-time collaboration and caching depend on it; check `podman logs docmost` for Redis connection errors |
| Docmost storage attachments missing after migration | The `/app/data/storage` volume must be preserved across upgrades; ensure the volume mount path hasn't changed in the compose file |
