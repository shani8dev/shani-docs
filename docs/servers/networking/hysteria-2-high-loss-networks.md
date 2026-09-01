---
title: Hysteria 2 (High-Loss Networks)
section: Self-Hosting & Servers
updated: 2026-08-28
---

> **Part of the VPN & Tunnels series:** See [all networking docs](../networking)

## Hysteria 2 (High-Loss Networks)

**Purpose:** A QUIC-based proxy and tunnel that performs well in high-latency, high-loss, or censored network environments where WireGuard/TCP struggle. Traffic looks like normal HTTP/3 to firewalls.

`/home/user/hysteria/config.yaml`:
```yaml
listen: :443
tls:
  cert: /etc/hysteria/fullchain.pem
  key: /etc/hysteria/privkey.pem
auth:
  type: password
  password: "your-strong-password"
```

```yaml
# ~/hysteria/compose.yaml
services:
  hysteria:
    image: ghcr.io/apernet/hysteria:latest
    ports:
      - 0.0.0.0:443:443/udp
    volumes:
      - /home/user/hysteria/config.yaml:/etc/hysteria/config.yaml:ro,Z
      - /home/user/hysteria/certs:/etc/hysteria:ro,Z
    command: server -c /etc/hysteria/config.yaml
    restart: unless-stopped
```

```bash
cd ~/hysteria && podman-compose up -d
```

---



---

## See Also

- [Networking](../networking) — all networking docs
