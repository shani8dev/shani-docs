---
title: Productivity & Files
section: Self-Hosting & Servers
updated: 2026-04-16
---

# Productivity & Files

Self-hosted cloud storage, task management, finance tracking, and document control.

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
    volumes: [nc_data:/var/www/html]
    depends_on: [db, redis]
    restart: unless-stopped
volumes: {db_data: {}, nc_data: {}}
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
```
> **Firewall**: Allow ports 22000/tcp, 22000/udp, 21027/udp for external peers.

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

## Planka
**Purpose**: Open-source Kanban board alternative to Trello. Supports real-time updates, labels, checklists, and project timelines.
```bash
podman run -d \
  --name planka \
  -p 127.0.0.1:3000:3000 \
  -v /home/user/planka/data:/app/public/user-avatars:Z \
  -e DATABASE_URL=postgresql://user:pass@host:5432/planka \
  -e SECRET_KEY=changeme \
  --restart unless-stopped \
  ghcr.io/plankanban/planka:latest
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
    volumes: [pg_data:/var/lib/postgresql/data]
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
      - /home/user/paperless/data:/usr/src/paperless/data:Z
      - /home/user/paperless/media:/usr/src/paperless/media:Z
      - /home/user/Documents/inbox:/usr/src/paperless/consume:Z
    depends_on: [broker, db]
    restart: unless-stopped
```

## Mealie / Grocy / Miniflux / LinkWarden
**Purpose**: Recipe manager, home ERP, RSS reader, and bookmark manager.
```bash
# Mealie
podman run -d \
  --name mealie \
  -p 127.0.0.1:9925:9000 \
  -e BASE_URL=https://recipes.example.com \
  -v /home/user/mealie/data:/app/data:Z \
  --restart unless-stopped \
  ghcr.io/mealie-recipes/mealie:latest

# Grocy
podman run -d \
  --name grocy \
  -p 127.0.0.1:9283:80 \
  -e PUID=1000 -e PGID=1000 \
  -v /home/user/grocy/config:/config:Z \
  --restart unless-stopped \
  lscr.io/linuxserver/grocy:latest

# Miniflux
podman run -d \
  --name miniflux \
  -p 127.0.0.1:8080:8080 \
  -e DATABASE_URL="postgres://miniflux:password@localhost/miniflux?sslmode=disable" \
  -e RUN_MIGRATIONS=1 \
  -e CREATE_ADMIN=1 \
  -e ADMIN_PASSWORD=changeme \
  --restart unless-stopped \
  miniflux/miniflux:latest

# LinkWarden
podman run -d \
  --name linkwarden \
  -p 127.0.0.1:3000:3000 \
  -e DATABASE_URL="mongodb://localhost:27017/linkwarden" \
  -e NEXTAUTH_SECRET=$(openssl rand -base64 32) \
  -v /home/user/linkwarden/data:/data:Z \
  --restart unless-stopped \
  ghcr.io/linkwarden/linkwarden:latest
```

## Financial Trackers (Actual / Firefly III / Maybe / Monica)
**Purpose**: Personal finance tracking. Actual uses local-first envelope budgeting; Firefly III uses double-entry accounting; Monica is a personal CRM.
```bash
# Actual Budget
podman run -d \
  --name actual \
  -p 127.0.0.1:5006:5006 \
  -v /home/user/actual/data:/data:Z \
  --restart unless-stopped \
  actualbudget/actual-server:latest

# Monica
podman run -d \
  --name monica \
  -p 127.0.0.1:8080:80 \
  -e APP_URL=https://crm.example.com \
  -e DB_CONNECTION=mysql \
  -e DB_HOST=db \
  -e DB_USERNAME=monica \
  -e DB_PASSWORD=secret \
  --restart unless-stopped \
  monica

# Maybe
podman run -d \
  --name maybe \
  -p 127.0.0.1:3000:3000 \
  -v /home/user/maybe/data:/app/data:Z \
  -e DATABASE_URL=sqlite:///data/production.sqlite \
  --restart unless-stopped \
  ghcr.io/maybe-finance/maybe:latest
```
> Firefly III requires `podman-compose` with Postgres.

## Ghost / Stirling PDF
**Purpose**: Ghost is a modern publishing platform; Stirling PDF is a web-based PDF manipulation tool.
```bash
# Stirling PDF
podman run -d \
  --name stirling-pdf \
  -p 127.0.0.1:8080:8080 \
  -v /home/user/stirling/trainingData:/usr/share/tessdata:Z \
  -v /home/user/stirling/extraConfigs:/configs:Z \
  --restart unless-stopped \
  frooodle/s-pdf:latest
```
> Ghost uses `podman-compose` with MySQL.
