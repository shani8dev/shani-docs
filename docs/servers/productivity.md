---
title: Productivity & Files
section: Self-Hosting & Servers
updated: 2026-04-16
---

# Productivity & Files

Self-hosted alternatives to Google Drive, Dropbox, Trello, Evernote, and financial trackers. Keep your documents, tasks, and finances under your control.

## Nextcloud
**Purpose**: Comprehensive productivity suite offering file sync, calendar, contacts, office editing, and collaborative workspaces.
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
    volumes: [db_/var/lib/mysql]
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
    volumes: [nc_/var/www/html]
    depends_on: [db, redis]
    restart: unless-stopped
volumes: {db_ {}, nc_ {}}
```
```bash
mkdir -p ~/nextcloud
podman-compose -f ~/nextcloud/compose.yml up -d
```

## Syncthing
**Purpose**: Decentralized, peer-to-peer file synchronization. No central server required. Encrypted, open-source, and ideal for cross-device file mirroring.
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
# Open firewall ports
sudo firewall-cmd --add-port=22000/tcp --permanent
sudo firewall-cmd --add-port=22000/udp --permanent
sudo firewall-cmd --add-port=21027/udp --permanent
sudo firewall-cmd --reload
```

## Filebrowser
**Purpose**: Lightweight web-based file manager. Provides a clean UI to browse, upload, download, and edit files on the host server.
```bash
podman run -d \
  --name filebrowser \
  -p 127.0.0.1:8085:80 \
  -v /home/user:/srv:Z \
  -v /home/user/filebrowser.db:/database.db:Z \
  --restart unless-stopped \
  filebrowser/filebrowser:s6
```

## Outline
**Purpose**: Fast, collaborative wiki and knowledge base. Notion-like interface with Markdown support, real-time editing, and team permissions. Requires Postgres + Redis + S3.
```bash
mkdir -p ~/outline && cd ~/outline
# Use official compose.yml
podman-compose up -d
```

## Planka
**Purpose**: Open-source Kanban board alternative to Trello. Supports real-time updates, labels, checklists, and project timelines.
```bash
podman run -d \
  --name planka \
  -p 127.0.0.1:3000:3000 \
  -v /home/user/planka//app/public/user-avatars:Z \
  -e DATABASE_URL=postgresql://user:pass@host:5432/planka \
  -e SECRET_KEY=changeme \
  --restart unless-stopped \
  ghcr.io/plankanban/planka:latest
```

## Mealie
**Purpose**: Recipe manager and meal planner. Import recipes via URL, generate shopping lists, and organize meal plans with a modern UI.
```bash
podman run -d \
  --name mealie \
  -p 127.0.0.1:9925:9000 \
  -e BASE_URL=https://recipes.example.com \
  -v /home/user/mealie/data:/app/data:Z \
  --restart unless-stopped \
  ghcr.io/mealie-recipes/mealie:latest
```

## Grocy
**Purpose**: ERP system for your home. Track groceries, chores, battery health, inventory, and meal planning with barcode scanning.
```bash
podman run -d \
  --name grocy \
  -p 127.0.0.1:9283:80 \
  -e PUID=1000 -e PGID=1000 \
  -v /home/user/grocy/config:/config:Z \
  --restart unless-stopped \
  lscr.io/linuxserver/grocy:latest
```

## Paperless-ngx
**Purpose**: Document management system with OCR. Scan paper documents, automatically index content, and make everything searchable.
```yaml
# ~/paperless/compose.yml
services:
  broker:
    image: redis:7-alpine
    restart: unless-stopped
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: paperless
      POSTGRES_USER: paperless
      POSTGRES_PASSWORD: paperless
    volumes: [pg_/var/lib/postgresql/data]
    restart: unless-stopped
  webserver:
    image: ghcr.io/paperless-ngx/paperless-ngx:latest
    ports: ["127.0.0.1:8000:8000"]
    environment:
      PAPERLESS_REDIS: redis://broker:6379
      PAPERLESS_DBHOST: db
      PAPERLESS_OCR_LANGUAGE: eng
      PAPERLESS_TIME_ZONE: Europe/London
    volumes:
      - /home/user/paperless/data:/usr/src/paperless/Z
      - /home/user/paperless/media:/usr/src/paperless/media:Z
      - /home/user/Documents/inbox:/usr/src/paperless/consume:Z
    depends_on: [broker, db]
    restart: unless-stopped
```
```bash
mkdir -p ~/paperless && cd ~/paperless
podman-compose -f ~/paperless/compose.yml up -d
```

## Miniflux
**Purpose**: Minimalist, opinionated RSS/Atom feed reader. Focuses on speed, privacy, and keyboard navigation with a clean web UI.
```bash
podman run -d \
  --name miniflux \
  -p 127.0.0.1:8080:8080 \
  -e DATABASE_URL="postgres://miniflux:password@localhost/miniflux?sslmode=disable" \
  -e RUN_MIGRATIONS=1 \
  -e CREATE_ADMIN=1 \
  -e ADMIN_PASSWORD=changeme \
  --restart unless-stopped \
  miniflux/miniflux:latest
```

## LinkWarden
**Purpose**: Collaborative bookmark and link manager. Save URLs, take screenshots, tag content, and share collections with teams.
```bash
podman run -d \
  --name linkwarden \
  -p 127.0.0.1:3000:3000 \
  -e DATABASE_URL="mongodb://localhost:27017/linkwarden" \
  -e NEXTAUTH_SECRET=$(openssl rand -base64 32) \
  -v /home/user/linkwarden/data:/data/Z \
  --restart unless-stopped \
  ghcr.io/linkwarden/linkwarden:latest
```

## Financial Trackers
**Purpose**: Personal finance tracking. Actual Budget uses local-first envelope budgeting; Firefly III uses double-entry accounting.
```bash
# Actual Budget
podman run -d \
  --name actual \
  -p 127.0.0.1:5006:5006 \
  -v /home/user/actual/data:/Z \
  --restart unless-stopped \
  actualbudget/actual-server:latest

# Firefly III
podman-compose -f ~/firefly/compose.yml up -d
```

## Publishing & PDF Tools
**Ghost**: Modern publishing platform for newsletters and blogs.
```bash
mkdir -p ~/ghost && cd ~/ghost
# Use compose.yml defining ghost and mysql services
podman-compose up -d
```

**Stirling PDF**: Powerful web-based PDF manipulation tool.
```bash
podman run -d \
  --name stirling-pdf \
  -p 127.0.0.1:8080:8080 \
  -v /home/user/stirling/trainingData:/usr/share/tessZ \
  -v /home/user/stirling/extraConfigs:/configs:Z \
  --restart unless-stopped \
  frooodle/s-pdf:latest
```
