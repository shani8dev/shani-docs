---
title: Developer Tools
section: Self-Hosting & Servers
updated: 2026-04-16
---

# Developer Tools

Infrastructure, CI/CD, monitoring, and development utilities.

## Nginx & Apache HTTPD
**Purpose**: High-performance web servers and reverse proxies. Nginx excels at static content and proxying; Apache provides `.htaccess` support.
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
**Purpose**: Lightweight, self-hosted Git servers with web UI, issue tracking, wikis, and CI integration. Forgejo is a community-driven fork.
```bash
podman run -d \
  --name gitea \
  -p 127.0.0.1:3000:3000 \
  -p 127.0.0.1:2222:22 \
  -v /home/user/gitea:/data:Z \
  -e USER_UID=$(id -u) \
  -e USER_GID=$(id -g) \
  --restart unless-stopped \
  gitea/gitea:latest
```
> Configure clients to use `Port 2222` for `git.example.com`.

## Woodpecker CI / Drone CI
**Purpose**: Simple, Kubernetes/Podman-compatible CI/CD engines. Integrates seamlessly with Gitea/Forgejo for automated builds and tests.
```yaml
# ~/drone/compose.yml
services:
  drone-server:
    image: drone/drone:2
    ports: ["127.0.0.1:80:80"]
    volumes: [/home/user/drone/data:/var/lib/drone:Z]
    environment:
      DRONE_GITEA_SERVER: https://git.example.com
      DRONE_GITEA_CLIENT_ID: <id>
      DRONE_GITEA_CLIENT_SECRET: <secret>
      DRONE_RPC_SECRET: <secret>
    restart: unless-stopped
  drone-runner:
    image: drone/drone-runner-docker:1
    volumes: [/var/run/docker.sock:/var/run/docker.sock]
    environment:
      DRONE_RPC_PROTO: http
      DRONE_RPC_HOST: drone-server
      DRONE_RPC_SECRET: <secret>
    depends_on: [drone-server]
    restart: unless-stopped
```

## Docker Registry / Nexus
**Purpose**: Private, secure container image registry and universal artifact manager (Maven, npm, PyPI, Docker).
```bash
# Registry
podman run -d \
  --name registry \
  -p 127.0.0.1:5000:5000 \
  -v /home/user/registry/data:/var/lib/registry:Z \
  -e REGISTRY_STORAGE_DELETE_ENABLED=true \
  --restart unless-stopped \
  registry:2

# Nexus
podman run -d \
  --name nexus \
  -p 127.0.0.1:8081:8081 \
  -v /home/user/nexus/nexus-data:/nexus-data:Z \
  --restart unless-stopped \
  sonatype/nexus3
```

## code-server
**Purpose**: VS Code running in the browser with full terminal, extensions, and language support.
```bash
podman run -d \
  --name code-server \
  -p 127.0.0.1:8443:8443 \
  -v /home/user/code-server:/home/coder:Z \
  -e PASSWORD=changeme \
  --restart unless-stopped \
  lscr.io/linuxserver/code-server:latest
```

## Prometheus + Grafana + Loki + Netdata
**Purpose**: Collect metrics (Prometheus), visualize dashboards (Grafana), aggregate logs (Loki), and get real-time telemetry (Netdata).
```bash
# Node Exporter
podman run -d \
  --name node-exporter \
  --network host \
  -v /proc:/host/proc:ro,rslave \
  -v /sys:/host/sys:ro,rslave \
  -v /:/rootfs:ro,rslave \
  --restart unless-stopped \
  prom/node-exporter \
  --path.procfs=/host/proc --path.sysfs=/host/sys

# Grafana
podman run -d \
  --name grafana \
  -p 127.0.0.1:3001:3000 \
  -v grafana_data:/var/lib/grafana \
  -e GF_SECURITY_ADMIN_PASSWORD=changeme \
  --restart unless-stopped \
  grafana/grafana

# Loki
podman run -d \
  --name loki \
  -p 127.0.0.1:3100:3100 \
  -v /home/user/loki:/loki:Z \
  --restart unless-stopped \
  grafana/loki:latest

# Netdata
podman run -d \
  --name netdata \
  -p 127.0.0.1:19999:19999 \
  --cap-add SYS_PTRACE \
  --security-opt apparmor=unconfined \
  -v netdata_config:/etc/netdata \
  -v netdata_lib:/var/lib/netdata \
  -v netdata_cache:/var/cache/netdata \
  -v /etc/passwd:/host/etc/passwd:ro \
  -v /proc:/host/proc:ro \
  -v /sys:/host/sys:ro \
  --restart unless-stopped \
  netdata/netdata
```

## Uptime Kuma / Dozzle / n8n / Healthchecks / Mailpit / Listmonk
**Purpose**: Uptime monitoring, live container logs, workflow automation, cron monitoring, email testing, and newsletter management.
```bash
# Uptime Kuma
podman run -d \
  --name uptime-kuma \
  -p 127.0.0.1:3001:3001 \
  -v /home/user/uptime-kuma:/app/data:Z \
  --restart unless-stopped \
  louislam/uptime-kuma:latest

# Dozzle
podman run -d \
  --name dozzle \
  -p 127.0.0.1:8888:8080 \
  -v /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro \
  --restart unless-stopped \
  amir20/dozzle:latest

# n8n
podman run -d \
  --name n8n \
  -p 127.0.0.1:5678:5678 \
  -e N8N_HOST=n8n.example.com \
  -e N8N_PROTOCOL=https \
  -e WEBHOOK_URL=https://n8n.example.com \
  -v /home/user/n8n:/home/node/.n8n:Z \
  --restart unless-stopped \
  docker.n8n.io/n8nio/n8n:latest

# Healthchecks
podman run -d \
  --name healthchecks \
  -p 127.0.0.1:8000:8000 \
  -e SECRET_KEY=$(openssl rand -base64 32) \
  -e SITE_ROOT=https://hc.example.com \
  -v /home/user/healthchecks/data:/data:Z \
  --restart unless-stopped \
  healthchecks/healthchecks:latest

# Mailpit
podman run -d \
  --name mailpit \
  -p 127.0.0.1:1025:1025 \
  -p 127.0.0.1:8025:8025 \
  --restart unless-stopped \
  axllent/mailpit

# Listmonk (requires compose with Postgres) Newsletter and mailing list manager.
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
