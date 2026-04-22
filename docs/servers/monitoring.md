---
title: Monitoring
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Monitoring

System metrics, log aggregation, alerting, uptime tracking, container visibility, and network performance monitoring.

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
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
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

# Show TSDB stats
curl http://localhost:9090/api/v1/status/tsdb | python3 -m json.tool
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

**End-to-end Alertmanager → ntfy routing:**

The webhook config above sends all alerts to a single ntfy topic. To route different alert severities to different topics — for example, critical alerts to a high-priority topic and warnings to a quieter one — use Alertmanager's `routes` tree and ntfy's HTTP title/priority headers via a shim or direct webhook format.

The cleanest self-hosted approach is to use [alertmanager-ntfy](https://github.com/alexbakker/alertmanager-ntfy) as a thin webhook bridge:

```yaml
# ~/alertmanager-ntfy/compose.yaml
services:
  alertmanager-ntfy:
    image: ghcr.io/alexbakker/alertmanager-ntfy:latest
    ports: ["127.0.0.1:9095:8080"]
    volumes:
      - /home/user/alertmanager-ntfy/config.yaml:/config.yaml:ro,Z
    restart: unless-stopped
```

```yaml
# ~/alertmanager-ntfy/config.yaml
ntfy:
  base_url: http://host.containers.internal:8090
  topic: alerts
  # Priority mapped from Alertmanager severity label
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

Update `alertmanager.yml` to point at the bridge and add severity-specific routes:

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
      continue: false
    - match:
        severity: warning
      receiver: ntfy-warning
      continue: false

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

> The bridge maps the `severity` label to ntfy priority levels automatically — `critical` → `urgent` (breaks through Do Not Disturb), `warning` → `default`, `info` → `low`. You can also route to different ntfy topics per receiver by setting `topic` per receiver in the bridge config.

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

# List installed plugins
podman exec grafana grafana-cli plugins ls

# Reset admin password
podman exec grafana grafana-cli admin reset-admin-password newpassword

# Check Grafana health
curl http://localhost:3001/api/health

# Export a dashboard as JSON (via API)
curl -u admin:changeme http://localhost:3001/api/dashboards/uid/YOUR_UID | python3 -m json.tool

# Import a dashboard from Grafana.com by ID
# Go to Dashboards → Import → paste ID (e.g., 1860 for Node Exporter Full)
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
curl "http://localhost:3100/loki/api/v1/query_range"   --data-urlencode 'query={job="containerlogs"}'   --data-urlencode 'start=1h ago' | python3 -m json.tool | head -30

# List all label names
curl http://localhost:3100/loki/api/v1/labels | python3 -m json.tool

# Check ingestion stats
curl http://localhost:3100/metrics | grep loki_ingester

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
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
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

# Restart after config change
podman restart uptime-kuma
```

Access at `http://localhost:3002`. Create monitors for each service you run. The built-in status page can be shared with users to communicate outages.

---

## Beszel (Multi-Host Monitoring)

**Purpose:** Minimal, lightweight server monitoring with a central dashboard. Each server runs a tiny agent that reports CPU, RAM, disk, and network to the hub. Better than Netdata for monitoring multiple remote servers from one screen.

```yaml
# ~/beszel/compose.yml — hub (central server)
services:
  beszel:
    image: henrygd/beszel:latest
    ports: ["127.0.0.1:8090:8090"]
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
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
    environment:
      PORT: 45876
      KEY: your-public-key-from-hub
    restart: unless-stopped
```

```bash
cd ~/beszel-agent && podman-compose up -d
```

**Common operations:**
```bash
# Get the public key for agent configuration (from the hub UI)
# Settings → Add Server → copy the public key shown

# View hub logs
podman logs -f beszel

# View agent logs on a monitored server
podman logs -f beszel-agent

# Check agent is reachable (from hub server)
curl -sk https://agent-ip:45876 || echo "Agent unreachable"
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
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
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

> Gatus integrates with ntfy, Slack, email, Telegram, and more for alert delivery. Its config file is easy to keep in Git alongside your other service configs.

---

## VictoriaMetrics (Prometheus-Compatible, High Performance)

**Purpose:** Drop-in Prometheus replacement with 10× lower memory usage, better compression, and faster queries. Fully compatible with the Prometheus remote-write protocol and PromQL — point any Prometheus-scraping agent (Grafana Alloy, Telegraf, node-exporter) at VictoriaMetrics without code changes. Ideal when Prometheus starts consuming too much RAM or when you need long-term metric retention without downsampling.

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

# Check storage stats
curl http://localhost:8428/api/v1/status/tsdb | python3 -m json.tool | head -20

# List all metric names
curl http://localhost:8428/api/v1/label/__name__/values | python3 -m json.tool | head -20

# Delete a time series (by label selector)
curl -X POST "http://localhost:8428/api/v1/admin/tsdb/delete_series?match[]=up{job="old-job"}"

# Snapshot for backup
curl -X POST http://localhost:8428/snapshot/create
```

**Reconfigure Grafana to use VictoriaMetrics** instead of Prometheus:
- Grafana → Connections → Data Sources → Prometheus
- URL: `http://host.containers.internal:8428`
- VictoriaMetrics speaks PromQL natively — all existing dashboards work unchanged.

**Remote-write from Prometheus to VictoriaMetrics** (dual-write for migration):
```yaml
# In prometheus.yml
remote_write:
  - url: http://host.containers.internal:8428/api/v1/write
```

---

## Grafana Tempo (Distributed Tracing)

**Purpose:** Distributed tracing backend from Grafana Labs. Stores traces from OpenTelemetry, Jaeger, Zipkin, and other instrumented services, then lets you correlate them with your Prometheus metrics and Loki logs in the same Grafana dashboard. Essential when you need to trace a slow request through multiple microservices.

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
# ~/zabbix/compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: zabbix
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: zabbix
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  zabbix-server:
    image: zabbix/zabbix-server-pgsql:alpine-latest
    ports: ["0.0.0.0:10051:10051"]
    environment:
      DB_SERVER_HOST: postgres
      POSTGRES_USER: zabbix
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: zabbix
    depends_on: [postgres]
    restart: unless-stopped

  zabbix-web:
    image: zabbix/zabbix-web-nginx-pgsql:alpine-latest
    ports: ["127.0.0.1:8400:8080"]
    environment:
      ZBX_SERVER_HOST: zabbix-server
      DB_SERVER_HOST: postgres
      POSTGRES_USER: zabbix
      POSTGRES_PASSWORD: changeme
      PHP_TZ: Asia/Kolkata
    depends_on: [zabbix-server]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/zabbix && podman-compose up -d
```

Default login: `Admin` / `zabbix`. Change immediately. Add hosts under Configuration → Hosts, assign templates (Linux by Zabbix agent, Network interfaces by SNMP, etc.).

**Install Zabbix agent on monitored hosts:**
```bash
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

**Purpose:** A Zabbix proxy collects monitoring data on behalf of the Zabbix server and forwards it in batches. Essential for monitoring remote networks (branch offices, cloud VPCs, or off-site servers) where direct agent-to-server connections are impractical, and for reducing the load on the main Zabbix server in large environments. The proxy runs locally in the remote network, so only a single outbound connection is needed from that network to the Zabbix server.

```yaml
# ~/zabbix-proxy/compose.yml
services:
  proxy-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: zabbix
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: zabbix_proxy
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  zabbix-proxy:
    image: zabbix/zabbix-proxy-pgsql:alpine-latest
    ports: ["0.0.0.0:10051:10051"]
    environment:
      ZBX_SERVER_HOST: zabbix.home.local   # IP or hostname of the main Zabbix server
      ZBX_SERVER_PORT: "10051"
      ZBX_PROXYMODE: "0"                   # 0 = active (proxy pushes to server), 1 = passive
      ZBX_HOSTNAME: remote-proxy-01        # must match the proxy name in the server UI
      DB_SERVER_HOST: proxy-db
      POSTGRES_USER: zabbix
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: zabbix_proxy
    depends_on: [proxy-db]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/zabbix-proxy && podman-compose up -d
```

**Register the proxy in the Zabbix server UI:**
1. Go to **Administration → Proxies → Create proxy**.
2. Set the **Proxy name** to match `ZBX_HOSTNAME` above (`remote-proxy-01`).
3. Set **Proxy mode** to **Active**.
4. Save. The proxy will connect to the server and begin checking in.

**Assign hosts to the proxy:**
- Open any host under **Configuration → Hosts**.
- Set the **Monitored by proxy** field to `remote-proxy-01`.
- The Zabbix server will instruct the proxy to collect data for that host.

**Firewall on the proxy host:**
```bash
# If using passive mode — server connects inbound to the proxy
sudo firewall-cmd --add-port=10051/tcp --permanent && sudo firewall-cmd --reload
```

> In **active mode** (recommended), the proxy initiates the connection to the Zabbix server — no inbound firewall rules are needed on the proxy host. The server on port `10051` must be reachable from the proxy network. Use active mode whenever possible for remote-network deployments.

---

## SigNoz (OpenTelemetry-Native Observability)

**Purpose:** All-in-one observability platform built natively on OpenTelemetry. Combines metrics, traces, and logs in a single UI — without needing to run separate Prometheus + Tempo + Loki stacks. Best for teams already using OpenTelemetry instrumentation in their applications.

```yaml
# ~/signoz/compose.yml — use the official install script
# git clone https://github.com/SigNoz/signoz
# cd signoz/deploy && ./install.sh

# Core services overview:
services:
  clickhouse:
    image: clickhouse/clickhouse-server:24-alpine
    volumes: [clickhouse_data:/var/lib/clickhouse]
    restart: unless-stopped

  query-service:
    image: signoz/query-service:latest
    ports: ["127.0.0.1:8085:8085"]
    environment:
      ClickHouseUrl: tcp://clickhouse:9000
    depends_on: [clickhouse]
    restart: unless-stopped

  frontend:
    image: signoz/frontend:latest
    ports: ["127.0.0.1:3301:3301"]
    depends_on: [query-service]
    restart: unless-stopped

  otel-collector:
    image: signoz/signoz-otel-collector:latest
    ports:
      - "127.0.0.1:4317:4317"   # OTLP gRPC
      - "127.0.0.1:4318:4318"   # OTLP HTTP
    depends_on: [clickhouse]
    restart: unless-stopped
```

```bash
cd ~/signoz && podman-compose up -d
```

> Use the official `install.sh` script for production — it sets up all dependencies and volume mounts correctly. The manual compose above is illustrative.

Access at `http://localhost:3301`. Instrument your apps with the OpenTelemetry SDK and point them at `http://localhost:4317` (gRPC) or `http://localhost:4318` (HTTP).

---

## OpenTelemetry Collector

**Purpose:** Vendor-neutral telemetry pipeline for traces, metrics, and logs. Acts as a central hub that receives telemetry from your applications (via OTLP, Jaeger, Zipkin, or Prometheus scrape), processes and enriches it, then fans it out to multiple backends — Grafana Tempo, Loki, Prometheus, SigNoz, Jaeger, and cloud vendors simultaneously. If you run more than one observability backend, the Collector removes per-backend SDK lock-in from your application code.

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

**Purpose:** Full-stack IT infrastructure monitoring with auto-discovery, agent-based checks, SNMP, hardware health (IPMI/iDRAC), service states, inventory, and a powerful notification engine. More approachable than Zabbix for users who want a polished setup wizard and less XML configuration. The free edition supports unlimited hosts with a full feature set for home lab and small-business use.

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
# On the monitored host — download from your Checkmk server
curl -o check-mk-agent.rpm \
  http://checkmk.home.local/cmk/check_mk/agents/check-mk-agent-2.3.0-1.noarch.rpm
sudo rpm -i check-mk-agent.rpm
sudo systemctl enable --now check-mk-agent.socket
```

> Checkmk auto-discovers all running services (systemd units, listening ports, running processes) on registered agents — far less manual configuration than Prometheus exporters for system monitoring.

---

## Karma (Alertmanager Dashboard)

**Purpose:** A read-only, real-time web dashboard for Alertmanager. Where Alertmanager's own UI is minimal and hard to navigate during an incident, Karma shows all firing alerts across multiple Alertmanager instances in a clear, filterable card layout — grouped by labels, silenced alerts visible, and instant search across alert names, labels, and annotations. Indispensable when you have many alert rules and need to quickly triage what's actually firing.

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

Access at `http://localhost:8094`. Karma auto-refreshes every 30 seconds and shows all active alerts with their labels, annotations, and silence status.

**Multiple Alertmanager instances:**
```bash
-e ALERTMANAGER_0_URI=http://host.containers.internal:9093 \
-e ALERTMANAGER_0_NAME=homelab \
-e ALERTMANAGER_1_URI=http://192.168.1.50:9093 \
-e ALERTMANAGER_1_NAME=nas
```

**Silence an alert from Karma:** Click any alert card → Silence → set duration and comment. Silences are pushed to Alertmanager and respected across your entire alerting pipeline.

---

## Graylog (Log Management & SIEM-Lite)

**Purpose:** Centralised log management platform. Where Loki (in the Grafana stack) stores logs as compressed streams and queries them with LogQL, Graylog parses, indexes, and makes logs fully searchable via Elasticsearch/OpenSearch — every field in every message is indexed, so you can query `http_status:500 AND source:caddy` across millions of events in milliseconds. Supports GELF, Syslog, Beats, CEF, and raw TCP/UDP inputs. Includes alerting, dashboards, stream-based routing, and pipeline rules for enrichment. Use Graylog when you need structured, searchable log analysis rather than log tailing; use Loki+Grafana when you want lightweight log storage alongside metrics.

```yaml
# ~/graylog/compose.yml
services:
  mongodb:
    image: mongo:6
    volumes: [mongo_data:/data/db]
    restart: unless-stopped

  opensearch:
    image: opensearchproject/opensearch:2
    environment:
      OPENSEARCH_JAVA_OPTS: "-Xms1g -Xmx1g"
      discovery.type: single-node
      plugins.security.disabled: "true"
      action.auto_create_index: "false"
    volumes: [os_data:/usr/share/opensearch/data]
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    restart: unless-stopped

  graylog:
    image: graylog/graylog:6.3
    ports:
      - "127.0.0.1:9000:9000"     # Web UI
      - "127.0.0.1:12201:12201"   # GELF TCP
      - "127.0.0.1:12201:12201/udp" # GELF UDP
      - "127.0.0.1:1514:1514"     # Syslog TCP
      - "127.0.0.1:1514:1514/udp" # Syslog UDP
    environment:
      GRAYLOG_PASSWORD_SECRET: changeme-run-openssl-rand-base64-48
      # SHA2 of your admin password: echo -n yourpassword | sha256sum | cut -d' ' -f1
      # The value below is the hash of 'admin' — CHANGE IT before deploying
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
  mongo_data:
  os_data:
```

```bash
cd ~/graylog && podman-compose up -d
```

> The default `GRAYLOG_ROOT_PASSWORD_SHA2` above is the SHA-256 hash of `admin`. Always replace it with your own: `echo -n yourpassword | sha256sum | cut -d' ' -f1`

Access at `http://localhost:9000`. Login with `admin` / your password. Create inputs under System → Inputs.

**Send logs from other containers via GELF:**
```yaml
# ~/myapp/compose.yaml
services:
  myapp:
    image: myapp:latest
    logging:
      driver: gelf
      options:
        gelf-address: "udp://localhost:12201"
        tag: "myapp"
    restart: unless-stopped
```

```bash
cd ~/myapp && podman-compose up -d
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

**Useful Graylog pipeline rule — enrich Caddy logs with GeoIP:**
```
rule "Tag internal IPs"
when
  has_field("remote_addr")
then
  let ip = to_string($message.remote_addr);
  if (cidr_match("192.168.0.0/16", ip) || cidr_match("10.0.0.0/8", ip),
    set_field("source_type", "internal"),
    set_field("source_type", "external")
  );
end
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

> **Graylog vs Loki:** Use Loki (via Grafana Alloy) for lightweight log tailing alongside Prometheus metrics. Use Graylog when you need full-text indexing, structured field search, complex pipeline transformations, and a dedicated log analysis UI — especially for security/compliance use cases alongside Wazuh.

---

## Changedetection.io (Website Change Monitor)

**Purpose:** Monitor any webpage for changes and get notified when content updates. Watches price drops, government notices, stock availability, documentation changes, job postings, or any content that changes over time. Supports CSS selectors for monitoring specific page elements, visual diffing, and notifications via ntfy, email, Telegram, Slack, Discord, and 80+ other services.

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

Access at `http://localhost:5000`. Add URLs to watch, optionally set a CSS/XPath selector to target specific page elements, configure the check interval, and connect a notification service.

**Send notifications via Ntfy:**

In the web UI, go to Settings → Notifications → Add notification URL:
```
ntfy://host.containers.internal:8090/your-topic
```

**Monitor a specific element (e.g., a price):**
```
URL: https://shop.example.com/product/123
CSS Filter: span.price
```

**Common use cases:**
- Price monitoring (add `CSS Filter` to target the price element)
- Software release pages (watch GitHub releases pages)
- Government tender or notification pages
- "Out of stock" product pages — get notified when availability changes

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

Access at `http://localhost:5080`. Log in with the credentials above. Ingest logs from Alloy or Promtail using the Loki-compatible endpoint (`/api/{org}/loki/api/v1/push`), send metrics via Prometheus remote-write (`/api/{org}/prometheus/api/v1/write`), and send traces via OTLP (`/api/{org}/traces`).

**Caddy:**
```caddyfile
openobserve.home.local { tls internal; reverse_proxy localhost:5080 }
```

---

## Netdata Cloud (Self-Hosted Hub)

**Purpose:** Netdata Cloud is the aggregation hub that collects streams from multiple Netdata agents and presents them in a unified multi-host dashboard. The open-source self-hosted version (formerly called Netdata Cloud OSS or `netdata/netdata-cloud`) lets you correlate metrics from all your servers in one place, without sending data to netdata.cloud. The individual agent setup is covered in the main Netdata section; this covers running the hub to aggregate across machines.

```yaml
# ~/netdata-parent/compose.yaml
# A Netdata "parent" node acts as a streaming hub for child agents.
# Children stream metrics to the parent; the parent's UI shows all hosts.
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

**Configure child agents to stream to the parent:**

On each child host, add a streaming destination to `/etc/netdata/stream.conf`:

```ini
# /etc/netdata/stream.conf on the CHILD agent
[stream]
  enabled = yes
  destination = parent.home.local:19999
  api key = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx   # generate with: uuidgen
```

And on the parent, allow incoming streams in `/etc/netdata/stream.conf`:

```ini
# /etc/netdata/stream.conf on the PARENT hub
[xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx]   # same UUID as child's api key
  enabled = yes
  default memory mode = dbengine
```

Restart both Netdata instances. The parent's dashboard at `http://localhost:19998` will show all streaming child nodes under the **Nodes** tab.

**Caddy:**
```caddyfile
netdata-hub.home.local { tls internal; reverse_proxy localhost:19998 }
```

---

## Parca (Continuous Profiling)

**Purpose:** Always-on CPU and memory profiling for your running services — captures flamegraphs in production without manual sampling. Parca stores profiles over time so you can compare CPU usage before and after a code change or pinpoint a memory leak by diffing two time windows. It complements Prometheus (metrics), Loki (logs), and Tempo (traces) by adding the fourth pillar of observability: profiling.

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

  # Parca Agent — runs on each host you want to profile (needs privileged access)
  parca-agent:
    image: ghcr.io/parca-dev/parca-agent:latest
    privileged: true
    pid: host
    network_mode: host
    volumes:
      - /sys/fs/cgroup:/sys/fs/cgroup:ro
      - /sys/fs/bpf:/sys/fs/bpf
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
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

Access at `http://localhost:7070`. Select a profile type (CPU, memory allocations, goroutines for Go apps), choose a time range, and Parca renders an interactive flamegraph. Use the **Compare** view to diff two time windows to isolate regressions.

**Instrument a Go application** to expose pprof profiles to Parca:
```go
import _ "net/http/pprof"  // registers /debug/pprof endpoints
// ensure your app serves HTTP on a known port
```

Add it as a scrape target in `parca.yaml`:
```yaml
scrape_configs:
  - job_name: my-go-app
    scrape_interval: 10s
    static_configs:
      - targets: ['host.containers.internal:6060']
    profiling_config:
      pprof_config:
        memory:
          enabled: true
        cpu:
          enabled: true
          delta: true
```

> The Parca Agent uses eBPF to profile any process on the host without code changes — useful for profiling binaries that don't expose pprof endpoints (C, Rust, Node.js, etc.). It requires a kernel ≥ 5.3 with BTF support.

**Caddy:**
```caddyfile
parca.home.local { tls internal; reverse_proxy localhost:7070 }
```

---

## Caddy Configuration

```caddyfile
grafana.home.local         { tls internal; reverse_proxy localhost:3001 }
prometheus.home.local      { tls internal; reverse_proxy localhost:9090 }
alerts.home.local          { tls internal; reverse_proxy localhost:9093 }
karma.home.local           { tls internal; reverse_proxy localhost:8094 }
netdata.home.local         { tls internal; reverse_proxy localhost:19999 }
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
netdata-hub.home.local     { tls internal; reverse_proxy localhost:19998 }
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
| Gatus not sending alerts | Verify the alert integration config syntax; check `podman logs gatus` for connection errors to the alerting endpoint |
| Healthchecks ping not received | Verify `SITE_ROOT` is the URL the script calls; check that the UUID matches the check in the UI |
| Speedtest results missing | Check the container has outbound internet access; verify `APP_KEY` is set |
| VictoriaMetrics not receiving data | Verify the remote-write URL is `http://host.containers.internal:8428/api/v1/write`; check `podman logs victoriametrics` for parse errors |
| Tempo traces not appearing | Ensure the OTel SDK in your app targets the correct endpoint (`4317` for gRPC, `4318` for HTTP); check `podman logs tempo` |
| OTel Collector dropping spans | Check `memory_limiter` isn't too aggressive; increase `limit_mib`; view pipeline stats at `http://localhost:8888/metrics` |
| Checkmk agent not connecting | Ensure `check-mk-agent.socket` is active on the monitored host; verify TCP port `6556` is reachable from the Checkmk container |
| Zabbix agent not connecting | Verify `Server=` in `zabbix_agent2.conf` matches the Zabbix server IP; check port `10051/tcp` is open |
| SigNoz no data after deployment | Ensure the OTel collector is running and your app is sending to the correct port; check ClickHouse is healthy |
| Karma shows no alerts | Verify `ALERTMANAGER_URI` is reachable from the container using `host.containers.internal`; check Alertmanager is running and has active alerts or silences |
| Graylog web UI unreachable | Ensure `GRAYLOG_HTTP_EXTERNAL_URI` matches the URL you're accessing; check OpenSearch and MongoDB are healthy before Graylog starts |
| Graylog `retention exceeded` on OpenSearch | Set an index rotation strategy: System → Indices → Default index set → edit rotation and retention period |
| Graylog GELF input not receiving logs | Verify the log driver is `gelf` and `gelf-address` uses `udp://` with the correct port; check firewall isn't blocking `12201/udp` |
| Graylog OpenSearch connection refused | The `plugins.security.disabled: "true"` env var is required for OpenSearch 2.x without TLS; verify it is set |
| Changedetection not detecting changes | Try adding a CSS selector to target the specific element rather than the full page; some sites require the Playwright-based browser fetcher for JavaScript-rendered content |
| Zabbix Proxy not registering | Confirm `ZBX_HOSTNAME` in the proxy compose matches exactly the name created in the server UI under Administration → Proxies |
| Zabbix Proxy child agents not reporting | In active proxy mode the proxy connects outbound to the server — verify port `10051/tcp` is reachable from the proxy host to the Zabbix server; also confirm the host is assigned to the correct proxy under Configuration → Hosts |
| alertmanager-ntfy bridge not delivering | Verify the bridge container is running and the `url` in `alertmanager.yml` uses `host.containers.internal`; check `podman logs alertmanager-ntfy` for JSON parse errors; ensure the ntfy topic exists |
| Netdata parent shows no child nodes | Confirm the `api key` UUID in both child and parent `stream.conf` match exactly; restart the child agent after editing; check `podman logs netdata-parent` for authentication errors |
| Parca Agent missing profiles | eBPF requires kernel ≥ 5.3 with BTF — verify with `ls /sys/kernel/btf/vmlinux`; the agent container must run `privileged: true` with `pid: host`; check `podman logs parca-agent` for capability errors |
| Parca no scrape targets appearing | Confirm the pprof endpoint on your app is reachable from the Parca container; check `parca.yaml` scrape_configs target addresses use `host.containers.internal` |
