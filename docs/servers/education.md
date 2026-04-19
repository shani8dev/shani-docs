---
title: Education & E-Learning
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Education & E-Learning

Self-hosted learning management systems, school administration platforms, collaborative tools, and knowledge-sharing apps. Run your own campus, classroom, or training environment with full data ownership and zero per-seat licensing fees.

> **Why self-host education tools?** GDPR and FERPA compliance, full student data ownership, no vendor lock-in, and the ability to customise the learning environment — these matter whether you are running a school, a homeschool co-op, a corporate training platform, or a private tutoring practice.

---

## Moodle

**Purpose:** The world's most widely deployed open-source Learning Management System (LMS). Supports courses, quizzes, assignments, forums, gradebooks, badges, SCORM packages, H5P interactive content, and deep analytics. Used by universities, schools, and enterprises worldwide.

```yaml
# ~/moodle/compose.yaml
services:
  moodle:
    image: bitnami/moodle:latest
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - /home/user/moodle/data:/bitnami/moodle:Z
      - /home/user/moodle/moodledata:/bitnami/moodledata:Z
    environment:
      MOODLE_DATABASE_HOST: host.containers.internal
      MOODLE_DATABASE_PORT_NUMBER: 3306
      MOODLE_DATABASE_USER: moodleuser
      MOODLE_DATABASE_PASSWORD: changeme
      MOODLE_DATABASE_NAME: moodle
      MOODLE_SITE_NAME: "My Moodle"
      MOODLE_USERNAME: admin
      MOODLE_PASSWORD: changeme
      MOODLE_EMAIL: admin@example.com
    restart: unless-stopped
```

```bash
cd ~/moodle && podman-compose up -d
```

> Moodle requires a database. Run MariaDB first from the [Databases wiki](https://docs.shani.dev/doc/servers/databases).

**Recommended plugins to install via admin panel:**
- **H5P** — rich interactive content (drag-and-drop, interactive videos, flashcards)
- **BigBlueButton** — integrated live video conferencing and virtual classrooms
- **Attendance** — mark and track student attendance per session
- **Collapsed Topics** — cleaner course layout for large courses
- **Boost Union** — enhanced Boost theme with extra customisation options

**Cron job (required for Moodle background tasks):**
```bash
# Add to a systemd timer — every minute
podman exec moodle php /opt/bitnami/moodle/admin/cli/cron.php
```

**Common operations:**
```bash
# Run Moodle cron (required — run every minute via systemd timer)
podman exec -u www-data moodle php /bitnami/moodle/admin/cli/cron.php

# Purge all caches
podman exec -u www-data moodle php /bitnami/moodle/admin/cli/purge_caches.php

# Upgrade Moodle database after version update
podman exec -u www-data moodle php /bitnami/moodle/admin/cli/upgrade.php --non-interactive

# Install a plugin from the plugins directory
podman exec -u www-data moodle php /bitnami/moodle/admin/cli/install_plugin.php   --pluginzip=/tmp/myplugin.zip

# Create a new user via CLI
podman exec -u www-data moodle php /bitnami/moodle/admin/cli/create_user.php   --username=newuser --password=changeme --email=user@example.com --firstname=John --lastname=Doe

# View logs
podman logs -f moodle

# Check Moodle status
curl http://localhost:8080/admin/index.php
```

---

## Canvas LMS

**Purpose:** Enterprise-grade LMS used by hundreds of universities. Cleaner UI than Moodle, superior mobile apps, strong API, and first-class support for rubrics, SpeedGrader, outcome tracking, and video feedback. Higher resource requirements than Moodle.

```yaml
# ~/canvas/compose.yaml
services:
  canvas:
    image: instructure/canvas-lms:latest
    ports: ["127.0.0.1:3000:3000"]
    environment:
      CANVAS_LMS_ADMIN_EMAIL: admin@example.com
      CANVAS_LMS_ADMIN_PASSWORD: changeme
      CANVAS_LMS_ACCOUNT_NAME: "My Canvas"
      CANVAS_LMS_STATS_COLLECTION: opt_out
      DATABASE_URL: postgresql://canvas:changeme@db:5432/canvas
      REDIS_URL: redis://redis:6379
    depends_on: [db, redis]
    volumes:
      - /home/user/canvas/uploads:/usr/src/app/tmp/files:Z
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: canvas
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: canvas
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/canvas && podman-compose up -d
```

> Canvas is resource-heavy — plan for at least 4 GB RAM dedicated to the stack.

---

## Open edX (Tutor)

**Purpose:** The platform powering edX.org and hundreds of MOOCs. Full MOOC toolkit: video courses, peer-graded assignments, timed exams, discussion forums, certificates, and XBlocks for custom content types. **Tutor** is the recommended way to deploy it — a Docker-based wrapper that makes the famously complex edX deployment manageable.

```bash
# Install Tutor
pip install "tutor[full]" --break-system-packages

# Initialise (interactive — sets domain, admin account, etc.)
tutor config save --interactive

# Launch the full stack
tutor local launch

# Create a superuser
tutor local run lms manage.py createsuperuser

# Import a demo course
tutor local do importdemocourse
```

> Tutor manages all containers, volumes, and configuration. Run `tutor local status` to see all services.

**Caddy:**
```caddyfile
lms.example.com { reverse_proxy localhost:80 }
studio.example.com { reverse_proxy localhost:80 }
```

---

## BigBlueButton (Virtual Classroom)

**Purpose:** Open-source web conferencing designed specifically for education. Features include multi-user whiteboards, breakout rooms, polling, shared notes, learning analytics, recordings with automatic transcription, and deep LMS integration (Moodle, Canvas).

```yaml
# ~/bbb-demo/compose.yaml
services:
  bbb-demo:
    image: bigbluebutton/demo:latest
    ports:
      - 127.0.0.1:8090:8090
    restart: unless-stopped
```

```bash
cd ~/bbb-demo && podman-compose up -d
```

> BBB needs ports `443/tcp` and `16384-32768/udp` open for WebRTC media. It works best on a server with at least 8 GB RAM.

---

## Greenlight (BigBlueButton Front End)

**Purpose:** A simple, polished web interface for BigBlueButton. Manages rooms, recordings, and user accounts — without the complexity of a full LMS. Ideal as a standalone virtual meeting room system for schools or teams.

```yaml
# ~/greenlight/compose.yaml
services:
  greenlight:
    image: bigbluebutton/greenlight:v3
    ports: ["127.0.0.1:5050:80"]
    environment:
      BIGBLUEBUTTON_ENDPOINT: https://bbb.example.com/bigbluebutton/
      BIGBLUEBUTTON_SECRET: your-bbb-secret
      SECRET_KEY_BASE: changeme-run-openssl-rand-hex-64
      DATABASE_URL: postgresql://greenlight:changeme@db:5432/greenlight
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: greenlight
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: greenlight
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/greenlight && podman-compose up -d
```

---

## ERPNext / Frappe (School ERP)

**Purpose:** ERPNext includes a full **Education module** — student admissions, enrollment, fee management, timetables, attendance, assessments, certificates, and parent portals. Built on the Frappe framework, it is a complete school management system alongside a full-featured ERP (HR, payroll, accounts, inventory).

```yaml
# ~/erpnext/compose.yaml — use the official Frappe Docker setup
# git clone https://github.com/frappe/frappe_docker
# cd frappe_docker
# cp example.env .env
# Edit .env: set FRAPPE_BRANCH=version-15, APPS_JSON_BASE64 to include erpnext

services:
  backend:
    image: frappe/erpnext:v15
    environment:
      DB_HOST: db
      DB_PORT: 3306
      REDIS_CACHE: redis-cache:6379
      REDIS_QUEUE: redis-queue:6379
      SOCKETIO_PORT: 9000
    volumes: [sites:/home/frappe/frappe-bench/sites]
    depends_on: [db, redis-cache, redis-queue]
    restart: unless-stopped

  frontend:
    image: frappe/erpnext:v15
    command: nginx-entrypoint.sh
    ports: ["127.0.0.1:8080:8080"]
    environment:
      BACKEND: backend:8000
      SOCKETIO: websocket:9000
      FRAPPE_SITE_NAME_HEADER: $$host
    volumes: [sites:/home/frappe/frappe-bench/sites]
    restart: unless-stopped

  db:
    image: mariadb:10.11
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
    environment:
      MYSQL_ROOT_PASSWORD: changeme
    volumes: [mariadb_data:/var/lib/mysql]
    restart: unless-stopped

  redis-cache:
    image: redis:7-alpine
    restart: unless-stopped

  redis-queue:
    image: redis:7-alpine
    restart: unless-stopped

  websocket:
    image: frappe/erpnext:v15
    command: node /home/frappe/frappe-bench/apps/frappe/socketio.js
    volumes: [sites:/home/frappe/frappe-bench/sites]
    restart: unless-stopped

volumes:
  sites:
  mariadb_data:
```

```bash
cd ~/erpnext && podman-compose up -d
```

**Create a new site:**
```bash
podman exec backend bench new-site erp.example.com \
  --mariadb-root-password changeme \
  --admin-password changeme \
  --install-app erpnext \
  --install-app education
```

---

## Gibbon (School Management System)

**Purpose:** Lightweight, purpose-built school information system. Timetables, attendance, gradebooks, student profiles, parent communication, notices, and planner — all in one. Lower resource footprint than ERPNext; easier to operate for a single school.

```yaml
# ~/gibbon/compose.yaml
services:
  gibbon:
    image: andrewm/gibbon:latest
    ports: ["127.0.0.1:8082:80"]
    environment:
      DB_HOST: db
      DB_NAME: gibbon
      DB_USERNAME: gibbon
      DB_PASSWORD: changeme
      INSTALL_TYPE: new
    volumes:
      - /home/user/gibbon/uploads:/var/www/html/uploads:Z
      - /home/user/gibbon/private:/var/www/html/private:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:10.11
    environment:
      MYSQL_DATABASE: gibbon
      MYSQL_USER: gibbon
      MYSQL_PASSWORD: changeme
      MYSQL_ROOT_PASSWORD: rootpass
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/gibbon && podman-compose up -d
```

Access at `http://localhost:8082`. Complete setup via the web installer on first run.

---

## Chamilo (LMS / E-Learning)

**Purpose:** Simple, accessible LMS targeted at schools and training centres in developing regions. Lower resource requirements than Moodle, easier to administer, and multilingual from the ground up. Supports courses, assignments, quizzes, certificates, and social learning tools.

```yaml
# ~/chamilo/compose.yaml
services:
  chamilo:
    image: chamilo/chamilo:latest
    ports:
      - 127.0.0.1:8083:80
    volumes:
      - /home/user/chamilo/app:/var/www/html/app:Z
      - /home/user/chamilo/web:/var/www/html/web:Z
    environment:
      CHAMILO_DATABASE_HOST: host.containers.internal
      CHAMILO_DATABASE_USER: chamilo
      CHAMILO_DATABASE_PASSWORD: changeme
      CHAMILO_DATABASE_NAME: chamilo
    restart: unless-stopped
```

```bash
cd ~/chamilo && podman-compose up -d
```

---

## Kolibri (Offline Learning)

**Purpose:** Open-source educational platform from Learning Equality, designed for low-bandwidth and offline use. Hosts Khan Academy content, ebooks, videos, and interactive exercises locally. Ideal for remote schools or learning environments without reliable internet access.

```yaml
# ~/kolibri/compose.yaml
services:
  kolibri:
    image: learningequality/kolibri:latest
    ports:
      - 127.0.0.1:8090:8080
    volumes:
      - /home/user/kolibri/data:/root/.kolibri:Z
    restart: unless-stopped
```

```bash
cd ~/kolibri && podman-compose up -d
```

> Kolibri can serve an entire classroom over Wi-Fi from a single Raspberry Pi or mini PC — no internet required after content import.

---

## Overleaf (Collaborative LaTeX Editor)

**Purpose:** Self-hosted collaborative LaTeX document editor. Essential for academic writing, research papers, theses, and technical documentation. The Community Edition gives you the same real-time collaborative experience as Overleaf.com, running on your own server.

```yaml
# ~/overleaf/compose.yaml
services:
  sharelatex:
    image: sharelatex/sharelatex:latest
    ports: ["127.0.0.1:5000:80"]
    environment:
      SHARELATEX_APP_NAME: "Overleaf CE"
      SHARELATEX_MONGO_URL: mongodb://mongo/sharelatex
      SHARELATEX_REDIS_HOST: redis
      SHARELATEX_SITE_URL: https://overleaf.home.local
      SHARELATEX_ADMIN_EMAIL: admin@example.com
    volumes:
      - /home/user/overleaf/data:/var/lib/sharelatex:Z
    depends_on: [mongo, redis]
    restart: unless-stopped

  mongo:
    image: mongo:6
    volumes: [mongo_data:/data/db]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  mongo_data:
```

```bash
cd ~/overleaf && podman-compose up -d
```

**Create an admin user:**
```bash
podman exec sharelatex /bin/bash -c \
  "cd /var/www/sharelatex && node modules/server-ce-scripts/scripts/create-user.js \
  --email=admin@example.com --admin"
```

**Install full TeX Live** (optional, adds all LaTeX packages):
```bash
podman exec sharelatex tlmgr install scheme-full
```

---

## Anki Sync Server

**Purpose:** Self-hosted synchronisation server for the Anki flashcard app (desktop and mobile). All your decks, scheduling data, and review history sync between devices through your own server — no AnkiWeb account required.

```yaml
# ~/anki-sync/compose.yaml
services:
  anki-sync:
    image: ghcr.io/ankitects/anki:latest
    ports:
      - 127.0.0.1:27701:27701
    volumes:
      - /home/user/anki-sync/data:/data:Z
    environment:
      SYNC_USER1: user:password
      # Add more users: SYNC_USER2=alice:pass1 SYNC_USER3=bob:pass2
    command: anki-sync-server
    restart: unless-stopped
```

```bash
cd ~/anki-sync && podman-compose up -d
```

**Configure Anki desktop:** Tools → Preferences → Network → Self-hosted sync server → enter your server URL.

---

## ITflow (IT Documentation)

**Purpose:** IT documentation and ticketing platform popular in school IT departments. Asset tracking, password vault, network documentation, and ticket management — all in one self-hosted tool.

```yaml
# ~/itflow/compose.yaml
services:
  itflow:
    image: itflow/itflow:latest
    ports: ["127.0.0.1:8091:80"]
    environment:
      DB_HOST: db
      DB_NAME: itflow
      DB_USER: itflow
      DB_PASS: changeme
      APP_URL: https://itflow.home.local
    volumes:
      - /home/user/itflow/uploads:/var/www/html/uploads:Z
      - /home/user/itflow/backups:/var/www/html/backups:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:10.11
    environment:
      MYSQL_DATABASE: itflow
      MYSQL_USER: itflow
      MYSQL_PASSWORD: changeme
      MYSQL_ROOT_PASSWORD: rootpass
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/itflow && podman-compose up -d
```

---

## H5P (Interactive Learning Content)

**Purpose:** Create rich, interactive HTML5 learning content — quizzes, drag-and-drop exercises, interactive videos, flashcards, branching scenarios, and 50+ other content types — without writing code. H5P content runs in the browser and integrates directly with Moodle, Canvas, and Open edX as a plugin. The standalone server lets you host H5P content independently and embed it in any website via iframes.

```yaml
# ~/h5p/compose.yaml
services:
  h5p:
    image: tutor/h5p:latest
    ports:
      - 127.0.0.1:8100:8080
    volumes:
      - /home/user/h5p/content:/var/www/html/content:Z
      - /home/user/h5p/libraries:/var/www/html/libraries:Z
    environment:
      H5P_EDITOR_DOMAIN: h5p.home.local
    restart: unless-stopped
```

```bash
cd ~/h5p && podman-compose up -d
```

Access at `http://localhost:8100`. Download H5P content types from the H5P Hub (built into the editor), create content, and embed it in any LMS or web page:

```html
<iframe src="https://h5p.home.local/h5p/embed/1" 
  width="800" height="450" frameborder="0" allowfullscreen>
</iframe>
```

> For Moodle integration, install the H5P plugin from the Moodle Plugin Directory — no separate container needed. The standalone server is useful when you want to embed H5P content in non-LMS sites (WordPress, Ghost, custom apps).

---

## Caddy Configuration

```caddyfile
moodle.home.local      { tls internal; reverse_proxy localhost:8080 }
canvas.home.local      { tls internal; reverse_proxy localhost:3000 }
bbb.example.com        { reverse_proxy localhost:8090 }
greenlight.home.local  { tls internal; reverse_proxy localhost:5050 }
erp.home.local         { tls internal; reverse_proxy localhost:8080 }
kolibri.home.local     { tls internal; reverse_proxy localhost:8090 }
overleaf.home.local    { tls internal; reverse_proxy localhost:5000 }
anki.home.local        { tls internal; reverse_proxy localhost:27701 }
h5p.home.local         { tls internal; reverse_proxy localhost:8100 }
```

---

## Choosing the Right Stack

| Scenario | Recommended Stack |
|----------|------------------|
| University-scale MOOC platform | Open edX (Tutor) |
| School or training centre LMS | Moodle (with H5P + BBB) |
| Cleaner LMS with great mobile apps | Canvas LMS |
| Virtual classrooms only | BigBlueButton + Greenlight |
| Full school ERP (fees, timetables, HR) | ERPNext Education |
| Lightweight school admin (single school) | Gibbon |
| Offline / low-bandwidth classrooms | Kolibri |
| Academic writing (LaTeX) | Overleaf CE |
| Flashcard sync | Anki Sync Server |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Moodle cron not running | Verify the cron command runs as the correct user inside the container; check `Site Administration → Server → Cron` for last run time |
| Moodle `Cannot connect to database` | Confirm MariaDB is running and `MOODLE_DATABASE_HOST` uses `host.containers.internal` not `localhost` |
| Canvas asset pipeline errors | Ensure the `uploads` volume has write permissions; run `podman exec canvas bundle exec rake canvas:compile_assets` |
| Open edX Tutor launch fails | Check Docker/Podman socket is accessible; run `tutor local logs` for errors; ensure at least 4 GB RAM free |
| BigBlueButton WebRTC fails | Verify `16384-32768/udp` is open in firewalld; BBB requires a real public IP or TURN server for NAT traversal |
| ERPNext site not loading | Check all services are up with `podman-compose ps`; run `bench clear-cache` inside the backend container |
| Overleaf PDF compilation fails | TeX Live may be incomplete — install `scheme-full` via `tlmgr install scheme-full` inside the container |
| Kolibri import fails | Ensure outbound internet access is available during `importchannel`; check disk space (channels can be several GB) |
| Anki sync `AuthFailed` | Verify username/password in `SYNC_USER1` matches exactly what the client sends; Anki is case-sensitive |

> 💡 **Tip:** For Moodle and Canvas, enable Redis as a caching backend (set under `config.php` → `$CFG->cache_*`) to significantly improve page load times and handle more concurrent users.

| H5P content type missing | Download content types from the H5P Hub inside the editor — libraries must be installed before content of that type can be created |
| H5P iframe not loading | Ensure `H5P_EDITOR_DOMAIN` matches the domain used in the iframe src; check CSP headers aren't blocking the embed |
