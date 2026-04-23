---
title: Developer Tools
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Developer Tools

Infrastructure, CI/CD, monitoring, code hosting, and development utilities.

---

## Gitea & Forgejo

**Purpose:** Lightweight, self-hosted Git servers with web UI, issue tracking, wikis, pull requests, and CI integration. Forgejo is a community-driven fork with identical CLI/API. Use Gitea/Forgejo as your private GitHub — complete with Actions-compatible CI.

```yaml
# ~/gitea/compose.yaml
services:
  gitea:
    image: gitea/gitea:latest
    ports:
      - 127.0.0.1:3000:3000
      - 127.0.0.1:2222:22
    volumes:
      - /home/user/gitea:/data:Z
    environment:
      USER_UID: "1000"
      USER_GID: "1000"
    restart: unless-stopped
```

```bash
cd ~/gitea && podman-compose up -d
```

**Common operations:**
```bash
# Create an admin user via CLI
podman exec -it gitea gitea admin user create   --username admin --password changeme --email admin@example.com --admin

# Reset a user's password
podman exec gitea gitea admin user change-password   --username myuser --password newpassword

# List all users
podman exec gitea gitea admin user list

# Create an org
podman exec gitea gitea admin user create   --username myorg --email org@example.com

# Run database migrations
podman exec gitea gitea migrate

# Regenerate git hooks (after upgrade)
podman exec gitea gitea admin regenerate hooks

# View logs
podman logs -f gitea

# Generate admin access token for API use
podman exec gitea gitea admin user generate-access-token   --username admin --token-name mytoken
```

Configure SSH clients to use `Port 2222` for `git.home.local`. After first login, configure your instance under the Site Administration panel (admin → Site Administration).

---

## Woodpecker CI

**Purpose:** Simple, Gitea/Forgejo-native CI/CD engine. YAML pipeline configs live in the repo (`.woodpecker.yml`). Lightweight, fast, and compatible with the Drone CI pipeline format.

```yaml
# ~/woodpecker/compose.yml
services:
  woodpecker-server:
    image: woodpeckerci/woodpecker-server:latest
    ports: ["127.0.0.1:8000:8000"]
    volumes: [woodpecker_data:/var/lib/woodpecker]
    environment:
      WOODPECKER_OPEN: "false"
      WOODPECKER_HOST: https://ci.example.com
      WOODPECKER_GITEA: "true"
      WOODPECKER_GITEA_URL: https://git.example.com
      WOODPECKER_GITEA_CLIENT: <oauth-client-id>
      WOODPECKER_GITEA_SECRET: <oauth-client-secret>
      WOODPECKER_AGENT_SECRET: changeme
    restart: unless-stopped

  woodpecker-agent:
    image: woodpeckerci/woodpecker-agent:latest
    volumes:
      - /run/user/${UID}/podman/podman.sock:/var/run/docker.sock:ro
      - woodpecker_agent:/var/lib/woodpecker
    environment:
      WOODPECKER_SERVER: woodpecker-server:9000
      WOODPECKER_AGENT_SECRET: changeme
    depends_on: [woodpecker-server]
    restart: unless-stopped

volumes: {woodpecker_data: {}, woodpecker_agent: {}}
```

```bash
cd ~/woodpecker && podman-compose up -d
```

---

## code-server

**Purpose:** VS Code running in the browser with full terminal, extensions, and language support. Accessible from any device on your tailnet — develop on your server from a tablet, Chromebook, or low-powered laptop.

```yaml
# ~/code-server/compose.yaml
services:
  code-server:
    image: lscr.io/linuxserver/code-server:latest
    ports:
      - 127.0.0.1:8443:8443
    volumes:
      - /home/user/code-server:/home/coder:Z
    environment:
      PASSWORD: changeme
      TZ: Asia/Kolkata
    restart: unless-stopped
```

```bash
cd ~/code-server && podman-compose up -d
```

**Caddy:**
```caddyfile
code.home.local { tls internal; reverse_proxy localhost:8443 }
```

---

## Gitpod / Coder (Cloud Development Environments)

**Purpose:** Self-hosted cloud development environments. Each developer gets an isolated, pre-configured container workspace with their tooling, extensions, and dotfiles — reproducible from a Git repo. Coder is lighter and better for self-hosting; Gitpod requires more resources.

# Coder
```yaml
# ~/coder/compose.yaml
services:
  coder:
    image: ghcr.io/coder/coder:latest
    ports:
      - 127.0.0.1:3001:3000
    volumes:
      - /home/user/coder:/var/lib/coder:Z
      - /run/user/${UID}/podman/podman.sock:/var/run/docker.sock:ro
    environment:
      CODER_ACCESS_URL: https://coder.home.local
      CODER_WILDCARD_ACCESS_URL: *.coder.home.local
    restart: unless-stopped
```

```bash
cd ~/coder && podman-compose up -d
```

---

## Nginx & Apache HTTPD

**Purpose:** High-performance web servers and reverse proxies. Nginx excels at static content and proxying; Apache provides `.htaccess` support. Use these when you need full server-level config, not just a reverse proxy.

```yaml
# ~/nginx/compose.yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - 127.0.0.1:8081:80
    volumes:
      - /home/user/www:/usr/share/nginx/html:ro,Z
      - /home/user/nginx.conf:/etc/nginx/nginx.conf:ro,Z
    restart: unless-stopped
  apache:
    image: httpd:alpine
    ports:
      - 127.0.0.1:8082:80
    volumes:
      - /home/user/www:/usr/local/apache2/htdocs:ro,Z
    restart: unless-stopped
```

```bash
cd ~/nginx && podman-compose up -d
```

---

## Private Container Registry

**Purpose:** Store and serve your own container images. Useful for CI/CD pipelines that push images built by Woodpecker and pull them on deploy.

```yaml
# ~/registry/compose.yaml
services:
  registry:
    image: registry:2
    ports:
      - 127.0.0.1:5000:5000
    volumes:
      - /home/user/registry/data:/var/lib/registry:Z
    environment:
      REGISTRY_STORAGE_DELETE_ENABLED: true
    restart: unless-stopped
```

```bash
cd ~/registry && podman-compose up -d
```

**Push an image to your registry:**
```bash
podman tag myimage localhost:5000/myimage:latest
podman push localhost:5000/myimage:latest
```

Add `{ "insecure-registries": ["localhost:5000"] }` to `/etc/containers/registries.conf` to allow unverified pushes in development.

---

## Mailpit (Email Testing)

**Purpose:** SMTP catch-all for development. All outgoing emails from your apps land in Mailpit's web UI — nothing is actually delivered. Perfect for testing Nextcloud, Gitea, or any app that sends email.

```yaml
# ~/mailpit/compose.yaml
services:
  mailpit:
    image: axllent/mailpit
    ports:
      - 127.0.0.1:1025:1025
      - 127.0.0.1:8025:8025
    restart: unless-stopped
```

```bash
cd ~/mailpit && podman-compose up -d
```

Configure apps to use SMTP host `localhost`, port `1025`. View emails at `http://localhost:8025`.

---

## Matomo (Web Analytics)

**Purpose:** The leading open-source web analytics platform — a complete, self-hosted Google Analytics replacement. Tracks pageviews, sessions, bounce rate, goal conversions, funnels, heatmaps (with plugin), and e-commerce. GDPR-compliant by default when configured correctly. Unlike Plausible or Umami, Matomo tracks individual visitor sessions for deep funnel analysis.

```yaml
# ~/matomo/compose.yml
services:
  matomo:
    image: matomo:latest
    ports: ["127.0.0.1:8500:80"]
    environment:
      MATOMO_DATABASE_HOST: db
      MATOMO_DATABASE_ADAPTER: mysql
      MATOMO_DATABASE_DBNAME: matomo
      MATOMO_DATABASE_USERNAME: matomo
      MATOMO_DATABASE_PASSWORD: changeme
    volumes:
      - /home/user/matomo/data:/var/www/html:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: matomo
      MYSQL_USER: matomo
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/matomo && podman-compose up -d
```

Access at `http://localhost:8500` to complete the setup wizard. Add the tracking snippet to your sites.

> **Choosing between Matomo, Plausible, and Umami:** Matomo is the choice when you need session-level tracking, funnel analysis, and A/B testing. Use Plausible or Umami for privacy-first aggregate-only analytics with no cookies.

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

**First run — run DB migrations:**
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

## GitLab CE

**Purpose:** Full DevSecOps platform in a single container — Git hosting, CI/CD pipelines, container registry, merge requests, issue tracking, a package registry, Kubernetes integration, and secrets management. Heavier than Gitea/Forgejo (~4 GB RAM) but includes everything in one place, including built-in CI with GitLab Runners. The right choice when you want GitHub's full feature set self-hosted.

```yaml
# ~/gitlab/compose.yml
services:
  gitlab:
    image: gitlab/gitlab-ce:latest
    hostname: gitlab.example.com
    ports:
      - "127.0.0.1:8929:80"
      - "127.0.0.1:8930:443"
      - "127.0.0.1:2224:22"
    environment:
      GITLAB_OMNIBUS_CONFIG: |
        external_url 'https://gitlab.example.com'
        gitlab_rails['gitlab_shell_ssh_port'] = 2224
        gitlab_rails['time_zone'] = 'Asia/Kolkata'
        nginx['listen_port'] = 80
        nginx['listen_https'] = false
    volumes:
      - /home/user/gitlab/config:/etc/gitlab:Z
      - /home/user/gitlab/logs:/var/log/gitlab:Z
      - /home/user/gitlab/data:/var/opt/gitlab:Z
    restart: unless-stopped
    shm_size: "256m"
```

```bash
cd ~/gitlab && podman-compose up -d
```

> GitLab requires at minimum 4 GB RAM — 8 GB recommended. First-start initialisation takes 3–5 minutes. Retrieve the initial root password with `podman exec gitlab cat /etc/gitlab/initial_root_password`.

**Register a GitLab Runner:**
```yaml
# ~/gitlab-runner/compose.yaml
services:
  gitlab-runner:
    image: gitlab/gitlab-runner:latest
    volumes:
      - /home/user/gitlab-runner/config:/etc/gitlab-runner:Z
      - /run/user/${UID}/podman/podman.sock:/var/run/docker.sock:ro
    restart: unless-stopped
```

```bash
cd ~/gitlab-runner && podman-compose up -d
```

---

## SonarQube (Code Quality & Security)

**Purpose:** Static analysis platform for code quality and security scanning. Detects bugs, code smells, and security vulnerabilities (OWASP Top 10, CWEs) across 30+ languages. Integrates with Gitea, Forgejo, and GitLab CI as a pull request gate — failing builds when quality thresholds aren't met.

```yaml
# ~/sonarqube/compose.yml
services:
  sonarqube:
    image: sonarqube:community
    ports: ["127.0.0.1:9000:9000"]
    environment:
      SONAR_JDBC_URL: jdbc:postgresql://db:5432/sonarqube
      SONAR_JDBC_USERNAME: sonarqube
      SONAR_JDBC_PASSWORD: changeme
    volumes:
      - /home/user/sonarqube/data:/opt/sonarqube/data:Z
      - /home/user/sonarqube/extensions:/opt/sonarqube/extensions:Z
      - /home/user/sonarqube/logs:/opt/sonarqube/logs:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: sonarqube
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: sonarqube
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/sonarqube && podman-compose up -d
```

> SonarQube requires `vm.max_map_count=524288` and `fs.file-max=131072` on the host. Set them persistently: `echo 'vm.max_map_count=524288' | sudo tee -a /etc/sysctl.d/sonar.conf && sudo sysctl -p /etc/sysctl.d/sonar.conf`.

Access at `http://localhost:9000`. Default credentials: `admin` / `admin` (change on first login). Install the SonarScanner in your CI pipeline to push analysis results.

---

## Harbor (Enterprise Container Registry)

**Purpose:** Cloud-native container registry with role-based access control, image vulnerability scanning (Trivy), image signing, replication between registries, and a web UI. A significant upgrade over the basic Docker Registry — Harbor gives you a proper private registry with security scanning built in. Ideal for CI/CD pipelines that push images built by Woodpecker or GitLab CI.

```yaml
# ~/harbor/compose.yml — use the official installer (recommended)
# Download from: https://github.com/goharbor/harbor/releases
# wget https://github.com/goharbor/harbor/releases/download/v2.13.0/harbor-online-installer-v2.13.0.tgz
# Check https://github.com/goharbor/harbor/releases for the latest version
# tar xzvf harbor-online-installer-v2.13.0.tgz
# cd harbor && cp harbor.yml.tmpl harbor.yml
# Edit harbor.yml: set hostname, disable https (let Caddy handle TLS), set admin_initial_password
# Then: sudo ./install.sh --with-trivy

# Minimal harbor.yml changes:
# hostname: registry.home.local
# http.port: 8180
# https: (comment out entire section — Caddy handles TLS)
# harbor_admin_password: changeme
# database.password: changeme
```

```bash
cd ~/harbor && podman-compose up -d
```

Access at `http://localhost:8180` after install. Default login: `admin` / your configured password.

**Push images to Harbor:**
```bash
# Login
podman login registry.home.local

# Tag and push
podman tag myapp:latest registry.home.local/myproject/myapp:latest
podman push registry.home.local/myproject/myapp:latest

# Pull
podman pull registry.home.local/myproject/myapp:latest
```

**Set up Woodpecker CI to push to Harbor:**
```yaml
# .woodpecker.yml
steps:
  build-and-push:
    image: woodpeckerci/plugin-docker-buildx
    settings:
      registry: registry.home.local
      repo: registry.home.local/myproject/myapp
      username:
        from_secret: harbor_user
      password:
        from_secret: harbor_password
      tags: [latest, "${CI_COMMIT_SHA}"]
```

**Caddy:**
```caddyfile
registry.home.local { tls internal; reverse_proxy localhost:8180 }
```

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

## Forgejo Actions Runner

**Purpose:** Native CI/CD runner for Forgejo (and Gitea) using the built-in Actions system. If you're already using Forgejo, this is the first runner to reach for — no separate Woodpecker server needed. Workflows live in `.forgejo/workflows/*.yml` (GitHub Actions-compatible syntax).

```yaml
# ~/forgejo-runner/compose.yaml
services:
  forgejo-runner:
    image: code.forgejo.org/forgejo/runner:latest
    volumes:
      - /home/user/forgejo-runner:/data:Z
      - /run/user/${UID}/podman/podman.sock:/var/run/docker.sock:ro
    environment:
      FORGEJO_INSTANCE_URL: https://git.home.local
      FORGEJO_RUNNER_SECRET: changeme-from-forgejo-admin-panel
    restart: unless-stopped
```

```bash
cd ~/forgejo-runner && podman-compose up -d
```

**Register the runner in Forgejo:**
1. Go to **Site Administration → Actions → Runners → Create new runner** in the Forgejo UI.
2. Copy the registration token and set it as `FORGEJO_RUNNER_SECRET`.
3. The runner registers itself on first start — refresh the Runners page to verify.

**Example workflow** (`.forgejo/workflows/ci.yml`):
```yaml
on: [push]
jobs:
  test:
    runs-on: docker
    steps:
      - uses: actions/checkout@v4
      - run: echo "Hello from Forgejo Actions"
```

> 💡 Forgejo Actions runner uses the same `act` engine under the hood — most GitHub Actions marketplace actions work without modification.

---

## Renovate Bot

**Purpose:** Automated dependency update pull requests for any repository. Renovate scans your repos for outdated container image tags, npm/pip/cargo packages, and GitHub Actions versions, then opens PRs with the exact diff. Self-hostable and works natively with Gitea and Forgejo. The self-hosted alternative to Dependabot.

```yaml
# ~/renovate/compose.yaml
services:
  renovate:
    image: renovate/renovate:latest
    environment:
      RENOVATE_TOKEN: <your-gitea-personal-access-token>
      RENOVATE_PLATFORM: gitea
      RENOVATE_ENDPOINT: https://git.home.local
      RENOVATE_AUTODISCOVER: "true"         # scan all repos the token can access
      LOG_LEVEL: info
    restart: "no"   # run once per invocation; use a timer for scheduling
```

**Run on demand or schedule with a systemd timer:**
```bash
# One-shot run
cd ~/renovate && podman-compose run --rm renovate

# Weekly timer
cat > ~/.config/systemd/user/renovate.service << 'EOF'
[Unit]
Description=Renovate Dependency Updater

[Service]
Type=oneshot
WorkingDirectory=/home/user/renovate
ExecStart=podman-compose run --rm renovate
EOF

cat > ~/.config/systemd/user/renovate.timer << 'EOF'
[Unit]
Description=Weekly Renovate Run

[Timer]
OnCalendar=weekly
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user enable --now renovate.timer
```

**Minimal `renovate.json` to add to each repo root:**
```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:base"],
  "automerge": false
}
```

> 💡 Set `"automerge": true` for low-risk updates (patch versions) to have Renovate merge them automatically without your review.

---

## Windmill (Workflow & Script Automation)

**Purpose:** Self-hosted alternative to n8n and Retool for code-heavy automations. Write scripts in Python, TypeScript, Bash, or Go; compose them into DAG workflows; build internal apps with a drag-and-drop UI; and schedule or trigger everything via webhook or cron — all version-controlled in Git. Significantly faster than n8n for automation tasks that are primarily code, not drag-and-drop.

```yaml
# ~/windmill/compose.yaml
services:
  windmill_server:
    image: ghcr.io/windmill-labs/windmill:latest
    ports:
      - 127.0.0.1:8300:8000
    environment:
      DATABASE_URL: postgresql://windmill:changeme@db:5432/windmill
      BASE_URL: https://windmill.home.local
      MODE: server
    depends_on: [db]
    restart: unless-stopped

  windmill_worker:
    image: ghcr.io/windmill-labs/windmill:latest
    environment:
      DATABASE_URL: postgresql://windmill:changeme@db:5432/windmill
      MODE: worker
      WORKER_GROUP: default
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: windmill
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: windmill
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/windmill && podman-compose up -d
```

Access at `http://localhost:8300`. Default credentials: `admin@windmill.dev` / `changeme` (change immediately). Create scripts, build flows, and deploy internal apps from the UI.

**Caddy:**
```caddyfile
windmill.home.local { tls internal; reverse_proxy localhost:8300 }
```

---

---

## Jenkins (Enterprise CI/CD)

**Purpose:** The most widely deployed open-source CI/CD server. Thousands of plugins covering every build tool, cloud provider, test framework, and deployment target. Common in enterprise environments where GitLab CI, Woodpecker, or Forgejo Actions aren't an option. Use Jenkins when you need to integrate with an existing org-wide pipeline or when the job description explicitly requires it.

```yaml
# ~/jenkins/compose.yaml
services:
  jenkins:
    image: jenkins/jenkins:lts
    ports:
      - 127.0.0.1:8090:8080
      - 127.0.0.1:50000:50000
    volumes:
      - /home/user/jenkins/data:/var/jenkins_home:Z
    environment:
      JAVA_OPTS: "-Djenkins.install.runSetupWizard=false"
    restart: unless-stopped
```

```bash
cd ~/jenkins && podman-compose up -d
```

**Get the initial admin password:**
```bash
podman exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

**Common operations:**
```bash
# Install plugins via CLI (Jenkins CLI jar)
podman exec jenkins java -jar /var/jenkins_home/war/WEB-INF/jenkins-cli.jar \
  -s http://localhost:8080 install-plugin git workflow-aggregator blueocean

# Restart Jenkins
podman exec jenkins java -jar /var/jenkins_home/war/WEB-INF/jenkins-cli.jar \
  -s http://localhost:8080 safe-restart

# View logs
podman logs -f jenkins

# Reload configuration from disk
podman exec jenkins java -jar /var/jenkins_home/war/WEB-INF/jenkins-cli.jar \
  -s http://localhost:8080 reload-configuration
```

**Caddy:**
```caddyfile
jenkins.home.local { tls internal; reverse_proxy localhost:8090 }
```

> 💡 For greenfield projects prefer Woodpecker or Forgejo Actions — they're lighter and Podman-native. Use Jenkins when integrating with existing enterprise pipelines or when a job requires it specifically.

---

## JFrog Artifactory OSS (Universal Artifact Repository)

**Purpose:** Universal artifact repository manager — store, proxy, and manage Maven, npm, PyPI, Docker, Helm, Go, Gradle, and generic binary artifacts from a single server. The self-hosted alternative to a paid Artifactory Cloud or GitHub Packages. Common in enterprise DevOps job descriptions alongside Jenkins or GitLab CI. OSS edition covers all common repository types.

```yaml
# ~/artifactory/compose.yaml
services:
  artifactory:
    image: releases-docker.jfrog.io/jfrog/artifactory-oss:latest
    ports:
      - 127.0.0.1:8181:8082    # web UI and API
      - 127.0.0.1:8182:8081    # legacy API
    volumes:
      - /home/user/artifactory/data:/var/opt/jfrog/artifactory:Z
    environment:
      JF_SHARED_DATABASE_TYPE: derby    # built-in; swap for PostgreSQL in prod
    restart: unless-stopped
```

```bash
cd ~/artifactory && podman-compose up -d
```

Default login: `admin` / `password`. **Change immediately on first login.**

**Common operations:**
```bash
# Create a local repository via REST API
curl -u admin:password -X PUT \
  "http://localhost:8181/artifactory/api/repositories/my-docker-local" \
  -H "Content-Type: application/json" \
  -d '{"rclass":"local","packageType":"docker"}'

# Push a Docker image to Artifactory
podman tag myapp:latest localhost:8182/my-docker-local/myapp:latest
podman push localhost:8182/my-docker-local/myapp:latest

# Upload a generic artifact
curl -u admin:password -T ./myapp.tar.gz \
  "http://localhost:8181/artifactory/generic-local/myapp-1.0.tar.gz"

# Search for artifacts
curl -u admin:password \
  "http://localhost:8181/artifactory/api/search/quick?name=myapp"
```

**With PostgreSQL (production):**
```yaml
services:
  artifactory:
    image: releases-docker.jfrog.io/jfrog/artifactory-oss:latest
    ports:
      - 127.0.0.1:8181:8082
    volumes:
      - /home/user/artifactory/data:/var/opt/jfrog/artifactory:Z
    environment:
      JF_SHARED_DATABASE_TYPE: postgresql
      JF_SHARED_DATABASE_URL: "jdbc:postgresql://db:5432/artifactory"
      JF_SHARED_DATABASE_USERNAME: artifactory
      JF_SHARED_DATABASE_PASSWORD: changeme
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: artifactory
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: artifactory
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

**Caddy:**
```caddyfile
artifactory.home.local { tls internal; reverse_proxy localhost:8181 }
```

---

## Nexus Repository OSS (Maven, npm, PyPI, Docker Proxy)

**Purpose:** Self-hosted artifact repository for Java/Maven, npm, PyPI, Docker, Helm, Go, NuGet, and RubyGems. Commonly used as a **proxy/cache** — pull from Maven Central or npm Registry through Nexus, reducing external bandwidth and enabling offline builds. The most common artifact manager in Java-heavy enterprise shops.

```yaml
# ~/nexus/compose.yaml
services:
  nexus:
    image: sonatype/nexus3:latest
    ports:
      - 127.0.0.1:8091:8081    # web UI
      - 127.0.0.1:8092:8082    # Docker registry port (configure in Nexus UI)
    volumes:
      - /home/user/nexus/data:/nexus-data:Z
    restart: unless-stopped
```

```bash
cd ~/nexus && podman-compose up -d

# Get the initial admin password
podman exec nexus cat /nexus-data/admin.password
```

**Common operations:**
```bash
# Configure Maven to use Nexus proxy — add to ~/.m2/settings.xml:
# <mirrors><mirror><id>nexus</id><url>http://localhost:8091/repository/maven-public/</url>
#          <mirrorOf>*</mirrorOf></mirror></mirrors>

# Configure npm to use Nexus proxy
npm config set registry http://localhost:8091/repository/npm-proxy/

# Push a Docker image to Nexus
podman tag myapp:latest localhost:8092/myapp:latest
podman push localhost:8092/myapp:latest

# Upload a Maven artifact
mvn deploy -DaltDeploymentRepository=nexus::default::http://localhost:8091/repository/maven-releases/

# Clean up old blob store snapshots
# Nexus UI → Administration → Tasks → Create: "Delete unused components and assets"
```

**Caddy:**
```caddyfile
nexus.home.local { tls internal; reverse_proxy localhost:8091 }
```

> ⚠️ Nexus requires at least 4 GB RAM for comfortable operation. Set `-Xms2703m -Xmx2703m` in the JVM options via the `INSTALL4J_ADD_VM_PARAMS` environment variable if you need to cap memory usage.

---

## Consul (Service Discovery & Service Mesh)

**Purpose:** HashiCorp's service discovery, health checking, key-value store, and service mesh. Services register themselves with Consul; others look them up by name rather than IP. Used in job descriptions for teams running Nomad, bare-metal microservices, or multi-cloud infrastructure. Pairs naturally with OpenBao (Vault) for dynamic secrets.

```yaml
# ~/consul/compose.yaml
services:
  consul:
    image: hashicorp/consul:latest
    ports:
      - 127.0.0.1:8500:8500    # HTTP API & web UI
      - 127.0.0.1:8600:8600/udp  # DNS interface
    volumes:
      - /home/user/consul/data:/consul/data:Z
    command: "agent -server -bootstrap-expect=1 -ui -client=0.0.0.0 -bind=0.0.0.0"
    restart: unless-stopped
```

```bash
cd ~/consul && podman-compose up -d
```

**Common operations:**
```bash
# Install Consul CLI via Nix
nix-env -iA nixpkgs.consul

# Check cluster members
consul members

# Register a service
consul services register -name=myapp -port=8080

# Watch for service changes
consul watch -type=services

# Read / write KV store
consul kv put myapp/config/db_host "db.home.local"
consul kv get myapp/config/db_host

# Check service health
consul health service myapp

# DNS lookup via Consul (requires 8600/udp)
dig @127.0.0.1 -p 8600 myapp.service.consul
```

**Caddy:**
```caddyfile
consul.home.local { tls internal; reverse_proxy localhost:8500 }
```

---

## Nomad (Workload Orchestrator)

**Purpose:** HashiCorp's flexible workload orchestrator — runs containers (Podman/Docker), VMs, Java JARs, raw binaries, and batch jobs. Simpler than Kubernetes for teams that don't need the full K8s ecosystem. Common in job descriptions at shops using the HashiCorp stack (Consul + Vault + Nomad). Pairs with Consul for service discovery and OpenBao for secrets.

```yaml
# ~/nomad/compose.yaml
services:
  nomad:
    image: hashicorp/nomad:latest
    ports:
      - 127.0.0.1:4646:4646    # HTTP API & web UI
      - 127.0.0.1:4647:4647    # RPC
      - 127.0.0.1:4648:4648    # Serf (cluster gossip)
    volumes:
      - /home/user/nomad/data:/nomad/data:Z
      - /home/user/nomad/config:/etc/nomad.d:Z
      - /run/user/${UID}/podman/podman.sock:/var/run/docker.sock:ro
    cap_add: [SYS_ADMIN]
    privileged: true
    command: "agent -dev -bind=0.0.0.0 -log-level=INFO"
    restart: unless-stopped
```

```bash
cd ~/nomad && podman-compose up -d
```

**Common operations:**
```bash
# Install Nomad CLI via Nix
nix-env -iA nixpkgs.nomad

# Check node status
nomad node status

# Submit a job
nomad job run ~/nomad/jobs/nginx.nomad

# Check job status
nomad job status nginx

# View allocation logs
nomad alloc logs <alloc-id>

# Scale a job
nomad job scale nginx web 3

# Stop a job
nomad job stop nginx
```

**Example job file (`~/nomad/jobs/nginx.nomad`):**
```hcl
job "nginx" {
  datacenters = ["dc1"]
  type        = "service"

  group "web" {
    count = 1

    network {
      port "http" { static = 8099 }
    }

    task "nginx" {
      driver = "docker"

      config {
        image = "nginx:alpine"
        ports = ["http"]
      }

      resources {
        cpu    = 100
        memory = 128
      }
    }
  }
}
```

**Caddy:**
```caddyfile
nomad.home.local { tls internal; reverse_proxy localhost:4646 }
```

---

## Backstage (Internal Developer Portal)

**Purpose:** Spotify's open-source Internal Developer Platform. A single portal where developers discover services, APIs, documentation, pipelines, infrastructure, and runbooks — reducing cognitive load and onboarding time. Common in Platform Engineer and DevEx job descriptions. Integrates with Gitea/Forgejo, Kubernetes, ArgoCD, PagerDuty, Grafana, and hundreds of plugins.

```yaml
# ~/backstage/compose.yaml
services:
  backstage:
    image: backstage/backstage:latest
    ports:
      - 127.0.0.1:7007:7007
    volumes:
      - /home/user/backstage/app-config.yaml:/app/app-config.production.yaml:ro,Z
    environment:
      NODE_ENV: production
      APP_CONFIG_app_baseUrl: https://backstage.home.local
      APP_CONFIG_backend_baseUrl: https://backstage.home.local
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: backstage
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: backstage
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

**Minimal `app-config.yaml`:**
```yaml
app:
  title: Homelab Developer Portal
  baseUrl: https://backstage.home.local

backend:
  baseUrl: https://backstage.home.local
  database:
    client: pg
    connection:
      host: db
      port: 5432
      user: backstage
      password: changeme

integrations:
  gitea:
    - host: git.home.local
      token: ${GITEA_TOKEN}

catalog:
  locations:
    - type: url
      target: https://git.home.local/myorg/catalog/blob/main/catalog-info.yaml
```

```bash
cd ~/backstage && podman-compose up -d
```

**Caddy:**
```caddyfile
backstage.home.local { tls internal; reverse_proxy localhost:7007 }
```

> 💡 Backstage is most valuable once you have 5+ services. Start small — register a few services with `catalog-info.yaml` files in their repos, then add plugins incrementally (ArgoCD, Kubernetes, TechDocs).

---

## Caddy Configuration

```caddyfile
git.home.local       { tls internal; reverse_proxy localhost:3000 }
ci.home.local        { tls internal; reverse_proxy localhost:8000 }
code.home.local      { tls internal; reverse_proxy localhost:8443 }
coder.home.local     { tls internal; reverse_proxy localhost:3001 }
registry.home.local  { tls internal; reverse_proxy localhost:5000 }
mail.home.local      { tls internal; reverse_proxy localhost:8025 }
analytics.home.local { tls internal; reverse_proxy localhost:8500 }
pm.home.local        { tls internal; reverse_proxy localhost:8600 }
crm.example.com      { reverse_proxy localhost:3700 }
huly.home.local      { tls internal; reverse_proxy localhost:8087 }
sign.home.local      { tls internal; reverse_proxy localhost:3800 }
gitlab.example.com   { reverse_proxy localhost:8929 }
sonar.home.local     { tls internal; reverse_proxy localhost:9000 }
harbor.home.local    { tls internal; reverse_proxy localhost:8180 }
plane.home.local     { tls internal; reverse_proxy localhost:3009 }
windmill.home.local  { tls internal; reverse_proxy localhost:8300 }
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Gitea SSH push fails | Confirm client is using `Port 2222` in `~/.ssh/config`; check `gitea` user has write access to the data volume |
| Woodpecker agent not picking up jobs | Verify `WOODPECKER_AGENT_SECRET` matches on server and agent; check the agent has access to the Docker/Podman socket |
| code-server blank after login | Verify `PASSWORD` env var is set; check the port is not in use by another service |
| Private registry push rejected | Add `{ "insecure-registries": ["localhost:5000"] }` to `/etc/containers/registries.conf`; restart Podman |
| Coder workspace fails to start | Confirm the Podman socket is mounted and accessible; check `CODER_ACCESS_URL` matches the URL you use to access it |
| n8n webhook not triggering | Ensure `WEBHOOK_URL` is the publicly accessible URL; check that Caddy is proxying correctly |
| code-server extension install fails | The container needs outbound internet access; verify network is not blocked by firewalld |
| Matomo setup wizard loops | Ensure MariaDB is fully started before Matomo; check `MATOMO_DATABASE_HOST` is `db` not `localhost` |
| Matomo `No data` in reports | Verify the tracking snippet is correctly deployed on your site; check the Matomo real-time visitors page to confirm pings are arriving |
| Leantime blank after install | Run `podman exec leantime php bin/leantime db:migrate` to apply DB migrations; check `podman logs leantime` |
| Twenty CRM blank page | Ensure `yarn database:migrate:prod` ran successfully; check `SERVER_URL` matches the URL you access it from |
| Huly services not connecting | Use the official `huly-selfhost` compose stack which wires all services correctly; single-container mode is for testing only |
| DocuSeal PDF fields not saving | Ensure the `/data` volume has write permissions; check `podman logs docuseal` for storage errors |
| GitLab 502 on first load | Wait 3–5 min for full initialisation; check `podman logs gitlab`; ensure `shm_size` is set to at least 256m |
| GitLab Runner not picking up jobs | Verify the runner token matches; check runner tags match the job's `tags:` definition in `.gitlab-ci.yml` |
| SonarQube exits immediately | Set `vm.max_map_count=524288` on the host with `sudo sysctl -w vm.max_map_count=524288`; add to `/etc/sysctl.d/` to persist across reboots |
| Forgejo Actions runner not picking up jobs | Verify the registration token matches what's shown in **Site Administration → Actions → Runners**; confirm the Podman socket is mounted and accessible |
| Renovate PR not created | Ensure the token has write access to the repos; check `podman logs` on the renovate container for API errors; verify `RENOVATE_PLATFORM=gitea` is set |
| Windmill worker not executing jobs | Check `DATABASE_URL` is identical on server and worker; run `podman logs windmill_worker` for connection errors; ensure `MODE=worker` is set on the worker container |
