---
title: LibreNMS
section: Self-Hosted Networking
updated: 2026-08-28
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.

## LibreNMS (Network Monitoring)

**Purpose:** Full-featured auto-discovering network monitoring system. Discovers routers, switches, servers, APs, and printers via SNMP, then monitors CPU, memory, interface traffic, BGP, environmental sensors, and more. Generates alerts, bandwidth graphs, and SLA reports. The self-hosted PRTG/SolarWinds alternative.

```yaml
# ~/librenms/compose.yml
services:
  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: librenms
      MYSQL_USER: librenms
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    command: --innodb-file-per-table=1 --lower-case-table-names=0
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  librenms:
    image: librenms/librenms:latest
    ports: ["127.0.0.1:8100:8000"]
    environment:
      DB_HOST: db
      DB_NAME: librenms
      DB_USER: librenms
      DB_PASSWORD: changeme
      REDIS_HOST: redis
      TZ: Asia/Kolkata
      MEMORY_LIMIT: 256M
      UPLOAD_MAX_SIZE: 16M
    volumes:
      - /home/user/librenms/data:/data:Z
    depends_on: [db, redis]
    restart: unless-stopped

  dispatcher:
    image: librenms/librenms:latest
    environment:
      DB_HOST: db
      DB_NAME: librenms
      DB_USER: librenms
      DB_PASSWORD: changeme
      REDIS_HOST: redis
      DISPATCHER_NODE_ID: dispatcher1
      SIDECAR_DISPATCHER: "1"
    volumes:
      - /home/user/librenms/data:/data:Z
    depends_on: [librenms]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/librenms && podman-compose up -d
```

#### Common operations
```bash
# Add a device via CLI
podman exec librenms lnms device:add 192.168.1.1 --v2c --community public

# Run discovery and polling manually
podman exec librenms lnms device:poll 192.168.1.1

# Validate the install
podman exec librenms lnms validate

# View logs
podman logs -f librenms

# Generate an API token for integrations
podman exec librenms lnms api-token:add mytoken --user admin
```

Access at `http://localhost:8100`. Add devices via Devices → Add Device, specifying SNMP community string and version.

**Caddy:**
```caddyfile
librenms.home.local { tls internal; reverse_proxy localhost:8100 }
```

## See Also

- [NetBox](netbox.md)
- [Ntopng](ntopng.md)
- [Caddy](../networking/caddy.md)
