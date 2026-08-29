---
title: Monitoring — Prometheus, Alerting & Long-Term Storage
section: Self-Hosting & Servers
updated: 2026-08-28
---

## Key Concepts

#### The three pillars (now four) of observability
- **Metrics** — numeric time-series data (CPU %, request rate, error count). Cheap to store, fast to query. Prometheus + Grafana.
- **Logs** — structured or unstructured event records. Expensive at scale. Loki (label-indexed streams) or Elasticsearch (fully indexed).
- **Traces** — records of a request as it flows through multiple services. Shows where latency is introduced. Tempo + OpenTelemetry.
- **Profiles** (emerging) — continuous CPU/memory profiling of running processes. Parca + eBPF. The "fourth pillar."

#### Pull vs push model for metrics
Prometheus uses a *pull* model — it scrapes `/metrics` endpoints on a schedule. This means you know what's being scraped and can see scrape errors in Prometheus itself. *Push* model (Pushgateway, InfluxDB's Telegraf) is used for short-lived jobs. Most interviewers will ask why Prometheus scrapes rather than having apps push to it: better target discovery, single place to detect unreachable targets, less firewall complexity.

#### Cardinality and why it matters
Cardinality is the number of unique label combinations for a metric. `http_requests_total{method="GET", path="/api/users/123"}` where `path` contains user IDs creates millions of unique series. High cardinality is the number-one cause of Prometheus memory exhaustion. Always bound labels to a small, known set of values (`path="/api/users/:id"` not the literal ID).

#### Rate vs irate vs increase
- `rate(metric[5m])` — per-second average rate over the last 5 minutes. Smooth, good for dashboards.
- `irate(metric[5m])` — instantaneous rate based on last two data points. Spiky, good for detecting brief bursts.
- `increase(metric[5m])` — total increase over the window (rate × duration). Good for "how many errors in the last 5 min".

#### Alert fatigue
The condition where too many noisy/low-priority alerts cause on-call engineers to start ignoring pages. Symptoms: alerts that resolve themselves, alerts that require no action, duplicate alerts for the same underlying cause. Fix: alert only on symptoms (high error rate) not causes (CPU high), use inhibition rules, tune `for:` duration so brief spikes don't fire, use Karma dashboard for triage.

#### Multiwindow, multi-burn-rate alerts
For SLO alerts, a single threshold alert (error rate > 1%) fires too often for minor blips and too slowly for catastrophic failures. The recommended pattern from the Google SRE book uses two windows: a fast window (e.g., 1h) catches rapid burns, a slow window (e.g., 6h) catches slow burns. Pyrra generates these automatically from SLO definitions.

#### OpenTelemetry SDK instrumentation
Auto-instrumentation (via agents) adds traces and metrics to your app with zero code changes for common frameworks (Django, Express, Spring). Manual instrumentation wraps specific code sections in spans. The SDK exports to an OTel Collector, which fans out to Tempo (traces), Prometheus (metrics), and Loki (logs) — one SDK call, multiple backends.

#### Log levels and when to use them
- `DEBUG` — verbose, only in dev; never leave on in production
- `INFO` — normal operation events ("started", "processed 100 items")
- `WARN` — recoverable unexpected condition that deserves attention
- `ERROR` — operation failed; action required
- `FATAL/CRITICAL` — service cannot continue; immediate page

#### Structured logging (JSON) vs unstructured
Structured logs (`{"level":"error","msg":"DB timeout","user_id":42,"latency_ms":5000}`) are parseable by Loki, Graylog, and other tools without Grok patterns. Unstructured logs (`ERROR: DB timeout for user 42 after 5000ms`) require regex extraction, which is brittle. Always use structured logging in production services.

#### Understanding Grafana variables and templating
Dashboard variables let one dashboard serve multiple services (`$service`), environments (`$environment`), or time ranges. They're backed by Prometheus label queries. A variable `$namespace` with query `label_values(kube_pod_info, namespace)` gives a dropdown of all Kubernetes namespaces. This is a core Grafana skill for platform teams building shared observability tooling.

#### Distributed tracing — spans, traces, and why they matter
A trace represents a single request as it flows through multiple services. It's composed of spans — each span represents one operation (HTTP call, DB query, cache lookup) with a start time, duration, and attributes. Spans are linked by a trace ID propagated in headers (`traceparent` in W3C format, `X-B3-TraceId` in Zipkin format). Without tracing, diagnosing latency in a microservices architecture means correlating logs across 10 services by timestamp — error-prone and slow. With tracing (Tempo + OTel), you click on a slow request in Grafana and see exactly which service and which operation contributed the latency. The key metric: P99 latency per span, not just the total.

#### Continuous profiling — flamegraphs and eBPF
A profiler samples what the CPU is executing thousands of times per second, building a statistical picture of where time is spent. A flamegraph visualises this as a call stack — the width of each frame is proportional to the time spent in that function. Parca uses eBPF to profile running processes with no code changes and near-zero overhead. Continuous profiling (running 24/7, not just during incidents) lets you correlate CPU spikes with deployments — "this function got 3x slower after the commit that added field validation." This is the "fourth pillar" of observability because it answers "why is the CPU high" when metrics only tell you that it is.

#### Thanos architecture — sidecar vs receive mode
Thanos extends Prometheus with long-term storage and global query. Two deployment modes: (1) **Sidecar** — a Thanos sidecar runs next to each Prometheus instance, uploads TSDB blocks to object storage (S3/MinIO) after they're sealed (every 2h). The Store Gateway serves these blocks for long-range queries. Simple but adds 2h latency before data is queryable globally. (2) **Receive** — Prometheus remote-writes metrics to Thanos Receive in real-time. Global queryability immediately, but adds write path complexity and a potential bottleneck. For most setups: sidecar mode is simpler and sufficient. For multi-cluster global dashboards with sub-2h data: receive mode.

#### Load testing methodology — k6 concepts
Load testing has three phases: (1) **Baseline** — what's the latency and error rate at 1 concurrent user? (2) **Load test** — ramp to expected production traffic, verify latency SLOs hold. (3) **Stress test** — push beyond expected load until the system breaks, to find the failure mode and capacity ceiling. k6 models load as virtual users (VUs) running test scripts. Key metrics: `http_req_duration` (latency), `http_req_failed` (error rate), `iterations` (throughput). The output feeds into Grafana dashboards (k6 has a Prometheus remote write output). Run load tests before every major release in CI with a pass/fail threshold on P95 latency.

#### Chaos engineering — intentional failure injection
Chaos engineering tests whether a system actually survives the failures it's designed to handle. Toxiproxy injects network conditions (latency, packet loss, bandwidth limits, connection drops) between your services — you test that your circuit breaker trips when the database latency spikes to 2s, rather than discovering this in production. The practice: (1) define a steady state (normal error rate, latency), (2) hypothesise that the system survives failure X, (3) inject failure X, (4) verify steady state is maintained (or fix if not). Chaos engineering is not about breaking things randomly — it's a disciplined experiment that builds confidence in fault tolerance.

#### Log aggregation architectures — push vs pull, and the pipeline
Three approaches: (1) **Agent-based push** — Alloy/Fluent Bit runs on each host, tails log files, and pushes to Loki/Elasticsearch. Low latency, agent adds resource overhead. (2) **Syslog forwarding** — services write to syslog, rsyslog/syslog-ng forwards centrally. Works for systemd services without any agent. (3) **Direct SDK** — applications write structured logs directly to Loki's push API. Pipeline tools (Vector.dev) add buffering, transformation (parse, filter, enrich), and fan-out (logs go to both Loki and an S3 archive). The key design decision: parse logs at the source (less data transmitted, structured from the start) vs at the destination (simpler agents, parsing can be changed without redeployment).
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

---

## Prometheus

**Purpose:** Scrapes `/metrics` endpoints on a schedule, evaluates alerting rules, and feeds dashboards in Grafana. The foundation of the standard self-hosted observability stack.

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

##### Minimal `prometheus.yml`

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

#### Node Exporter — system metrics
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

#### cAdvisor — container metrics
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

#### Common operations
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

##### Example alert rules (`alerts.yml`)

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

##### Recording rules

pre-compute expensive or frequently used queries and store the result as a new metric. This makes dashboards and alert rules load faster, and lets you build higher-level metrics from raw ones:

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

##### Example `alertmanager.yml` — route alerts to ntfy

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

#### Alertmanager → ntfy bridge (severity-aware routing)

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

---

## Alerting Best Practices

#### Alert on symptoms, not causes
Alert on what the user experiences (high latency, error rate, service down) not on infrastructure metrics that may or may not be impacting users (CPU at 80% might be fine). A CPU alert that fires daily and never requires action is alert noise; an error-rate alert that fires rarely but always requires action is signal.

#### Multi-window multi-burn-rate alerting (SLO-based)
Instead of a simple threshold alert, use two windows that catch both fast and slow error budget burns:

```yaml
# alerts.yml — SLO burn rate alert (99.9% availability SLO)
groups:
  - name: slo_alerts
    rules:
      # Fast burn: 14.4× rate over 1h → will exhaust budget in 5 days
      - alert: ErrorBudgetFastBurn
        expr: |
          (
            job:http_request_errors:ratio5m > (14.4 * 0.001)
            and
            job:http_request_errors:ratio1h > (14.4 * 0.001)
          )
        for: 2m
        labels:
          severity: critical
          slo: availability
        annotations:
          summary: "Fast error budget burn on {{ $labels.job }}"

      # Slow burn: 3× rate over 6h → will exhaust budget in 24 days
      - alert: ErrorBudgetSlowBurn
        expr: |
          (
            job:http_request_errors:ratio5m > (3 * 0.001)
            and
            job:http_request_errors:ratio6h > (3 * 0.001)
          )
        for: 15m
        labels:
          severity: warning
          slo: availability
        annotations:
          summary: "Slow error budget burn on {{ $labels.job }}"
```

#### Inhibition rules — reduce alert storms
When a `ServiceDown` fires, suppress all `SlowResponse` and `HighErrorRate` alerts for the same instance — the downstream symptoms are causally related to the root cause:

```yaml
# alertmanager.yml
inhibit_rules:
  - source_match:
      alertname: ServiceDown
    target_match_re:
      alertname: (SlowResponse|HighErrorRate|DiskNearlyFull)
    equal: [instance]
```

---


---

## Thanos (Prometheus Long-Term Storage, HA & Federation)

**Purpose:** Thanos extends Prometheus to solve its three main production limitations: **retention** (Prometheus stores data locally; Thanos uploads blocks to object storage — MinIO, S3, GCS — for unlimited retention), **high availability** (Thanos Querier deduplicates data from multiple Prometheus replicas, so you can run 2+ Prometheus instances with identical configs), and **federation** (Thanos Query Frontend federates across multiple Prometheus clusters — query all environments from a single Grafana datasource). The standard choice for production Prometheus at scale.

#### Architecture overview
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

#### Object store config (`/home/user/thanos/objstore.yaml`) — MinIO backend
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

#### Wire Prometheus to upload blocks (add to `prometheus.yml`)
```yaml
# Enable TSDB block storage (required for Thanos Sidecar)
# Thanos Sidecar reads from the same TSDB path Prometheus writes to.
# Ensure prometheus_data volume is shared between prometheus and thanos-sidecar containers.

# Remote-write to Thanos Receive (alternative architecture — push instead of sidecar):
# remote_write:
#   - url: http://thanos-receive:19291/api/v1/receive
```

##### Point Grafana at Thanos Query Frontend

In Grafana → Data Sources → Prometheus:
- **URL:** `http://localhost:9092` (Query Frontend — cached, split queries)
- Or `http://localhost:9091` (Querier — direct, no cache)

#### Multi-cluster federation
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

#### HA setup (2× Prometheus, deduplicated by Thanos)
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

#### Compaction and downsampling explained
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

#### Ruler — alerting rules that evaluate across long-term data
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

#### Troubleshooting Thanos

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

#### Common operations
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

##### Reconfigure Grafana to use VictoriaMetrics

instead of Prometheus:
- Data Sources → Prometheus → URL: `http://host.containers.internal:8428`

##### Remote-write from Prometheus to VictoriaMetrics

(dual-write for migration):
```yaml
# In prometheus.yml
remote_write:
  - url: http://host.containers.internal:8428/api/v1/write
```

For the horizontally scalable cluster variant (vminsert / vmselect / vmstorage), see the [Clusters wiki](https://docs.shani.dev/doc/servers/clusters).

---


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

#### Add to `prometheus.yml`
```yaml
scrape_configs:
  - job_name: pushgateway
    honor_labels: true
    static_configs:
      - targets: ['host.containers.internal:9091']
```

#### Push metrics from a script
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

#### In a backup systemd service
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

#### Add to `prometheus.yml`
```yaml
scrape_configs:
  - job_name: pyrra
    static_configs:
      - targets: ['host.containers.internal:9099']

rule_files:
  - /etc/prometheus/pyrra/*.yaml
```

##### Example SLO definition (`/home/user/pyrra/slos/api-availability.yaml`)

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

## Prometheus Exporters Reference

Common exporters you'll configure beyond node-exporter and cAdvisor:

| Exporter | Port | What it exposes |
|----------|------|-----------------|
| `postgres_exporter` | 9187 | PostgreSQL query times, connections, replication lag |
| `redis_exporter` | 9121 | Redis hits/misses, memory, commands/sec |
| `mysql_exporter` | 9104 | MySQL queries, connections, slow queries |
| `rabbitmq_exporter` | 9419 | Queue depth, message rates, consumer lag |
| `kafka_exporter` | 9308 | Topic offsets, consumer group lag |
| `blackbox_exporter` | 9115 | HTTP/TCP/ICMP probes from external perspective |
| `snmp_exporter` | 9116 | Network device metrics via SNMP |
| `nginx_exporter` | 9113 | Nginx request rates, active connections |
| `cadvisor` | 8080 | Container CPU/memory/network/disk |
| `process_exporter` | 9256 | Per-process CPU, memory, open files |

#### Blackbox Exporter (external probing)

```yaml
# ~/blackbox/compose.yaml
services:
  blackbox:
    image: prom/blackbox-exporter:latest
    ports:
      - 127.0.0.1:9115:9115
    volumes:
      - /home/user/blackbox/config.yml:/etc/blackbox_exporter/config.yml:ro,Z
    restart: unless-stopped
```

```yaml
# ~/blackbox/config.yml
modules:
  http_2xx:
    prober: http
    timeout: 5s
    http:
      valid_http_versions: [HTTP/1.1, HTTP/2.0]
      valid_status_codes: []  # default: 2xx
      follow_redirects: true
  tcp_connect:
    prober: tcp
    timeout: 5s
```

```yaml
# prometheus.yml — scrape blackbox for your services
- job_name: blackbox
  metrics_path: /probe
  params:
    module: [http_2xx]
  static_configs:
    - targets:
        - https://nextcloud.home.local
        - https://gitea.home.local
        - https://grafana.home.local
  relabel_configs:
    - source_labels: [__address__]
      target_label: __param_target
    - source_labels: [__param_target]
      target_label: instance
    - target_label: __address__
      replacement: host.containers.internal:9115
```

---

