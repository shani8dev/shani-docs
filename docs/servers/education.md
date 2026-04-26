---
title: Education & E-Learning
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Education & E-Learning

Self-hosted learning management systems, school administration platforms, collaborative tools, and knowledge-sharing apps. Run your own campus, classroom, or training environment with full data ownership and zero per-seat licensing fees.

> **Why self-host education tools?** GDPR and FERPA compliance, full student data ownership, no vendor lock-in, and the ability to customise the learning environment — these matter whether you are running a school, a homeschool co-op, a corporate training platform, or a private tutoring practice.

---

## Key Concepts

#### LMS architecture — SCORM, xAPI, and LTI
The e-learning interoperability standards define how learning content and tools integrate. SCORM (Sharable Content Object Reference Model) packages courses as ZIP files with a manifest — any SCORM-compliant LMS (Moodle, Canvas) can import and track completion. xAPI (Tin Can) extends this to track any learning experience as subject-verb-object statements ("Alice completed Module 3") sent to a Learning Record Store (LRS). LTI (Learning Tools Interoperability) is the SSO standard for embedding third-party tools (H5P, Google Docs, Zoom) into an LMS with single sign-on and grade passback. LTI 1.3 uses OAuth2 for authentication. Any edtech role requires understanding these three acronyms and which standard solves which problem.

#### SIS vs LMS — the system boundary
A Student Information System (SIS) manages administrative data — enrollment, timetables, attendance, grades, billing, transcripts. An LMS manages learning delivery — course content, quizzes, discussion forums, assignment submission. They're separate systems that integrate via an API or a standard like OneRoster (CSV/API for syncing roster data between SIS and LMS). ERPNext's Education module is a SIS. Moodle and Canvas are LMSes. Gibbon straddles both for smaller schools. In edtech engineering, the SIS is the source of truth for student identity; the LMS receives roster data from it and publishes grades back.

#### Accessibility and WCAG compliance
Web Content Accessibility Guidelines (WCAG) 2.1 AA is the standard accessibility target for educational content — legally required in many jurisdictions for public schools. Key criteria relevant to LMS content: sufficient colour contrast (4.5:1 for text), keyboard navigability, alt text for images, captions for videos, and semantic HTML structure. H5P interactive content has variable accessibility — some content types meet WCAG, others don't. Any edtech deployment serving students with disabilities must audit content types. Canvas has stronger built-in accessibility tools than Moodle; Moodle's accessibility depends heavily on the theme and plugins installed.

#### CalDAV, CardDAV, and school scheduling
School scheduling systems (timetables, room bookings, events) use CalDAV as the standard calendar protocol for exposing data to client apps (iOS Calendar, Google Calendar, Thunderbird). A school server exposes a CalDAV endpoint; student and staff apps subscribe to their personal calendar feeds. The key operational fact: CalDAV is a WebDAV extension — it's stateful HTTP with `PROPFIND`, `REPORT`, and `PUT` methods. Debugging CalDAV sync issues requires reading HTTP traces, not just checking the app. ERPNext and Moodle both expose CalDAV for course events.

#### FHIR in education — student health records
Schools managing student health data (medications, allergies, immunisations) in a regulated environment increasingly use FHIR (Fast Healthcare Interoperability Resources) for structured health data storage — the same standard used in medical settings. This matters at the intersection of edtech and healthtech, for example in special education systems that store IEP (Individualised Education Plan) health components. Any role building school health record integrations will encounter HL7 FHIR R4.

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

#### Recommended plugins to install via admin panel
- **H5P** — rich interactive content (drag-and-drop, interactive videos, flashcards)
- **BigBlueButton** — integrated live video conferencing and virtual classrooms
- **Attendance** — mark and track student attendance per session
- **Collapsed Topics** — cleaner course layout for large courses
- **Boost Union** — enhanced Boost theme with extra customisation options

#### Cron job (required for Moodle background tasks)
```bash
# Add to a systemd timer — every minute
podman exec moodle php /opt/bitnami/moodle/admin/cli/cron.php
```

#### Common operations
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

#### SCORM, xAPI, and the LMS content standard landscape
**SCORM** (Sharable Content Object Reference Model) is the legacy e-learning packaging standard — a zip file with HTML, JS, and an XML manifest. The LMS launches SCORM content in an iFrame and receives completion/score data via a JavaScript API. Widely supported but limited: no mobile-first support, requires a browser, and tracking is binary (passed/failed). **xAPI** (Tin Can) is the modern replacement — sends structured JSON statements (`actor, verb, object` — "John completed Module 3") to a Learning Record Store (LRS). Moodle supports both. xAPI enables tracking outside the LMS (mobile apps, simulators, on-the-job activities).

#### Moodle's grading system and gradebook design
Moodle's gradebook aggregates activity grades into course totals using configurable aggregation methods: weighted mean of grades (each activity has a weight), natural weighting (based on max grade points), or highest grade. Grade categories allow grouping activities — "Assignments" (30%), "Quizzes" (40%), "Final Exam" (30%). Grade letters map percentages to letters. A common mistake: setting up a complex gradebook after students have submitted work. Design the gradebook before the course opens — retroactive changes cause visible anomalies in the gradebook.

#### Single Sign-On in educational platforms
Schools often run multiple systems (Moodle, Nextcloud, Gitea, BigBlueButton) that should share the same login. OIDC (via Authentik or Keycloak) is the modern standard: students log in once, and all SSO-enabled services accept the token. LTI (Learning Tools Interoperability) is the education-specific standard for embedding external tools directly inside Moodle — a quiz tool, a video platform, or a coding environment appears as a Moodle activity, grades flow back automatically, and the student never leaves the LMS. LTI 1.3 uses OAuth2/OIDC under the hood.

#### Accessibility in e-learning — WCAG and ATAG
WCAG (Web Content Accessibility Guidelines) 2.1 Level AA is the legal requirement in most jurisdictions for educational platforms receiving public funding. Key requirements relevant to LMSes: sufficient colour contrast (4.5:1 for body text), all functionality keyboard-accessible, all images have alt text, all videos have captions, forms have associated labels. Moodle 4.x is largely WCAG 2.1 AA compliant out of the box; third-party themes and plugins may not be. ATAG (Authoring Tool Accessibility Guidelines) additionally requires that the authoring tools (course editors) produce accessible content by default.

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

##### Create a new site

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
    image: mongo:7
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

##### Create an admin user

```bash
podman exec sharelatex /bin/bash -c \
  "cd /var/www/sharelatex && node modules/server-ce-scripts/scripts/create-user.js \
  --email=admin@example.com --admin"
```

##### Install full TeX Live

(optional, adds all LaTeX packages):
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
    image: noxinc/anki-sync-server:latest   # Official Anki sync server; supports SYNC_USER1
    ports:
      - 127.0.0.1:27701:8080
    volumes:
      - /home/user/anki-sync/data:/anki_data:Z
    environment:
      SYNC_USER1: user:password             # Add more users: SYNC_USER2, SYNC_USER3, …
    restart: unless-stopped
```

```bash
cd ~/anki-sync && podman-compose up -d
```

##### Configure Anki desktop

Tools → Preferences → Network → Self-hosted sync server → enter your server URL.

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
