---
title: AdGuard Home
section: Self-Hosted Networking
updated: 2026-08-28
---

> **Part of the Networking & Infrastructure series:** See [all networking docs](../networking)

## AdGuard Home

**Purpose:** Pi-hole alternative with native DNS-over-HTTPS (DoH) and DNS-over-TLS (DoT) support, a cleaner UI, per-client rules, and built-in parental controls.

```yaml
# ~/adguardhome/compose.yaml
services:
  adguardhome:
    image: adguard/adguardhome
    ports:
      - 53:53/tcp
      - 53:53/udp
      - 127.0.0.1:3000:3000
      - 853:853/tcp
    volumes:
      - /home/user/adguard/work:/opt/adguardhome/work:Z
      - /home/user/adguard/conf:/opt/adguardhome/conf:Z
    restart: unless-stopped
```

```bash
cd ~/adguardhome && podman-compose up -d
```

Access the setup wizard at `http://localhost:3000` on first run. After setup, the UI moves to port `80` (or the port you configure).

**Firewall:** (for DoT from external devices):
```bash
sudo firewall-cmd --add-port=853/tcp --permanent && sudo firewall-cmd --reload
```

#### Common operations
```bash
# View logs
podman logs -f adguardhome

# Test DNS resolution via AdGuard
podman exec adguardhome nslookup google.com 127.0.0.1

# Query statistics via API
curl -u admin:changeme http://localhost:3000/control/stats

# Update blocklists
curl -X POST -u admin:changeme http://localhost:3000/control/filtering/refresh   -H "Content-Type: application/json" -d '{"whitelist":false}'

# Add a custom DNS rewrite (internal domain)
curl -X POST -u admin:changeme http://localhost:3000/control/rewrite/add   -H "Content-Type: application/json"   -d '{"domain":"myserver.home.local","answer":"192.168.1.10"}'
```

---



---

## See Also

- [Networking & Infrastructure](networking) — overview
