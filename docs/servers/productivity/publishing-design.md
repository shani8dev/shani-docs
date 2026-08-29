---
title: Productivity — Publishing & Design Tools
section: Self-Hosting & Servers
updated: 2026-08-28
---

## Ghost (Publishing & Blogging)

**Purpose:** Modern, open-source publishing platform. Ghost is a focused writing and newsletter tool — clean editor, built-in membership and paid subscriptions (via Stripe), email newsletters, and a polished public-facing blog. The self-hosted alternative to Substack or Medium.

```yaml
# ~/ghost/compose.yaml
services:
  ghost:
    image: ghost:5-alpine
    ports: ["127.0.0.1:2368:2368"]
    environment:
      url: https://blog.example.com
      database__client: mysql
      database__connection__host: db
      database__connection__user: ghost
      database__connection__password: changeme
      database__connection__database: ghost
      mail__transport: SMTP
      mail__options__host: localhost
      mail__options__port: 25
      NODE_ENV: production
    volumes:
      - /home/user/ghost/content:/var/lib/ghost/content:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: ghost
      MYSQL_USER: ghost
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/ghost && podman-compose up -d
```

Access the admin panel at `http://localhost:2368/ghost`. Set up your site, configure the theme, and connect Stripe for paid memberships.

**Caddy:**
```caddyfile
blog.example.com { reverse_proxy localhost:2368 }
```

---

## WordPress

**Purpose:** The world's most widely used CMS. Powers 40% of the web. Massive plugin ecosystem, thousands of themes, WooCommerce for e-commerce, and a huge talent pool. The right choice when you need maximum flexibility or have to integrate with existing WordPress tooling.

```yaml
# ~/wordpress/compose.yaml
services:
  wordpress:
    image: wordpress:6-php8.3-apache
    ports: ["127.0.0.1:8100:80"]
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: changeme
      WORDPRESS_DB_NAME: wordpress
      WORDPRESS_CONFIG_EXTRA: |
        define('WP_HOME', 'https://site.example.com');
        define('WP_SITEURL', 'https://site.example.com');
    volumes:
      - /home/user/wordpress/data:/var/www/html:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/wordpress && podman-compose up -d
```

> For better performance, add Redis object caching: deploy a Redis container and install the `Redis Object Cache` WordPress plugin, pointing it at `host.containers.internal:6379`.

---

## Penpot (Open-Source Design Tool)

**Purpose:** Self-hosted, browser-based design and prototyping tool — a Figma alternative. Create UI mockups, design systems, interactive prototypes, and export assets, all in a collaborative environment where multiple users work on the same file simultaneously. Fully vector-based, exports SVG and CSS, and integrates with developer handoff workflows.

```yaml
# ~/penpot/compose.yaml
services:
  penpot-frontend:
    image: penpotapp/frontend:latest
    ports: ["127.0.0.1:9001:80"]
    environment:
      PENPOT_FLAGS: enable-registration enable-login
    restart: unless-stopped

  penpot-backend:
    image: penpotapp/backend:latest
    environment:
      PENPOT_FLAGS: enable-registration enable-login
      PENPOT_PUBLIC_URI: https://design.home.local
      PENPOT_DATABASE_URI: postgresql://penpot:changeme@db/penpot
      PENPOT_REDIS_URI: redis://redis/0
      PENPOT_STORAGE_BACKEND: fs
      PENPOT_STORAGE_FS_DIRECTORY: /opt/data/assets
      PENPOT_SECRET_KEY: changeme-run-openssl-rand-hex-32
    volumes:
      - /home/user/penpot/assets:/opt/data/assets:Z
    depends_on: [db, redis]
    restart: unless-stopped

  penpot-exporter:
    image: penpotapp/exporter:latest
    environment:
      PENPOT_PUBLIC_URI: https://design.home.local
      PENPOT_REDIS_URI: redis://redis/0
    depends_on: [redis]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: penpot
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: penpot
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/penpot && podman-compose up -d
```

Access at `http://localhost:9001`. Create a team workspace, invite collaborators, and design with real-time multiplayer editing.

---

## Excalidraw (Collaborative Whiteboard)

**Purpose:** Self-hosted virtual whiteboard with a hand-drawn aesthetic. Sketch architecture diagrams, wireframes, flowcharts, and brainstorm maps — either solo or with your team in real-time. No account required; drawings are stored in the browser or exported as `.excalidraw` or SVG. Much simpler than Penpot for quick sketches and team whiteboarding sessions.

```yaml
# ~/excalidraw/compose.yaml
services:
  excalidraw:
    image: excalidraw/excalidraw:latest
    ports:
      - 127.0.0.1:3700:80
    restart: unless-stopped
```

```bash
cd ~/excalidraw && podman-compose up -d
```

> Excalidraw is a pure frontend — no database, no persistent server state. All data lives in the browser's local storage or in exported files. For real-time collaboration, the official backend (`@excalidraw/excalidraw-room`) is a separate WebSocket service:

```yaml
# Add to the same compose.yaml for live collaboration
  excalidraw-room:
    image: excalidraw/excalidraw-room:latest
    ports:
      - 127.0.0.1:3701:80
    restart: unless-stopped
```

**Caddy:**
```caddyfile
draw.home.local { tls internal; reverse_proxy localhost:3700 }
```

---


---

## Drawio / draw.io (Self-Hosted Diagram Editor)

**Purpose:** Self-hosted version of diagrams.net — the most widely used open-source diagramming tool. Create architecture diagrams, flowcharts, ERDs, network maps, and UML without sending data to any cloud service. Integrates with Nextcloud, Confluence, and can export to SVG, PNG, and PDF.

```yaml
# ~/drawio/compose.yaml
services:
  drawio:
    image: jgraph/drawio:latest
    ports:
      - 127.0.0.1:8710:8080
    restart: unless-stopped
```

```bash
cd ~/drawio && podman-compose up -d
```

**Caddy:**
```caddyfile
draw.home.local { tls internal; reverse_proxy localhost:8710 }
```

---

