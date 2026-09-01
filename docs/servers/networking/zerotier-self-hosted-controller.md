---
title: ZeroTier (Self-Hosted Controller)
section: Self-Hosting & Servers
updated: 2026-08-28
---

> **Part of the VPN & Tunnels series:** See [all networking docs](../networking)

## ZeroTier (Self-Hosted Controller)

**Purpose:** Run a private ZeroTier network controller without using ZeroTier's central cloud servers. Manage virtual networks and peers on your own hardware.

```yaml
# ~/zerotier-controller/compose.yaml
services:
  zerotier-controller:
    image: mgk/zerotier-controller:latest
    ports:
      - 127.0.0.1:9993:9993/udp
      - 127.0.0.1:3180:3180/tcp
    volumes:
      - /home/user/zerotier-controller:/var/lib/ztnetwork:Z
    restart: unless-stopped
```

```bash
cd ~/zerotier-controller && podman-compose up -d
```

- **Dashboard:** `http://localhost:3180`
- **Client setup:** `zerotier-cli join <network-id> --controller <your-server-ip>:3180`

---



---

## See Also

- [Networking](../networking) — all networking docs
