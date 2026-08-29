---
title: Monitoring — Grafana, Loki & Tracing
section: Self-Hosting & Servers
updated: 2026-08-28
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

#### Common operations
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

##### Useful dashboard imports

(Dashboard → Import → paste ID):
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

#### Common operations
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

##### Ship container logs with Alloy

— add to your `config.alloy`:
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

##### Minimal `config.yaml`

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

##### Enable the ruler in Loki config

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

##### Example rule files (`/home/user/loki/rules/homelab/rules.yaml`)

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

##### Create the rules directory and restart Loki

```bash
mkdir -p /home/user/loki/rules/homelab
# Place rule files there
podman restart loki
```

#### Query via API to verify rules are loaded
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

Access at `http://localhost:7070`. Select a profile type (CPU, memory allocations), choose a time range, and Parca renders an interactive flamegraph. Use the **Compare** view to diff two time windows.

> The Parca Agent uses eBPF to profile any process on the host without code changes. Requires kernel ≥ 5.3 with BTF support — verify with `ls /sys/kernel/btf/vmlinux`.

**Caddy:**
```caddyfile
parca.home.local { tls internal; reverse_proxy localhost:7070 }
```

---

## Netdata → Grafana Datasource Integration

**Purpose:** Netdata (already documented above) exposes a Prometheus-compatible metrics endpoint — you can query it directly from Grafana as a datasource alongside your regular Prometheus instance. This gives you Netdata's per-second system metrics (CPU, RAM, disk I/O, network, containers) in the same Grafana dashboards as your application metrics, without running a separate Prometheus scrape job.

#### Step 1 — Enable Prometheus exporter in Netdata

Netdata exposes Prometheus metrics at `/api/v1/allmetrics?format=prometheus` by default on port 19999. No configuration required — it's always on.

```bash
# Test the endpoint
curl http://localhost:19999/api/v1/allmetrics?format=prometheus | head -30
```

#### Step 2 — Add Netdata as a Prometheus datasource in Grafana

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

#### Step 3 — Query Netdata metrics in Grafana panels
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

#### Step 4 — Import a Netdata Grafana dashboard

Go to Grafana → Dashboards → Import → Dashboard ID **7107** (Netdata System Overview). This gives you a full system health dashboard powered by Netdata's Prometheus endpoint.

> **When to use which:** Keep Prometheus as your primary datasource for application metrics, SLO calculations, and alert evaluation. Use the Netdata datasource for host-level dashboards where 1-second resolution matters (disk spike analysis, container burst profiling). Both can be combined in a single Grafana dashboard row by row.

---

## Grafana Loki LogQL Reference

LogQL is Loki's query language. Understanding its patterns is essential for building useful log dashboards.

```logql
# Filter by label
{job="containerlogs", container="myapp"}

# Filter by log content
{job="containerlogs"} |= "ERROR"

# Exclude pattern
{job="containerlogs"} != "health check"

# Regex match
{job="containerlogs"} |~ "status=5[0-9]{2}"

# Parse JSON logs and filter on a field
{job="containerlogs"} | json | level="error"

# Parse unstructured logs with logfmt
{job="containerlogs"} | logfmt | status >= 500

# Count error rate (metric query)
sum(rate({job="containerlogs"} |= "ERROR" [5m])) by (container)

# P99 latency from a structured log field
quantile_over_time(0.99, {job="containerlogs"} | json | unwrap latency_ms [5m]) by (endpoint)

# Top 5 containers by error count (last hour)
topk(5,
  sum(count_over_time({job="containerlogs"} |= "ERROR" [1h])) by (container)
)
```

---

