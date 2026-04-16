---
title: Databases & Caches
section: Self-Hosting & Servers
updated: 2026-04-16
---

# Databases & Caches

Relational, document, caching, and full-text search engines. All run rootless with persistent volumes mounted via `:Z`.

## MariaDB / MySQL
**Purpose**: Open-source relational database for web apps, CMS platforms, and legacy software stacks.
```bash
podman run -d \
  --name mariadb \
  -p 127.0.0.1:3306:3306 \
  -e MYSQL_ROOT_PASSWORD=strongpassword \
  -e MYSQL_DATABASE=mydb \
  -e MYSQL_USER=myuser \
  -e MYSQL_PASSWORD=myuserpass \
  -v mariadb_data:/var/lib/mysql \
  --restart unless-stopped \
  mariadb:11
```
> **Connect**: `podman exec -it mariadb mariadb -u myuser -p mydb`

## PostgreSQL
**Purpose**: Advanced, standards-compliant relational database known for complex queries, JSONB support, and extensibility.
```bash
podman run -d \
  --name postgres \
  -p 127.0.0.1:5432:5432 \
  -e POSTGRES_USER=myuser \
  -e POSTGRES_PASSWORD=strongpassword \
  -e POSTGRES_DB=mydb \
  -v postgres_data:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16-alpine
```
> **Connect**: `podman exec -it postgres psql -U myuser -d mydb`
> **GUI**: `podman run -d --name pgadmin -p 127.0.0.1:5050:80 -e PGADMIN_DEFAULT_EMAIL=admin@example.com -e PGADMIN_DEFAULT_PASSWORD=admin --restart unless-stopped dpage/pgadmin4`

## Redis
**Purpose**: High-performance in-memory data store used for caching, session management, message brokering, and real-time analytics.
```bash
podman run -d \
  --name redis \
  -p 127.0.0.1:6379:6379 \
  -v redis_data:/data \
  --restart unless-stopped \
  redis:7-alpine redis-server --appendonly yes
```
> **Test**: `podman exec -it redis redis-cli ping`

## KeyDB
**Purpose**: Multithreaded Redis fork optimized for modern multi-core CPUs. Drop-in compatible with Redis clients.
```bash
podman run -d \
  --name keydb \
  -p 127.0.0.1:6379:6379 \
  -v keydb_data:/data \
  --restart unless-stopped \
  eqalpha/keydb:alpine
```

## MongoDB
**Purpose**: Flexible document database optimized for JSON-like storage, rapid development cycles, and unstructured data models.
```bash
podman run -d \
  --name mongodb \
  -p 127.0.0.1:27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=strongpassword \
  -v mongodb_data:/data/db \
  --restart unless-stopped \
  mongo:7
```

## MeiliSearch
**Purpose**: Lightning-fast, typo-tolerant full-text search engine designed for easy integration into web apps and dashboards.
```bash
podman run -d \
  --name meilisearch \
  -p 127.0.0.1:7700:7700 \
  -v meilisearch_data:/meili_data \
  -e MEILI_MASTER_KEY=changeme \
  --restart unless-stopped \
  getmeili/meilisearch:latest
```

## InfluxDB
**Purpose**: High-performance time-series database. Optimized for metrics, IoT telemetry, and real-time analytics.
```bash
podman run -d \
  --name influxdb \
  -p 127.0.0.1:8086:8086 \
  -v influxdb_data:/var/lib/influxdb2 \
  -e DOCKER_INFLUXDB_INIT_MODE=setup \
  -e DOCKER_INFLUXDB_INIT_USERNAME=admin \
  -e DOCKER_INFLUXDB_INIT_PASSWORD=strongpassword \
  --restart unless-stopped \
  influxdb:2
```

## Elasticsearch
**Purpose**: Distributed search and analytics engine powering log analysis, full-text search, and observability (ELK stack).
```bash
podman run -d \
  --name elasticsearch \
  -p 127.0.0.1:9200:9200 \
  -v elasticsearch_data:/usr/share/elasticsearch/data \
  -e discovery.type=single-node \
  -e xpack.security.enabled=false \
  --restart unless-stopped \
  docker.elastic.co/elasticsearch/elasticsearch:8.15.0
```

## SQLite via Litestream
**Purpose**: Lightweight serverless database with continuous, incremental replication to S3-compatible storage for disaster recovery.
```bash
podman run -d \
  --name litestream \
  -v /home/user/app/db:/data:Z \
  -v /home/user/litestream.yml:/etc/litestream.yml:ro,Z \
  --restart unless-stopped \
  litestream/litestream replicate
```

## Adminer
**Purpose**: Lightweight, single-file database management interface supporting MySQL, PostgreSQL, SQLite, and Oracle.
```bash
podman run -d \
  --name adminer \
  -p 127.0.0.1:8089:8080 \
  --restart unless-stopped \
  adminer
```

## PHP-FPM Stack
**Purpose**: Run PHP applications like WordPress or Laravel with a dedicated FastCGI processor.
```yaml
# ~/php-stack/compose.yml
services:
  nginx:
    image: nginx:alpine
    ports: ["127.0.0.1:8080:80"]
    volumes:
      - ./www:/var/www/html:ro,Z
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro,Z
    depends_on: [php]
  php:
    image: php:8.3-fpm-alpine
    volumes:
      - ./www:/var/www/html:Z
    depends_on: [db]
  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootpass
      MYSQL_DATABASE: myapp
      MYSQL_USER: appuser
      MYSQL_PASSWORD: apppass
    volumes: [db_data:/var/lib/mysql]
volumes: {db_data: {}}
```
