---
title: Network & Analytics
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Network & Analytics

DNS filtering, privacy-friendly analytics, search engines, dashboards, latency monitoring, and network utilities.

---

## Pi-hole

**Purpose:** Network-wide DNS ad and tracker blocker. Runs as your LAN's DNS server and blocks ads, telemetry, and malware domains for every device — phones, smart TVs, IoT — without installing anything on them.

```bash
podman run -d \
  --name pihole \
  -p 127.0.0.1:8083:80 \
  -p 53:53/tcp \
  -p 53:53/udp \
  -e TZ=Asia/Kolkata \
  -e WEBPASSWORD=changeme \
  -v /home/user/pihole/etc-pihole:/etc/pihole:Z \
  -v /home/user/pihole/etc-dnsmasq.d:/etc/dnsmasq.d:Z \
  --restart unless-stopped \
  pihole/pihole:latest
```

> Set your router's DHCP DNS option to your server's LAN IP. All devices will automatically use Pi-hole.

**Caddy:**
```caddyfile
pihole.home.local { tls internal; reverse_proxy localhost:8083 }
```

---

## AdGuard Home

**Purpose:** Pi-hole alternative with native DNS-over-HTTPS (DoH) and DNS-over-TLS (DoT) support, a cleaner UI, per-client rules, and built-in parental controls.

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

Access the setup wizard at `http://localhost:3000` on first run. After setup, the UI moves to port `80` (or the port you configure).

**Firewall** (for DoT from external devices):
```bash
sudo firewall-cmd --add-port=853/tcp --permanent && sudo firewall-cmd --reload
```

---

## Unbound (Recursive DNS Resolver)

**Purpose:** Validating, caching, recursive DNS resolver. Use it upstream of Pi-hole or AdGuard Home for DNSSEC validation and to eliminate your ISP's DNS from the picture entirely. Queries go directly to root nameservers.

```bash
podman run -d \
  --name unbound \
  -p 127.0.0.1:5335:53/tcp \
  -p 127.0.0.1:5335:53/udp \
  -v /home/user/unbound/unbound.conf:/opt/unbound/etc/unbound/unbound.conf:ro,Z \
  --restart unless-stopped \
  mvance/unbound
```

In Pi-hole: Settings → DNS → Custom upstream DNS → `127.0.0.1#5335`. Disable all other upstream DNS entries.

---

## Nginx Proxy Manager

**Purpose:** GUI-based reverse proxy with Let's Encrypt integration. If you find Caddy's Caddyfile syntax unfamiliar, NPM offers a click-through interface for creating proxy hosts, redirects, and SSL termination.

```yaml
# ~/npm/compose.yml
services:
  npm:
    image: jc21/nginx-proxy-manager:latest
    ports:
      - "80:80"
      - "443:443"
      - "127.0.0.1:81:81"
    volumes:
      - /home/user/npm/data:/data:Z
      - /home/user/npm/letsencrypt:/etc/letsencrypt:Z
    restart: unless-stopped
```

Access the admin UI at `http://localhost:81`. Default credentials: `admin@example.com` / `changeme` — change immediately.

---

## Traefik

**Purpose:** Dynamic reverse proxy that auto-discovers containers via Docker/Podman labels. Zero-config HTTPS via Let's Encrypt. Best for setups where containers are frequently added and removed.

```bash
podman run -d \
  --name traefik \
  -p 0.0.0.0:80:80 \
  -p 0.0.0.0:443:443 \
  -p 127.0.0.1:8080:8080 \
  -v /run/user/$(id -u)/podman/podman.sock:/var/run/docker.sock:ro \
  -v /home/user/traefik/traefik.yml:/etc/traefik/traefik.yml:Z \
  --restart unless-stopped \
  traefik:v3
```

---

## SearXNG

**Purpose:** Privacy-respecting meta-search engine. Aggregates results from Google, Bing, DuckDuckGo, and 70+ other sources without tracking, logging, or profiling users. Run it on your server and use it as your default browser search engine.

```bash
podman run -d \
  --name searxng \
  -p 127.0.0.1:8091:8080 \
  -v /home/user/searxng/settings:/etc/searxng:Z \
  -e SEARXNG_BASE_URL=https://search.home.local \
  --restart unless-stopped \
  searxng/searxng:latest
```

---

## Plausible Analytics

See the [Business Intelligence wiki](https://docs.shani.dev/doc/servers/business-intelligence#plausible-analytics-web-analytics) for the full Plausible setup.

---

## Umami

See the [Business Intelligence wiki](https://docs.shani.dev/doc/servers/business-intelligence#umami-simple-web-analytics) for the full Umami setup.

---

## Homepage

**Purpose:** Application dashboard showing live status of all your services, system metrics, and bookmarks. See the [Container Management wiki](https://docs.shani.dev/doc/servers/management#homepage-service-dashboard) for the full setup.

---

## Speedtest Tracker

See the [Monitoring wiki](https://docs.shani.dev/doc/servers/monitoring#speedtest-tracker) for the Speedtest Tracker setup.

---

## SmokePing

See the [Monitoring wiki](https://docs.shani.dev/doc/servers/monitoring#smokeping-latency--packet-loss) for the SmokePing setup.

---

## Netbird (Open-Source WireGuard Mesh)

**Purpose:** Open-source peer-to-peer VPN management platform. Works like Tailscale but self-hostable from top to bottom — management API, relay server, and dashboard all run on your own infrastructure. Uses WireGuard for direct device-to-device tunnels.

See the full setup in the [VPN & Tunnels wiki](https://docs.shani.dev/doc/servers/vpn-tunnels).

---

## Caddy Configuration

```caddyfile
pihole.home.local      { tls internal; reverse_proxy localhost:8083 }
search.home.local      { tls internal; reverse_proxy localhost:8091 }
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Pi-hole not blocking ads on some devices | Verify the device's DNS is pointing at the server IP (not 1.1.1.1 hardcoded); check Pi-hole's query log to confirm queries are reaching it |
| AdGuard DoT not working | Ensure `853/tcp` is open in firewalld; some clients need the full TLS hostname in the format `tls://server-ip` |
| Port 53 conflict | `systemd-resolved` may be listening on port 53 — run `sudo systemctl disable --now systemd-resolved` or configure it to use a stub listener only |
| Traefik not picking up containers | Ensure `--providers.docker=true` in `traefik.yml`; verify containers have the correct `traefik.enable=true` label |
