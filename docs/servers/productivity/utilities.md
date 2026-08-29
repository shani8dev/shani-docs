---
title: Productivity — Household & Personal Utilities
section: Self-Hosting & Servers
updated: 2026-08-28
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

##### First run

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

##### Run DB migrations on first start

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

#### Key workflows
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

> n8n webhooks require a publicly accessible URL. Use a Cloudflare Tunnel or Pangolin for internet-facing webhooks without opening firewall ports — see [Cloudflared](https://docs.shani.dev/doc/networking/cloudflared) or [Pangolin](https://docs.shani.dev/doc/networking/pangolin) in the Networking wiki.

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

## Etherpad (Simple Collaborative Text Editor)

**Purpose:** The original real-time collaborative text editor. No accounts required by default — just share a pad URL and multiple users can type simultaneously. Simpler than HedgeDoc (which is Markdown-focused) or CryptPad (which is encrypted). Good for quick meeting notes, brainstorming sessions, and shared drafts.

```yaml
# ~/etherpad/compose.yaml
services:
  etherpad:
    image: etherpad/etherpad:latest
    ports:
      - 127.0.0.1:9001:9001
    environment:
      DB_TYPE: postgres
      DB_HOST: db
      DB_PORT: 5432
      DB_NAME: etherpad
      DB_USER: etherpad
      DB_PASS: changeme
      ADMIN_PASSWORD: changeme
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: etherpad
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: etherpad
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/etherpad && podman-compose up -d
```

**Caddy:**
```caddyfile
pad-simple.home.local { tls internal; reverse_proxy localhost:9001 }
```

---


---

## DocuSeal (Document Signing)

**Purpose:** Open-source document signing and e-signature platform. Upload PDFs, add signature fields, send signing links via email, and collect legally binding e-signatures — all self-hosted. The self-hosted DocuSign alternative.

```yaml
# ~/docuseal/compose.yml
services:
  docuseal:
    image: docuseal/docuseal:latest
    ports: ["127.0.0.1:3800:3000"]
    volumes:
      - /home/user/docuseal/data:/data:Z
    environment:
      DATABASE_URL: postgresql://docuseal:changeme@db:5432/docuseal
      SECRET_KEY_BASE: changeme-run-openssl-rand-hex-64
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: docuseal
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: docuseal
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/docuseal && podman-compose up -d
```

Access at `http://localhost:3800`. Create a signing template, upload a PDF, add signature fields, and send via a one-time link or email.

---


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
survey.home.local    { tls internal; reverse_proxy localhost:8420 }
docs-static.home.local { tls internal; reverse_proxy localhost:8421 }
taiga.home.local     { tls internal; reverse_proxy localhost:8004 }
wiki.home.local      { tls internal; reverse_proxy localhost:3800 }
```

---

## The S3 API: A Core Cloud Skill

Several tools in this wiki (MinIO in backups-sync.md, Garage, Cloudflare R2) implement the **S3-compatible API** — originally Amazon S3's interface but now a de facto standard for object storage. Understanding this API is valuable independent of which storage backend you use.

#### Core operations

| HTTP Method | S3 Operation | What it does |
|------------|-------------|--------------|
| `PUT /bucket/key` | PutObject | Upload a file |
| `GET /bucket/key` | GetObject | Download a file |
| `DELETE /bucket/key` | DeleteObject | Delete a file |
| `GET /bucket?list-type=2` | ListObjectsV2 | List objects in a bucket |
| `POST /bucket/key?uploads` | CreateMultipartUpload | Start a large upload |

**Presigned URLs:** — time-limited URLs that grant access to a specific object without requiring the requester to have credentials. The URL embeds an HMAC signature valid for a configured time window. Used for secure direct downloads or uploads from untrusted clients:

```bash
# Generate a presigned URL with MinIO client (mc)
mc alias set local http://localhost:9000 admin changeme123
mc share download local/my-bucket/report.pdf --expire=24h

# Or with the AWS CLI (works against MinIO with --endpoint-url)
aws s3 presign s3://my-bucket/report.pdf \
  --endpoint-url http://localhost:9000 \
  --expires-in 86400
```

**Multipart uploads:** — large files (>100MB) are split into parts, uploaded in parallel, and assembled server-side. This is why Rclone's `--s3-chunk-size` flag exists — it controls the part size.

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

---

## Additional Caddy Routes

```caddyfile
pad-simple.home.local { tls internal; reverse_proxy localhost:9001 }
photos.home.local     { tls internal; reverse_proxy localhost:2283 }
```

---

## Choosing the Right Productivity Tool

A decision guide for common use cases:

| Need | Recommended | Why |
|------|------------|-----|
| Team wiki / runbooks | Docmost | Easiest setup, block editor, no mandatory SSO |
| Structured docs-as-code | Docusaurus | Git-backed, versioned, full-text search at build time |
| Figma replacement | Penpot | Full vector design + prototyping + dev handoff |
| Quick whiteboard | Excalidraw | Zero setup, hand-drawn aesthetic, exports SVG |
| Personal notes | Memos or Joplin | Memos = Twitter-style quick capture; Joplin = Notebook with E2E encryption |
| Collaborative Notion-like | AFFiNE | Document + whiteboard in one, offline-capable |
| Team project management | Plane or Huly | Plane = Linear-like; Huly = all-in-one hub |
| Scrum / sprints | Taiga | Full Scrum with epics, velocity, backlog |
| Simple Kanban | Planka | Lightweight Trello clone |
| Photo backup | Immich | Google Photos replacement, face recognition |
| Read-later | Wallabag | Full article archiving, clean reading view |
| Smart bookmarks | Hoarder | AI tagging + summarisation via Ollama |

---

## Troubleshooting (additional)

| Issue | Solution |
|-------|----------|
| Immich machine learning container OOM | Limit ML memory: set `MACHINE_LEARNING_WORKERS=1` and `MACHINE_LEARNING_WORKER_TIMEOUT=120`; face recognition needs ~2 GB RAM |
| Immich photos not backing up from mobile | Ensure the Immich mobile app uses the correct server URL (include `https://` and no trailing slash); verify the server is reachable from your mobile network |
| Etherpad pad not syncing | WebSocket must be proxied — add `header_up Upgrade {http.request.header.Upgrade}` in the Caddy reverse_proxy block |
| AFFiNE collaboration not working | The WebSocket server must be reachable; confirm port 3010 is accessible from all clients and Caddy is proxying WebSocket upgrades |

