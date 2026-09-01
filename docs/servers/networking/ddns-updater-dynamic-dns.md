---
title: ddns-updater (Dynamic DNS)
section: Self-Hosting & Servers
updated: 2026-08-28
---

> **Part of the Networking & Infrastructure series:** See [all networking docs](../networking)

## ddns-updater (Dynamic DNS)

**Purpose:** Keeps your DNS records updated when your home/server IP changes. Polls your current public IP on a schedule and updates records via the APIs of 30+ providers — Cloudflare, Namecheap, DuckDNS, Gandi, Porkbun, Hetzner, and more. Essential if you're self-hosting from a residential or dynamic-IP connection without a static IP.

```yaml
# ~/ddns-updater/compose.yaml
services:
  ddns-updater:
    image: qmcgaw/ddns-updater:latest
    ports:
      - 127.0.0.1:8000:8000
    volumes:
      - /home/user/ddns-updater/data:/updater/data:Z
    environment:
      PERIOD: 5m
      UPDATE_COOLDOWN_PERIOD: 5m
      PUBLICIP_FETCHERS: all
      LOG_LEVEL: info
      TZ: Asia/Kolkata
    restart: unless-stopped
```

```bash
cd ~/ddns-updater && podman-compose up -d
```

##### Configure providers in `/home/user/ddns-updater/data/config.json`

```json
{
  "settings": [
    {
      "provider": "cloudflare",
      "zone_identifier": "your-zone-id",
      "domain": "home.example.com",
      "host": "@",
      "ttl": 300,
      "proxied": false,
      "token": "your-cloudflare-api-token",
      "ip_version": "ipv4"
    },
    {
      "provider": "duckdns",
      "domain": "myhome.duckdns.org",
      "token": "your-duckdns-token",
      "ip_version": "ipv4"
    }
  ]
}
```

Access the status dashboard at `http://localhost:8000` — shows last update time, current IP, and success/failure per record.

**Caddy:**
```caddyfile
ddns.home.local { tls internal; reverse_proxy localhost:8000 }
```

> **Tip:** Pair with a short TTL (300 seconds) on the DNS record so clients pick up the new IP quickly after a change.

---



---

## See Also

- [Networking & Infrastructure](networking) — overview
