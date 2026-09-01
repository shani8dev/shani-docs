---
title: Squid (Caching Proxy)
section: Self-Hosting & Servers
updated: 2026-08-28
---

> **Part of the Networking & Infrastructure series:** See [all networking docs](../networking)

## Squid (Caching Proxy)

**Purpose:** High-performance HTTP/HTTPS caching proxy. Squid caches web content so repeated requests are served from disk rather than the internet — saving bandwidth, reducing latency, and enabling content filtering by URL, domain, or MIME type. Useful in homelabs with metered internet connections, for caching container image pulls, or as a transparent proxy for auditing outbound HTTP traffic from containers.

```yaml
# ~/squid/compose.yaml
services:
  squid:
    image: ubuntu/squid:latest
    ports:
      - 127.0.0.1:3128:3128
    volumes:
      - /home/user/squid/squid.conf:/etc/squid/squid.conf:ro,Z
      - /home/user/squid/cache:/var/spool/squid:Z
      - /home/user/squid/logs:/var/log/squid:Z
    restart: unless-stopped
```

##### Minimal `squid.conf`

```
# Allow LAN clients
acl localnet src 192.168.0.0/16
acl localnet src 10.0.0.0/8

# Standard safe ports
acl SSL_ports port 443
acl Safe_ports port 80 443 21 70 210 280 488 591 777 1025-65535
acl CONNECT method CONNECT

http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports
http_access allow localnet
http_access allow localhost
http_access deny all

http_port 3128

# Cache configuration
cache_dir ufs /var/spool/squid 10000 16 256   # 10 GB cache
maximum_object_size 512 MB
cache_mem 512 MB
maximum_object_size_in_memory 10 MB

# Access log
access_log /var/log/squid/access.log squid
```

```bash
cd ~/squid && podman-compose up -d

# Initialise the cache directory (first run)
podman exec squid squid -z

# View access log
podman exec squid tail -f /var/log/squid/access.log

# Force cache refresh for a URL
podman exec squid squidclient -m PURGE http://example.com/

# Check cache statistics
podman exec squid squidclient mgr:info
```

#### Use Squid as a proxy for container pulls
```bash
# Set Podman to pull via Squid
export https_proxy=http://localhost:3128
export http_proxy=http://localhost:3128
podman pull nginx:alpine
```

**Caddy:**
```caddyfile
squid.home.local { tls internal; reverse_proxy localhost:3128 }
```

---



---

## See Also

- [Networking & Infrastructure](networking) — overview
