---
title: NetBox
section: Self-Hosted Networking
updated: 2026-08-28
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.

## NetBox (Network Documentation & IPAM)

**Purpose:** Source of truth for your network infrastructure. Document IP address assignments (IPAM), VLAN configurations, rack layouts, cable connections, device inventory, and circuit topology. NetBox is not a monitoring tool — it's the authoritative record of what you have and how it's connected. Integrates with Ansible, Terraform, and LibreNMS.

```yaml
# ~/netbox/compose.yml
services:
  netbox:
    image: netboxcommunity/netbox:latest
    ports: ["127.0.0.1:8101:8080"]
    environment:
      DB_HOST: postgres
      DB_NAME: netbox
      DB_USER: netbox
      DB_PASSWORD: changeme
      REDIS_HOST: redis
      REDIS_PASSWORD: ""
      SECRET_KEY: changeme-run-openssl-rand-base64-50
      ALLOWED_HOSTS: netbox.home.local localhost
      SUPERUSER_EMAIL: admin@home.local
      SUPERUSER_PASSWORD: changeme
    volumes:
      - /home/user/netbox/media:/opt/netbox/netbox/media:Z
    depends_on: [postgres, redis]
    restart: unless-stopped

  netbox-worker:
    image: netboxcommunity/netbox:latest
    command: /opt/netbox/venv/bin/python /opt/netbox/netbox/manage.py rqworker
    environment:
      DB_HOST: postgres
      DB_NAME: netbox
      DB_USER: netbox
      DB_PASSWORD: changeme
      REDIS_HOST: redis
      SECRET_KEY: changeme-run-openssl-rand-base64-50
    depends_on: [postgres, redis]
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: netbox
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: netbox
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/netbox && podman-compose up -d
```

Access at `http://localhost:8101`. Start by defining your IP prefixes and VLANs, then populate devices and rack positions.

## See Also

- [LibreNMS](librenms.md)
- [Caddy](../networking/caddy.md)
