---
title: OpenVPN
section: Self-Hosted Networking
updated: 2026-08-28
---

> **Part of the VPN & Tunnels series:** See [all networking docs](../networking)

## OpenVPN

**Purpose:** Legacy, highly configurable VPN standard. Use when you need specific cipher suites, client certificate management, or compatibility with older devices.

```yaml
# ~/openvpn/compose.yaml
services:
  openvpn:
    image: kylemanna/openvpn
    ports:
      - 0.0.0.0:1194:1194/udp
    volumes:
      - /home/user/openvpn:/etc/openvpn:Z
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    sysctls:
      net.ipv4.ip_forward: 1
    restart: unless-stopped
```

```bash
cd ~/openvpn && podman-compose up -d
```

---



---

## See Also

- [Networking](../networking) — all networking docs
