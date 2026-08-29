---
title: Pangolin
section: Self-Hosted Networking
updated: 2026-08-28
---

**Purpose:** A fully open-source alternative to Cloudflare Tunnel. Expose local services via a public HTTPS URL through an encrypted WireGuard tunnel to a VPS you control. No third-party cloud — you own the entire path. Supports identity-aware access control per resource.

Pangolin has two components:
- **Pangolin** — the server, runs on a VPS, receives tunnelled traffic and routes it to your services
- **Newt** — the agent, runs on your Shani OS machine, creates the outbound WireGuard tunnel

### 1. Server Setup (on a VPS)

`/home/user/pangolin/config/config.yml`:
```yaml
app:
  dashboard_url: https://pangolin.yourdomain.com
  base_domain: yourdomain.com
  admin_email: admin@yourdomain.com
  admin_password: changeme
  log_level: info
server:
  external_port: 443
  internal_port: 8080
db:
  encryption_key: "your-32-char-hex-key"
```

```yaml
# ~/pangolin/compose.yaml
services:
  pangolin:
    image: fosrl/pangolin:latest
    ports:
      - 0.0.0.0:443:443
      - 0.0.0.0:51820:51820/udp
    volumes:
      - /home/user/pangolin/config:/app/config:Z
      - /home/user/pangolin/data:/app/data:Z
    restart: unless-stopped
```

```bash
cd ~/pangolin && podman-compose up -d
```

Access the dashboard at `https://pangolin.yourdomain.com`, create a site, and copy the Newt credentials.

#### VPS firewall
open `443/tcp` and `51820/udp`

### 2. Newt Agent (on this system)

```yaml
# ~/newt/compose.yaml
services:
  newt:
    image: fosrl/newt:latest
    environment:
      PANGOLIN_URL: https://pangolin.yourdomain.com
      NEWT_ID: <your-newt-id>
      NEWT_SECRET: <your-newt-secret>
    restart: unless-stopped
```

```bash
cd ~/newt && podman-compose up -d
```

## See Also

- [WireGuard / WG-Easy](./wireguard-easy.md)
- [Cloudflared](../networking/cloudflared.md)
- [NetBird](./netbird.md)
