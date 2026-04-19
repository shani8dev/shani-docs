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

```bash
podman run -d \
  --name prometheus \
  -p 127.0.0.1:9090:9090 \
  -v /home/user/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro,Z \
  -v prometheus_data:/prometheus \
  --restart unless-stopped \
  prom/prometheus:latest
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
```bash
podman run -d \
  --name node-exporter \
  --network host \
  -v /proc:/host/proc:ro,rslave \
  -v /sys:/host/sys:ro,rslave \
  -v /:/rootfs:ro,rslave \
  --restart unless-stopped \
  prom/node-exporter \
  --path.procfs=/host/proc --path.sysfs=/host/sys
```

**cAdvisor — container metrics:**
```bash
podman run -d \
  --name cadvisor \
  -p 127.0.0.1:8080:8080 \
  -v /run/user/$(id -u)/podman/podman.sock:/var/run/docker.sock:ro \
  -v /:/rootfs:ro \
  -v /var/run:/var/run:ro \
  -v /sys:/sys:ro \
  --restart unless-stopped \
  gcr.io/cadvisor/cadvisor:latest
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

```bash
podman run -d \
  --name alertmanager \
  -p 127.0.0.1:9093:9093 \
  -v /home/user/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro,Z \
  --restart unless-stopped \
  prom/alertmanager:latest
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

---

## Grafana

**Purpose:** The standard visualisation layer for Prometheus, Loki, InfluxDB, and 50+ other data sources. Drag-and-drop dashboards, alerting, and team sharing.

```bash
podman run -d \
  --name grafana \
  -p 127.0.0.1:3001:3000 \
  -v grafana_data:/var/lib/grafana \
  -e GF_SECURITY_ADMIN_PASSWORD=changeme \
  -e GF_SERVER_ROOT_URL=https://grafana.home.local \
  -e GF_INSTALL_PLUGINS=grafana-clock-panel,grafana-piechart-panel,grafana-worldmap-panel \
  --restart unless-stopped \
  grafana/grafana:latest
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

```bash
podman run -d \
  --name alloy \
  -p 127.0.0.1:12345:12345 \
  -v /home/user/alloy/config.alloy:/etc/alloy/config.alloy:ro,Z \
  -v /var/log:/var/log:ro \
  --restart unless-stopped \
  grafana/alloy:latest run /etc/alloy/config.alloy
```

---

## Loki (Log Aggregation)

**Purpose:** Log aggregation system from Grafana Labs. Stores logs indexed by labels — cheap, fast, and queryable in Grafana alongside your metrics. Use Alloy (or the older Promtail) to ship container and system logs into Loki.

```bash
podman run -d \
  --name loki \
  -p 127.0.0.1:3100:3100 \
  -v /home/user/loki:/loki:Z \
  --restart unless-stopped \
  grafana/loki:latest
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

```bash
podman run -d \
  --name netdata \
  -p 127.0.0.1:19999:19999 \
  --cap-add SYS_PTRACE \
  --security-opt apparmor=unconfined \
  -v netdata_config:/etc/netdata \
  -v netdata_lib:/var/lib/netdata \
  -v netdata_cache:/var/cache/netdata \
  -v /etc/passwd:/host/etc/passwd:ro \
  -v /proc:/host/proc:ro \
  -v /sys:/host/sys:ro \
  -v /run/user/$(id -u)/podman/podman.sock:/var/run/docker.sock:ro \
  --restart unless-stopped \
  netdata/netdata:latest
```

Access at `http://localhost:19999`. Good first option when you want metrics immediately without writing any configuration.

---

## Uptime Kuma

**Purpose:** Self-hosted uptime monitoring with beautiful status pages. Monitors HTTP/HTTPS endpoints, TCP ports, DNS resolution, MQTT topics, and Docker container health. Sends alerts via ntfy, Telegram, Slack, email, and 50+ integrations.

```bash
podman run -d \
  --name uptime-kuma \
  -p 127.0.0.1:3002:3001 \
  -v /home/user/uptime-kuma:/app/data:Z \
  --restart unless-stopped \
  louislam/uptime-kuma:latest
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

**Agent on each monitored server:**
```bash
podman run -d \
  --name beszel-agent \
  --network host \
  -v /run/user/$(id -u)/podman/podman.sock:/var/run/docker.sock:ro \
  -e PORT=45876 \
  -e KEY="your-public-key-from-hub" \
  --restart unless-stopped \
  henrygd/beszel-agent:latest
```

---

## Dozzle (Container Log Viewer)

**Purpose:** Live container log viewer in the browser. Zero setup — mount the Podman socket and browse logs for any running container in real time. Supports log search, filtering, and multi-host aggregation.

```bash
podman run -d \
  --name dozzle \
  -p 127.0.0.1:8888:8080 \
  -v /run/user/$(id -u)/podman/podman.sock:/var/run/docker.sock:ro \
  --restart unless-stopped \
  amir20/dozzle:latest
```

---

## Healthchecks.io (Cron Monitoring)

**Purpose:** Dead man's switch for cron jobs and scheduled tasks. Your scripts ping a URL when they finish — Healthchecks alerts you if the ping doesn't arrive on schedule. Essential for monitoring backup jobs, data sync tasks, and other scheduled work.

```bash
podman run -d \
  --name healthchecks \
  -p 127.0.0.1:8000:8000 \
  -e SECRET_KEY=$(openssl rand -base64 32) \
  -e SITE_ROOT=https://hc.home.local \
  -v /home/user/healthchecks/data:/data:Z \
  --restart unless-stopped \
  healthchecks/healthchecks:latest
```

**Use in a backup script:**
```bash
podman exec restic restic backup /data && \
  curl -fsS --retry 3 https://hc.home.local/ping/your-uuid
```

---

## Speedtest Tracker

**Purpose:** Runs automated Ookla/LibreSpeed tests on a schedule and stores results with charts. Useful for documenting ISP performance over time and catching degradation before it becomes a problem.

```bash
podman run -d \
  --name speedtest \
  -p 127.0.0.1:8092:80 \
  -e APP_KEY=base64:$(openssl rand -base64 32) \
  -e DB_CONNECTION=sqlite \
  -v /home/user/speedtest/config:/config:Z \
  --restart unless-stopped \
  lscr.io/linuxserver/speedtest-tracker:latest
```

---

## SmokePing (Latency & Packet Loss)

**Purpose:** Network latency and packet loss monitor. Sends probes to configurable targets (your ISP gateway, 1.1.1.1, a VPS) and plots RTT over time — excellent for diagnosing intermittent network issues.

```bash
podman run -d \
  --name smokeping \
  -p 127.0.0.1:8081:80 \
  -v /home/user/smokeping/config:/config:Z \
  -v /home/user/smokeping/data:/data:Z \
  --restart unless-stopped \
  lscr.io/linuxserver/smokeping:latest
```

---

## Gatus (Endpoint Monitoring)

**Purpose:** Declarative, Git-friendly uptime and health monitoring. Define endpoints in YAML — HTTP, TCP, DNS, ICMP — with configurable conditions. Lighter than Uptime Kuma and easy to version-control. Ships a built-in status page.

```bash
podman run -d \
  --name gatus \
  -p 127.0.0.1:8088:8080 \
  -v /home/user/gatus/config:/config:ro,Z \
  --restart unless-stopped \
  twinproduction/gatus:latest
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

```bash
podman run -d \
  --name victoriametrics \
  -p 127.0.0.1:8428:8428 \
  -v /home/user/victoriametrics/data:/victoria-metrics-data:Z \
  --restart unless-stopped \
  victoriametrics/victoria-metrics:latest \
    --storageDataPath=/victoria-metrics-data \
    --retentionPeriod=12 \
    --selfScrapeInterval=10s
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

```bash
podman run -d \
  --name tempo \
  -p 127.0.0.1:3200:3200 \
  -p 127.0.0.1:4317:4317 \
  -p 127.0.0.1:4318:4318 \
  -v /home/user/tempo/config.yaml:/etc/tempo.yaml:ro,Z \
  -v /home/user/tempo/data:/var/tempo:Z \
  --restart unless-stopped \
  grafana/tempo:latest -config.file=/etc/tempo.yaml
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

> Use the official `install.sh` script for production — it sets up all dependencies and volume mounts correctly. The manual compose above is illustrative.

Access at `http://localhost:3301`. Instrument your apps with the OpenTelemetry SDK and point them at `http://localhost:4317` (gRPC) or `http://localhost:4318` (HTTP).

---

## OpenTelemetry Collector

**Purpose:** Vendor-neutral telemetry pipeline for traces, metrics, and logs. Acts as a central hub that receives telemetry from your applications (via OTLP, Jaeger, Zipkin, or Prometheus scrape), processes and enriches it, then fans it out to multiple backends — Grafana Tempo, Loki, Prometheus, SigNoz, Jaeger, and cloud vendors simultaneously. If you run more than one observability backend, the Collector removes per-backend SDK lock-in from your application code.

```bash
podman run -d \
  --name otel-collector \
  -p 127.0.0.1:4317:4317 \
  -p 127.0.0.1:4318:4318 \
  -p 127.0.0.1:8889:8889 \
  -v /home/user/otel/otel-collector.yaml:/etc/otelcol-contrib/config.yaml:ro,Z \
  --restart unless-stopped \
  otel/opentelemetry-collector-contrib:latest
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

```bash
podman run -d \
  --name checkmk \
  -p 127.0.0.1:8095:5000 \
  -v /home/user/checkmk/data:/omd/sites:Z \
  --tmpfs /omd/sites/cmk/tmp:uid=1000,gid=1000 \
  --restart unless-stopped \
  checkmk/check-mk-free:latest
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

```bash
podman run -d \
  --name karma \
  -p 127.0.0.1:8094:8080 \
  -e ALERTMANAGER_URI=http://host.containers.internal:9093 \
  -e ALERTMANAGER_NAME="home" \
  --restart unless-stopped \
  ghcr.io/prymitive/karma:latest
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
    image: graylog/graylog:6.1
    ports:
      - "127.0.0.1:9000:9000"     # Web UI
      - "127.0.0.1:12201:12201"   # GELF TCP
      - "127.0.0.1:12201:12201/udp" # GELF UDP
      - "127.0.0.1:1514:1514"     # Syslog TCP
      - "127.0.0.1:1514:1514/udp" # Syslog UDP
    environment:
      GRAYLOG_PASSWORD_SECRET: changeme-run-openssl-rand-base64-48
      # SHA2 of your admin password: echo -n yourpassword | sha256sum
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

> The default `GRAYLOG_ROOT_PASSWORD_SHA2` above is the SHA-256 hash of `admin`. Always replace it: `echo -n yourpassword | sha256sum | cut -d' ' -f1`

Access at `http://localhost:9000`. Login with `admin` / your password. Create inputs under System → Inputs.

**Send logs from other containers via GELF:**
```bash
# Add to any podman run command to forward logs to Graylog
podman run -d \
  --name myapp \
  --log-driver=gelf \
  --log-opt gelf-address=udp://localhost:12201 \
  --log-opt tag=myapp \
  myapp:latest
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

```bash
podman run -d \
  --name changedetection \
  -p 127.0.0.1:5000:5000 \
  -v /home/user/changedetection/data:/datastore:Z \
  -e PUID=$(id -u) \
  -e PGID=$(id -g) \
  --restart unless-stopped \
  ghcr.io/dgtlmoon/changedetection.io:latest
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
