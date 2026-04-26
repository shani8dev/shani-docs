---
title: Monitoring
section: Self-Hosting & Servers
updated: 2026-04-22
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.


# Monitoring

System metrics, log aggregation, alerting, uptime tracking, container visibility, and network performance monitoring. All run rootless with bind-mount volumes labelled `:Z`. Named volumes omit `:Z` — Podman manages their labels automatically.

For multi-node, replicated, and HA deployments (Elasticsearch cluster, OpenSearch cluster, VictoriaMetrics cluster) see the [Clusters wiki](https://docs.shani.dev/doc/servers/clusters).

---

## Observability Philosophy

Before diving into tools, it helps to have a framework for what you're trying to observe. Two complementary models are widely used in practice.

### The Four Golden Signals

Coined by Google's SRE team, these four metrics cover nearly everything that matters about a running service:

- **Latency** — how long does a request take? Track both successful and failed requests separately. A failed request that returns instantly is fast but still broken.
- **Traffic** — how many requests per second? This establishes your baseline and helps you notice unusual spikes or drops.
- **Errors** — what fraction of requests fail? Include both explicit errors (HTTP 5xx) and implicit failures (HTTP 200 with a corrupted response).
- **Saturation** — how full is the system? CPU usage, memory pressure, disk I/O queue depth. Saturation often predicts problems before latency or errors spike.

### SLI, SLO, SLA, and Error Budgets

These terms define how reliability is measured and negotiated:

- **SLI (Service Level Indicator)** — a specific metric that measures reliability. Example: "the fraction of HTTP requests that complete successfully in under 500ms."
- **SLO (Service Level Objective)** — a target value for an SLI over a time window. Example: "the SLI above must be ≥ 99.9% over any 30-day rolling window."
- **SLA (Service Level Agreement)** — a contractual commitment to an SLO, with consequences for violation. SLOs are internal; SLAs are external.
- **Error Budget** — the amount of unreliability an SLO allows. 99.9% SLO over 30 days = 0.1% budget = 43.2 minutes of downtime/slowness per month.

The error budget is the most useful concept for day-to-day decisions: if you've used half your budget two weeks into the month, you slow down deployments. If you have plenty of budget left, you can move faster. This replaces "can we deploy on Fridays?" with a data-driven answer.

```yaml
# Concrete SLI: 99th percentile latency below 500ms
# SLO: this must hold 99.9% of the time over 30 days

# Prometheus query for the SLI:
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket{job="myapi"}[5m])) by (le)
) < 0.5

# Error budget consumed (last 30 days):
1 - (
  sum(rate(http_requests_total{job="myapi", status!~"5.."}[30d]))
  /
  sum(rate(http_requests_total{job="myapi"}[30d]))
)
```

Pyrra (below) provides a dashboard-based SLO management UI that calculates error budgets and burn rates automatically from Prometheus metrics.

### The USE Method

Complementing the four golden signals for **infrastructure** monitoring: for every resource (CPU, memory, disk, network), measure:

- **Utilisation** — what percentage of the resource is being used?
- **Saturation** — how much additional demand is queued (run queue length, memory swap)?
- **Errors** — are there hardware errors, dropped packets, disk errors?

Apply USE to every physical resource: CPU cores, memory, storage, network interfaces. Combine with the four golden signals (which apply to services) for complete coverage.

---

## Prometheus Scrapes `/metrics` endpoints on a schedule, evaluates alerting rules, and feeds dashboards in Grafana. The foundation of the standard self-hosted observability stack.

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

**Recording rules** pre-compute expensive or frequently used queries and store the result as a new metric. This makes dashboards and alert rules load faster, and lets you build higher-level metrics from raw ones:

```yaml
# prometheus/recording_rules.yml
groups:
  - name: recording
    interval: 1m
    rules:
      # Pre-compute request rate per job — used by many dashboards
      - record: job:http_requests_total:rate5m
        expr: sum(rate(http_requests_total[5m])) by (job)

      # Pre-compute error ratio per job — used by SLO alerts
      - record: job:http_request_errors:ratio5m
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) by (job)
          /
          sum(rate(http_requests_total[5m])) by (job)

      # Node CPU utilisation — expensive query, compute once
      - record: instance:node_cpu_utilisation:rate5m
        expr: |
          1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) by (instance)
```

Add this file to your Prometheus config:
```yaml
rule_files:
  - /etc/prometheus/alerts.yml
  - /etc/prometheus/recording_rules.yml
```

Recording rule results are stored as time series with the `record:` name — query them just like any other metric: `job:http_requests_total:rate5m`. Naming convention: `level:metric:operations` (e.g., `job:http_requests_total:rate5m`).

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

### Grafana Provisioning (Dashboards and Datasources as Code)

Rather than configuring Grafana through the UI (which is lost if you recreate the container), provision datasources and dashboards from config files. Grafana reads these at startup and applies them automatically:

```yaml
# ~/grafana/compose.yaml — add provisioning volume mounts
volumes:
  - grafana_data:/var/lib/grafana
  - /home/user/grafana/provisioning:/etc/grafana/provisioning:ro,Z
  - /home/user/grafana/dashboards:/etc/grafana/dashboards:ro,Z
```

```yaml
# ~/grafana/provisioning/datasources/prometheus.yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    url: http://host.containers.internal:9090
    isDefault: true
    editable: false

  - name: Loki
    type: loki
    url: http://host.containers.internal:3100
    editable: false
```

```yaml
# ~/grafana/provisioning/dashboards/main.yaml
apiVersion: 1
providers:
  - name: default
    type: file
    disableDeletion: true      # prevent accidental deletion via UI
    updateIntervalSeconds: 30  # hot-reload when dashboard JSON files change
    options:
      path: /etc/grafana/dashboards
```

Place exported dashboard JSON files in `~/grafana/dashboards/`. Grafana picks them up automatically — no browser interaction required. Export a dashboard via:

```bash
# Export dashboard JSON by UID
curl -u admin:changeme http://localhost:3001/api/dashboards/uid/YOUR_UID \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['dashboard'], indent=2))" \
  > ~/grafana/dashboards/my-dashboard.json
```

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

## Thanos (Prometheus Long-Term Storage, HA & Federation)

**Purpose:** Thanos extends Prometheus to solve its three main production limitations: **retention** (Prometheus stores data locally; Thanos uploads blocks to object storage — MinIO, S3, GCS — for unlimited retention), **high availability** (Thanos Querier deduplicates data from multiple Prometheus replicas, so you can run 2+ Prometheus instances with identical configs), and **federation** (Thanos Query Frontend federates across multiple Prometheus clusters — query all environments from a single Grafana datasource). The standard choice for production Prometheus at scale.

**Architecture overview:**
```
Prometheus ──► Thanos Sidecar ──► Object Store (MinIO)
                    │
                    ▼
             Thanos Store Gateway ◄── Object Store (MinIO)
                    │
Thanos Ruler ──►    │
                    ▼
             Thanos Querier ◄── Grafana / PromQL clients
                    │
             Thanos Query Frontend (caching layer)
                    │
             Thanos Compactor (compaction + downsampling)
```

```yaml
# ~/thanos/compose.yaml
services:

  # Sidecar: sits next to Prometheus, uploads TSDB blocks to object store
  thanos-sidecar:
    image: quay.io/thanos/thanos:latest
    command:
      - sidecar
      - --tsdb.path=/prometheus
      - --prometheus.url=http://host.containers.internal:9090
      - --objstore.config-file=/etc/thanos/objstore.yaml
      - --http-address=0.0.0.0:10902
      - --grpc-address=0.0.0.0:10901
    ports:
      - "127.0.0.1:10901:10901"   # gRPC (Querier connects here)
      - "127.0.0.1:10902:10902"   # HTTP status page
    volumes:
      - prometheus_data:/prometheus:ro
      - /home/user/thanos/objstore.yaml:/etc/thanos/objstore.yaml:ro,Z
    restart: unless-stopped

  # Store Gateway: serves historical blocks from object storage to Querier
  thanos-store:
    image: quay.io/thanos/thanos:latest
    command:
      - store
      - --objstore.config-file=/etc/thanos/objstore.yaml
      - --http-address=0.0.0.0:10904
      - --grpc-address=0.0.0.0:10903
      - --data-dir=/var/thanos/store
    ports:
      - "127.0.0.1:10903:10903"   # gRPC
      - "127.0.0.1:10904:10904"   # HTTP
    volumes:
      - thanos_store_data:/var/thanos/store
      - /home/user/thanos/objstore.yaml:/etc/thanos/objstore.yaml:ro,Z
    restart: unless-stopped

  # Querier: deduplicates from Sidecar + Store Gateway, exposes PromQL endpoint
  thanos-querier:
    image: quay.io/thanos/thanos:latest
    command:
      - query
      - --http-address=0.0.0.0:9091
      - --grpc-address=0.0.0.0:10905
      - --store=thanos-sidecar:10901           # real-time data from Prometheus
      - --store=thanos-store:10903             # historical data from object store
      - --query.replica-label=prometheus_replica
    ports:
      - "127.0.0.1:9091:9091"    # Querier UI + PromQL endpoint (point Grafana here)
    depends_on: [thanos-sidecar, thanos-store]
    restart: unless-stopped

  # Query Frontend: caching + query splitting layer in front of Querier
  thanos-query-frontend:
    image: quay.io/thanos/thanos:latest
    command:
      - query-frontend
      - --http-address=0.0.0.0:9092
      - --query-frontend.downstream-url=http://thanos-querier:9091
      - --query-range.split-interval=24h
      - --query-range.max-retries-per-request=5
      - --query-range.response-cache-config-file=/etc/thanos/cache.yaml
    ports:
      - "127.0.0.1:9092:9092"    # Use this as Grafana datasource URL for best performance
    depends_on: [thanos-querier]
    restart: unless-stopped

  # Compactor: compacts and downsamples historical blocks (only one instance)
  thanos-compactor:
    image: quay.io/thanos/thanos:latest
    command:
      - compact
      - --wait
      - --objstore.config-file=/etc/thanos/objstore.yaml
      - --data-dir=/var/thanos/compact
      - --retention.resolution-raw=30d     # keep raw (15s) data for 30 days
      - --retention.resolution-5m=180d     # keep 5m downsamples for 180 days
      - --retention.resolution-1h=365d     # keep 1h downsamples for 1 year
      - --http-address=0.0.0.0:10906
    ports:
      - "127.0.0.1:10906:10906"
    volumes:
      - thanos_compact_data:/var/thanos/compact
      - /home/user/thanos/objstore.yaml:/etc/thanos/objstore.yaml:ro,Z
    restart: unless-stopped

  # Ruler: evaluates alerting and recording rules against Thanos query layer
  thanos-ruler:
    image: quay.io/thanos/thanos:latest
    command:
      - rule
      - --data-dir=/var/thanos/ruler
      - --eval-interval=30s
      - --rule-file=/etc/thanos/rules/*.yaml
      - --alertmanagers.url=http://host.containers.internal:9093
      - --query=thanos-querier:9091
      - --objstore.config-file=/etc/thanos/objstore.yaml
      - --http-address=0.0.0.0:10908
      - --grpc-address=0.0.0.0:10907
      - --label=ruler_cluster="homelab"
    ports:
      - "127.0.0.1:10907:10907"
      - "127.0.0.1:10908:10908"
    volumes:
      - thanos_ruler_data:/var/thanos/ruler
      - /home/user/thanos/rules:/etc/thanos/rules:ro,Z
      - /home/user/thanos/objstore.yaml:/etc/thanos/objstore.yaml:ro,Z
    restart: unless-stopped

volumes:
  prometheus_data:
    external: true    # shared with the Prometheus container
  thanos_store_data:
  thanos_compact_data:
  thanos_ruler_data:
```

**Object store config (`/home/user/thanos/objstore.yaml`) — MinIO backend:**
```yaml
type: S3
config:
  bucket: thanos-metrics
  endpoint: minio.home.local:9000
  access_key: minioadmin
  secret_key: changeme
  insecure: true             # use false + proper cert in production
  signature_version2: false
```

```bash
# Create the MinIO bucket first
mc alias set local http://localhost:9000 minioadmin changeme
mc mb local/thanos-metrics

cd ~/thanos && podman-compose up -d
```

**Wire Prometheus to upload blocks (add to `prometheus.yml`):**
```yaml
# Enable TSDB block storage (required for Thanos Sidecar)
# Thanos Sidecar reads from the same TSDB path Prometheus writes to.
# Ensure prometheus_data volume is shared between prometheus and thanos-sidecar containers.

# Remote-write to Thanos Receive (alternative architecture — push instead of sidecar):
# remote_write:
#   - url: http://thanos-receive:19291/api/v1/receive
```

**Point Grafana at Thanos Query Frontend:**

In Grafana → Data Sources → Prometheus:
- **URL:** `http://localhost:9092` (Query Frontend — cached, split queries)
- Or `http://localhost:9091` (Querier — direct, no cache)

**Multi-cluster federation:**
```yaml
# On the global Thanos Querier, add store endpoints from remote clusters:
thanos-querier:
  command:
    - query
    - --store=thanos-sidecar-cluster1:10901     # cluster 1 Sidecar
    - --store=thanos-sidecar-cluster2:10901     # cluster 2 Sidecar
    - --store=thanos-store:10903                # shared object store (historical)
    - --query.replica-label=prometheus_replica
    # Add as many --store flags as needed (one per Prometheus/Sidecar endpoint)
```

**HA setup (2× Prometheus, deduplicated by Thanos):**
```yaml
# Run two Prometheus instances with identical scrape configs but different replica labels:
# prometheus-1: --storage.tsdb.path=/prometheus --web.listen-address=:9090
# prometheus-2: --storage.tsdb.path=/prometheus --web.listen-address=:9090

# In each Prometheus's external_labels:
global:
  external_labels:
    cluster: homelab
    prometheus_replica: prometheus-1   # change to prometheus-2 on second instance

# Thanos Querier deduplicates using --query.replica-label=prometheus_replica
# Result: you see one consistent time series even when one Prometheus restarts
```

**Compaction and downsampling explained:**
```bash
# Compactor runs continuously (--wait flag) and:
# 1. Merges small 2h TSDB blocks into larger ones (reduces object store files)
# 2. Downsamples raw data (15s → 5m → 1h resolution) for fast long-range queries
# 3. Applies retention policies to delete old blocks

# Check compactor status
curl http://localhost:10906/metrics | grep thanos_compact

# View blocks in object store
podman run --rm -e AWS_ACCESS_KEY_ID=minioadmin -e AWS_SECRET_ACCESS_KEY=changeme \
  quay.io/thanos/thanos:latest \
  tools bucket ls \
  --objstore.config="type: S3
config:
  bucket: thanos-metrics
  endpoint: minio.home.local:9000
  insecure: true"
```

**Ruler — alerting rules that evaluate across long-term data:**
```yaml
# /home/user/thanos/rules/alerts.yaml
groups:
  - name: long-term-alerts
    interval: 5m
    rules:
      # Alert if any host has had >90% CPU for more than 1 hour total in the last day
      - alert: HighCPULastDay
        expr: |
          sum_over_time(
            (avg by(instance) (rate(node_cpu_seconds_total{mode!="idle"}[5m])) > 0.9)[24h:5m]
          ) * 5 > 60
        labels:
          severity: warning
        annotations:
          summary: "{{ $labels.instance }} had high CPU for >1h in last 24h"
```

**Caddy:**
```caddyfile
thanos.home.local         { tls internal; reverse_proxy localhost:9092 }
thanos-query.home.local   { tls internal; reverse_proxy localhost:9091 }
thanos-compact.home.local { tls internal; reverse_proxy localhost:10906 }
```

**Troubleshooting Thanos:**

| Issue | Solution |
|-------|----------|
| Sidecar `cannot read TSDB blocks` | Ensure `prometheus_data` volume is shared between Prometheus and Thanos Sidecar containers; mount as `:ro` on the Sidecar |
| Querier shows gaps in data | Store Gateway may be lagging — check `thanos_objstore_*` metrics; compactor takes time to upload blocks (default 2h) |
| Compactor `halted — conflict` | Only one Compactor can run at a time; check for a second running instance or a stale lock file in the MinIO bucket (`thanos/` prefix) |
| `duplicate label set` error in Querier | Two store endpoints return the same series with the same labels — set `--query.replica-label` to the label that differentiates your Prometheus replicas |
| Query Frontend `cache miss` for all queries | Cache config file may not be mounted correctly; start without `--query-range.response-cache-config-file` to confirm frontend works, then add caching |
| Ruler alerts not firing | Verify Ruler's `--query` flag points to the Querier address; check Ruler logs for rule evaluation errors |
| Blocks not appearing in Store Gateway | Blocks take up to 2h to upload (Sidecar uploads completed blocks only); force immediate upload by restarting the Sidecar |

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
# Option A: Install inside a Distrobox container (recommended on this system)
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

## Prometheus Pushgateway

**Purpose:** An intermediary for short-lived jobs that cannot be scraped by Prometheus — batch jobs, cron tasks, and scripts that run and exit before Prometheus's scrape interval. The job pushes metrics to the Pushgateway on completion; Prometheus then scrapes the Pushgateway at its normal interval. Essential for monitoring backup jobs, ETL pipelines, and any workload where the process is already gone by the time Prometheus would scrape it.

```yaml
# ~/pushgateway/compose.yaml
services:
  pushgateway:
    image: prom/pushgateway:latest
    ports:
      - 127.0.0.1:9091:9091
    restart: unless-stopped
```

```bash
cd ~/pushgateway && podman-compose up -d
```

**Add to `prometheus.yml`:**
```yaml
scrape_configs:
  - job_name: pushgateway
    honor_labels: true
    static_configs:
      - targets: ['host.containers.internal:9091']
```

**Push metrics from a script:**
```bash
# Push a single metric (backup job duration)
cat <<EOF | curl --data-binary @- http://localhost:9091/metrics/job/restic_backup/instance/homeserver
# HELP restic_backup_duration_seconds Duration of the last backup run
# TYPE restic_backup_duration_seconds gauge
restic_backup_duration_seconds 142.3
# HELP restic_backup_success Whether the last backup succeeded (1=yes, 0=no)
# TYPE restic_backup_success gauge
restic_backup_success 1
EOF

# Delete a metric group after the job
curl -X DELETE http://localhost:9091/metrics/job/restic_backup/instance/homeserver
```

**In a backup systemd service:**
```bash
# Wrap your backup command and push success/failure
START=$(date +%s)
podman exec restic restic backup /data && SUCCESS=1 || SUCCESS=0
DURATION=$(($(date +%s) - START))
cat <<EOF | curl --data-binary @- http://localhost:9091/metrics/job/restic_backup
restic_backup_success $SUCCESS
restic_backup_duration_seconds $DURATION
EOF
```

**Caddy:**
```caddyfile
pushgateway.home.local { tls internal; reverse_proxy localhost:9091 }
```

---

## Pyrra (SLO Management)

**Purpose:** SLO (Service Level Objective) management for Prometheus. Define SLOs in YAML, and Pyrra generates the recording rules, alerting rules, and Grafana dashboards automatically. Calculates error budgets, burn rates, and multi-window alerts — the proper way to move from raw metric alerts to SLO-based alerting without writing complex PromQL by hand.

```yaml
# ~/pyrra/compose.yaml
services:
  pyrra-api:
    image: ghcr.io/pyrra-dev/pyrra:latest
    ports:
      - 127.0.0.1:9099:9099
    volumes:
      - /home/user/pyrra/slos:/etc/pyrra:Z
    command: filesystem --config-files=/etc/pyrra
    restart: unless-stopped

  pyrra-kubernetes:
    image: ghcr.io/pyrra-dev/pyrra:latest
    command: kubernetes
    restart: unless-stopped
```

```bash
cd ~/pyrra && podman-compose up -d
```

**Add to `prometheus.yml`:**
```yaml
scrape_configs:
  - job_name: pyrra
    static_configs:
      - targets: ['host.containers.internal:9099']

rule_files:
  - /etc/prometheus/pyrra/*.yaml
```

**Example SLO definition (`/home/user/pyrra/slos/api-availability.yaml`):**
```yaml
apiVersion: pyrra.dev/v1alpha1
kind: ServiceLevelObjective
metadata:
  name: api-availability
  namespace: monitoring
spec:
  target: "99.9"
  window: 4w
  serviceLevel:
    objectives:
      - ratio:
          errors:
            metric: http_requests_total{job="myapi", code=~"5.."}
          total:
            metric: http_requests_total{job="myapi"}
```

Access Pyrra's UI at `http://localhost:9099` to view current SLO status, error budget remaining, and burn rate over time.

**Caddy:**
```caddyfile
pyrra.home.local { tls internal; reverse_proxy localhost:9099 }
```

---

## Grafana OnCall (On-Call Scheduling)

**Purpose:** Self-hosted on-call scheduling and escalation platform — a PagerDuty/OpsGenie alternative. Define on-call schedules (weekly rotations, override shifts), escalation chains (page the primary → wait 5 min → page the secondary → alert the manager), and route Alertmanager or Grafana alerts through it. Integrates natively with Grafana and has mobile apps for iOS and Android.

```yaml
# ~/grafana-oncall/compose.yaml
services:
  engine:
    image: grafana/oncall:latest
    ports:
      - 127.0.0.1:8080:8080
    environment:
      SECRET_KEY: changeme-run-openssl-rand-hex-32
      DATABASE_TYPE: sqlite3
      BROKER_TYPE: redis
      BASE_URL: https://oncall.home.local
      REDIS_URI: redis://redis:6379/0
      DJANGO_SETTINGS_MODULE: settings.hobby
    volumes:
      - /home/user/oncall/data:/var/lib/oncall:Z
    depends_on: [redis]
    restart: unless-stopped

  celery:
    image: grafana/oncall:latest
    command: ./celery_with_beat.sh
    environment:
      SECRET_KEY: changeme-run-openssl-rand-hex-32
      DATABASE_TYPE: sqlite3
      BROKER_TYPE: redis
      BASE_URL: https://oncall.home.local
      REDIS_URI: redis://redis:6379/0
      DJANGO_SETTINGS_MODULE: settings.hobby
    volumes:
      - /home/user/oncall/data:/var/lib/oncall:Z
    depends_on: [redis]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped
```

```bash
cd ~/grafana-oncall && podman-compose up -d
```

Access at `http://localhost:8080`. Connect to Grafana under Settings → Plugins → Grafana OnCall, then configure integrations under Integrations → Alertmanager to receive alerts.

**Caddy:**
```caddyfile
oncall.home.local { tls internal; reverse_proxy localhost:8080 }
```

---

## Loki Alert Rules (Log-Based Alerting)

**Purpose:** LogQL-based alerting fires Prometheus-compatible alerts based on log patterns — distinct from metric alerts. Use log alerts to fire when error rates in logs exceed a threshold, when a specific log pattern appears (like `FATAL` or `panic:`), or when a log stream goes silent (indicating a dead service). Loki alert rules are configured using the Loki Ruler and work alongside Alertmanager exactly like Prometheus rules.

**Enable the ruler in Loki config:**
```yaml
# Add to your Loki config (if using the single-binary image)
ruler:
  storage:
    type: local
    local:
      directory: /loki/rules
  rule_path: /loki/rules-temp
  alertmanager_url: http://host.containers.internal:9093
  ring:
    kvstore:
      store: inmemory
  enable_api: true
```

**Example rule files (`/home/user/loki/rules/homelab/rules.yaml`):**
```yaml
groups:
  - name: log-alerts
    rules:
      # Fire when error rate in app logs exceeds 10/min for 5 minutes
      - alert: HighErrorRate
        expr: |
          sum(rate({job="containerlogs", container="myapp"} |= "ERROR" [1m])) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate in myapp logs"
          description: "More than 10 errors/min for 5 minutes"

      # Fire when a specific fatal error appears
      - alert: PanicDetected
        expr: |
          count_over_time({job="containerlogs"} |= "panic:" [5m]) > 0
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "Panic detected in container logs"

      # Fire when a service produces no logs (dead service detection)
      - alert: ServiceSilent
        expr: |
          absent(rate({job="containerlogs", container="myapp"}[10m]))
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "myapp has produced no logs for 10 minutes"
```

**Create the rules directory and restart Loki:**
```bash
mkdir -p /home/user/loki/rules/homelab
# Place rule files there
podman restart loki
```

**Query via API to verify rules are loaded:**
```bash
curl http://localhost:3100/loki/api/v1/rules | python3 -m json.tool
```

> Log-based and metric-based alerts both route through the same Alertmanager — you get a unified alert feed from both systems, deduplicated and routed to ntfy/Slack/email by the same `alertmanager.yml`.

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

## k6 / Grafana k6 (Load Testing)

**Purpose:** Open-source load testing tool with a JavaScript scripting API. Write realistic traffic simulations in JS, run them locally or in CI, and push metrics directly into your existing Prometheus stack via remote-write — then visualise results in Grafana with the official k6 dashboard. Native companion to the Prometheus + Grafana stack already documented here.

```bash
# Install k6 via Nix
nix-env -iA nixpkgs.k6

# Or via Snap
snap install k6
```

**Basic load test script (`~/k6/smoke-test.js`):**
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 20 },   // ramp up to 20 VUs
    { duration: '3m', target: 20 },   // hold for 3 min
    { duration: '1m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],           // <1% errors
    http_req_duration: ['p(95)<500'],         // 95th percentile < 500ms
  },
};

export default function () {
  const res = http.get('https://myapp.home.local/api/health');
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
```

**Run locally:**
```bash
k6 run ~/k6/smoke-test.js

# Run with more VUs and a duration override
k6 run --vus 50 --duration 60s ~/k6/smoke-test.js
```

**Push results to Prometheus (remote-write to VictoriaMetrics or Prometheus):**
```bash
# Using the experimental Prometheus remote-write output
K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=true \
  k6 run --out=experimental-prometheus-rw ~/k6/smoke-test.js
```

**Run as a Podman container in CI (Woodpecker example):**
```yaml
# .woodpecker.yml
steps:
  load-test:
    image: grafana/k6:latest
    environment:
      K6_PROMETHEUS_RW_SERVER_URL: http://prometheus.home.local:9090/api/v1/write
    commands:
      - k6 run --out=experimental-prometheus-rw /k6/smoke-test.js
    volumes:
      - /home/user/k6:/k6:ro
```

**Import the k6 Grafana dashboard:**

In Grafana → Dashboards → Import → Dashboard ID **18030** (official k6 Prometheus dashboard). This gives you p50/p95/p99 latency, VU count, request rate, and error rate per test run, all correlated with your application metrics.

---

## Toxiproxy (Network Failure Simulation)

**Purpose:** A programmable TCP proxy that injects network failures — latency, packet loss, bandwidth throttling, connection resets, and timeouts — between your services. Use Toxiproxy to test how your monitored services behave when dependencies are degraded: does Alertmanager fire? Do your Prometheus alerts have the right thresholds? Does your application retry correctly? Essential for chaos engineering and validating monitoring alert fidelity.

```yaml
# ~/toxiproxy/compose.yaml
services:
  toxiproxy:
    image: ghcr.io/shopify/toxiproxy:latest
    ports:
      - "127.0.0.1:8474:8474"    # Toxiproxy REST API
      - "127.0.0.1:15432:15432"  # proxied postgres (example)
      - "127.0.0.1:16379:16379"  # proxied redis (example)
    restart: unless-stopped
```

```bash
cd ~/toxiproxy && podman-compose up -d

# Install the CLI
nix-env -iA nixpkgs.toxiproxy   # or: go install github.com/Shopify/toxiproxy/v2/cli/toxiproxy-cli@latest
```

**Create proxies for your services:**
```bash
# Proxy for Postgres (real Postgres at localhost:5432, proxied at localhost:15432)
toxiproxy-cli create postgres --listen 0.0.0.0:15432 --upstream localhost:5432

# Proxy for Redis
toxiproxy-cli create redis --listen 0.0.0.0:16379 --upstream localhost:6379

# List all proxies
toxiproxy-cli list
```

**Inject failures via REST API or CLI:**
```bash
# Add 200ms latency to all Postgres connections
toxiproxy-cli toxic add postgres --type latency --attribute latency=200 --attribute jitter=50

# Simulate 30% packet loss on Redis
toxiproxy-cli toxic add redis --type slicer --attribute average_size=1 --attribute delay_us=0

# Bandwidth throttle to 100 KB/s (simulates slow link)
toxiproxy-cli toxic add postgres --type bandwidth --attribute rate=100

# Timeout — close connections after 2s of inactivity
toxiproxy-cli toxic add postgres --type timeout --attribute timeout=2000

# Remove a toxic
toxiproxy-cli toxic remove postgres --toxicName latency_downstream

# Take a proxy completely offline (simulates full outage)
toxiproxy-cli toggle postgres
```

**Use in integration tests (Python example):**
```python
import requests

TOXIPROXY_API = "http://localhost:8474"

def add_latency(proxy_name, latency_ms):
    requests.post(f"{TOXIPROXY_API}/proxies/{proxy_name}/toxics", json={
        "type": "latency", "name": "db_slow",
        "attributes": {"latency": latency_ms, "jitter": 10}
    })

def remove_toxic(proxy_name, toxic_name):
    requests.delete(f"{TOXIPROXY_API}/proxies/{proxy_name}/toxics/{toxic_name}")

# In your test:
add_latency("postgres", 500)
# ... run test that should degrade gracefully ...
remove_toxic("postgres", "db_slow")
```

> Pair Toxiproxy with your Prometheus + Alertmanager stack: inject a fault, verify the correct alert fires within the expected `for:` duration, then check that it resolves when you remove the toxic. This validates your alert thresholds are calibrated to actual failure modes rather than theoretical ones.

---

## Netdata → Grafana Datasource Integration

**Purpose:** Netdata (already documented above) exposes a Prometheus-compatible metrics endpoint — you can query it directly from Grafana as a datasource alongside your regular Prometheus instance. This gives you Netdata's per-second system metrics (CPU, RAM, disk I/O, network, containers) in the same Grafana dashboards as your application metrics, without running a separate Prometheus scrape job.

**Step 1 — Enable Prometheus exporter in Netdata:**

Netdata exposes Prometheus metrics at `/api/v1/allmetrics?format=prometheus` by default on port 19999. No configuration required — it's always on.

```bash
# Test the endpoint
curl http://localhost:19999/api/v1/allmetrics?format=prometheus | head -30
```

**Step 2 — Add Netdata as a Prometheus datasource in Grafana:**

In Grafana → Connections → Data Sources → Add → Prometheus:
- **Name:** `Netdata`
- **URL:** `http://netdata.home.local:19999/api/v1/allmetrics?format=prometheus`
- **Scrape interval:** `1s` (Netdata collects at 1s resolution)
- **Query timeout:** `30s`

Or configure via provisioning YAML:
```yaml
# /home/user/grafana/provisioning/datasources/netdata.yaml
apiVersion: 1
datasources:
  - name: Netdata
    type: prometheus
    access: proxy
    url: http://host.containers.internal:19999/api/v1/allmetrics?format=prometheus
    isDefault: false
    jsonData:
      timeInterval: "1s"
```

**Step 3 — Query Netdata metrics in Grafana panels:**
```promql
# CPU usage per core
netdata_cpu_cpu_percentage_average{dimension="user"}

# System RAM usage
netdata_system_ram_MiB_average{dimension="used"}

# Disk I/O
rate(netdata_disk_io_kilobytes_persec_average[1m])

# Network traffic per interface
netdata_net_kilobits_persec_average{dimension="received"}

# Container CPU (Netdata monitors all Podman containers)
netdata_cgroups_cpu_percentage_average{chart=~"cgroup_.*"}
```

**Step 4 — Import a Netdata Grafana dashboard:**

Go to Grafana → Dashboards → Import → Dashboard ID **7107** (Netdata System Overview). This gives you a full system health dashboard powered by Netdata's Prometheus endpoint.

> **When to use which:** Keep Prometheus as your primary datasource for application metrics, SLO calculations, and alert evaluation. Use the Netdata datasource for host-level dashboards where 1-second resolution matters (disk spike analysis, container burst profiling). Both can be combined in a single Grafana dashboard row by row.


---

## Job-Ready Concepts

### Observability Interview Essentials

**The three pillars (now four) of observability:**
- **Metrics** — numeric time-series data (CPU %, request rate, error count). Cheap to store, fast to query. Prometheus + Grafana.
- **Logs** — structured or unstructured event records. Expensive at scale. Loki (label-indexed streams) or Elasticsearch (fully indexed).
- **Traces** — records of a request as it flows through multiple services. Shows where latency is introduced. Tempo + OpenTelemetry.
- **Profiles** (emerging) — continuous CPU/memory profiling of running processes. Parca + eBPF. The "fourth pillar."

**Pull vs push model for metrics:**
Prometheus uses a *pull* model — it scrapes `/metrics` endpoints on a schedule. This means you know what's being scraped and can see scrape errors in Prometheus itself. *Push* model (Pushgateway, InfluxDB's Telegraf) is used for short-lived jobs. Most interviewers will ask why Prometheus scrapes rather than having apps push to it: better target discovery, single place to detect unreachable targets, less firewall complexity.

**Cardinality and why it matters:** Cardinality is the number of unique label combinations for a metric. `http_requests_total{method="GET", path="/api/users/123"}` where `path` contains user IDs creates millions of unique series. High cardinality is the number-one cause of Prometheus memory exhaustion. Always bound labels to a small, known set of values (`path="/api/users/:id"` not the literal ID).

**Rate vs irate vs increase:**
- `rate(metric[5m])` — per-second average rate over the last 5 minutes. Smooth, good for dashboards.
- `irate(metric[5m])` — instantaneous rate based on last two data points. Spiky, good for detecting brief bursts.
- `increase(metric[5m])` — total increase over the window (rate × duration). Good for "how many errors in the last 5 min".

**Alert fatigue:** The condition where too many noisy/low-priority alerts cause on-call engineers to start ignoring pages. Symptoms: alerts that resolve themselves, alerts that require no action, duplicate alerts for the same underlying cause. Fix: alert only on symptoms (high error rate) not causes (CPU high), use inhibition rules, tune `for:` duration so brief spikes don't fire, use Karma dashboard for triage.

**Multiwindow, multi-burn-rate alerts:** For SLO alerts, a single threshold alert (error rate > 1%) fires too often for minor blips and too slowly for catastrophic failures. The recommended pattern from the Google SRE book uses two windows: a fast window (e.g., 1h) catches rapid burns, a slow window (e.g., 6h) catches slow burns. Pyrra generates these automatically from SLO definitions.

**OpenTelemetry SDK instrumentation:** Auto-instrumentation (via agents) adds traces and metrics to your app with zero code changes for common frameworks (Django, Express, Spring). Manual instrumentation wraps specific code sections in spans. The SDK exports to an OTel Collector, which fans out to Tempo (traces), Prometheus (metrics), and Loki (logs) — one SDK call, multiple backends.

**Log levels and when to use them:**
- `DEBUG` — verbose, only in dev; never leave on in production
- `INFO` — normal operation events ("started", "processed 100 items")
- `WARN` — recoverable unexpected condition that deserves attention
- `ERROR` — operation failed; action required
- `FATAL/CRITICAL` — service cannot continue; immediate page

**Structured logging (JSON) vs unstructured:** Structured logs (`{"level":"error","msg":"DB timeout","user_id":42,"latency_ms":5000}`) are parseable by Loki, Graylog, and other tools without Grok patterns. Unstructured logs (`ERROR: DB timeout for user 42 after 5000ms`) require regex extraction, which is brittle. Always use structured logging in production services.

**Understanding Grafana variables and templating:** Dashboard variables let one dashboard serve multiple services (`$service`), environments (`$environment`), or time ranges. They're backed by Prometheus label queries. A variable `$namespace` with query `label_values(kube_pod_info, namespace)` gives a dropdown of all Kubernetes namespaces. This is a core Grafana skill for platform teams building shared observability tooling.

---
---

## Caddy Configuration

```caddyfile
grafana.home.local         { tls internal; reverse_proxy localhost:3001 }
prometheus.home.local      { tls internal; reverse_proxy localhost:9090 }
alerts.home.local          { tls internal; reverse_proxy localhost:9093 }
karma.home.local           { tls internal; reverse_proxy localhost:8094 }
pushgateway.home.local     { tls internal; reverse_proxy localhost:9091 }
pyrra.home.local           { tls internal; reverse_proxy localhost:9099 }
oncall.home.local          { tls internal; reverse_proxy localhost:8080 }
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
toxiproxy.home.local       { tls internal; reverse_proxy localhost:8474 }
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
| k6 `experimental-prometheus-rw: connection refused` | Ensure Prometheus has `--web.enable-remote-write-receiver` flag or use VictoriaMetrics which accepts remote-write by default |
| k6 thresholds not appearing in Grafana | Import dashboard ID **18030** and set the datasource to the Prometheus instance receiving k6 remote-write; confirm `K6_PROMETHEUS_RW_SERVER_URL` is reachable from where k6 runs |
| Toxiproxy proxy not affecting traffic | Ensure your app connects to the Toxiproxy port (e.g., `15432`) rather than directly to Postgres (`5432`); use `toxiproxy-cli list` to verify the proxy is enabled |
| Toxiproxy toxic added but latency not observed | Some toxics are directional — add the toxic to both `upstream` and `downstream` if needed; verify with `toxiproxy-cli inspect <proxy>` |
| Netdata Grafana datasource returns no data | The Prometheus query format differs from native Prometheus — use `netdata_` prefixed metric names; verify with `curl http://netdata:19999/api/v1/allmetrics?format=prometheus | grep netdata_` |
| Netdata metrics disappear after host restart | Netdata stores metrics in `/var/cache/netdata` — mount this as a volume (`/home/user/netdata/cache:/var/cache/netdata:Z`) to persist across container restarts |
