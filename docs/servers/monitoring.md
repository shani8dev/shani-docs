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

## Caddy Configuration

```caddyfile
grafana.home.local     { tls internal; reverse_proxy localhost:3001 }
prometheus.home.local  { tls internal; reverse_proxy localhost:9090 }
alerts.home.local      { tls internal; reverse_proxy localhost:9093 }
netdata.home.local     { tls internal; reverse_proxy localhost:19999 }
uptime.home.local      { tls internal; reverse_proxy localhost:3002 }
beszel.home.local      { tls internal; reverse_proxy localhost:8090 }
dozzle.home.local      { tls internal; reverse_proxy localhost:8888 }
hc.home.local          { tls internal; reverse_proxy localhost:8000 }
speedtest.home.local   { tls internal; reverse_proxy localhost:8092 }
smokeping.home.local   { tls internal; reverse_proxy localhost:8081 }
gatus.home.local       { tls internal; reverse_proxy localhost:8088 }
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
