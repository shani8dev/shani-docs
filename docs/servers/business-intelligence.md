---
title: Business Intelligence & Analytics
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Business Intelligence & Analytics

Self-hosted BI platforms, data visualisation tools, SQL explorers, and analytical dashboards. Query your databases, build charts, and share insights — without sending your business data to a cloud analytics vendor.

> **Why self-host BI?** Your databases already live on your server. Running your analytics stack next to them eliminates egress costs, keeps sensitive data on-premises, and removes per-seat licensing that makes cloud BI prohibitively expensive for small teams.

---

## Metabase

**Purpose:** The most approachable self-hosted BI tool. Non-technical users can build charts and dashboards by clicking through a question builder — no SQL required. For power users, the native query editor supports full SQL with autocomplete, query versioning, and parameterised questions. Connects to PostgreSQL, MySQL, MariaDB, MongoDB, SQLite, ClickHouse, Redshift, BigQuery, Snowflake, and more.

```yaml
# ~/metabase/compose.yaml
services:
  metabase:
    image: metabase/metabase:latest
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - /home/user/metabase/data:/metabase-data:Z
    environment:
      MB_DB_TYPE: postgres
      MB_DB_DBNAME: metabase
      MB_DB_PORT: 5432
      MB_DB_USER: metabase
      MB_DB_PASS: changeme
      MB_DB_HOST: host.containers.internal
      MB_SITE_URL: https://metabase.home.local
    restart: unless-stopped
```

```bash
cd ~/metabase && podman-compose up -d
```

**Common operations:**
```bash
# Check Metabase health
curl http://localhost:3000/api/health

# View logs
podman logs -f metabase

# Reset admin password (if locked out)
podman exec metabase java -jar metabase.jar reset-password admin@example.com

# Export a question/dashboard result via API
curl -X POST http://localhost:3000/api/dataset   -H "X-Metabase-Session: YOUR_SESSION_TOKEN"   -H "Content-Type: application/json"   -d '{"database":1,"type":"native","native":{"query":"SELECT count(*) FROM orders"}}'   | python3 -m json.tool

# Get session token for API use
curl -X POST http://localhost:3000/api/session   -H "Content-Type: application/json"   -d '{"username":"admin@example.com","password":"changeme"}'
```

> Metabase can use its built-in H2 database for evaluation, but PostgreSQL is strongly recommended for production — it handles concurrent users and stores question/dashboard history reliably.

**Key features to explore after setup:**
- **Questions** — saved queries that auto-refresh on a schedule
- **Dashboards** — drag-and-drop canvas combining multiple questions with filters
- **Subscriptions** — email or Slack delivery of dashboard snapshots on a cron schedule
- **Alerts** — notify when a metric crosses a threshold
- **Embedding** — embed signed charts into other apps or internal tools via iframes
- **Models** — curated, reusable data layers that hide raw table complexity from end users

**Caddy:**
```caddyfile
metabase.home.local { tls internal; reverse_proxy localhost:3000 }
```

---

## Apache Superset

**Purpose:** Enterprise-grade BI and data exploration platform from Apache. More powerful and more configurable than Metabase — supports 40+ database connectors, a drag-and-drop chart builder, a full SQL IDE (SQL Lab), role-based access control, row-level security, and advanced chart types (Sankey, sunburst, heatmap, geospatial). Steeper learning curve but no feature ceilings.

```yaml
# ~/superset/compose.yaml
services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: superset
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: superset
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  superset:
    image: apache/superset:latest
    ports: ["127.0.0.1:8088:8088"]
    environment:
      SUPERSET_SECRET_KEY: changeme-run-openssl-rand-base64-42
      DATABASE_URL: postgresql+psycopg2://superset:changeme@db:5432/superset
      REDIS_URL: redis://redis:6379/0
    volumes:
      - /home/user/superset/config:/app/superset_home:Z
    depends_on: [db, redis]
    restart: unless-stopped

  superset-init:
    image: apache/superset:latest
    command: >
      bash -c "
        superset db upgrade &&
        superset fab create-admin
          --username admin --firstname Admin --lastname Admin
          --email admin@example.com --password changeme &&
        superset init"
    environment:
      SUPERSET_SECRET_KEY: changeme-run-openssl-rand-base64-42
      DATABASE_URL: postgresql+psycopg2://superset:changeme@db:5432/superset
    depends_on: [db]

volumes:
  pg_data:
```

```bash
cd ~/superset && podman-compose up -d
```

Access at `http://localhost:8088`.

**SQL Lab** — the built-in IDE supports multi-tab SQL editing, query history, schema explorer, result export to CSV/Excel, and saved queries shared across the team. It is a full replacement for tools like DBeaver for query work.

---

## Redash

**Purpose:** Query-first BI tool. Write SQL (or use the query builder), visualise the results, and assemble dashboards. Strong focus on scheduled query refreshes and alerting — ideal for operational dashboards that need to stay current. Supports PostgreSQL, MySQL, MongoDB, Elasticsearch, InfluxDB, Google Sheets, and REST APIs as data sources.

```yaml
# ~/redash/compose.yaml
x-redash-service: &redash-service
  image: redash/redash:latest
  environment:
    REDASH_DATABASE_URL: postgresql://redash:changeme@postgres/redash
    REDASH_REDIS_URL: redis://redis:6379/0
    REDASH_SECRET_KEY: changeme
    REDASH_COOKIE_SECRET: changeme
  depends_on: [postgres, redis]

services:
  server:
    <<: *redash-service
    ports: ["127.0.0.1:5000:5000"]
    command: server
    restart: unless-stopped

  scheduler:
    <<: *redash-service
    command: scheduler
    restart: unless-stopped

  worker:
    <<: *redash-service
    command: worker
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: redash
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: redash
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/redash && podman-compose up -d
```

**Initialise the database (first run only):**
```bash
podman-compose run --rm server create_db
```

> **Version note:** Redash jumped from v10.1 to v25.1 in early 2025 (a 3-year release gap). The `:latest` tag will pull v25.x. If upgrading from v10.x, review the [release notes](https://github.com/getredash/redash/releases) — the scheduler service structure changed in v10.

Access at `http://localhost:5000`.

---

## Grafana

Grafana is covered in the [Monitoring wiki](https://docs.shani.dev/doc/servers/monitoring#grafana). Connect it as a datasource to any database or BI backend covered here — PostgreSQL, ClickHouse, InfluxDB, and TimescaleDB all have first-class Grafana datasource plugins.

---

## Evidence.dev

**Purpose:** Code-first BI tool — write SQL queries and Markdown in `.md` files, and Evidence renders them as a polished interactive report site. Version-controlled in Git, deployed as a static site. Ideal for analysts who prefer code over drag-and-drop and want reports that live in the same repo as the data pipelines that produce them.

```yaml
# ~/evidence/compose.yaml
services:
  evidence:
    image: nginx:alpine
    ports:
      - 127.0.0.1:3002:3000
    volumes:
      - /home/user/evidence/build:/usr/share/nginx/html:ro,Z
    restart: unless-stopped
```

```bash
cd ~/evidence && podman-compose up -d
```

**Example report page (`pages/sales.md`):**
```markdown
# Sales Overview

```sql orders_by_month
SELECT date_trunc('month', created_at) AS month,
       COUNT(*) AS orders,
       SUM(total) AS revenue
FROM orders
WHERE created_at >= NOW() - INTERVAL '12 months'
GROUP BY 1 ORDER BY 1
```

<LineChart data={orders_by_month} x=month y=revenue title="Monthly Revenue" />

Total orders last 12 months: **<Value data={orders_by_month} column=orders fmt=num0 agg=sum />**
```

---

## ClickHouse (OLAP Database)

**Purpose:** Columnar OLAP database that executes analytical queries orders of magnitude faster than row-oriented databases. If you are running Metabase or Superset against a PostgreSQL table with hundreds of millions of rows and queries are slow, ClickHouse is the answer. Used by Cloudflare, Uber, and Bytedance for petabyte-scale analytics.

```yaml
# ~/clickhouse/compose.yaml
services:
  clickhouse:
    image: clickhouse/clickhouse-server:latest
    ports:
      - "127.0.0.1:8123:8123"
      - "127.0.0.1:9000:9000"
    volumes:
      - /home/user/clickhouse/data:/var/lib/clickhouse:Z
      - /home/user/clickhouse/logs:/var/log/clickhouse-server:Z
    environment:
      CLICKHOUSE_USER: admin
      CLICKHOUSE_PASSWORD: changeme
      CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: 1
    ulimits:
      nofile:
        soft: 262144
        hard: 262144
    restart: unless-stopped
```

```bash
cd ~/clickhouse && podman-compose up -d
```

**Connect and run queries:**
```bash
podman exec -it clickhouse clickhouse-client --user admin --password changeme

-- Create a table and insert data
CREATE TABLE events (
  event_date Date,
  event_type String,
  user_id UInt64,
  properties String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_date, event_type, user_id);

-- ClickHouse can ingest from Kafka directly
CREATE TABLE kafka_events (...)
ENGINE = Kafka
SETTINGS kafka_broker_list = 'localhost:9092',
         kafka_topic_list = 'events',
         kafka_group_name = 'clickhouse',
         kafka_format = 'JSONEachRow';
```

**Common operations:**
```bash
# Connect to ClickHouse SQL shell
podman exec -it clickhouse clickhouse-client --user admin --password changeme

# Run a query non-interactively
podman exec clickhouse clickhouse-client --user admin --password changeme   --query "SELECT count() FROM system.tables"

# Show all databases
podman exec clickhouse clickhouse-client --user admin --password changeme   --query "SHOW DATABASES"

# Show tables in a database
podman exec clickhouse clickhouse-client --user admin --password changeme   --query "SHOW TABLES FROM default"

# Ingest CSV data
cat data.csv | podman exec -i clickhouse clickhouse-client   --user admin --password changeme   --query "INSERT INTO mydb.mytable FORMAT CSV"

# Check disk usage per table
podman exec clickhouse clickhouse-client --user admin --password changeme   --query "SELECT table, formatReadableSize(sum(bytes)) FROM system.parts GROUP BY table ORDER BY sum(bytes) DESC"

# View running queries
podman exec clickhouse clickhouse-client --user admin --password changeme   --query "SELECT query_id, elapsed, query FROM system.processes"

# Kill a long-running query
podman exec clickhouse clickhouse-client --user admin --password changeme   --query "KILL QUERY WHERE query_id='abc123'"
```

> Connect Metabase or Superset to ClickHouse to get sub-second query times on datasets that would take minutes in PostgreSQL.

---

## Lightdash (dbt-Native BI)

**Purpose:** Open-source BI tool built on top of dbt (data build tool). If your team already uses dbt for data transformation, Lightdash reads your dbt models and metrics directly — no reimporting schemas, no duplicated definitions. Metrics defined in dbt YAML automatically appear in Lightdash dashboards.

```yaml
# ~/lightdash/compose.yaml
services:
  lightdash:
    image: lightdash/lightdash:latest
    ports: ["127.0.0.1:8080:8080"]
    environment:
      PGHOST: db
      PGPORT: 5432
      PGUSER: lightdash
      PGPASSWORD: changeme
      PGDATABASE: lightdash
      SECRET_KEY: changeme-run-openssl-rand-hex-32
      SITE_URL: https://lightdash.home.local
    volumes:
      - /home/user/lightdash/dbt:/usr/app/dbt:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: lightdash
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: lightdash
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/lightdash && podman-compose up -d
```

---

## Plausible Analytics (Web Analytics)

**Purpose:** Lightweight, GDPR-compliant web analytics. No cookies, no cross-site tracking, no personal data stored. A one-line script tag replaces Google Analytics with a dashboard you own. See pageviews, referrers, top pages, devices, and conversion goals — without privacy violations.

```yaml
# ~/plausible/compose.yaml
services:
  plausible_db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: plausible
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: plausible
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  plausible_events_db:
    image: clickhouse/clickhouse-server:latest
    volumes: [events_data:/var/lib/clickhouse]
    restart: unless-stopped

  plausible:
    image: ghcr.io/plausible/community-edition:v2
    ports: ["127.0.0.1:8000:8000"]
    environment:
      BASE_URL: https://analytics.example.com
      SECRET_KEY_BASE: changeme-run-openssl-rand-base64-64
      DATABASE_URL: postgres://plausible:changeme@plausible_db:5432/plausible
      CLICKHOUSE_DATABASE_URL: http://plausible_events_db:8123/plausible_events
    depends_on: [plausible_db, plausible_events_db]
    restart: unless-stopped

volumes: {pg_data: {}, events_data: {}}
```

```bash
cd ~/plausible && podman-compose up -d
```

Add to any website:
```html
<script defer data-domain="yoursite.com" src="https://analytics.example.com/js/script.js"></script>
```

---

## Umami (Simple Web Analytics)

**Purpose:** Simpler Plausible alternative. Single-service analytics with event tracking, funnel analysis, and an OpenAPI. Backed by PostgreSQL or MySQL.

```yaml
# ~/umami/compose.yaml
services:
  umami:
    image: ghcr.io/umami-software/umami:postgresql-latest
    ports: ["127.0.0.1:3003:3000"]
    environment:
      DATABASE_URL: postgresql://umami:umami@db:5432/umami
      APP_SECRET: changeme
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: umami
      POSTGRES_PASSWORD: umami
      POSTGRES_DB: umami
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes: {pg_data: {}}
```

```bash
cd ~/umami && podman-compose up -d
```

---

## Choosing the Right Tool

| Use Case | Recommended Tool |
|----------|-----------------|
| Non-technical users, quick setup | Metabase |
| Large teams, enterprise features, 40+ connectors | Apache Superset |
| Operational dashboards, alerting on query results | Redash |
| Time-series, infrastructure metrics | Grafana |
| Code-first reports in Git | Evidence.dev |
| dbt-native BI | Lightdash |
| Fast analytics on 100M+ row tables | ClickHouse |
| GDPR-compliant web analytics | Plausible |
| Simple web analytics | Umami |

---

## Caddy Configuration

```caddyfile
metabase.home.local    { tls internal; reverse_proxy localhost:3000 }
superset.home.local    { tls internal; reverse_proxy localhost:8088 }
redash.home.local      { tls internal; reverse_proxy localhost:5000 }
analytics.example.com  { reverse_proxy localhost:8000 }
lightdash.home.local   { tls internal; reverse_proxy localhost:8080 }
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Metabase blank on first load | Wait 60–90 s for initialisation; check logs with `podman logs metabase`; ensure PostgreSQL is reachable on `host.containers.internal` |
| Metabase `Cannot connect to database` | Use `host.containers.internal` not `localhost` for the DB host; verify credentials match the PostgreSQL container |
| Superset `No module named psycopg2` | Add `psycopg2-binary` to the image or use `apache/superset:latest` which includes it |
| Superset charts not loading | Check `SUPERSET_SECRET_KEY` is set and consistent; clear browser cache |
| Redash worker not processing queries | Verify Redis is running; check `podman-compose logs worker` for connection errors |
| ClickHouse OOM | Add `--memory 4g` to limit container memory; tune `max_memory_usage` in ClickHouse config |
| Plausible no events received | Verify `BASE_URL` matches your site's script src; check CSP headers aren't blocking the script |
| Evidence build fails | Ensure your database credentials in `sources/` are correct; run `npm run sources` to retest connections |

> 💡 **Tip:** For the best Metabase experience, connect it to a **read replica** of your production database rather than the primary — long-running analytical queries won't block application writes.
