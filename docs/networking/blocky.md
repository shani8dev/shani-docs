---
title: Blocky
section: Self-Hosted Networking
updated: 2026-08-28
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.

## Blocky (Fast DNS Ad Blocker)

**Purpose:** High-performance DNS proxy written in Go. Blocks ads and trackers via deny-lists (same blocklists as Pi-hole), supports DNS-over-HTTPS and DNS-over-TLS upstream resolvers, per-client group rules, conditional forwarding, query logging to a database, and response caching with prefetching. Starts in under a second and uses a fraction of Pi-hole's RAM — good choice for low-power hardware or containers where resource efficiency matters.

```yaml
# ~/blocky/compose.yml
services:
  blocky:
    image: spx01/blocky:latest
    ports:
      - "53:53/tcp"
      - "53:53/udp"
      - "127.0.0.1:4000:4000"
    volumes:
      - /home/user/blocky/config.yml:/app/config.yml:ro,Z
    restart: unless-stopped
```

```bash
cd ~/blocky && podman-compose up -d
```

##### Example `config.yml`

```yaml
upstreams:
  groups:
    default:
      - https://one.one.one.one/dns-query    # Cloudflare DoH
      - https://dns.quad9.net/dns-query      # Quad9 DoH

blocking:
  blackLists:
    ads:
      - https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts
      - https://adaway.org/hosts.txt
  clientGroupsBlock:
    default:
      - ads

caching:
  minTime: 5m
  maxTime: 30m
  prefetching: true

queryLog:
  type: console
  logRetentionDays: 7

ports:
  dns: 53
  http: 4000
```

> **Pi-hole vs Blocky:** Use Pi-hole or AdGuard Home for a dashboard-heavy, click-to-manage experience. Use Blocky when you want a lean, config-file-driven blocker with better performance and no web UI overhead.

## See Also

- [Pi-hole](pihole.md)
- [AdGuard Home](adguard-home.md)
- [Unbound](unbound.md)
