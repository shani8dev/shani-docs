---
title: Pritunl
section: Self-Hosting & Servers
updated: 2026-08-28
---

**Purpose:** Enterprise-grade VPN with a modern web UI. Supports WireGuard and OpenVPN, SSO, multi-site routing, and audit logging. Requires MongoDB.

### 1. MongoDB Backend
```yaml
# ~/pritunl-mongo/compose.yaml
services:
  pritunl-mongo:
    image: mongo:6
    ports:
      - 127.0.0.1:27017:27017
    volumes:
      - /home/user/pritunl/mongo:/data/db:Z
    restart: unless-stopped
```

```bash
cd ~/pritunl-mongo && podman-compose up -d
```

### 2. Pritunl Server
```yaml
# ~/pritunl/compose.yaml
services:
  pritunl:
    image: linuxserver/pritunl:latest
    network_mode: host
    volumes:
      - /home/user/pritunl/config:/etc/pritunl:Z
    cap_add:
      - NET_ADMIN
      - SYS_ADMIN
    restart: unless-stopped
```

```bash
cd ~/pritunl && podman-compose up -d
```

#### Initial setup
1. Generate setup key: `podman exec pritunl pritunl setup-key`
2. Access UI: `https://<server-ip>:443`
3. Set MongoDB URI: `mongodb://127.0.0.1:27017/pritunl`
4. Create Org → Add Users → Create Server → Attach → Start

**Firewall:** `sudo firewall-cmd --add-port=443/tcp --add-port=51820/udp --add-port=1194/udp --permanent && sudo firewall-cmd --reload`

## See Also

- [WireGuard / WG-Easy](./wireguard-easy.md)
- [OpenVPN](openvpn.md)
- [Firezone](./firezone.md)
