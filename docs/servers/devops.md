---
title: Developer Tools
section: Self-Hosting & Servers
updated: 2026-04-16
---

# Developer Tools

Infrastructure, CI/CD, monitoring, and development utilities for managing code, containers, and system health.

## Nginx & Apache HTTPD
**Purpose**: High-performance web servers and reverse proxies. Nginx excels at static content and proxying; Apache provides `.htaccess` support and extensive module ecosystem.
```bash
podman run -d \
  --name nginx \
  -p 127.0.0.1:8081:80 \
  -v /home/user/www:/usr/share/nginx/html:ro,Z \
  -v /home/user/nginx.conf:/etc/nginx/nginx.conf:ro,Z \
  --restart unless-stopped \
  nginx:alpine

podman run -d \
  --name apache \
  -p 127.0.0.1:8082:80 \
  -v /home/user/www:/usr/local/apache2/htdocs:ro,Z \
  --restart unless-stopped \
  httpd:alpine
```

## Gitea & Forgejo
**Purpose**: Lightweight, self-hosted Git servers with web UI, issue tracking, wikis, and CI integration. Forgejo is a community-driven fork of Gitea.
```bash
podman run -d \
  --name gitea \
  -p 127.0.0.1:3000:3000 \
  -p 127.0.0.1:2222:22 \
  -v /home/user/gitea:/data:Z \
  -e USER_UID=$(id -u) -e USER_GID=$(id -g) \
  --restart unless-stopped \
  gitea/gitea:latest
```

## Woodpecker CI
**Purpose**: Simple, Kubernetes/Podman-compatible CI/CD engine. Integrates seamlessly with Gitea/Forgejo for automated builds and tests.
```yaml
# ~/woodpecker/compose.yml
services:
  woodpecker-server:
    image: woodpeckerci/woodpecker-server:latest
    ports: ["127.0.0.1:8000:8000"]
    environment:
      WOODPECKER_OPEN: "true"
      WOODPECKER_HOST: https://ci.example.com
      WOODPECKER_GITEA: "true"
      WOODPECKER_GITEA_URL: https://git.example.com
      WOODPECKER_GITEA_CLIENT: <oauth2-client-id>
      WOODPECKER_GITEA_SECRET: <oauth2-client-secret>
      WOODPECKER_AGENT_SECRET: <random-secret>
    volumes: [woodpecker_/var/lib/woodpecker]
    restart: unless-stopped
  woodpecker-agent:
    image: woodpeckerci/woodpecker-agent:latest
    environment:
      WOODPECKER_SERVER: woodpecker-server:9000
      WOODPECKER_AGENT_SECRET: <same-random-secret>
    volumes: [/run/user/1000/podman/podman.sock:/var/run/docker.sock]
    depends_on: [woodpecker-server]
    restart: unless-stopped
```

## Monitoring Stack
**Purpose**: Collect system/application metrics (Prometheus), visualize dashboards (Grafana), and get real-time performance telemetry (Netdata).
```bash
# Node Exporter
podman run -d --name node-exporter --network host -v /proc:/host/proc:ro,rslave -v /sys:/host/sys:ro,rslave -v /:/rootfs:ro,rslave --restart unless-stopped prom/node-exporter --path.procfs=/host/proc --path.sysfs=/host/sys

# Prometheus
mkdir -p ~/monitoring && cat > ~/monitoring/prometheus.yml <<'EOF'
global: { scrape_interval: 15s }
scrape_configs: [{ job_name: 'node', static_configs: [{ targets: ['localhost:9100'] }] }]
EOF
podman run -d --name prometheus -p 127.0.0.1:9090:9090 -v ~/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro,Z -v prometheus_/prometheus --restart unless-stopped prom/prometheus

# Grafana
podman run -d --name grafana -p 127.0.0.1:3001:3000 -v grafana_/var/lib/grafana -e GF_SECURITY_ADMIN_PASSWORD=changeme --restart unless-stopped grafana/grafana

# Loki (Logs)
podman run -d --name loki -p 127.0.0.1:3100:3100 -v /home/user/loki:/loki:Z --restart unless-stopped grafana/loki:latest

# Netdata
podman run -d --name netdata -p 127.0.0.1:19999:19999 --cap-add SYS_PTRACE --security-opt apparmor=unconfined -v netdata_config:/etc/netdata -v netdata_lib:/var/lib/netdata -v netdata_cache:/var/cache/netdata -v /etc/passwd:/host/etc/passwd:ro -v /proc:/host/proc:ro -v /sys:/host/sys:ro --restart unless-stopped netdata/netdata
```

## Uptime Kuma
**Purpose**: Beautiful, self-hosted uptime monitoring dashboard. Supports HTTP, TCP, Ping, DNS, and push notifications.
```bash
podman run -d \
  --name uptime-kuma \
  -p 127.0.0.1:3001:3001 \
  -v /home/user/uptime-kuma:/app/Z \
  --restart unless-stopped \
  louislam/uptime-kuma:latest
```

## Dozzle
**Purpose**: Real-time web UI for streaming container logs. Auto-detects running containers via Podman socket.
```bash
podman run -d \
  --name dozzle \
  -p 127.0.0.1:8888:8080 \
  -v /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro \
  --restart unless-stopped \
  amir20/dozzle:latest
```

## Workflow & Notifications
**n8n**: Workflow automation platform.
```bash
podman run -d --name n8n -p 127.0.0.1:5678:5678 -e N8N_PROTOCOL=https -e N8N_HOST=n8n.example.com -v /home/user/n8n:/home/node/.n8n:Z --restart unless-stopped docker.n8n.io/n8nio/n8n:latest
```

**Healthchecks**: Monitor cron jobs and alert on failure.
```bash
podman run -d --name healthchecks -p 127.0.0.1:8000:8000 -e SECRET_KEY=$(openssl rand -base64 32) -e SITE_ROOT=https://hc.example.com -v /home/user/healthchecks/data:/Z --restart unless-stopped healthchecks/healthchecks:latest
```

**Mailpit**: Intercept outbound emails for development/testing.
```bash
podman run -d --name mailpit -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 --restart unless-stopped axllent/mailpit
```

**Listmonk**: Newsletter and mailing list manager.
```bash
# ~/listmonk/compose.yml
services:
  listmonk:
    image: listmonk/listmonk:latest
    ports: ["127.0.0.1:9000:9000"]
    environment:
      LISTMONK_app__address: "0.0.0.0:9000"
      LISTMONK_db__host: db
      LISTMONK_db__user: listmonk
      LISTMONK_db__password: listmonk
      LISTMONK_db__database: listmonk
    depends_on: [db]
    restart: unless-stopped
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: listmonk
      POSTGRES_PASSWORD: listmonk
      POSTGRES_DB: listmonk
    volumes: [pg_/var/lib/postgresql/data]
    restart: unless-stopped
volumes: {pg_ {}}
```
