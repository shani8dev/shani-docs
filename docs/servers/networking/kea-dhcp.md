---
title: Kea DHCP
section: Self-Hosted Networking
updated: 2026-08-28
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.

## Kea DHCP (Modern DHCP Server)

**Purpose:** ISC Kea is the modern replacement for ISC DHCP (`dhcpd`). Provides DHCPv4 and DHCPv6 with a REST API, a lease database (PostgreSQL or MySQL), high-availability failover, host reservations, and a web UI via Stork. Run it alongside Technitium or PowerDNS to control both DHCP and DNS from your server, giving you reliable `hostname → IP` mappings for every device on your LAN.

```yaml
# ~/kea/compose.yaml
services:
  kea-dhcp4:
    image: jonasal/kea-dhcp4:latest
    network_mode: host          # Must see your LAN broadcast domain
    volumes:
      - /home/user/kea/kea-dhcp4.conf:/etc/kea/kea-dhcp4.conf:ro,Z
      - /home/user/kea/leases:/var/lib/kea:Z
    restart: unless-stopped
```

##### Minimal `kea-dhcp4.conf`

```json
{
  "Dhcp4": {
    "interfaces-config": {
      "interfaces": ["eth0"]
    },
    "lease-database": {
      "type": "memfile",
      "persist": true,
      "name": "/var/lib/kea/dhcp4.leases"
    },
    "subnet4": [{
      "id": 1,
      "subnet": "192.168.1.0/24",
      "pools": [{ "pool": "192.168.1.100 - 192.168.1.200" }],
      "option-data": [
        { "name": "routers",              "data": "192.168.1.1" },
        { "name": "domain-name-servers",  "data": "192.168.1.10" },
        { "name": "domain-search",        "data": "home.local" }
      ],
      "reservations": [
        {
          "hw-address": "aa:bb:cc:dd:ee:ff",
          "ip-address":  "192.168.1.50",
          "hostname":    "myserver"
        }
      ]
    }],
    "loggers": [{
      "name": "kea-dhcp4",
      "output_options": [{ "output": "stdout" }],
      "severity": "INFO"
    }]
  }
}
```

```bash
cd ~/kea && podman-compose up -d

# View current leases
cat /home/user/kea/leases/dhcp4.leases

# Firewall — allow DHCP
sudo firewall-cmd --add-service=dhcp --permanent && sudo firewall-cmd --reload
```

> **Kea vs dnsmasq:** dnsmasq (bundled with Pi-hole) is excellent for simple setups. Kea is the right choice when you need HA failover, a REST API, PostgreSQL lease storage, or want to manage DHCP independently of your DNS blocker.

## See Also

- [Technitium DNS Server](technitium.md)
- [PowerDNS](powerdns.md)
- [Pi-hole](pihole.md)
