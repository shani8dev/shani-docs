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
# ~/nextcloud/compose.yml
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
    image: nextcloud:29
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

**Recommended apps to install:** Nextcloud Office (Collabora), Contacts, Calendar, Notes, Passwords, Talk (video calls).

---

## Syncthing

**Purpose:** Decentralised, peer-to-peer file sync with no central server. Devices sync directly with each other — encrypted, open-source, and completely private. Ideal for syncing folders across your laptop, phone, and server without a cloud account.

```bash
podman run -d \
  --name syncthing \
  -p 127.0.0.1:8384:8384 \
  -p 22000:22000/tcp \
  -p 22000:22000/udp \
  -p 21027:21027/udp \
  -v /home/user/syncthing/config:/var/syncthing/config:Z \
  -v /home/user/sync:/var/syncthing/Sync:Z \
  -e PUID=$(id -u) \
  -e PGID=$(id -g) \
  --restart unless-stopped \
  syncthing/syncthing:latest
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

```bash
podman run -d \
  --name filebrowser \
  -p 127.0.0.1:8085:80 \
  -v /home/user:/srv:Z \
  -v /home/user/filebrowser.db:/database.db:Z \
  --restart unless-stopped \
  filebrowser/filebrowser:s6
```

Default login: admin / admin. Change the password immediately after first login.

---

## Paperless-ngx

**Purpose:** Document management system with OCR. Scan paper documents, automatically index and tag their contents, and make everything full-text searchable. Drop a PDF into the consume folder and it is automatically processed and filed.

```yaml
# ~/paperless/compose.yml
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

> Drop documents into `~/Documents/inbox` — Paperless will automatically OCR, index, and file them within minutes.

---

## Planka (Kanban Board)

**Purpose:** Open-source Trello alternative. Real-time collaborative Kanban boards with cards, labels, checklists, due dates, and member assignments.

```bash
podman run -d \
  --name planka \
  -p 127.0.0.1:3000:3000 \
  -v /home/user/planka/avatars:/app/public/user-avatars:Z \
  -v /home/user/planka/background:/app/public/project-background-images:Z \
  -v /home/user/planka/attachments:/app/private/attachments:Z \
  -e DATABASE_URL=postgresql://planka:changeme@localhost:5432/planka \
  -e SECRET_KEY=$(openssl rand -hex 64) \
  -e BASE_URL=https://planka.home.local \
  --restart unless-stopped \
  ghcr.io/plankanban/planka:latest
```

> Requires a PostgreSQL instance. Run one using the command from the [Databases wiki](https://docs.shani.dev/doc/servers/databases).

---

## Vikunja (Task Management)

**Purpose:** Self-hosted to-do app and project manager. Supports tasks, projects, teams, Kanban boards, Gantt charts, and CalDAV sync for task syncing with mobile apps. Clean alternative to Todoist.

```yaml
# ~/vikunja/compose.yml
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

---

## Outline (Team Knowledge Base)

**Purpose:** Modern wiki and knowledge base with real-time collaborative editing, a clean Notion-like interface, and full Markdown support. Great for team documentation, runbooks, and personal notes.

```yaml
# ~/outline/compose.yml
services:
  outline:
    image: outlinewiki/outline:latest
    ports: ["127.0.0.1:3000:3000"]
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

> Outline requires an OIDC provider for login. Use Authentik or Zitadel configured with an Outline application.

---

## Mealie (Recipe Manager)

**Purpose:** Self-hosted recipe manager with web scraping (import recipes from any URL), meal planning, shopping list generation, and household sharing.

```bash
podman run -d \
  --name mealie \
  -p 127.0.0.1:9925:9000 \
  -e BASE_URL=https://recipes.home.local \
  -e DEFAULT_EMAIL=admin@home.local \
  -e DEFAULT_PASSWORD=changeme \
  -v /home/user/mealie/data:/app/data:Z \
  --restart unless-stopped \
  ghcr.io/mealie-recipes/mealie:latest
```

---

## Miniflux (RSS Reader)

**Purpose:** Minimal, fast RSS and Atom feed reader. No tracking, no ads, no algorithmic recommendations — just the articles from sources you choose. Supports Fever and Google Reader APIs for mobile app compatibility (Reeder, NetNewsWire).

```bash
podman run -d \
  --name miniflux \
  -p 127.0.0.1:8090:8080 \
  -e DATABASE_URL="postgres://miniflux:changeme@localhost/miniflux?sslmode=disable" \
  -e RUN_MIGRATIONS=1 \
  -e CREATE_ADMIN=1 \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=changeme \
  --restart unless-stopped \
  miniflux/miniflux:latest
```

---

## Actual Budget

See the [Finance wiki](https://docs.shani.dev/doc/servers/finance#actual-budget) for the full Actual Budget setup.

---

## n8n (Workflow Automation)

**Purpose:** Visual workflow automation with 400+ integrations — webhooks, APIs, databases, AI tools, home automation, and more. Build multi-step automations without code using a drag-and-drop node editor. Self-hosted alternative to Zapier and Make. Pairs well with Nextcloud, Gitea, and Home Assistant for event-driven workflows across your entire self-hosted stack.

```bash
podman run -d \
  --name n8n \
  -p 127.0.0.1:5678:5678 \
  -e N8N_HOST=n8n.example.com \
  -e N8N_PROTOCOL=https \
  -e WEBHOOK_URL=https://n8n.example.com \
  -v /home/user/n8n:/home/node/.n8n:Z \
  --restart unless-stopped \
  docker.n8n.io/n8nio/n8n:latest
```

**Caddy:**
```caddyfile
n8n.example.com { reverse_proxy localhost:5678 }
```

> n8n webhooks require a publicly accessible URL. Use a Cloudflare Tunnel or Pangolin for internet-facing webhooks without opening firewall ports — see the [VPN & Tunnels wiki](https://docs.shani.dev/doc/servers/vpn-tunnels).

---

## Stirling PDF

**Purpose:** Web-based PDF Swiss Army knife. Merge, split, compress, convert, rotate, watermark, OCR, edit metadata, and more — all locally, no files uploaded to third-party services.

```bash
podman run -d \
  --name stirling-pdf \
  -p 127.0.0.1:8080:8080 \
  -v /home/user/stirling/trainingData:/usr/share/tessdata:Z \
  -v /home/user/stirling/extraConfigs:/configs:Z \
  -e DOCKER_ENABLE_SECURITY=false \
  --restart unless-stopped \
  frooodle/s-pdf:latest
```

---

## Caddy Configuration

```caddyfile
files.home.local     { tls internal; reverse_proxy localhost:8888 }
sync.home.local      { tls internal; reverse_proxy localhost:8384 }
docs.home.local      { tls internal; reverse_proxy localhost:8000 }
tasks.home.local     { tls internal; reverse_proxy localhost:3456 }
wiki.home.local      { tls internal; reverse_proxy localhost:3000 }
recipes.home.local   { tls internal; reverse_proxy localhost:9925 }
pdf.home.local       { tls internal; reverse_proxy localhost:8080 }
n8n.example.com      { reverse_proxy localhost:5678 }
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Nextcloud showing `Untrusted domain` | Add your domain to `NEXTCLOUD_TRUSTED_DOMAINS` env var or `config.php` `trusted_domains` array |
| Nextcloud file sync very slow | Ensure background cron jobs are running (`php cron.php` every 5 minutes via systemd timer) |
| Syncthing devices not finding each other | Ensure ports 22000/tcp and 22000/udp are open in the firewall; verify both devices show the other as Connected |
| Paperless not consuming documents | Check the consume directory path matches the volume mount; verify file permissions allow the container user to read the files |
| Miniflux database connection refused | Ensure PostgreSQL is running and the `DATABASE_URL` host/port is reachable from the container |
| Planka `SECRET_KEY must be set` | Generate one with `openssl rand -hex 64` and set it in the environment |
| Outline blank on load | OIDC configuration is likely missing or wrong — check `SECRET_KEY` and `UTILS_SECRET` are both set and non-empty |
| n8n webhook not triggering | Ensure `WEBHOOK_URL` is the publicly accessible URL; check that Caddy or the tunnel is proxying correctly |
| Vikunja CalDAV not syncing | Ensure `VIKUNJA_SERVICE_FRONTENDURL` matches the URL your client connects to; CalDAV endpoint is at `/dav` |
