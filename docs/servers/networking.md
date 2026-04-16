---
title: Network & Analytics
section: Self-Hosting & Servers
updated: 2026-04-16
---

# Network & Analytics

DNS filtering, privacy-friendly analytics, search engines, dashboards, and latency monitoring.

## Pi-hole / AdGuard Home
**Purpose**: Network-wide DNS ad and tracker blocker. Pi-hole is lightweight; AdGuard supports DoH/DoT natively.
```bash
# Pi-hole
podman run -d \
  --name pihole \
  -p 127.0.0.1:8083:80 \
  -p 53:53/tcp \
  -p 53:53/udp \
  -e TZ=Europe/London \
  -e WEBPASSWORD=changeme \
  -v /home/user/pihole/etc-pihole:/etc/pihole:Z \
  -v /home/user/pihole/etc-dnsmasq.d:/etc/dnsmasq.d:Z \
  --restart unless-stopped \
  pihole/pihole:latest

# AdGuard Home
podman run -d \
  --name adguardhome \
  -p 53:53/tcp -p 53:53/udp \
  -p 127.0.0.1:3000:3000 \
  -p 853:853/tcp \
  -v /home/user/adguard/work:/opt/adguardhome/work:Z \
  -v /home/user/adguard/conf:/opt/adguardhome/conf:Z \
  --restart unless-stopped \
  adguard/adguardhome
```

## Nginx Proxy Manager / Traefik
**Purpose**: GUI-based reverse proxy manager (NPM). Traefik is a dynamic reverse proxy that auto-discovers containers via labels and handles Let's Encrypt automatically.
```bash
podman run -d \
  --name traefik \
  -p 127.0.0.1:80:80 \
  -p 127.0.0.1:443:443 \
  -p 127.0.0.1:8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /home/user/traefik/traefik.yml:/etc/traefik/traefik.yml:Z \
  --restart unless-stopped \
  traefik:v3
```

## SearXNG
**Purpose**: Privacy-respecting meta-search engine. Aggregates results from multiple providers without tracking, logging, or profiling users.
```bash
podman run -d \
  --name searxng \
  -p 127.0.0.1:8080:8080 \
  -v /home/user/searxng/settings:/etc/searxng:Z \
  -e SEARXNG_BASE_URL=https://search.example.com \
  --restart unless-stopped \
  searxng/searxng:latest
```

## Plausible Analytics / Umami
**Purpose**: Lightweight, GDPR-compliant web analytics alternatives to Google Analytics. Focus on privacy, speed, and simple dashboards.
```yaml
# ~/umami/compose.yml
services:
  umami:
    image: ghcr.io/umami-software/umami:postgresql-latest
    ports: ["127.0.0.1:3000:3000"]
    environment:
      DATABASE_URL: postgresql://umami:umami@db:5432/umami
      DATABASE_TYPE: postgresql
      APP_SECRET: $(openssl rand -base64 32)
    depends_on: [db]
    restart: unless-stopped
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: umami
      POSTGRES_PASSWORD: umami
      POSTGRES_DB: umami
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped
volumes: {pg_data: {}}
```

## Homepage / Speedtest Tracker / SmokePing
**Purpose**: Modern application dashboard, automated internet speed test logger, and latency/packet-loss monitor.
```bash
podman run -d \
  --name homepage \
  -p 127.0.0.1:3000:3000 \
  -v /home/user/homepage/config:/app/config:Z \
  --restart unless-stopped \
  ghcr.io/gethomepage/homepage:latest

podman run -d \
  --name speedtest \
  -p 127.0.0.1:8080:80 \
  -e APP_KEY=base64:$(openssl rand -base64 32) \
  -v /home/user/speedtest:/config:Z \
  --restart unless-stopped \
  henrywhitaker3/speedtest-tracker:latest

podman run -d \
  --name smokeping \
  -p 127.0.0.1:8081:80 \
  -v /home/user/smokeping/config:/config:Z \
  -v /home/user/smokeping/data:/data:Z \
  --restart unless-stopped \
  linuxserver/smokeping:latest
```

## Unbound / Netbird
**Purpose**: Unbound is a validating recursive DNS resolver for local privacy. Netbird is an open-source peer-to-peer WireGuard mesh alternative to Tailscale.
```bash
podman run -d \
  --name unbound \
  -p 127.0.0.1:53:53 \
  -p 127.0.0.1:53:53/udp \
  -v /home/user/unbound/unbound.conf:/opt/unbound/etc/unbound/unbound.conf:ro,Z \
  --restart unless-stopped \
  mvance/unbound
```
