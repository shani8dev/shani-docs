---
title: Unbound
section: Self-Hosted Networking
updated: 2026-08-28
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.

## Unbound (Recursive DNS Resolver)

**Purpose:** Validating, caching, recursive DNS resolver. Use it upstream of Pi-hole or AdGuard Home for DNSSEC validation and to eliminate your ISP's DNS from the picture entirely. Queries go directly to root nameservers.

##### Minimal `unbound.conf`

```yaml
# /home/user/unbound/unbound.conf
server:
  interface: 0.0.0.0
  port: 53
  do-ip6: no
  prefetch: yes
  cache-min-ttl: 60
  cache-max-ttl: 86400
  msg-cache-size: 64m
  rrset-cache-size: 128m
  access-control: 127.0.0.0/8 allow
  access-control: 192.168.0.0/16 allow

forward-zone:
  name: "."
  forward-addr: 1.1.1.1
  forward-addr: 9.9.9.9
```

```yaml
# ~/unbound/compose.yaml
services:
  unbound:
    image: mvance/unbound
    ports:
      - 127.0.0.1:5335:53/tcp
      - 127.0.0.1:5335:53/udp
    volumes:
      - /home/user/unbound/unbound.conf:/opt/unbound/etc/unbound/unbound.conf:ro,Z
    restart: unless-stopped
```

```bash
cd ~/unbound && podman-compose up -d
```

Verify resolution through the resolver:

```bash
dig @localhost -p 5335 example.com +short
```

In Pi-hole: Settings → DNS → Custom upstream DNS → `127.0.0.1#5335`. Disable all other upstream DNS entries.

## See Also

- [Pi-hole](pihole.md)
- [AdGuard Home](adguard-home.md)
- [Technitium DNS Server](technitium.md)
