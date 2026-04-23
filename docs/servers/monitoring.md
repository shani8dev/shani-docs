---
title: Monitoring
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Monitoring

System metrics, log aggregation, alerting, uptime tracking, container visibility, and network performance monitoring. All run rootless with bind-mount volumes labelled `:Z`. Named volumes omit `:Z` — Podman manages their labels automatically.

For multi-node, replicated, and HA deployments (Elasticsearch cluster, OpenSearch cluster, VictoriaMetrics cluster) see the [Clusters wiki](https://docs.shani.dev/doc/servers/clusters).

---

## Prometheus

**Purpose:** Pull-based metrics collection and time-series storage. Scrapes `/metrics` endpoints on a schedule, evaluates alerting rules, and feeds dashboards in Grafana. The foundation of the standard self-hosted observability stack.

```yaml
# ~/prometheus/compose.yaml
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - 127.0.0.1:9090:9090
    volumes:
      - /home/user/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro,Z
      - prometheus_data:/prometheus
    restart: unless-stopped

volumes:
  prometheus_data:
```

```bash
cd ~/prometheus && podman-compose up -d
```

**Minimal `prometheus.yml`:**
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - /etc/prometheus/alerts.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['host.containers.internal:9093']

scrape_configs:
  - job_name: node
    static_configs:
      - targets: ['host.containers.internal:9100']

  - job_name: cadvisor
    static_configs:
      - targets: ['host.containers.internal:8080']
```

**Node Exporter — system metrics:**
```yaml
# ~/node-exporter/compose.yaml
services:
  node-exporter:
    image: prom/node-exporter
    network_mode: host
    volumes:
      - /proc:/host/proc:ro,rslave
      - /sys:/host/sys:ro,rslave
      - /:/rootfs:ro,rslave
    command: --path.procfs=/host/proc --path.sysfs=/host/sys
    restart: unless-stopped
```

```bash
cd ~/node-exporter && podman-compose up -d
```

**cAdvisor — container metrics:**
```yaml
# ~/cadvisor/compose.yaml
services:
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    ports:
      - 127.0.0.1:8080:8080
    volumes:
      - /run/user/${UID}/podman/podman.sock:/var/run/docker.sock:ro
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
    restart: unless-stopped
```

```bash
cd ~/cadvisor && podman-compose up -d
```

**Common operations:**
```bash
# Check Prometheus targets status
curl http://localhost:9090/api/v1/targets | python3 -m json.tool | grep -A3 health

# Query a metric via API
curl "http://localhost:9090/api/v1/query?query=up" | python3 -m json.tool

# Reload config without restart
curl -X POST http://localhost:9090/-/reload

# Check config validity before reloading
podman exec prometheus promtool check config /etc/prometheus/prometheus.yml

# Check alert rules
podman exec prometheus promtool check rules /etc/prometheus/alerts.yml

# View current active alerts
curl http://localhost:9090/api/v1/alerts | python3 -m json.tool
```

**Example alert rules (`alerts.yml`):**
```yaml
groups:
  - name: host
    rules:
      - alert: HighCPU
        expr: 100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 90
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High CPU on {{ $labels.instance }}"

      - alert: DiskNearlyFull
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100 < 10
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Disk nearly full on {{ $labels.instance }}"

      - alert: ServiceDown
        expr: up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"
```

---

## Alertmanager

**Purpose:** Routes firing Prometheus alerts to notification channels — ntfy, Slack, email, PagerDuty, and more. Handles deduplication, grouping, silencing, and inhibition.

```yaml
# ~/alertmanager/compose.yaml
services:
  alertmanager:
    image: prom/alertmanager:latest
    ports:
      - 127.0.0.1:9093:9093
    volumes:
      - /home/user/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro,Z
    restart: unless-stopped
```

```bash
cd ~/alertmanager && podman-compose up -d
```

**Example `alertmanager.yml` — route alerts to ntfy:**
```yaml
route:
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: ntfy

receivers:
  - name: ntfy
    webhook_configs:
      - url: http://host.containers.internal:8090/alerts
        send_resolved: true

inhibit_rules:
  - source_match:
      severity: critical
    target_match:
      severity: warning
    equal: [alertname, instance]
```

**Alertmanager → ntfy bridge (severity-aware routing):**

Use [alertmanager-ntfy](https://github.com/alexbakker/alertmanager-ntfy) as a thin webhook bridge to map Prometheus severity labels to ntfy priority levels:

```yaml
# ~/alertmanager-ntfy/compose.yaml
services:
  alertmanager-ntfy:
    image: ghcr.io/alexbakker/alertmanager-ntfy:latest
    ports:
      - 127.0.0.1:9095:8080
    volumes:
      - /home/user/alertmanager-ntfy/config.yaml:/config.yaml:ro,Z
    restart: unless-stopped
```

```yaml
# ~/alertmanager-ntfy/config.yaml
ntfy:
  base_url: http://host.containers.internal:8090
  topic: alerts
  priority_map:
    critical: urgent
    warning: default
    info: low

labels:
  - name: severity
```

```bash
cd ~/alertmanager-ntfy && podman-compose up -d
```

Update `alertmanager.yml` to route by severity to the bridge:

```yaml
route:
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: ntfy-default
  routes:
    - match:
        severity: critical
      receiver: ntfy-critical
    - match:
        severity: warning
      receiver: ntfy-warning

receivers:
  - name: ntfy-default
    webhook_configs:
      - url: http://host.containers.internal:9095/hook
        send_resolved: true
  - name: ntfy-critical
    webhook_configs:
      - url: http://host.containers.internal:9095/hook
        send_resolved: true
  - name: ntfy-warning
    webhook_configs:
      - url: http://host.containers.internal:9095/hook
        send_resolved: true
```

> The bridge maps the `severity` label to ntfy priority levels automatically — `critical` → `urgent` (breaks through Do Not Disturb), `warning` → `default`, `info` → `low`.

---

## Grafana

**Purpose:** The standard visualisation layer for Prometheus, Loki, InfluxDB, and 50+ other data sources. Drag-and-drop dashboards, alerting, and team sharing.

```yaml
# ~/grafana/compose.yaml
services:
  grafana:
    image: grafana/grafana:latest
    ports:
      - 127.0.0.1:3001:3000
    volumes:
      - grafana_data:/var/lib/grafana
    environment:
      GF_SECURITY_ADMIN_PASSWORD: changeme
      GF_SERVER_ROOT_URL: https://grafana.home.local
      GF_INSTALL_PLUGINS: grafana-clock-panel,grafana-piechart-panel,grafana-worldmap-panel
    restart: unless-stopped

volumes:
  grafana_data:
```

```bash
cd ~/grafana && podman-compose up -d
```

**Common operations:**
```bash
# Install a plugin
podman exec grafana grafana-cli plugins install grafana-clock-panel
podman restart grafana

# Reset admin password
podman exec grafana grafana-cli admin reset-admin-password newpassword

# Check Grafana health
curl http://localhost:3001/api/health

# Export a dashboard as JSON
curl -u admin:changeme http://localhost:3001/api/dashboards/uid/YOUR_UID | python3 -m json.tool
```

**Useful dashboard imports** (Dashboard → Import → paste ID):
- `1860` — Node Exporter Full (complete server metrics)
- `14282` — PostgreSQL overview
- `11835` — Redis dashboard
- `15141` — Kafka overview
- `10991` — RabbitMQ overview
- `12378` — InfluxDB 2.x system metrics

> For BI-focused Grafana usage (connecting to databases, building analytical dashboards), see the [Business Intelligence wiki](https://docs.shani.dev/doc/servers/business-intelligence).

---

## Grafana Alloy (Unified Telemetry Collector)

**Purpose:** Replaces Promtail, Grafana Agent, and OpenTelemetry Collector in a single binary. Scrapes metrics, ships logs to Loki, and forwards traces to Tempo. The recommended replacement for running separate collection agents.

```yaml
# ~/alloy/compose.yaml
services:
  alloy:
    image: grafana/alloy:latest
    ports:
      - 127.0.0.1:12345:12345
    volumes:
      - /home/user/alloy/config.alloy:/etc/alloy/config.alloy:ro,Z
      - /var/log:/var/log:ro
    command: run /etc/alloy/config.alloy
    restart: unless-stopped
```

```bash
cd ~/alloy && podman-compose up -d
```

---

## Loki (Log Aggregation)

**Purpose:** Log aggregation system from Grafana Labs. Stores logs indexed by labels — cheap, fast, and queryable in Grafana alongside your metrics. Use Alloy (or the older Promtail) to ship container and system logs into Loki.

```yaml
# ~/loki/compose.yaml
services:
  loki:
    image: grafana/loki:latest
    ports:
      - 127.0.0.1:3100:3100
    volumes:
      - /home/user/loki:/loki:Z
    restart: unless-stopped
```

```bash
cd ~/loki && podman-compose up -d
```

**Common operations:**
```bash
# Check Loki is ready
curl http://localhost:3100/ready

# Query logs via the API (LogQL)
curl "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={job="containerlogs"}' \
  --data-urlencode 'start=1h ago' | python3 -m json.tool | head -30

# List all label names
curl http://localhost:3100/loki/api/v1/labels | python3 -m json.tool

# Flush in-memory chunks to storage
curl -X POST http://localhost:3100/flush
```

**Ship container logs with Alloy** — add to your `config.alloy`:
```hcl
local.file_match "containers" {
  path_targets = [{
    __path__ = "/var/log/containers/*.log",
    job      = "containerlogs",
  }]
}

loki.source.file "containers" {
  targets    = local.file_match.containers.targets
  forward_to = [loki.write.default.receiver]
}

loki.write "default" {
  endpoint {
    url = "http://localhost:3100/loki/api/v1/push"
  }
}
```

---

## Netdata

**Purpose:** Real-time system and container metrics with zero configuration. Auto-discovers running containers, processes, databases, and services. Provides built-in anomaly detection, and exports to Prometheus for Grafana dashboards.

```yaml
# ~/netdata/compose.yaml
services:
  netdata:
    image: netdata/netdata:latest
    ports:
      - 127.0.0.1:19999:19999
    volumes:
      - netdata_config:/etc/netdata
      - netdata_lib:/var/lib/netdata
      - netdata_cache:/var/cache/netdata
      - /etc/passwd:/host/etc/passwd:ro
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /run/user/${UID}/podman/podman.sock:/var/run/docker.sock:ro
    cap_add:
      - SYS_PTRACE
    security_opt:
      - apparmor=unconfined
    restart: unless-stopped

volumes:
  netdata_cache:
  netdata_config:
  netdata_lib:
```

```bash
cd ~/netdata && podman-compose up -d
```

Access at `http://localhost:19999`. Good first option when you want metrics immediately without writing any configuration.

---

## Netdata Parent (Multi-Host Hub)

**Purpose:** A Netdata "parent" node acts as a streaming hub for child agents. Children stream metrics to the parent; the parent's UI shows all hosts in a unified multi-host dashboard — without sending data to netdata.cloud.

```yaml
# ~/netdata-parent/compose.yaml
services:
  netdata-parent:
    image: netdata/netdata:latest
    ports:
      - 127.0.0.1:19998:19999
    volumes:
      - /home/user/netdata-parent/config:/etc/netdata:Z
      - /home/user/netdata-parent/lib:/var/lib/netdata:Z
      - /home/user/netdata-parent/cache:/var/cache/netdata:Z
    environment:
      NETDATA_CLAIM_TOKEN: ""   # leave blank for fully local hub
    cap_add: [SYS_PTRACE, SYS_ADMIN]
    restart: unless-stopped
```

```bash
cd ~/netdata-parent && podman-compose up -d
```

**Configure child agents to stream to the parent** (`/etc/netdata/stream.conf` on each child):
```ini
[stream]
  enabled = yes
  destination = parent.home.local:19999
  api key = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx   # generate with: uuidgen
```

**Allow incoming streams on the parent** (`/etc/netdata/stream.conf`):
```ini
[xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx]   # same UUID as child's api key
  enabled = yes
  default memory mode = dbengine
```

Restart both instances. The parent's dashboard at `http://localhost:19998` will show all streaming child nodes under the **Nodes** tab.

**Caddy:**
```caddyfile
netdata-hub.home.local { tls internal; reverse_proxy localhost:19998 }
```

---

## Uptime Kuma

**Purpose:** Self-hosted uptime monitoring with beautiful status pages. Monitors HTTP/HTTPS endpoints, TCP ports, DNS resolution, MQTT topics, and Docker container health. Sends alerts via ntfy, Telegram, Slack, email, and 50+ integrations.

```yaml
# ~/uptime-kuma/compose.yaml
services:
  uptime-kuma:
    image: louislam/uptime-kuma:latest
    ports:
      - 127.0.0.1:3002:3001
    volumes:
      - /home/user/uptime-kuma:/app/data:Z
    restart: unless-stopped
```

```bash
cd ~/uptime-kuma && podman-compose up -d
```

**Common operations:**
```bash
# Backup Uptime Kuma data
cp -r /home/user/uptime-kuma /home/user/uptime-kuma.bak

# View logs
podman logs -f uptime-kuma

# Check all monitors via API (requires API key from Settings → API Keys)
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3002/api/v1/monitor
```

Access at `http://localhost:3002`. The built-in status page can be shared with users to communicate outages.

---

## Beszel (Multi-Host Monitoring)

**Purpose:** Minimal, lightweight server monitoring with a central dashboard. Each server runs a tiny agent that reports CPU, RAM, disk, and network to the hub. Better than Netdata for monitoring multiple remote servers from one screen.

```yaml
# ~/beszel/compose.yaml — hub (central server)
services:
  beszel:
    image: henrygd/beszel:latest
    ports:
      - 127.0.0.1:8090:8090
    volumes:
      - /home/user/beszel/data:/beszel_data:Z
    restart: unless-stopped
```

```bash
cd ~/beszel && podman-compose up -d
```

**Agent on each monitored server:**
```yaml
# ~/beszel-agent/compose.yaml
services:
  beszel-agent:
    image: henrygd/beszel-agent:latest
    network_mode: host
    volumes:
      - /run/user/${UID}/podman/podman.sock:/var/run/docker.sock:ro
    environment:
      PORT: 45876
      KEY: your-public-key-from-hub
    restart: unless-stopped
```

```bash
cd ~/beszel-agent && podman-compose up -d
```

---

## Dozzle (Container Log Viewer)

**Purpose:** Live container log viewer in the browser. Zero setup — mount the Podman socket and browse logs for any running container in real time. Supports log search, filtering, and multi-host aggregation.

```yaml
# ~/dozzle/compose.yaml
services:
  dozzle:
    image: amir20/dozzle:latest
    ports:
      - 127.0.0.1:8888:8080
    volumes:
      - /run/user/${UID}/podman/podman.sock:/var/run/docker.sock:ro
    restart: unless-stopped
```

```bash
cd ~/dozzle && podman-compose up -d
```

---

## Healthchecks.io (Cron Monitoring)

**Purpose:** Dead man's switch for cron jobs and scheduled tasks. Your scripts ping a URL when they finish — Healthchecks alerts you if the ping doesn't arrive on schedule. Essential for monitoring backup jobs, data sync tasks, and other scheduled work.

```yaml
# ~/healthchecks/compose.yaml
services:
  healthchecks:
    image: healthchecks/healthchecks:latest
    ports:
      - 127.0.0.1:8000:8000
    environment:
      SECRET_KEY: changeme-run-openssl-rand-base64-32
      SITE_ROOT: https://hc.home.local
      ALLOWED_HOSTS: hc.home.local,localhost
      DEBUG: "False"
    volumes:
      - /home/user/healthchecks/data:/data:Z
    restart: unless-stopped
```

```bash
cd ~/healthchecks && podman-compose up -d
```

**Use in a backup script:**
```bash
podman exec restic restic backup /data && \
  curl -fsS --retry 3 https://hc.home.local/ping/your-uuid
```

---

## Speedtest Tracker

**Purpose:** Runs automated Ookla/LibreSpeed tests on a schedule and stores results with charts. Useful for documenting ISP performance over time and catching degradation before it becomes a problem.

```yaml
# ~/speedtest/compose.yaml
services:
  speedtest:
    image: lscr.io/linuxserver/speedtest-tracker:latest
    ports:
      - 127.0.0.1:8092:80
    environment:
      APP_KEY: base64:changeme-run-openssl-rand-base64-32
      DB_CONNECTION: sqlite
      PUID: "1000"
      PGID: "1000"
    volumes:
      - /home/user/speedtest/config:/config:Z
    restart: unless-stopped
```

```bash
cd ~/speedtest && podman-compose up -d
```

---

## SmokePing (Latency & Packet Loss)

**Purpose:** Network latency and packet loss monitor. Sends probes to configurable targets (your ISP gateway, 1.1.1.1, a VPS) and plots RTT over time — excellent for diagnosing intermittent network issues.

```yaml
# ~/smokeping/compose.yaml
services:
  smokeping:
    image: lscr.io/linuxserver/smokeping:latest
    ports:
      - 127.0.0.1:8081:80
    volumes:
      - /home/user/smokeping/config:/config:Z
      - /home/user/smokeping/data:/data:Z
    restart: unless-stopped
```

```bash
cd ~/smokeping && podman-compose up -d
```

---

## Gatus (Endpoint Monitoring)

**Purpose:** Declarative, Git-friendly uptime and health monitoring. Define endpoints in YAML — HTTP, TCP, DNS, ICMP — with configurable conditions. Lighter than Uptime Kuma and easy to version-control. Ships a built-in status page.

```yaml
# ~/gatus/compose.yaml
services:
  gatus:
    image: twinproduction/gatus:latest
    ports:
      - 127.0.0.1:8088:8080
    volumes:
      - /home/user/gatus/config:/config:ro,Z
    restart: unless-stopped
```

```bash
cd ~/gatus && podman-compose up -d
```

**Example `config.yaml`:**
```yaml
endpoints:
  - name: Jellyfin
    url: http://host.containers.internal:8096/health
    interval: 60s
    conditions:
      - "[STATUS] == 200"
    alerts:
      - type: ntfy
        failure-threshold: 2
        description: "Jellyfin is down"

  - name: Nextcloud
    url: https://files.home.local
    interval: 5m
    conditions:
      - "[STATUS] == 200"
      - "[RESPONSE_TIME] < 2000"
```

> Gatus integrates with ntfy, Slack, email, Telegram, and more. Its config file is easy to keep in Git alongside your other service configs.

---

## VictoriaMetrics (Prometheus-Compatible, High Performance)

**Purpose:** Drop-in Prometheus replacement with 10× lower memory usage, better compression, and faster queries. Fully compatible with the Prometheus remote-write protocol and PromQL — point any Prometheus-scraping agent (Grafana Alloy, Telegraf, node-exporter) at VictoriaMetrics without code changes. Ideal when Prometheus starts consuming too much RAM or when you need long-term metric retention.

```yaml
# ~/victoriametrics/compose.yaml
services:
  victoriametrics:
    image: victoriametrics/victoria-metrics:latest
    ports:
      - 127.0.0.1:8428:8428
    volumes:
      - /home/user/victoriametrics/data:/victoria-metrics-data:Z
    command: --storageDataPath=/victoria-metrics-data --retentionPeriod=12 --selfScrapeInterval=10s
    restart: unless-stopped
```

```bash
cd ~/victoriametrics && podman-compose up -d
```

**Common operations:**
```bash
# Check server health
curl http://localhost:8428/health

# Query metrics (MetricsQL / PromQL)
curl "http://localhost:8428/api/v1/query?query=up"

# List all metric names
curl http://localhost:8428/api/v1/label/__name__/values | python3 -m json.tool | head -20

# Snapshot for backup
curl -X POST http://localhost:8428/snapshot/create
```

**Reconfigure Grafana to use VictoriaMetrics** instead of Prometheus:
- Data Sources → Prometheus → URL: `http://host.containers.internal:8428`

**Remote-write from Prometheus to VictoriaMetrics** (dual-write for migration):
```yaml
# In prometheus.yml
remote_write:
  - url: http://host.containers.internal:8428/api/v1/write
```

For the horizontally scalable cluster variant (vminsert / vmselect / vmstorage), see the [Clusters wiki](https://docs.shani.dev/doc/servers/clusters).

---

## Grafana Tempo (Distributed Tracing)

**Purpose:** Distributed tracing backend from Grafana Labs. Stores traces from OpenTelemetry, Jaeger, Zipkin, and other instrumented services, then lets you correlate them with Prometheus metrics and Loki logs in the same Grafana dashboard.

```yaml
# ~/tempo/compose.yaml
services:
  tempo:
    image: grafana/tempo:latest
    ports:
      - 127.0.0.1:3200:3200
      - 127.0.0.1:4317:4317
      - 127.0.0.1:4318:4318
    volumes:
      - /home/user/tempo/config.yaml:/etc/tempo.yaml:ro,Z
      - /home/user/tempo/data:/var/tempo:Z
    command: -config.file=/etc/tempo.yaml
    restart: unless-stopped
```

```bash
cd ~/tempo && podman-compose up -d
```

**Minimal `config.yaml`:**
```yaml
server:
  http_listen_port: 3200

distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4317
        http:
          endpoint: 0.0.0.0:4318

storage:
  trace:
    backend: local
    local:
      path: /var/tempo/blocks
    wal:
      path: /var/tempo/wal
```

Connect Grafana to Tempo: Configuration → Data Sources → Tempo → URL: `http://host.containers.internal:3200`. Enable the Trace to Logs correlation with your Loki datasource for one-click trace-to-log navigation.

---

## Zabbix (Agent-Based Monitoring)

**Purpose:** Enterprise-grade infrastructure monitoring with active and passive agent support. Zabbix agents run on monitored hosts and push detailed metrics — process lists, file monitoring, log parsing, custom scripts, and SNMP traps. Strong choice for monitoring Windows servers, network equipment, and bare-metal machines that don't expose Prometheus `/metrics` endpoints.

```yaml
# ~/zabbix/compose.yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: zabbix
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: zabbix
    volumes:
      - zabbix_pg_data:/var/lib/postgresql/data
    restart: unless-stopped

  zabbix-server:
    image: zabbix/zabbix-server-pgsql:alpine-latest
    ports:
      - 0.0.0.0:10051:10051
    environment:
      DB_SERVER_HOST: postgres
      POSTGRES_USER: zabbix
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: zabbix
    depends_on: [postgres]
    restart: unless-stopped

  zabbix-web:
    image: zabbix/zabbix-web-nginx-pgsql:alpine-latest
    ports:
      - 127.0.0.1:8400:8080
    environment:
      ZBX_SERVER_HOST: zabbix-server
      DB_SERVER_HOST: postgres
      POSTGRES_USER: zabbix
      POSTGRES_PASSWORD: changeme
      PHP_TZ: Asia/Kolkata
    depends_on: [zabbix-server]
    restart: unless-stopped

volumes:
  zabbix_pg_data:
```

```bash
cd ~/zabbix && podman-compose up -d
```

Default login: `Admin` / `zabbix`. Change immediately. Add hosts under Configuration → Hosts.

**Install Zabbix agent on monitored hosts:**
```bash
# Option A: Install inside a Distrobox container (recommended on Shani OS)
distrobox create --name zabbix-agent --image fedora:latest
distrobox enter zabbix-agent -- bash -c "
  sudo dnf install -y zabbix-agent2
  sudo sed -i 's/Server=127.0.0.1/Server=zabbix.home.local/' /etc/zabbix/zabbix_agent2.conf
  sudo systemctl enable --now zabbix-agent2
"
sudo firewall-cmd --add-port=10050/tcp --permanent && sudo firewall-cmd --reload

# Option B: On a conventional Linux host (not Shani OS)
sudo dnf install zabbix-agent2
sudo sed -i 's/Server=127.0.0.1/Server=zabbix.home.local/' /etc/zabbix/zabbix_agent2.conf
sudo systemctl enable --now zabbix-agent2
sudo firewall-cmd --add-port=10050/tcp --permanent && sudo firewall-cmd --reload
```

**Firewall (server side — for active agents):**
```bash
sudo firewall-cmd --add-port=10051/tcp --permanent && sudo firewall-cmd --reload
```

---

## Zabbix Proxy

**Purpose:** Collects monitoring data on behalf of the Zabbix server and forwards it in batches. Essential for monitoring remote networks where direct agent-to-server connections are impractical, and for reducing load on the main Zabbix server. The proxy runs locally in the remote network — only a single outbound connection is needed from that network to the Zabbix server.

```yaml
# ~/zabbix-proxy/compose.yaml
services:
  proxy-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: zabbix
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: zabbix_proxy
    volumes:
      - zabbix_proxy_pg_data:/var/lib/postgresql/data
    restart: unless-stopped

  zabbix-proxy:
    image: zabbix/zabbix-proxy-pgsql:alpine-latest
    ports:
      - 0.0.0.0:10051:10051
    environment:
      ZBX_SERVER_HOST: zabbix.home.local
      ZBX_SERVER_PORT: "10051"
      ZBX_PROXYMODE: "0"              # 0 = active (proxy pushes to server)
      ZBX_HOSTNAME: remote-proxy-01   # must match the proxy name in the server UI
      DB_SERVER_HOST: proxy-db
      POSTGRES_USER: zabbix
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: zabbix_proxy
    depends_on: [proxy-db]
    restart: unless-stopped

volumes:
  zabbix_proxy_pg_data:
```

```bash
cd ~/zabbix-proxy && podman-compose up -d
```

**Register the proxy in the Zabbix server UI:**
1. Go to **Administration → Proxies → Create proxy**.
2. Set the **Proxy name** to match `ZBX_HOSTNAME` above (`remote-proxy-01`).
3. Set **Proxy mode** to **Active**. Save.

> In **active mode** (recommended), the proxy initiates the connection to the Zabbix server — no inbound firewall rules are needed on the proxy host.

---

## SigNoz (OpenTelemetry-Native Observability)

**Purpose:** All-in-one observability platform built natively on OpenTelemetry. Combines metrics, traces, and logs in a single UI — without needing to run separate Prometheus + Tempo + Loki stacks. Best for teams already using OpenTelemetry instrumentation.

```yaml
# ~/signoz/compose.yaml
services:
  clickhouse:
    image: clickhouse/clickhouse-server:24-alpine
    volumes:
      - signoz_clickhouse_data:/var/lib/clickhouse
    restart: unless-stopped

  query-service:
    image: signoz/query-service:latest
    ports:
      - 127.0.0.1:8085:8085
    environment:
      ClickHouseUrl: tcp://clickhouse:9000
    depends_on: [clickhouse]
    restart: unless-stopped

  frontend:
    image: signoz/frontend:latest
    ports:
      - 127.0.0.1:3301:3301
    depends_on: [query-service]
    restart: unless-stopped

  otel-collector:
    image: signoz/signoz-otel-collector:latest
    ports:
      - 127.0.0.1:4317:4317   # OTLP gRPC
      - 127.0.0.1:4318:4318   # OTLP HTTP
    depends_on: [clickhouse]
    restart: unless-stopped

volumes:
  signoz_clickhouse_data:
```

```bash
cd ~/signoz && podman-compose up -d
```

> Use the official `install.sh` script from the [SigNoz repo](https://github.com/SigNoz/signoz) for production — it sets up all dependencies and volume mounts correctly.

Access at `http://localhost:3301`. Instrument your apps with the OpenTelemetry SDK and point them at `http://localhost:4317` (gRPC) or `http://localhost:4318` (HTTP).

---

## OpenTelemetry Collector

**Purpose:** Vendor-neutral telemetry pipeline for traces, metrics, and logs. Receives telemetry from your applications via OTLP, Jaeger, Zipkin, or Prometheus scrape; processes and enriches it; then fans it out to multiple backends simultaneously. Removes per-backend SDK lock-in from your application code.

```yaml
# ~/otel-collector/compose.yaml
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    ports:
      - 127.0.0.1:4317:4317
      - 127.0.0.1:4318:4318
      - 127.0.0.1:8889:8889
    volumes:
      - /home/user/otel/otel-collector.yaml:/etc/otelcol-contrib/config.yaml:ro,Z
    restart: unless-stopped
```

```bash
cd ~/otel-collector && podman-compose up -d
```

**Example `otel-collector.yaml`:**
```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
  prometheus:
    config:
      scrape_configs:
        - job_name: otel-collector
          static_configs:
            - targets: [localhost:8888]

processors:
  batch:
    timeout: 5s
  memory_limiter:
    limit_mib: 512

exporters:
  otlp/tempo:
    endpoint: host.containers.internal:4317
    tls:
      insecure: true
  loki:
    endpoint: http://host.containers.internal:3100/loki/api/v1/push
  prometheus:
    endpoint: 0.0.0.0:8889

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch, memory_limiter]
      exporters: [otlp/tempo]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [loki]
    metrics:
      receivers: [otlp, prometheus]
      processors: [batch]
      exporters: [prometheus]
```

> Point your applications' OTLP SDK at `http://localhost:4317` (gRPC) or `http://localhost:4318` (HTTP). They send telemetry to the Collector, which routes to Tempo, Loki, and Prometheus — zero application changes needed when you swap backends.

---

## Checkmk Free (Agent-Based Infrastructure Monitoring)

**Purpose:** Full-stack IT infrastructure monitoring with auto-discovery, agent-based checks, SNMP, hardware health (IPMI/iDRAC), service states, inventory, and a powerful notification engine. More approachable than Zabbix for users who want a polished setup wizard. The free edition supports unlimited hosts with a full feature set for home lab and small-business use.

```yaml
# ~/checkmk/compose.yaml
services:
  checkmk:
    image: checkmk/check-mk-free:latest
    ports:
      - 127.0.0.1:8095:5000
    volumes:
      - /home/user/checkmk/data:/omd/sites:Z
    tmpfs:
      - /omd/sites/cmk/tmp:uid=1000,gid=1000
    restart: unless-stopped
```

```bash
cd ~/checkmk && podman-compose up -d
```

Access at `http://localhost:8095/cmk`. The admin password is shown in the container startup logs (`podman logs checkmk`).

**Install the agent on hosts to monitor:**
```bash
curl -o check-mk-agent.rpm \
  http://checkmk.home.local/cmk/check_mk/agents/check-mk-agent-2.3.0-1.noarch.rpm
sudo rpm -i check-mk-agent.rpm
sudo systemctl enable --now check-mk-agent.socket
```

> Checkmk auto-discovers all running services (systemd units, listening ports, running processes) on registered agents — far less manual configuration than Prometheus exporters.

---

## Karma (Alertmanager Dashboard)

**Purpose:** Read-only, real-time web dashboard for Alertmanager. Shows all firing alerts across multiple Alertmanager instances in a clear, filterable card layout — grouped by labels, silenced alerts visible, and instant search across alert names, labels, and annotations. Indispensable when you have many alert rules and need to quickly triage what's firing.

```yaml
# ~/karma/compose.yaml
services:
  karma:
    image: ghcr.io/prymitive/karma:latest
    ports:
      - 127.0.0.1:8094:8080
    environment:
      ALERTMANAGER_URI: http://host.containers.internal:9093
      ALERTMANAGER_NAME: home
    restart: unless-stopped
```

```bash
cd ~/karma && podman-compose up -d
```

Access at `http://localhost:8094`. Karma auto-refreshes every 30 seconds.

**Multiple Alertmanager instances:**
```bash
-e ALERTMANAGER_0_URI=http://host.containers.internal:9093 \
-e ALERTMANAGER_0_NAME=homelab \
-e ALERTMANAGER_1_URI=http://192.168.1.50:9093 \
-e ALERTMANAGER_1_NAME=nas
```

---

## Graylog (Log Management & SIEM-Lite)

**Purpose:** Centralised log management platform. Where Loki stores logs as compressed streams and queries them with LogQL, Graylog parses, indexes, and makes logs fully searchable via OpenSearch — every field in every message is indexed, so you can query `http_status:500 AND source:caddy` across millions of events in milliseconds. Use Graylog when you need structured, searchable log analysis; use Loki+Grafana when you want lightweight log storage alongside metrics.

```yaml
# ~/graylog/compose.yaml
services:
  mongodb:
    image: mongo:6
    volumes:
      - graylog_mongo_data:/data/db
    restart: unless-stopped

  opensearch:
    image: opensearchproject/opensearch:2
    environment:
      OPENSEARCH_JAVA_OPTS: "-Xms1g -Xmx1g"
      discovery.type: single-node
      plugins.security.disabled: "true"
      action.auto_create_index: "false"
    volumes:
      - graylog_os_data:/usr/share/opensearch/data
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    restart: unless-stopped

  graylog:
    image: graylog/graylog:6.3
    ports:
      - 127.0.0.1:9000:9000       # Web UI
      - 127.0.0.1:12201:12201     # GELF TCP
      - 127.0.0.1:12201:12201/udp # GELF UDP
      - 127.0.0.1:1514:1514       # Syslog TCP
      - 127.0.0.1:1514:1514/udp   # Syslog UDP
    environment:
      GRAYLOG_PASSWORD_SECRET: changeme-run-openssl-rand-base64-48
      # SHA2 of your admin password: echo -n yourpassword | sha256sum | cut -d' ' -f1
      # Value below is the hash of 'admin' — CHANGE IT before deploying
      GRAYLOG_ROOT_PASSWORD_SHA2: "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918"
      GRAYLOG_HTTP_EXTERNAL_URI: https://graylog.home.local/
      GRAYLOG_ELASTICSEARCH_HOSTS: http://opensearch:9200
      GRAYLOG_MONGODB_URI: mongodb://mongodb:27017/graylog
      TZ: Asia/Kolkata
    volumes:
      - /home/user/graylog/data:/usr/share/graylog/data:Z
      - /home/user/graylog/config:/usr/share/graylog/data/config:Z
    depends_on: [mongodb, opensearch]
    restart: unless-stopped

volumes:
  graylog_mongo_data:
  graylog_os_data:
```

```bash
cd ~/graylog && podman-compose up -d
```

Access at `http://localhost:9000`. Login with `admin` / your password. Create inputs under System → Inputs.

**Send logs from other containers via GELF:**
```yaml
# Add to any service's compose.yaml
logging:
  driver: gelf
  options:
    gelf-address: "udp://localhost:12201"
    tag: "myapp"
```

**Send Caddy access logs to Graylog via Syslog:**
```caddyfile
{
  log {
    output net localhost:1514 {
      dial_timeout 3s
    }
    format json
  }
}
```

**Ship logs from any Linux host via Filebeat → Graylog:**
```yaml
# /etc/filebeat/filebeat.yml on remote host
filebeat.inputs:
  - type: log
    paths: ["/var/log/*.log", "/var/log/caddy/*.log"]
    json.keys_under_root: true

output.logstash:
  hosts: ["graylog.home.local:5044"]
```

> **Graylog vs Loki:** Use Loki (via Grafana Alloy) for lightweight log tailing alongside Prometheus metrics. Use Graylog when you need full-text indexing, structured field search, and a dedicated log analysis UI.

---

## Changedetection.io (Website Change Monitor)

**Purpose:** Monitor any webpage for changes and get notified when content updates. Watches price drops, government notices, stock availability, documentation changes, and more. Supports CSS selectors, visual diffing, and notifications via ntfy, email, Telegram, Slack, Discord, and 80+ other services.

```yaml
# ~/changedetection/compose.yaml
services:
  changedetection:
    image: ghcr.io/dgtlmoon/changedetection.io:latest
    ports:
      - 127.0.0.1:5000:5000
    volumes:
      - /home/user/changedetection/data:/datastore:Z
    environment:
      PUID: "1000"
      PGID: "1000"
    restart: unless-stopped
```

```bash
cd ~/changedetection && podman-compose up -d
```

Access at `http://localhost:5000`. Add URLs to watch, optionally set a CSS/XPath selector, configure the check interval, and connect a notification service.

**Send notifications via ntfy** (Settings → Notifications → Add notification URL):
```
ntfy://host.containers.internal:8090/your-topic
```

**Caddy:**
```caddyfile
changes.home.local { tls internal; reverse_proxy localhost:5000 }
```

---

## OpenObserve (All-in-One Observability)

**Purpose:** Rust-based unified observability platform — metrics, logs, and traces in a single binary with a built-in web UI. Claims ~140× lower storage cost than Elasticsearch for log ingestion. A compelling alternative to running the full Grafana + Loki + Tempo stack when you want one service instead of three. Accepts OpenTelemetry, Prometheus remote-write, and Loki-compatible log APIs.

```yaml
# ~/openobserve/compose.yaml
services:
  openobserve:
    image: public.ecr.aws/zinclabs/openobserve:latest
    ports:
      - 127.0.0.1:5080:5080
    volumes:
      - /home/user/openobserve/data:/data:Z
    environment:
      ZO_ROOT_USER_EMAIL: admin@example.com
      ZO_ROOT_USER_PASSWORD: changeme
      ZO_DATA_DIR: /data
    restart: unless-stopped
```

```bash
cd ~/openobserve && podman-compose up -d
```

Access at `http://localhost:5080`. Ingest logs via the Loki-compatible endpoint (`/api/{org}/loki/api/v1/push`), send metrics via Prometheus remote-write, and send traces via OTLP.

**Caddy:**
```caddyfile
openobserve.home.local { tls internal; reverse_proxy localhost:5080 }
```

---

## Parca (Continuous Profiling)

**Purpose:** Always-on CPU and memory profiling for your running services — captures flamegraphs in production without manual sampling. Stores profiles over time so you can compare CPU usage before and after a code change or pinpoint a memory leak by diffing two time windows. Adds the fourth pillar of observability alongside metrics, logs, and traces.

```yaml
# ~/parca/compose.yaml
services:
  parca:
    image: ghcr.io/parca-dev/parca:latest
    ports:
      - 127.0.0.1:7070:7070
    volumes:
      - /home/user/parca/parca.yaml:/etc/parca/parca.yaml:ro,Z
    command: /parca --config-path=/etc/parca/parca.yaml
    restart: unless-stopped

  parca-agent:
    image: ghcr.io/parca-dev/parca-agent:latest
    privileged: true
    pid: host
    network_mode: host
    volumes:
      - /sys/fs/cgroup:/sys/fs/cgroup:ro
      - /sys/fs/bpf:/sys/fs/bpf
      - /run/user/${UID}/podman/podman.sock:/var/run/docker.sock:ro
    command: >
      --node=homeserver
      --remote-store-address=localhost:7070
      --remote-store-insecure
    restart: unless-stopped
```

```yaml
# ~/parca/parca.yaml
object_storage:
  bucket:
    type: FILESYSTEM
    config:
      directory: /var/lib/parca

scrape_configs:
  - job_name: parca-server
    scrape_interval: 10s
    static_configs:
      - targets: ['localhost:7070']
```

```bash
cd ~/parca && podman-compose up -d
```

Access at `http://localhost:7070`. Select a profile type (CPU, memory allocations), choose a time range, and Parca renders an interactive flamegraph. Use the **Compare** view to diff two time windows.

> The Parca Agent uses eBPF to profile any process on the host without code changes. Requires kernel ≥ 5.3 with BTF support — verify with `ls /sys/kernel/btf/vmlinux`.

**Caddy:**
```caddyfile
parca.home.local { tls internal; reverse_proxy localhost:7070 }
```

---

## Elasticsearch + ELK Stack (Single-Node)

**Purpose:** Distributed search and analytics engine — the `E` in the ELK stack (Elasticsearch + Logstash + Kibana). Stores, indexes, and searches structured and unstructured log data at scale. For multi-node production clusters see the [Clusters wiki](https://docs.shani.dev/doc/servers/clusters).

```yaml
# ~/elk/compose.yaml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.4
    ports:
      - 127.0.0.1:9200:9200
    volumes:
      - es_data:/usr/share/elasticsearch/data
    environment:
      discovery.type: single-node
      xpack.security.enabled: "false"
      ES_JAVA_OPTS: "-Xms512m -Xmx1g"
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    restart: unless-stopped

  kibana:
    image: docker.elastic.co/kibana/kibana:8.13.4
    ports:
      - 127.0.0.1:5601:5601
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200
    depends_on: [elasticsearch]
    restart: unless-stopped

  logstash:
    image: docker.elastic.co/logstash/logstash:8.13.4
    ports:
      - 127.0.0.1:5044:5044    # Beats input
      - 127.0.0.1:5000:5000    # TCP/syslog input
      - 127.0.0.1:9600:9600    # Logstash monitoring API
    volumes:
      - /home/user/elk/logstash/pipeline:/usr/share/logstash/pipeline:ro,Z
      - /home/user/elk/logstash/config/logstash.yml:/usr/share/logstash/config/logstash.yml:ro,Z
    environment:
      LS_JAVA_OPTS: "-Xms256m -Xmx512m"
    depends_on: [elasticsearch]
    restart: unless-stopped

volumes:
  es_data:
```

```bash
# Required on the host before starting
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee /etc/sysctl.d/99-elasticsearch.conf

cd ~/elk && podman-compose up -d
```

**Kibana:** `http://localhost:5601` — create index patterns under Stack Management → Index Patterns.

**Minimal `logstash.yml`:**
```yaml
# ~/elk/logstash/config/logstash.yml
http.host: "0.0.0.0"
xpack.monitoring.enabled: false
pipeline.workers: 2
pipeline.batch.size: 125
```

**Pipeline: Beats → parse → Elasticsearch (`beats-to-es.conf`):**
```ruby
# ~/elk/logstash/pipeline/beats-to-es.conf
input {
  beats {
    port => 5044
  }
}

filter {
  if [fields][type] == "nginx" {
    grok {
      match => { "message" => "%{COMBINEDAPACHELOG}" }
    }
    date {
      match => ["timestamp", "dd/MMM/yyyy:HH:mm:ss Z"]
    }
    geoip {
      source => "clientip"
    }
    mutate {
      remove_field => ["message", "timestamp"]
    }
  }

  if [fields][type] == "syslog" {
    grok {
      match => { "message" => "%{SYSLOGTIMESTAMP:syslog_timestamp} %{SYSLOGHOST:syslog_hostname} %{DATA:syslog_program}(?:\\[%{POSINT:syslog_pid}\\])?: %{GREEDYDATA:syslog_message}" }
    }
    date {
      match => ["syslog_timestamp", "MMM  d HH:mm:ss", "MMM dd HH:mm:ss"]
    }
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "logs-%{[fields][type]}-%{+YYYY.MM.dd}"
  }
}
```

**Common Logstash operations:**
```bash
# Check pipeline status
curl http://localhost:9600/_node/pipelines?pretty

# Check node stats (throughput, queue depth)
curl http://localhost:9600/_node/stats?pretty | python3 -m json.tool | grep -A5 events

# Validate a pipeline config before deploying
podman exec logstash logstash --config.test_and_exit \
  -f /usr/share/logstash/pipeline/beats-to-es.conf
```

**Common Elasticsearch operations:**
```bash
# Cluster health
curl http://localhost:9200/_cluster/health?pretty

# List all indices with size and doc count
curl "http://localhost:9200/_cat/indices?v&s=store.size:desc"

# Delete an index
curl -X DELETE http://localhost:9200/logs-2024.01.01

# Check ILM policy status for an index
curl http://localhost:9200/logs-000001/_ilm/explain?pretty
```

**Index Lifecycle Management (ILM) — auto-manage index ageing:**
```bash
curl -X PUT http://localhost:9200/_ilm/policy/logs-policy \
  -H "Content-Type: application/json" -d '
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": { "max_primary_shard_size": "50gb", "max_age": "1d" },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 },
          "set_priority": { "priority": 50 }
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": { "delete": {} }
      }
    }
  }
}'
```

---

## Beats — Lightweight Log & Metric Shippers

**Purpose:** Single-purpose, lightweight agents (Go binaries, no JVM) that run on monitored hosts and ship data to Logstash or Elasticsearch directly.

| Beat | Ships | Use Case |
|------|-------|----------|
| **Filebeat** | Log files | Application logs, access logs, syslog |
| **Metricbeat** | System metrics | CPU, memory, disk, container stats |
| **Packetbeat** | Network traffic | HTTP, DNS, MySQL, Redis protocol analysis |
| **Auditbeat** | Audit events | File integrity monitoring, `auditd` events |
| **Heartbeat** | Uptime | Active monitoring, HTTP/TCP/ICMP checks |
| **Winlogbeat** | Windows Event Log | Windows security and application logs |

**Filebeat — ship log files to Logstash:**
```yaml
# ~/filebeat/compose.yaml
services:
  filebeat:
    image: docker.elastic.co/beats/filebeat:8.13.4
    user: root
    volumes:
      - /home/user/filebeat/filebeat.yml:/usr/share/filebeat/filebeat.yml:ro,Z
      - /var/log:/var/log:ro
      - /run/user/${UID}/podman/podman.sock:/run/podman/podman.sock:ro
      - filebeat_data:/usr/share/filebeat/data
    restart: unless-stopped

volumes:
  filebeat_data:
```

```yaml
# ~/filebeat/filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/*.log
      - /var/log/caddy/*.log
    fields:
      type: syslog
    fields_under_root: true

  - type: log
    enabled: true
    paths:
      - /var/log/nginx/access.log
    fields:
      type: nginx
    fields_under_root: true

output.logstash:
  hosts: ["host.containers.internal:5044"]

processors:
  - add_host_metadata: ~
  - add_cloud_metadata: ~

logging.level: info
```

```bash
cd ~/filebeat && podman-compose up -d
```

**Metricbeat — ship system metrics:**
```yaml
# ~/metricbeat/compose.yaml
services:
  metricbeat:
    image: docker.elastic.co/beats/metricbeat:8.13.4
    user: root
    network_mode: host
    volumes:
      - /home/user/metricbeat/metricbeat.yml:/usr/share/metricbeat/metricbeat.yml:ro,Z
      - /proc:/hostfs/proc:ro
      - /sys/fs/cgroup:/hostfs/sys/fs/cgroup:ro
      - /:/hostfs:ro
      - /run/user/${UID}/podman/podman.sock:/run/podman/podman.sock:ro
    command: metricbeat -e --system.hostfs=/hostfs
    restart: unless-stopped
```

---

## OpenSearch (Single-Node)

**Purpose:** Fully open-source fork of Elasticsearch 7.10 under the Apache 2.0 licence. Drop-in API compatible — any Logstash output, Filebeat, or Metricbeat that targets Elasticsearch works against OpenSearch without changes. For multi-node production clusters see the [Clusters wiki](https://docs.shani.dev/doc/servers/clusters).

```yaml
# ~/opensearch/compose.yaml
services:
  opensearch:
    image: opensearchproject/opensearch:2
    ports:
      - 127.0.0.1:9200:9200
      - 127.0.0.1:9600:9600
    environment:
      discovery.type: single-node
      DISABLE_SECURITY_PLUGIN: "true"
      OPENSEARCH_JAVA_OPTS: "-Xms512m -Xmx1g"
    volumes:
      - opensearch_data:/usr/share/opensearch/data
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    restart: unless-stopped

  opensearch-dashboards:
    image: opensearchproject/opensearch-dashboards:2
    ports:
      - 127.0.0.1:5601:5601
    environment:
      OPENSEARCH_HOSTS: '["http://opensearch:9200"]'
      DISABLE_SECURITY_DASHBOARDS_PLUGIN: "true"
    depends_on: [opensearch]
    restart: unless-stopped

volumes:
  opensearch_data:
```

```bash
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee /etc/sysctl.d/99-elasticsearch.conf

cd ~/opensearch && podman-compose up -d
```

---

## Fluent Bit (Lightweight Log Forwarder)

**Purpose:** Ultra-lightweight (< 1 MB binary, ~1 MB RAM at idle) log and metrics forwarder written in C. The modern replacement for Fluentd in resource-constrained environments. Collects from files, syslog, systemd journal, Docker, and container runtimes; then ships to Elasticsearch, OpenSearch, Loki, ClickHouse, S3, Kafka, and 40+ other outputs.

```yaml
# ~/fluent-bit/compose.yaml
services:
  fluent-bit:
    image: fluent/fluent-bit:latest
    ports:
      - 127.0.0.1:24224:24224/tcp
      - 127.0.0.1:24224:24224/udp
      - 127.0.0.1:2020:2020
    volumes:
      - /home/user/fluent-bit/fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf:ro,Z
      - /home/user/fluent-bit/parsers.conf:/fluent-bit/etc/parsers.conf:ro,Z
      - /var/log:/var/log:ro
      - /run/user/${UID}/podman/podman.sock:/var/run/docker.sock:ro
    restart: unless-stopped
```

**`fluent-bit.conf` — collect system logs and ship to Elasticsearch + Loki:**
```ini
[SERVICE]
    Flush         5
    Daemon        Off
    Log_Level     info
    Parsers_File  parsers.conf
    HTTP_Server   On
    HTTP_Listen   0.0.0.0
    HTTP_Port     2020
    storage.type  filesystem
    storage.path  /var/log/fluent-bit-storage/

[INPUT]
    Name              tail
    Path              /var/log/*.log
    Tag               syslog.*
    Parser            syslog-rfc3164
    DB                /var/log/fluent-bit-syslog.db
    Mem_Buf_Limit     5MB
    Skip_Long_Lines   On

[INPUT]
    Name              systemd
    Tag               journal.*
    Systemd_Filter    _SYSTEMD_UNIT=caddy.service
    Strip_Underscores On

[FILTER]
    Name           record_modifier
    Match          *
    Record         hostname ${HOSTNAME}
    Record         environment homelab

[OUTPUT]
    Name                es
    Match               *
    Host                host.containers.internal
    Port                9200
    Logstash_Format     On
    Logstash_Prefix     fluent
    Suppress_Type_Name  On

[OUTPUT]
    Name        loki
    Match       *
    Host        host.containers.internal
    Port        3100
    Labels      job=fluent-bit,host=${HOSTNAME}
    Line_Format json
```

**Common operations:**
```bash
# Check pipeline stats
curl http://localhost:2020/api/v1/metrics | python3 -m json.tool

# Test config before deploying
podman exec fluent-bit fluent-bit --config /fluent-bit/etc/fluent-bit.conf --dry-run
```

> **Fluent Bit vs Logstash vs Filebeat:** Use Fluent Bit for a tiny-footprint forwarder (perfect for every container/host to a central aggregator). Use Filebeat when you're in the Elastic ecosystem. Use Logstash for heavy-duty filtering, complex Grok patterns, or multiple conditional outputs.

---

## Vector.dev (High-Performance Log & Metric Pipeline)

**Purpose:** Rust-based observability data pipeline. Collects logs, metrics, and traces; transforms them with a powerful built-in VRL (Vector Remap Language) scripting layer; and routes to any backend. Significantly higher throughput than Logstash or Fluent Bit on multi-core hardware, with end-to-end acknowledgements and disk-backed buffering. A single Vector instance can replace Filebeat + Logstash, or Promtail + Grafana Alloy, in many setups.

```yaml
# ~/vector/compose.yaml
services:
  vector:
    image: timberio/vector:latest-alpine
    ports:
      - 127.0.0.1:8686:8686    # Vector API
      - 127.0.0.1:6000:6000    # Syslog TCP
      - 127.0.0.1:6001:6001/udp
    volumes:
      - /home/user/vector/vector.yaml:/etc/vector/vector.yaml:ro,Z
      - /var/log:/var/log:ro
      - /home/user/vector/data:/var/lib/vector:Z
      - /run/user/${UID}/podman/podman.sock:/var/run/docker.sock:ro
    restart: unless-stopped
```

**`vector.yaml` — collect, enrich, and fan out to Elasticsearch and Loki:**
```yaml
api:
  enabled: true
  address: "0.0.0.0:8686"

data_dir: /var/lib/vector

sources:
  syslog_tcp:
    type: syslog
    address: "0.0.0.0:6000"
    mode: tcp

  host_logs:
    type: file
    include:
      - /var/log/*.log
      - /var/log/caddy/*.log

  docker_logs:
    type: docker_logs
    docker_host: "unix:///run/user/${UID}/podman/podman.sock"

  host_metrics:
    type: host_metrics
    scrape_interval_secs: 15
    collectors: [cpu, disk, filesystem, load, memory, network]

transforms:
  enrich_all:
    type: remap
    inputs: [syslog_tcp, docker_logs]
    source: |
      .hostname = get_hostname!()
      .environment = "homelab"

  filter_noise:
    type: filter
    inputs: [enrich_all]
    condition: |
      !includes(["debug", "trace"], downcase(string!(.level ?? "")))

sinks:
  elasticsearch_out:
    type: elasticsearch
    inputs: [filter_noise]
    endpoints: ["http://host.containers.internal:9200"]
    mode: bulk
    bulk:
      index: "vector-%Y.%m.%d"
    buffer:
      type: disk
      max_size: 268435456   # 256 MB

  loki_out:
    type: loki
    inputs: [filter_noise]
    endpoint: "http://host.containers.internal:3100"
    labels:
      job: vector
      host: "{{ hostname }}"
    encoding:
      codec: json
    buffer:
      type: disk
      max_size: 134217728   # 128 MB

  prometheus_out:
    type: prometheus_exporter
    inputs: [host_metrics]
    address: "0.0.0.0:9598"
```

**Common operations:**
```bash
# Check topology and component health
curl http://localhost:8686/health
curl http://localhost:8686/components | python3 -m json.tool

# Validate config before deploying
podman exec vector vector validate /etc/vector/vector.yaml

# Test VRL expressions interactively
podman run --rm -it timberio/vector:latest-alpine vector vrl
```

> **Vector vs Fluent Bit vs Logstash:** Vector has the highest throughput and most expressive transformation language (VRL). Fluent Bit has the smallest footprint for edge/sidecar deployments. Logstash has the richest plugin ecosystem and best Kibana integration. For a new homelab log pipeline shipping to both Elasticsearch and Loki, Vector is the best starting point.

---

## Caddy Configuration

```caddyfile
grafana.home.local         { tls internal; reverse_proxy localhost:3001 }
prometheus.home.local      { tls internal; reverse_proxy localhost:9090 }
alerts.home.local          { tls internal; reverse_proxy localhost:9093 }
karma.home.local           { tls internal; reverse_proxy localhost:8094 }
netdata.home.local         { tls internal; reverse_proxy localhost:19999 }
netdata-hub.home.local     { tls internal; reverse_proxy localhost:19998 }
uptime.home.local          { tls internal; reverse_proxy localhost:3002 }
beszel.home.local          { tls internal; reverse_proxy localhost:8090 }
dozzle.home.local          { tls internal; reverse_proxy localhost:8888 }
hc.home.local              { tls internal; reverse_proxy localhost:8000 }
speedtest.home.local       { tls internal; reverse_proxy localhost:8092 }
smokeping.home.local       { tls internal; reverse_proxy localhost:8081 }
gatus.home.local           { tls internal; reverse_proxy localhost:8088 }
victoriametrics.home.local { tls internal; reverse_proxy localhost:8428 }
tempo.home.local           { tls internal; reverse_proxy localhost:3200 }
zabbix.home.local          { tls internal; reverse_proxy localhost:8400 }
signoz.home.local          { tls internal; reverse_proxy localhost:3301 }
checkmk.home.local         { tls internal; reverse_proxy localhost:8095 }
graylog.home.local         { tls internal; reverse_proxy localhost:9000 }
changes.home.local         { tls internal; reverse_proxy localhost:5000 }
openobserve.home.local     { tls internal; reverse_proxy localhost:5080 }
parca.home.local           { tls internal; reverse_proxy localhost:7070 }
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Grafana shows "No data" | Ensure Prometheus scrape targets are reachable; verify the datasource URL uses `host.containers.internal` not `localhost` |
| Loki not receiving logs | Check that Alloy/Promtail is running and the Loki push URL is correct; check `podman logs loki` |
| Prometheus scrape failing | Confirm the target endpoint responds at `/metrics` with a 200; check the port is bound and reachable |
| Alertmanager not sending alerts | Verify receiver config syntax; test with `amtool alert add`; check `podman logs alertmanager` |
| Node Exporter shows wrong metrics | Ensure `--path.procfs` and `--path.sysfs` flags are set correctly when running in a container |
| Netdata container metrics missing | Mount the Podman socket: `-v /run/user/$(id -u)/podman/podman.sock:/var/run/docker.sock:ro` |
| Uptime Kuma push monitors not firing | Verify the monitor URL is accessible from the container; check that ntfy topic/webhook URL is correct |
| Dozzle shows no containers | Rootless Podman uses `/run/user/$(id -u)/podman/podman.sock` — not `/var/run/docker.sock` |
| Beszel agent not reporting | Verify the public key from the hub is correctly pasted; check that port `45876` is reachable from the hub |
| Gatus not sending alerts | Verify the alert integration config syntax; check `podman logs gatus` for connection errors |
| Healthchecks ping not received | Verify `SITE_ROOT` is the URL the script calls; check that the UUID matches the check in the UI |
| VictoriaMetrics not receiving data | Verify the remote-write URL is `http://host.containers.internal:8428/api/v1/write`; check `podman logs victoriametrics` |
| Tempo traces not appearing | Ensure the OTel SDK targets the correct endpoint (`4317` for gRPC, `4318` for HTTP); check `podman logs tempo` |
| OTel Collector dropping spans | Check `memory_limiter` isn't too aggressive; increase `limit_mib`; view pipeline stats at `http://localhost:8888/metrics` |
| Checkmk agent not connecting | Ensure `check-mk-agent.socket` is active on the monitored host; verify TCP port `6556` is reachable |
| Zabbix agent not connecting | Verify `Server=` in `zabbix_agent2.conf` matches the Zabbix server IP; check port `10051/tcp` is open |
| Zabbix Proxy not registering | Confirm `ZBX_HOSTNAME` in the proxy compose matches exactly the name in the server UI under Administration → Proxies |
| SigNoz no data after deployment | Ensure the OTel collector is running and your app is sending to the correct port; check ClickHouse is healthy |
| Karma shows no alerts | Verify `ALERTMANAGER_URI` is reachable from the container using `host.containers.internal` |
| Graylog web UI unreachable | Ensure `GRAYLOG_HTTP_EXTERNAL_URI` matches the URL you're accessing; check OpenSearch and MongoDB are healthy first |
| Graylog GELF input not receiving logs | Verify the log driver uses `gelf` with `gelf-address: udp://`; check firewall isn't blocking `12201/udp` |
| Graylog OpenSearch connection refused | The `plugins.security.disabled: "true"` env var is required for OpenSearch 2.x without TLS |
| Changedetection not detecting changes | Try adding a CSS selector to target the specific element; some sites require the Playwright-based browser fetcher for JavaScript-rendered content |
| alertmanager-ntfy bridge not delivering | Verify the bridge container is running and the `url` in `alertmanager.yml` uses `host.containers.internal`; check `podman logs alertmanager-ntfy` |
| Netdata parent shows no child nodes | Confirm the `api key` UUID in both child and parent `stream.conf` match exactly; restart the child agent after editing |
| Parca Agent missing profiles | eBPF requires kernel ≥ 5.3 with BTF — verify with `ls /sys/kernel/btf/vmlinux`; the agent must run `privileged: true` with `pid: host` |
| Elasticsearch OOM-killed | Limit JVM heap with `ES_JAVA_OPTS="-Xms512m -Xmx1g"`; default is 50% of host RAM |
| Elasticsearch `vm.max_map_count too low` | Run `sudo sysctl -w vm.max_map_count=262144` on the host and persist in `/etc/sysctl.d/99-elasticsearch.conf` |
| Kibana `Kibana server is not ready yet` | Wait for Elasticsearch to fully start first; check `podman logs kibana` |
| Logstash `Pipeline aborted due to error` | Check `podman logs logstash`; most common causes are Grok pattern mismatch or Elasticsearch unreachable |
| Filebeat `connection refused` to Logstash | Verify Logstash Beats input is on port `5044`; use `host.containers.internal:5044` not `localhost:5044` |
| OpenSearch `cluster_manager not discovered` | `cluster.initial_cluster_manager_nodes` must list all manager-eligible nodes on first boot only |
| Fluent Bit losing events on container restart | Enable `storage.type filesystem` on a persistent volume; without this, in-flight events are lost on restart |
| Vector pipeline component showing errors | Run `curl localhost:8686/components` to see component health; run `vector validate /etc/vector/vector.yaml` before deploying |
| Vector disk buffer filling up | Increase `max_size` in the sink buffer config, or fix the downstream sink connectivity; Vector applies backpressure rather than dropping events |
