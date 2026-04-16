---
title: Network & Analytics
section: Self-Hosting & Servers
updated: 2026-04-16
---

# Network & Analytics

DNS filtering, privacy-friendly analytics, search engines, dashboards, and latency monitoring tools.

## Pi-hole
**Purpose**: Network-wide DNS ad and tracker blocker. Intercepts DNS requests at the router level, blocking ads before they reach any device.
```bash
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
# Open DNS port if used as LAN DNS
sudo firewall-cmd --add-service=dns --permanent && sudo firewall-cmd --reload
```

## AdGuard Home
**Purpose**: DNS-based ad/tracker blocker with support for DNS-over-HTTPS (DoH), DNS-over-TLS (DoT), and client-level filtering rules.
```bash
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

## Nginx Proxy Manager
**Purpose**: GUI-based reverse proxy manager. Simplifies SSL certificate issuance, proxy host configuration, and access lists with a web dashboard.
```yaml
# ~/npm/compose.yml
services:
  app:
    image: jc21/nginx-proxy-manager:latest
    ports: ["80:80", "443:443", "127.0.0.1:81:81"]
    volumes:
      - /home/user/npm/data:/Z
      - /home/user/npm/letsencrypt:/etc/letsencrypt:Z
    restart: unless-stopped
```
```bash
mkdir -p ~/npm/data ~/npm/letsencrypt && cd ~/npm
podman-compose up -d
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

## Plausible Analytics & Umami
**Purpose**: Lightweight, GDPR-compliant web analytics alternatives to Google Analytics. Focus on privacy, speed, and simple dashboards.

**Plausible**
```bash
mkdir -p ~/plausible && cd ~/plausible
# Use compose.yml (plausible + postgres + clickhouse)
podman-compose up -d
```

**Umami**
```bash
mkdir -p ~/umami && cd ~/umami
# Use compose.yml (umami + postgres)
podman-compose up -d
```

## Homepage
**Purpose**: Modern, highly customizable application dashboard. Aggregates service status, docker containers, calendar events, and system metrics in one view.
```bash
podman run -d \
  --name homepage \
  -p 127.0.0.1:3000:3000 \
  -v /home/user/homepage/config:/app/config:Z \
  --restart unless-stopped \
  ghcr.io/gethomepage/homepage:latest
```

## Speedtest Tracker & SmokePing
**Purpose**: Speedtest Tracker automates internet speed tests and logs results over time. SmokePing monitors network latency and packet loss with historical graphs.
```bash
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
  -v /home/user/smokeping//Z \
  --restart unless-stopped \
  linuxserver/smokeping:latest
```
