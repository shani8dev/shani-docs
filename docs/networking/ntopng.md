---
title: Ntopng
section: Self-Hosted Networking
updated: 2026-08-28
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.

## Ntopng (Network Traffic Analysis)

**Purpose:** Real-time network traffic monitoring and analysis. Shows active flows, top talkers, protocol breakdown, geo-IP mapping, and historical traffic trends. Can integrate with nProbe for deep packet inspection and with pfSense/OPNsense via NetFlow/sFlow export.

```yaml
# ~/ntopng/compose.yaml
services:
  ntopng:
    image: ntop/ntopng:stable
    network_mode: host
    volumes:
      - /home/user/ntopng/data:/var/lib/ntopng:Z
    environment:
      NTOPNG_COMMUNITY: true
    command: --interface=eth0 --http-port=3000 --data-dir=/var/lib/ntopng --community
    restart: unless-stopped
```

```bash
cd ~/ntopng && podman-compose up -d
```

> Replace `eth0` with your primary network interface name (`ip link show`). `--network host` is required for ntopng to see actual traffic.

## See Also

- [LibreNMS](librenms.md)
- [Caddy](../networking/caddy.md)
