---
title: Technitium DNS Server
section: Self-Hosting & Servers
updated: 2026-08-28
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.

## Technitium DNS Server

**Purpose:** Full-featured authoritative and recursive DNS server with a clean web UI. Goes further than Pi-hole and AdGuard Home — Technitium can host your own DNS zones (split-horizon DNS for `home.local`), act as a DHCP server, supports DNS-over-HTTPS/TLS/QUIC, has advanced conditional forwarding, and includes built-in ad-blocking. The right choice when you need proper DNS zone management alongside ad-blocking.

```yaml
# ~/technitium-dns/compose.yaml
services:
  technitium-dns:
    image: technitium/dns-server:latest
    ports:
      - 53:53/udp
      - 53:53/tcp
      - 127.0.0.1:5380:5380
      - 853:853/tcp
      - 443:443/tcp
    volumes:
      - /home/user/technitium/config:/etc/dns:Z
    environment:
      DNS_SERVER_DOMAIN: dns.home.local
      DNS_SERVER_ADMIN_PASSWORD: changeme
    restart: unless-stopped
```

```bash
cd ~/technitium-dns && podman-compose up -d
```

Access the web UI at `http://localhost:5380`. Configure zones, forwarders, and blocklists in the admin panel.

> **Pi-hole vs AdGuard vs Technitium:** Use Pi-hole or AdGuard for simple network-wide ad-blocking. Use Technitium when you also need to manage DNS zones for internal services or run DHCP from the same interface.

## See Also

- [Pi-hole](pihole.md)
- [AdGuard Home](adguard-home.md)
- [Unbound](unbound.md)
- [PowerDNS](powerdns.md)
- [Kea DHCP](kea-dhcp.md)
