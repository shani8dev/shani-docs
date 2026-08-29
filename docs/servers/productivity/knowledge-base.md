---
title: Productivity — Wikis & Knowledge Bases
section: Self-Hosting & Servers
updated: 2026-08-28
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

#### Common operations
```bash
# View logs
podman logs -f docmost

# Run database migrations manually (after upgrade)
podman exec docmost node ace migration:run

# Backup storage (attachments and uploads)
rsync -av /home/user/docmost/storage/ backup:/docmost-storage/
```

#### Key features
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

#### Build the site on your workstation or in a Gitea Actions runner
```bash
# Scaffold a new docs site
npx create-docusaurus@latest my-docs classic
cd my-docs

# Write docs in docs/*.md, configure docusaurus.config.js
npm run build        # produces build/ directory
rsync -av build/ user@server:/home/user/docusaurus/build/
```

##### Minimal `docusaurus.config.js` for a self-hosted intranet

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

#### Gitea Actions workflow to auto-deploy on push
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

