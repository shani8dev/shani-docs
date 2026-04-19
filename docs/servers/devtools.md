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
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
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
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
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

## Prometheus + Grafana + Loki + Alertmanager

See the [Monitoring wiki](https://docs.shani.dev/doc/servers/monitoring) for the full observability stack — Prometheus, Grafana, Loki, and Alertmanager.




---

## n8n (Workflow Automation)

**Purpose:** Visual workflow automation with 400+ integrations — webhooks, APIs, databases, home automation, AI. Self-hosted alternative to Zapier and Make.

See the [Productivity wiki](https://docs.shani.dev/doc/servers/productivity#n8n-workflow-automation) for the full setup.


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
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
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

## act (Local GitHub Actions Runner)

**Purpose:** Run GitHub Actions workflows locally for testing and development — no pushing to GitHub just to test CI changes. `act` reads your `.github/workflows/*.yml` files and runs them in containers on your machine. Supports most actions, secrets, and matrix builds.

```bash
# Install act
curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Run the default push event
act

# Run a specific job
act -j build

# Pass secrets
act --secret-file .secrets

# Dry run (list jobs without running)
act -n
```

> For reproducible CI across Gitea/Forgejo workflows too, Woodpecker CI (covered above) is the server-side complement — `act` is for local iteration before pushing.

---

## Harbor (Enterprise Container Registry)

**Purpose:** Cloud-native container registry with role-based access control, image vulnerability scanning (Trivy), image signing, replication between registries, and a web UI. A significant upgrade over the basic Docker Registry — Harbor gives you a proper private registry with security scanning built in. Ideal for CI/CD pipelines that push images built by Woodpecker or GitLab CI.

```yaml
# ~/harbor/compose.yml — use the official installer (recommended)
# Download from: https://github.com/goharbor/harbor/releases
# wget https://github.com/goharbor/harbor/releases/download/v2.11.0/harbor-online-installer-v2.11.0.tgz
# tar xzvf harbor-online-installer-v2.11.0.tgz
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
