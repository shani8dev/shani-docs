---
title: Nginx Proxy Manager
section: Self-Hosted Networking
updated: 2026-08-28
---

> **Part of the Networking & Infrastructure series:** See [all networking docs](../networking)

## Nginx Proxy Manager

**Purpose:** GUI-based reverse proxy with Let's Encrypt integration. If you find Caddy's Caddyfile syntax unfamiliar, NPM offers a click-through interface for creating proxy hosts, redirects, and SSL termination.

```yaml
# ~/npm/compose.yml
services:
  npm:
    image: jc21/nginx-proxy-manager:latest
    ports:
      - "80:80"
      - "443:443"
      - "127.0.0.1:81:81"
    environment:
      DB_MYSQL_HOST: db
      DB_MYSQL_PORT: 3306
      DB_MYSQL_USER: npm
      DB_MYSQL_PASSWORD: changeme
      DB_MYSQL_NAME: npm
    volumes:
      - /home/user/npm/data:/data:Z
      - /home/user/npm/letsencrypt:/etc/letsencrypt:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: npm
      MYSQL_USER: npm
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/npm && podman-compose up -d
```

Access the admin UI at `http://localhost:81`. Default credentials: `admin@example.com` / `changeme` — change immediately after first login. Add proxy hosts via Dashboard → Proxy Hosts → Add Proxy Host; enable Let's Encrypt in the SSL tab.

---



---

## See Also

- [Networking & Infrastructure](networking) — overview
