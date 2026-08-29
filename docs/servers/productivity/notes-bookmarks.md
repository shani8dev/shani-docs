---
title: Productivity — Notes, Bookmarks & RSS
section: Self-Hosting & Servers
updated: 2026-08-28
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

## Notesnook (End-to-End Encrypted Notes)

**Purpose:** Privacy-focused, end-to-end encrypted note-taking app. Unlike Joplin (which requires a separate sync server), Notesnook is a polished all-in-one app — the web/desktop/mobile clients sync via the Notesnook cloud, but the server-side architecture is open-source and self-hostable. Good alternative to Joplin when you want a more modern UI without setting up a separate sync backend.

> **Self-hosting Notesnook:** The server component is called `notesnook-sync-server` and is available on GitHub. Requires a MongoDB instance and environment-variable configuration. The compose setup is more complex than Joplin Server; use Joplin for straightforward homelab setups or Notesnook for teams that want the polished mobile apps.

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

#### Common operations
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

