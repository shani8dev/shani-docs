---
title: PowerDNS + PowerDNS Admin
section: Networking
updated: 2026-08-28
---

> **Part of the Networking & Infrastructure series:** See [all networking docs](../networking)

## PowerDNS + PowerDNS Admin (Authoritative DNS)

**Purpose:** Authoritative DNS server for your own domains. While Pi-hole, AdGuard, and Technitium handle *resolving* DNS queries for your LAN, PowerDNS *answers* authoritative queries — it's what you run when you want `example.com` (or an internal zone like `home.local`) to be served from your own nameserver. PowerDNS Admin provides a web UI for managing zones and records. Common in homelabs that run their own internal PKI or split-horizon DNS.

```yaml
# ~/powerdns/compose.yaml
services:
  pdns:
    image: powerdns/pdns-auth-49:latest
    ports:
      - 0.0.0.0:5300:53/tcp
      - 0.0.0.0:5300:53/udp
      - 127.0.0.1:8053:8081
    volumes:
      - /home/user/powerdns/pdns.conf:/etc/powerdns/pdns.conf:ro,Z
    environment:
      PDNS_AUTH_API_KEY: changeme
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: pdns
      MYSQL_USER: pdns
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

  powerdns-admin:
    image: powerdnsadmin/pda-legacy:latest
    ports:
      - 127.0.0.1:9191:80
    environment:
      SQLALCHEMY_DATABASE_URI: mysql://pdns:changeme@db/pdns
      SECRET_KEY: changeme-run-openssl-rand-hex-32
      PDNS_STATS_URL: http://pdns:8081/
      PDNS_API_KEY: changeme
      PDNS_VERSION: "4.9"
    depends_on: [db, pdns]
    restart: unless-stopped

volumes:
  db_data:
```

##### Minimal `pdns.conf`

```ini
launch=gmysql
gmysql-host=db
gmysql-user=pdns
gmysql-password=changeme
gmysql-dbname=pdns
gmysql-dnssec=yes

api=yes
api-key=changeme
webserver=yes
webserver-address=0.0.0.0
webserver-port=8081
webserver-allow-from=0.0.0.0/0

local-port=53
```

##### Initialise the database schema

```bash
podman exec pdns pdnsutil create-slave-zone home.local 127.0.0.1
# Or use PowerDNS Admin web UI at http://localhost:9191 to create zones and records
```

#### Common operations
```bash
# List all zones
podman exec pdns pdnsutil list-all-zones

# Add a zone
podman exec pdns pdnsutil create-zone home.local ns1.home.local

# Add an A record
podman exec pdns pdnsutil add-record home.local myserver A 192.168.1.50

# Check DNSSEC status
podman exec pdns pdnsutil check-all-zones

# Reload zone after manual DB edits
podman exec pdns pdnsutil rectify-zone home.local

# Test from host
dig @127.0.0.1 -p 5300 myserver.home.local
```

**Caddy:**
```caddyfile
pdnsadmin.home.local { tls internal; reverse_proxy localhost:9191 }
```

---



---

## See Also

- [Networking & Infrastructure](networking) — overview
