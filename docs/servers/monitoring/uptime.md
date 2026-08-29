---
title: Monitoring — Uptime, Lightweight Dashboards & All-in-One Platforms
section: Self-Hosting & Servers
updated: 2026-08-28
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

##### Configure child agents to stream to the parent

(`/etc/netdata/stream.conf` on each child):
```ini
[stream]
  enabled = yes
  destination = parent.home.local:19999
  api key = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx   # generate with: uuidgen
```

##### Allow incoming streams on the parent

(`/etc/netdata/stream.conf`):
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

#### Common operations
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

#### Agent on each monitored server
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

#### Use in a backup script
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

##### Example `config.yaml`

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

##### Send notifications via ntfy

(Settings → Notifications → Add notification URL):
```
ntfy://host.containers.internal:8090/your-topic
```

**Caddy:**
```caddyfile
changes.home.local { tls internal; reverse_proxy localhost:5000 }
```

---

## DIUN (Docker Image Update Notifier)

Watches running container images and notifies when a newer version is available upstream, without auto-updating. Full setup and compose file: [Management wiki → Diun](https://docs.shani.dev/doc/servers/management#diun-image-update-notifier).

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

##### Install Zabbix agent on monitored hosts

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

##### Register the proxy in the Zabbix server UI
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

##### Example `otel-collector.yaml`

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

##### Install the agent on hosts to monitor

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

#### Multiple Alertmanager instances
```bash
-e ALERTMANAGER_0_URI=http://host.containers.internal:9093 \
-e ALERTMANAGER_0_NAME=homelab \
-e ALERTMANAGER_1_URI=http://192.168.1.50:9093 \
-e ALERTMANAGER_1_NAME=nas
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

---

## Caddy (additional routes)

```caddyfile
blackbox.home.local { tls internal; reverse_proxy localhost:9115 }
```

---

## Troubleshooting (additional)

| Issue | Solution |
|-------|----------|
| Prometheus `scrape timeout` errors | Increase `scrape_timeout` in `prometheus.yml` (default 10s); check the target is not overloaded |
| High cardinality causing Prometheus OOM | Run `topk(10, count by (__name__)({__name__=~".+"}))` to find high-cardinality metrics; drop labels at scrape time with `metric_relabel_configs` |
| Loki `out of order` errors | Ensure log timestamps are monotonically increasing; use `allow_structured_metadata: true` in Loki config if timestamps are close together |
| Grafana dashboard loads slowly | Enable query caching in Grafana data source settings; use recording rules in Prometheus to pre-compute expensive queries |
| Alertmanager duplicate alerts | Add `group_by` labels that are common across duplicates; use `equal` in inhibition rules to match root cause and symptom alerts |
| DIUN not detecting updated images | Verify the Podman socket is mounted and readable; check `DIUN_PROVIDERS_DOCKER` is `"true"`; inspect logs with `podman logs diun` |

