---
title: phpIPAM — IP Address Management
section: Self-Hosted Networking
updated: 2026-08-28
---

> **Part of the Networking & Infrastructure series:** See [all networking docs](../networking)

## phpIPAM (Lightweight IP Address Management)

**Purpose:** Web-based IP address management tool. Track which IPs are assigned, to what device, who requested the allocation, and which subnets are full. phpIPAM is lighter than NetBox for teams who just need clean IPAM without the full network topology and asset management features. Integrates with PowerDNS for automatic PTR record updates when IPs are assigned.

```yaml
# ~/phpipam/compose.yaml
services:
  phpipam-web:
    image: phpipam/phpipam-www:latest
    ports:
      - 127.0.0.1:8200:80
    environment:
      TZ: Asia/Kolkata
      IPAM_DATABASE_HOST: db
      IPAM_DATABASE_USER: phpipam
      IPAM_DATABASE_PASS: changeme
      IPAM_DATABASE_NAME: phpipam
    volumes:
      - /home/user/phpipam/logo:/phpipam/css/images/logo:Z
    depends_on: [db]
    restart: unless-stopped

  phpipam-cron:
    image: phpipam/phpipam-cron:latest
    environment:
      TZ: Asia/Kolkata
      IPAM_DATABASE_HOST: db
      IPAM_DATABASE_USER: phpipam
      IPAM_DATABASE_PASS: changeme
      IPAM_DATABASE_NAME: phpipam
      SCAN_INTERVAL: 1h
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: phpipam
      MYSQL_USER: phpipam
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/phpipam && podman-compose up -d
```

Access at `http://localhost:8200`. On first run, select **Automatic database installation** and create the admin account. Then define your subnets and start allocating IPs.

**Caddy:**
```caddyfile
ipam.home.local { tls internal; reverse_proxy localhost:8200 }
```

> **NetBox vs phpIPAM:** Use phpIPAM for pure IPAM (subnets, IPs, reservations). Use NetBox when you also need rack diagrams, cable management, VLAN documentation, and device inventory.

---



---

## See Also

- [Networking & Infrastructure](networking) — overview
