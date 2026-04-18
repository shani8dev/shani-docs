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
      - /run/user/$(id -u)/podman/podman.sock:/var/run/docker.sock:ro
      - woodpecker_agent:/var/lib/woodpecker
    environment:
      WOODPECKER_SERVER: woodpecker-server:9000
      WOODPECKER_AGENT_SECRET: changeme
    depends_on: [woodpecker-server]
    restart: unless-stopped

volumes: {woodpecker_data: {}, woodpecker_agent: {}}
```

---

## code-server

**Purpose:** VS Code running in the browser with full terminal, extensions, and language support. Accessible from any device on your tailnet — develop on your server from a tablet, Chromebook, or low-powered laptop.

```bash
podman run -d \
  --name code-server \
  -p 127.0.0.1:8443:8443 \
  -v /home/user/code-server:/home/coder:Z \
  -e PASSWORD=changeme \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  lscr.io/linuxserver/code-server:latest
```

**Caddy:**
```caddyfile
code.home.local { tls internal; reverse_proxy localhost:8443 }
```

---

## Gitpod / Coder (Cloud Development Environments)

**Purpose:** Self-hosted cloud development environments. Each developer gets an isolated, pre-configured container workspace with their tooling, extensions, and dotfiles — reproducible from a Git repo. Coder is lighter and better for self-hosting; Gitpod requires more resources.

```bash
# Coder
podman run -d \
  --name coder \
  -p 127.0.0.1:3001:3000 \
  -v /home/user/coder:/var/lib/coder:Z \
  -v /run/user/$(id -u)/podman/podman.sock:/var/run/docker.sock:ro \
  -e CODER_ACCESS_URL=https://coder.home.local \
  -e CODER_WILDCARD_ACCESS_URL="*.coder.home.local" \
  --restart unless-stopped \
  ghcr.io/coder/coder:latest
```

---

## Nginx & Apache HTTPD

**Purpose:** High-performance web servers and reverse proxies. Nginx excels at static content and proxying; Apache provides `.htaccess` support. Use these when you need full server-level config, not just a reverse proxy.

```bash
# Nginx
podman run -d \
  --name nginx \
  -p 127.0.0.1:8081:80 \
  -v /home/user/www:/usr/share/nginx/html:ro,Z \
  -v /home/user/nginx.conf:/etc/nginx/nginx.conf:ro,Z \
  --restart unless-stopped \
  nginx:alpine

# Apache HTTPD
podman run -d \
  --name apache \
  -p 127.0.0.1:8082:80 \
  -v /home/user/www:/usr/local/apache2/htdocs:ro,Z \
  --restart unless-stopped \
  httpd:alpine
```

---

## Private Container Registry

**Purpose:** Store and serve your own container images. Useful for CI/CD pipelines that push images built by Woodpecker and pull them on deploy.

```bash
podman run -d \
  --name registry \
  -p 127.0.0.1:5000:5000 \
  -v /home/user/registry/data:/var/lib/registry:Z \
  -e REGISTRY_STORAGE_DELETE_ENABLED=true \
  --restart unless-stopped \
  registry:2
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

```bash
podman run -d \
  --name mailpit \
  -p 127.0.0.1:1025:1025 \
  -p 127.0.0.1:8025:8025 \
  --restart unless-stopped \
  axllent/mailpit
```

Configure apps to use SMTP host `localhost`, port `1025`. View emails at `http://localhost:8025`.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Gitea SSH push fails | Confirm client is using `Port 2222` in `~/.ssh/config`; check `gitea` user has write access to the data volume |
| Woodpecker agent not picking up jobs | Verify `WOODPECKER_AGENT_SECRET` matches on server and agent; check the agent has access to the Docker/Podman socket |



| n8n webhook not triggering | Ensure `WEBHOOK_URL` is the publicly accessible URL; check that Caddy is proxying correctly |
| code-server extension install fails | The container needs outbound internet access; verify network is not blocked by firewalld |
