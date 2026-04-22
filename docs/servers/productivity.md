---
title: Productivity & Files
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Productivity & Files

Self-hosted cloud storage, file sync, document management, task management, knowledge bases, and personal finance tools.

---

## Nextcloud

**Purpose:** Comprehensive self-hosted cloud suite — file sync across all your devices, calendar, contacts, collaborative document editing (via Collabora or OnlyOffice), and a mobile app that feels like Google Drive. Replaces Dropbox, Google Drive, Google Calendar, and Google Contacts simultaneously.

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

## Actual Budget

See the [Finance wiki](https://docs.shani.dev/doc/servers/finance#actual-budget) for the full Actual Budget setup.

---

## Gitea / Forgejo (Version-Controlled Config)

For teams who want to version-control their notes, runbooks, and wiki pages alongside code, Gitea is an excellent pairing with Outline or Obsidian. See the [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#gitea--forgejo) for the full setup.

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
```

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
