---
title: Productivity — Project Management & CRM
section: Self-Hosting & Servers
updated: 2026-08-28
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

#### Key workflows
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

#### Cross-repository wiki as a standalone CMS

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


---

## Leantime (Project Management)

**Purpose:** Open-source project management for non-project-managers. Covers the full project lifecycle: ideation → strategic goals → milestones → tasks → retros. Combines Kanban boards, Gantt charts, time tracking, and a built-in lean canvas — without the complexity of Jira. Good Basecamp or Linear alternative.

```yaml
# ~/leantime/compose.yml
services:
  leantime:
    image: leantime/leantime:latest
    ports: ["127.0.0.1:8600:80"]
    environment:
      LEAN_DB_HOST: db
      LEAN_DB_USER: leantime
      LEAN_DB_PASSWORD: changeme
      LEAN_DB_DATABASE: leantime
      LEAN_SESSION_PASSWORD: changeme-run-openssl-rand-hex-32
      LEAN_APP_URL: https://pm.home.local
    volumes:
      - /home/user/leantime/public/userfiles:/var/www/html/public/userfiles:Z
      - /home/user/leantime/userfiles:/var/www/html/userfiles:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: leantime
      MYSQL_USER: leantime
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/leantime && podman-compose up -d
```

---

## Twenty CRM (Modern Sales CRM)

**Purpose:** Open-source CRM with a clean, Notion-inspired UI. Manage contacts, companies, deals, and tasks. Supports custom fields, relationships between records, a Kanban pipeline view, and a REST + GraphQL API. The self-hosted alternative to Salesforce Essentials or HubSpot CRM.

```yaml
# ~/twenty/compose.yml
services:
  server:
    image: twentycrm/twenty:latest
    ports: ["127.0.0.1:3700:3000"]
    environment:
      SERVER_URL: https://crm.example.com
      FRONT_BASE_URL: https://crm.example.com
      PG_DATABASE_URL: postgresql://twenty:changeme@db:5432/twenty
      REDIS_URL: redis://redis:6379
      APP_SECRET: changeme-run-openssl-rand-base64-32
    depends_on: [db, redis]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: twenty
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: twenty
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/twenty && podman-compose up -d
```

##### First run — run DB migrations

```bash
podman exec twenty yarn database:migrate:prod
```

---

## Huly (All-in-One Project Hub)

**Purpose:** Open-source alternative to Linear, Jira, and Notion combined. Issues, projects, team planning, HR (time off, members), chat, and documentation — all in one platform. Real-time collaborative editing, relations between issues, and a GraphQL API.

```yaml
# ~/huly/compose.yml — use the official template
# git clone https://github.com/hcengineering/huly-selfhost
# cd huly-selfhost && cp .env.template .env
# Edit .env (set HOST to your domain), then:
# podman-compose up -d
```

```bash
cd ~/huly && podman-compose up -d
```

For a quick local start:
```yaml
# ~/huly/compose.yaml
services:
  huly:
    image: hardcoreeng/huly:latest
    ports:
      - 127.0.0.1:8087:8083
    environment:
      SERVER_SECRET: changeme
    restart: unless-stopped
```

```bash
cd ~/huly && podman-compose up -d
```

> Huly's full stack includes separate services for the backend, front-end, collaboration engine, and MinIO storage. Use the official `huly-selfhost` compose stack for production.

---

## Plane (Open-Source Project Management)

**Purpose:** Open-source project management platform — issues, cycles (sprints), modules (epics), pages (docs), and analytics. A clean, fast alternative to Jira and Linear with a familiar kanban/list/spreadsheet view switcher, custom properties, sub-issues, and a REST + GraphQL API. Self-host your entire engineering issue tracker with no per-seat fees.

```yaml
# ~/plane/compose.yml
services:
  web:
    image: makeplane/plane-frontend:latest
    ports: ["127.0.0.1:3009:3000"]
    environment:
      NEXT_PUBLIC_API_BASE_URL: https://plane.home.local
    depends_on: [api]
    restart: unless-stopped

  api:
    image: makeplane/plane-backend:latest
    command: ./bin/beat-with-celery
    ports: ["127.0.0.1:8080:8000"]
    environment:
      SECRET_KEY: changeme-run-openssl-rand-hex-32
      POSTGRES_URL: postgresql://plane:changeme@db/plane
      REDIS_URL: redis://redis:6379/
      CORS_ALLOWED_ORIGINS: https://plane.home.local
      WEB_URL: https://plane.home.local
      EMAIL_HOST: localhost
      EMAIL_PORT: 25
      DEFAULT_FROM_EMAIL: plane@home.local
      STORAGE_CLASS: storages.backends.s3boto3.S3Boto3Storage
      AWS_S3_ENDPOINT_URL: http://host.containers.internal:9000
      AWS_ACCESS_KEY_ID: plane
      AWS_SECRET_ACCESS_KEY: changeme
      AWS_STORAGE_BUCKET_NAME: plane
    depends_on: [db, redis]
    restart: unless-stopped

  worker:
    image: makeplane/plane-backend:latest
    command: ./bin/worker
    environment:
      SECRET_KEY: changeme-run-openssl-rand-hex-32
      POSTGRES_URL: postgresql://plane:changeme@db/plane
      REDIS_URL: redis://redis:6379/
    depends_on: [db, redis]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: plane
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: plane
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/plane && podman-compose up -d
```

> Plane requires S3-compatible object storage for file attachments. Use the MinIO instance from the [Backups wiki](https://docs.shani.dev/doc/servers/backups-sync#minio-self-hosted-s3-backup-target) — create a `plane` bucket and access key.

Access at `http://localhost:3009`. Create a workspace, invite members, and start creating projects.

**Caddy:**
```caddyfile
plane.home.local { tls internal; reverse_proxy localhost:3009 }
```

---

