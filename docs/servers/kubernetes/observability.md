---
title: Kubernetes — Observability (Metrics, Dashboards & SLOs)
section: Self-Hosting & Servers
updated: 2026-08-28
---

## Observability

### Prometheus + Grafana (kube-prometheus-stack)

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --set grafana.adminPassword=changeme \
  --set prometheus.prometheusSpec.retention=15d

kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3000:80
```

#### Grafana dashboard IDs

| Tool | Dashboard ID |
|------|-------------|
| Longhorn | 13032 |
| Ingress NGINX | 9614 |
| ArgoCD | 14584 |
| KEDA | 16406 |
| Cilium Overview | 18814 |
| Cilium / Hubble L4 Flows | 18815 |
| Cilium / Hubble DNS | 18816 |
| Loki Logs | 13639 |
| Tempo Traces | 16459 |
| OpenCost | 15714 |

> Import via Grafana UI: **Dashboards → New → Import → enter ID**.

---

### Prometheus AlertManager

**Purpose:** Routes Prometheus alerts to Slack, PagerDuty, email, or ntfy. AlertManager handles deduplication, grouping, silencing, and inhibition — so 50 alerts from one failing node appear as one grouped notification.

#### AlertManager config (bundled with kube-prometheus-stack)

```yaml
# ~/k8s/values/prometheus.yaml — add to your kube-prometheus-stack values
alertmanager:
  config:
    global:
      resolve_timeout: 5m

    route:
      group_by: [alertname, namespace, severity]
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 12h
      receiver: default
      routes:
        - match:
            severity: critical
          receiver: critical-alerts
          continue: true
        - match:
            severity: warning
          receiver: warning-alerts

    receivers:
      - name: default
        slack_configs:
          - api_url: https://hooks.slack.com/services/XXXX
            channel: "#k8s-alerts"
            title: '{{ template "slack.default.title" . }}'
            text: '{{ template "slack.default.text" . }}'

      - name: critical-alerts
        slack_configs:
          - api_url: https://hooks.slack.com/services/XXXX
            channel: "#incidents"
            send_resolved: true
        pagerduty_configs:
          - service_key: <pagerduty-service-key>

      - name: warning-alerts
        webhook_configs:
          - url: http://ntfy.home.local/k8s-warnings    # ntfy push notification

    inhibit_rules:
      - source_match:
          severity: critical
        target_match:
          severity: warning
        equal: [alertname, namespace]    # critical silences matching warning
```

#### Useful PrometheusRule examples

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: myapp-alerts
  namespace: myapp
  labels:
    release: kube-prometheus-stack    # must match kube-prometheus-stack label selector
spec:
  groups:
    - name: myapp.rules
      interval: 30s
      rules:
        # Alert if error rate > 1% for 5 minutes
        - alert: HighErrorRate
          expr: |
            sum(rate(http_requests_total{namespace="myapp", status=~"5.."}[5m]))
            / sum(rate(http_requests_total{namespace="myapp"}[5m])) > 0.01
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "High error rate in {{ $labels.namespace }}"
            description: "Error rate is {{ $value | humanizePercentage }}"

        # Alert if pod is not running for 10 minutes
        - alert: PodNotRunning
          expr: |
            kube_pod_status_phase{namespace="myapp", phase!~"Running|Succeeded"} > 0
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Pod {{ $labels.pod }} is not running"

        # Alert if PVC is more than 80% full
        - alert: PVCAlmostFull
          expr: |
            kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes > 0.8
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "PVC {{ $labels.persistentvolumeclaim }} is {{ $value | humanizePercentage }} full"

        # Alert if HPA is at maximum replicas
        - alert: HPAAtMaxReplicas
          expr: |
            kube_horizontalpodautoscaler_status_current_replicas
            == kube_horizontalpodautoscaler_spec_max_replicas
          for: 15m
          labels:
            severity: warning
          annotations:
            summary: "HPA {{ $labels.horizontalpodautoscaler }} is at max replicas"

        # Alert if deployment has no available replicas
        - alert: DeploymentUnavailable
          expr: |
            kube_deployment_status_replicas_available{namespace="myapp"} == 0
          for: 2m
          labels:
            severity: critical
          annotations:
            summary: "Deployment {{ $labels.deployment }} has no available replicas"
```

```bash
# Test alertmanager config locally
docker run --rm -v $(pwd)/alertmanager.yaml:/config.yaml \
  prom/alertmanager:latest --config.file=/config.yaml --check-config

kubectl -n monitoring port-forward svc/kube-prometheus-stack-alertmanager 9093:9093
# Check at http://localhost:9093
```

#### ServiceMonitor / PodMonitor — Scrape Custom Apps

```yaml
# Tell Prometheus to scrape your app's /metrics endpoint
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: myapp
  namespace: myapp
  labels:
    release: kube-prometheus-stack    # must match prometheus.serviceMonitorSelector
spec:
  selector:
    matchLabels:
      app: myapp
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
      scrapeTimeout: 10s
---
# PodMonitor — when pods don't have a Service
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: myapp-workers
  namespace: myapp
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app: myapp-worker
  podMetricsEndpoints:
    - port: metrics
      path: /metrics
      interval: 30s
```

---

### Loki + Promtail / Grafana Alloy (Log Aggregation)

**Purpose:** Loki indexes only labels (not full log content), keeping storage costs low. Promtail or the newer Alloy agent ships pod logs from every node to Loki. Query via LogQL in Grafana alongside Prometheus metrics.

```bash
helm repo add grafana https://grafana.github.io/helm-charts

# Loki (single-binary — homelab mode)
helm upgrade --install loki grafana/loki \
  --namespace monitoring --create-namespace \
  --set loki.auth_enabled=false \
  --set loki.commonConfig.replication_factor=1 \
  --set loki.storage.type=filesystem

# Promtail DaemonSet
helm upgrade --install promtail grafana/promtail \
  --namespace monitoring \
  --set config.lokiAddress=http://loki:3100/loki/api/v1/push
```

#### Grafana Alloy (replaces Promtail + Grafana Agent)

```bash
helm upgrade --install alloy grafana/alloy \
  --namespace monitoring -f ~/k8s/alloy-values.yaml
```

```yaml
# ~/k8s/alloy-values.yaml
alloy:
  configMap:
    content: |
      discovery.kubernetes "pods" { role = "pod" }

      discovery.relabel "pod_logs" {
        targets = discovery.kubernetes.pods.targets
        rule { source_labels = ["__meta_kubernetes_namespace"]; target_label = "namespace" }
        rule { source_labels = ["__meta_kubernetes_pod_label_app"]; target_label = "app" }
      }

      loki.source.kubernetes "pod_logs" {
        targets    = discovery.relabel.pod_logs.output
        forward_to = [loki.write.default.receiver]
      }

      loki.write "default" {
        endpoint { url = "http://loki.monitoring.svc:3100/loki/api/v1/push" }
      }
```

#### Add Loki as Grafana data source

```bash
helm upgrade kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --reuse-values \
  --set grafana.additionalDataSources[0].name=Loki \
  --set grafana.additionalDataSources[0].type=loki \
  --set grafana.additionalDataSources[0].url=http://loki.monitoring.svc:3100
```

#### LogQL quick reference

```logql
{namespace="myapp"}                              # all logs from namespace
{app="myapp"} |= "error"                         # filter by string
{app="myapp"} | json | level="error"             # JSON parsing
rate({namespace="myapp"} |= "error" [5m])        # error rate (for alerting)
sum by (app) (rate({namespace="myapp"}[5m]))     # log volume by app
```

```bash
kubectl -n monitoring port-forward svc/loki 3100:3100
curl -G "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={namespace="myapp"} |= "error"' \
  --data-urlencode 'start=1h' --data-urlencode 'limit=100'
```

**Caddy:** `loki.home.local { tls internal; reverse_proxy localhost:3100 }`

---

### OpenTelemetry + Grafana Tempo (Distributed Tracing)

**Purpose:** Follow a single request across microservices — finding which service was slow or where an error occurred. OTel is the vendor-neutral instrumentation standard; Tempo is the trace backend.

#### Install the OTel Operator

```bash
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm install opentelemetry-operator open-telemetry/opentelemetry-operator \
  --namespace opentelemetry-operator-system --create-namespace \
  --set admissionWebhooks.certManager.enabled=true
```

#### Deploy an OTel Collector

```yaml
# ~/k8s/otel-collector.yaml
apiVersion: opentelemetry.io/v1alpha1
kind: OpenTelemetryCollector
metadata:
  name: otel-collector
  namespace: monitoring
spec:
  mode: Deployment
  config: |
    receivers:
      otlp:
        protocols:
          grpc: { endpoint: 0.0.0.0:4317 }
          http: { endpoint: 0.0.0.0:4318 }
    processors:
      batch: { timeout: 1s, send_batch_size: 1024 }
      memory_limiter: { check_interval: 1s, limit_mib: 512 }
    exporters:
      otlp/tempo:
        endpoint: http://tempo.monitoring.svc:4317
        tls: { insecure: true }
    service:
      pipelines:
        traces:
          receivers: [otlp]
          processors: [memory_limiter, batch]
          exporters: [otlp/tempo]
```

```bash
kubectl apply -f ~/k8s/otel-collector.yaml
```

#### Install Grafana Tempo

```bash
helm upgrade --install tempo grafana/tempo \
  --namespace monitoring \
  --set tempo.storage.trace.backend=local \
  --set tempo.retention=24h
```

#### Auto-instrumentation (zero-code injection)

```yaml
# ~/k8s/otel-autoinstrumentation.yaml
apiVersion: opentelemetry.io/v1alpha1
kind: Instrumentation
metadata:
  name: auto-instrumentation
  namespace: myapp
spec:
  exporter:
    endpoint: http://otel-collector.monitoring.svc:4317
  sampler:
    type: parentbased_traceidratio
    argument: "0.1"   # sample 10% of traces
  python:
    image: ghcr.io/open-telemetry/opentelemetry-operator/autoinstrumentation-python:latest
  java:
    image: ghcr.io/open-telemetry/opentelemetry-operator/autoinstrumentation-java:latest
  nodejs:
    image: ghcr.io/open-telemetry/opentelemetry-operator/autoinstrumentation-nodejs:latest
```

```bash
kubectl apply -f ~/k8s/otel-autoinstrumentation.yaml

# Opt a Deployment in — no code changes required
kubectl annotate deployment myapp \
  instrumentation.opentelemetry.io/inject-python="auto-instrumentation" -n myapp
```

#### Add Tempo as Grafana data source

```bash
helm upgrade kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --reuse-values \
  --set grafana.additionalDataSources[0].name=Tempo \
  --set grafana.additionalDataSources[0].type=tempo \
  --set grafana.additionalDataSources[0].url=http://tempo.monitoring.svc:3100 \
  --set "grafana.additionalDataSources[0].jsonData.tracesToLogsV2.datasourceUid=loki" \
  --set "grafana.additionalDataSources[0].jsonData.serviceMap.datasourceUid=prometheus"
```

> **Full observability triangle:** With Loki + Tempo + Prometheus connected, Grafana can jump from a trace → that span's logs → service metrics at that timestamp.

---

> **Cost Monitoring** (OpenCost, Kubecost) is covered in [Cost Management & Resource Efficiency](#cost-management--resource-efficiency) — it integrates directly with the Prometheus stack already running here.

---

### Thanos (Long-Term Metrics Storage)

**Purpose:** Extends Prometheus with unlimited retention, global query view across multiple clusters, and object storage (MinIO/S3) as the backend. The sidecar model means your existing Prometheus doesn't need modification.

> **Thanos vs Grafana Mimir:** Thanos is sidecar-based (attaches to existing Prometheus); simpler to adopt. Mimir is a fully separate write path with better write scalability. For a homelab or single-cluster setup, Thanos is the right choice.

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm upgrade --install thanos bitnami/thanos \
  --namespace monitoring \
  -f ~/k8s/values/thanos.yaml
```

```yaml
# ~/k8s/values/thanos.yaml
query:
  enabled: true
  replicaCount: 1
  stores:
    - thanos-storegateway.monitoring.svc:10901

queryFrontend:
  enabled: true

storegateway:
  enabled: true
  persistence:
    enabled: true
    size: 10Gi

compactor:
  enabled: true
  retentionResolutionRaw: 30d    # keep raw samples for 30 days
  retentionResolution5m: 90d     # 5m downsampled for 90 days
  retentionResolution1h: 1y      # 1h downsampled for 1 year
  persistence:
    enabled: true
    size: 20Gi

objstoreConfig: |-
  type: s3
  config:
    bucket: thanos
    endpoint: minio.minio.svc:9000
    access_key: thanos-user
    secret_key: thanos-secret
    insecure: true    # MinIO without TLS inside cluster
```

```yaml
# Add Thanos sidecar to your kube-prometheus-stack Prometheus
# ~/k8s/values/prometheus.yaml — add to existing values
prometheus:
  prometheusSpec:
    thanos:
      image: quay.io/thanos/thanos:v0.37.2
      objectStorageConfig:
        secret:
          type: s3
          config:
            bucket: thanos
            endpoint: minio.minio.svc:9000
            access_key: thanos-user
            secret_key: thanos-secret
            insecure: true
    retention: 2h          # Prometheus only keeps 2h; Thanos keeps the rest
    retentionSize: 10GB
```

```bash
# Add Thanos Querier as a datasource in Grafana
# URL: http://thanos-query-frontend.monitoring.svc:9090
# Check Thanos is receiving blocks
kubectl -n monitoring logs -l app.kubernetes.io/name=thanos-compactor -f

# Query via Thanos (same PromQL as Prometheus)
kubectl -n monitoring port-forward svc/thanos-query-frontend 9090:9090
```

---

### DORA Metrics

| Metric | What it measures | Elite benchmark |
|--------|-----------------|-----------------|
| **Deployment Frequency** | How often code ships to production | Multiple per day |
| **Lead Time for Changes** | Commit to production | < 1 hour |
| **Change Failure Rate** | % of deployments causing incidents | 0–5% |
| **Time to Restore (MTTR)** | Recovery time from failure | < 1 hour |

#### Prometheus recording rules

```yaml
groups:
  - name: dora_metrics
    interval: 5m
    rules:
      - record: dora:deployment_frequency:rate24h
        expr: increase(ci_pipeline_runs_total{status="success", branch="main"}[24h])

      - record: dora:change_failure_rate
        expr: |
          sum(increase(ci_pipeline_runs_total{status="success", trigger="rollback"}[7d]))
          / sum(increase(ci_pipeline_runs_total{status="success"}[7d]))

      - record: dora:mttr_hours_p50
        expr: |
          histogram_quantile(0.50, sum(rate(incident_duration_seconds_bucket[30d])) by (le)) / 3600
```

#### Tracking DORA without a dedicated tool

```bash
# Deployment Frequency — releases in Forgejo in last 24h
curl -s "http://git.home.local/api/v1/repos/myorg/myapp/releases?limit=50" \
  -H "Authorization: token $GITEA_TOKEN" \
  | jq '[.[] | select(.created_at > (now - 86400 | todate))] | length'

# Change Failure Rate — hotfix/rollback merges in last 30 days
git log --merges --first-parent main --format="%s" --since="30 days ago" \
  | grep -c -i "hotfix\|rollback\|revert"

# MTTR from Grafana OnCall API
curl -s "https://oncall.home.local/api/v1/incidents/?limit=100" \
  -H "Authorization: $GRAFANA_ONCALL_TOKEN" \
  | jq '[.results[] | .duration_seconds] | add / length / 3600'
```

---

## Grafana Dashboards as Code

### Grafana Dashboard Provisioning (GitOps)

**Purpose:** Store Grafana dashboards as JSON in Git and have them auto-provisioned — no manual UI imports, no dashboard drift.

```yaml
# ~/k8s/values/prometheus.yaml (kube-prometheus-stack)
grafana:
  dashboardProviders:
    dashboardproviders.yaml:
      apiVersion: 1
      providers:
        - name: default
          orgId: 1
          folder: Homelab
          type: file
          options:
            path: /var/lib/grafana/dashboards/default

  # Auto-load dashboards from ConfigMaps with this label
  sidecar:
    dashboards:
      enabled: true
      label: grafana_dashboard
      labelValue: "1"
      searchNamespace: ALL    # scan all namespaces for dashboard ConfigMaps

  # Import community dashboards by ID
  dashboards:
    default:
      cilium-overview:
        gnetId: 18814
        revision: 1
        datasource: Prometheus
      loki-logs:
        gnetId: 13639
        revision: 1
        datasource: Loki
      opencost:
        gnetId: 15714
        revision: 1
        datasource: Prometheus
```

```yaml
# Store a custom dashboard as a ConfigMap — auto-imported by Grafana sidecar
apiVersion: v1
kind: ConfigMap
metadata:
  name: myapp-dashboard
  namespace: monitoring
  labels:
    grafana_dashboard: "1"     # must match sidecar.dashboards.label
data:
  myapp.json: |
    {
      "title": "MyApp Overview",
      "uid": "myapp-overview",
      "panels": [
        {
          "title": "Request Rate",
          "type": "timeseries",
          "targets": [{
            "expr": "sum(rate(http_requests_total{namespace=\"myapp\"}[5m])) by (status)"
          }]
        },
        {
          "title": "Error Rate",
          "type": "stat",
          "targets": [{
            "expr": "sum(rate(http_requests_total{namespace=\"myapp\",status=~\"5..\"}[5m])) / sum(rate(http_requests_total{namespace=\"myapp\"}[5m]))"
          }]
        },
        {
          "title": "p99 Latency",
          "type": "timeseries",
          "targets": [{
            "expr": "histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{namespace=\"myapp\"}[5m])) by (le))"
          }]
        }
      ]
    }
```

---

## SLO Management

Service Level Objectives define the reliability targets your service must meet. Alerting on SLO burn rate (not raw error rate) dramatically reduces alert noise — you only page when a failure is consuming your error budget fast enough to miss the SLO.

### OpenSLO (Declarative SLO Specification)

**Purpose:** CNCF standard for defining SLOs as code — vendor-neutral YAML spec that generates Prometheus rules, Datadog monitors, or whatever backend you use.

```yaml
# slo.yaml — OpenSLO spec
apiVersion: openslo/v1
kind: SLO
metadata:
  name: myapp-availability
  namespace: myapp
spec:
  service: myapp
  indicator:
    metadata:
      name: http-availability
    spec:
      ratioMetric:
        counter: true
        good:
          metricSource:
            type: Prometheus
            spec:
              query: |
                sum(rate(http_requests_total{namespace="myapp", status!~"5.."}[5m]))
        total:
          metricSource:
            type: Prometheus
            spec:
              query: |
                sum(rate(http_requests_total{namespace="myapp"}[5m]))
  objectives:
    - displayName: Availability 99.9%
      target: 0.999
      timeWindow:
        - duration: 30d
          isRolling: true
```

---

### Pyrra (SLO Dashboards & Alerting)

**Purpose:** Takes SLO definitions (as CRDs or Prometheus recording rules) and generates multi-burn-rate alerts and Grafana dashboards automatically. The fastest way to get SLO-based alerting running.

```bash
helm repo add pyrra https://pyrra-dev.github.io/pyrra/helm-charts
helm upgrade --install pyrra pyrra/pyrra \
  --namespace monitoring \
  --set apiServer.genericRules=true

kubectl -n monitoring port-forward svc/pyrra-kubernetes 9099:9099
```

```yaml
# ~/k8s/slo-myapp.yaml — Pyrra SLO CRD
apiVersion: pyrra.dev/v1alpha1
kind: ServiceLevelObjective
metadata:
  name: myapp-availability
  namespace: monitoring
  labels:
    pyrra.dev/team: backend
spec:
  target: "99.9"
  window: 4w
  indicator:
    ratio:
      errors:
        metric: http_requests_total{namespace="myapp",status=~"5.."}
      total:
        metric: http_requests_total{namespace="myapp"}
---
apiVersion: pyrra.dev/v1alpha1
kind: ServiceLevelObjective
metadata:
  name: myapp-latency
  namespace: monitoring
spec:
  target: "99"
  window: 4w
  indicator:
    latency:
      success:
        metric: http_request_duration_seconds_bucket{namespace="myapp",le="0.5"}
      total:
        metric: http_request_duration_seconds_count{namespace="myapp"}
```

```bash
kubectl apply -f ~/k8s/slo-myapp.yaml
# Pyrra auto-generates:
# - Prometheus PrometheusRule with multi-window burn rate alerts
# - Grafana dashboard with error budget burn-down chart
kubectl get prometheusrule -n monitoring | grep pyrra
```

#### Multi-burn-rate alerting (why it beats raw thresholds)

Pyrra generates alerts at multiple time windows automatically:

| Window | Burn Rate | Meaning |
|--------|-----------|---------|
| 5m / 1h | 14.4× budget | Page immediately — fast incident |
| 30m / 6h | 6× budget | Page — moderate incident draining budget |
| 2h / 24h | 3× budget | Ticket — slow burn, needs investigation |
| 6h / 3d | 1× budget | Track — budget consumption at exactly SLO rate |

---

## Beyla (eBPF Auto-Instrumentation — No Code Changes)

**Purpose:** Grafana Beyla uses eBPF to automatically instrument applications at the kernel level — capturing HTTP/gRPC latency, error rates, and traces without any SDK or code instrumentation. Works for any language: Go, Python, Node.js, Java, Rust. Exports to Prometheus and OpenTelemetry. The ultimate zero-code observability.

> **Beyla vs OTel auto-instrumentation:** The OTel Operator injects language-specific agents as init containers — requires Kubernetes API access and works per-language. Beyla is a DaemonSet that instruments everything on the node via eBPF — language-agnostic, no sidecars, lower overhead.

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm upgrade --install beyla grafana/beyla \
  --namespace beyla --create-namespace \
  -f ~/k8s/beyla-values.yaml
```

```yaml
# ~/k8s/beyla-values.yaml
config:
  data: |
    otel_metrics_export:
      endpoint: http://otel-collector.monitoring.svc:4317
    otel_traces_export:
      endpoint: http://otel-collector.monitoring.svc:4317
    prometheus_export:
      port: 9090
      path: /metrics
    attributes:
      kubernetes:
        enable: true      # attach pod/namespace/deployment labels to metrics

preset: network           # instrument all pods on the node (vs 'application' for specific)

tolerations:
  - operator: Exists      # run on all nodes including control plane

podAnnotations:
  instrumentation.opentelemetry.io/inject-sdk: "false"   # Beyla replaces OTel injection
```

```bash
# Verify Beyla is capturing spans
kubectl -n beyla logs -l app.kubernetes.io/name=beyla -f

# Metrics are available in Prometheus automatically
# Traces appear in Grafana Tempo
# No annotations needed on workloads
```

```bash
# Beyla Grafana dashboard IDs
# RED Metrics (HTTP):    19419
# RED Metrics (gRPC):    19420
# Network Map:           19421
```


### Grafana OnCall (On-Call Scheduling & Escalation)

**Purpose:** Integrates with Grafana alerts to provide on-call schedules, escalation chains, and incident management. Self-hosted option available; SaaS tier is free for small teams.

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm upgrade --install oncall grafana/oncall \
  --namespace oncall --create-namespace \
  --set base_url=https://oncall.home.local \
  --set grafana.enabled=false \     # connect to existing Grafana
  --set mariadb.enabled=true \
  --set rabbitmq.enabled=true
```

```bash
kubectl -n oncall port-forward svc/oncall-engine 8080:8080
```

**Caddy:** `oncall.home.local { tls internal; reverse_proxy localhost:8080 }`

Configure in Grafana UI: **Alerts & IRM → OnCall → Connect**.

---

