---
title: Kubernetes — Workload Patterns
section: Self-Hosting & Servers
updated: 2026-08-28
---

## Workload Patterns

### StatefulSets

Use for databases, Kafka, Elasticsearch, Redis Cluster — anything needing stable identity or per-pod PVCs.

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: data
spec:
  serviceName: postgres
  replicas: 3
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          env:
            - { name: PGDATA, value: /var/lib/postgresql/data/pgdata }
          volumeMounts:
            - { name: data, mountPath: /var/lib/postgresql/data }
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 20Gi
  # updateStrategy controls how rolling updates work for StatefulSets
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      partition: 0     # only update pods with index >= partition; set > 0 for phased rollout
  
  # podManagementPolicy: OrderedReady (default) | Parallel
  # OrderedReady: start/stop pods one at a time in order (0, 1, 2...)
  # Parallel: start/stop all pods simultaneously — faster but less safe for DBs
  podManagementPolicy: OrderedReady
---
# Headless Service for stable DNS (postgres-0.postgres.data.svc.cluster.local)
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: data
spec:
  clusterIP: None
  selector:
    app: postgres
  ports:
    - port: 5432
```

```bash
# StatefulSet-specific operations
kubectl rollout status statefulset/postgres -n data
kubectl rollout undo statefulset/postgres -n data

# Scale down safely (pods deleted highest-index first: 2 → 1 → 0)
kubectl scale statefulset postgres --replicas=1 -n data

# Note: PVCs are NOT deleted on scale-down — manual cleanup required
kubectl get pvc -n data -l app=postgres
kubectl delete pvc data-postgres-2 -n data    # only after verifying data is safe
```

---

### Jobs

**Purpose:** Run a pod to completion — batch processing, DB migrations, one-off tasks.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-seed
  namespace: myapp
spec:
  completions: 1
  parallelism: 1
  backoffLimit: 3
  ttlSecondsAfterFinished: 3600
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: seed
          image: myapp:latest
          command: ["python", "manage.py", "seed_db"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: myapp-secrets
                  key: database-url
```

```bash
kubectl apply -f ~/k8s/job-db-seed.yaml
kubectl logs job/db-seed -n myapp
kubectl wait --for=condition=complete job/db-seed -n myapp --timeout=300s
```

#### Indexed jobs (parallel processing with stable shard IDs)

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: process-shards
spec:
  completions: 10
  parallelism: 3
  completionMode: Indexed    # each pod gets JOB_COMPLETION_INDEX (0-9)
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: worker
          image: myapp:latest
          command: ["python", "process.py", "--shard=$(JOB_COMPLETION_INDEX)"]
```

---

### CronJobs

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: daily-report
  namespace: myapp
spec:
  schedule: "0 6 * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  startingDeadlineSeconds: 300
  jobTemplate:
    spec:
      ttlSecondsAfterFinished: 86400
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: report
              image: myapp:latest
              command: ["python", "generate_report.py"]
              resources:
                requests: { cpu: 200m, memory: 256Mi }
                limits: { cpu: 500m, memory: 512Mi }
```

```bash
kubectl create job --from=cronjob/daily-report manual-$(date +%s) -n myapp
kubectl patch cronjob daily-report -n myapp -p '{"spec":{"suspend":true}}'
kubectl get jobs -n myapp --sort-by='.metadata.creationTimestamp'
```

| Schedule | Meaning |
|----------|---------|
| `0 * * * *` | Every hour |
| `*/15 * * * *` | Every 15 minutes |
| `0 2 * * *` | Daily at 2 AM |
| `0 2 * * 0` | Weekly, Sunday 2 AM |
| `0 2 1 * *` | Monthly, 1st at 2 AM |
| `@hourly` | Shorthand for `0 * * * *` |

---

### Init Containers

Init containers run to completion **before** any app containers start. They share volumes with app containers but run sequentially in order. Common uses: database migration, waiting for dependencies, pre-populating config from Vault, downloading ML models.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  namespace: myapp
spec:
  template:
    spec:
      # Init containers run sequentially, each must exit 0 before the next starts
      initContainers:

        # 1. Wait for the database to be ready before the app starts
        - name: wait-for-db
          image: busybox:1.36
          command:
            - sh
            - -c
            - |
              until nc -z postgres.data.svc.cluster.local 5432; do
                echo "waiting for postgres..."; sleep 2
              done
              echo "postgres is ready"

        # 2. Run DB migration (uses same image as app for schema access)
        - name: db-migrate
          image: myapp:v1.4.2
          command: ["python", "manage.py", "migrate", "--noinput"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: myapp-secrets
                  key: database-url

        # 3. Download a large model file into a shared emptyDir
        - name: model-download
          image: curlimages/curl:latest
          command:
            - sh
            - -c
            - |
              curl -fsSL https://models.example.com/v1/model.bin \
                -o /shared/model.bin
          volumeMounts:
            - name: model-volume
              mountPath: /shared

      containers:
        - name: myapp
          image: myapp:v1.4.2
          volumeMounts:
            - name: model-volume
              mountPath: /app/models

      volumes:
        - name: model-volume
          emptyDir: {}
```

**Key properties of init containers:**
- `resources` are tracked separately — scheduler sums `max(init container resources, sum(app container resources))`
- `restartPolicy: Always` applies to the pod, not init containers — a failed init container is retried according to pod `restartPolicy`
- Init containers do NOT have `livenessProbe` or `readinessProbe`
- Kubernetes 1.29+ supports **native sidecar containers** via `initContainers[].restartPolicy: Always` — see below

---

### Native Sidecar Containers (Kubernetes 1.29+)

Before 1.29, sidecars were regular containers that ran alongside the main container. The problem: if the main container exited (Job complete), the sidecar would keep running and block pod completion. Native sidecars solve this.

```yaml
spec:
  initContainers:
    # Native sidecar — starts before app containers, runs for pod lifetime,
    # but does NOT block pod completion when the main container exits
    - name: log-shipper
      image: fluent/fluent-bit:3.0
      restartPolicy: Always     # this flag makes it a native sidecar (1.29+)
      volumeMounts:
        - name: log-volume
          mountPath: /var/log/app
      resources:
        requests: { cpu: 50m, memory: 64Mi }
        limits: { cpu: 100m, memory: 128Mi }

    - name: vault-agent
      image: hashicorp/vault-agent:latest
      restartPolicy: Always
      args: ["agent", "-config=/vault/config/agent.hcl"]
      volumeMounts:
        - name: vault-config
          mountPath: /vault/config

  containers:
    - name: myapp
      image: myapp:latest
      volumeMounts:
        - name: log-volume
          mountPath: /app/logs
```

> **Without native sidecars (< 1.29):** Use a regular container with a `preStop` lifecycle hook that polls for a shared file written by the main container upon exit.

---

### Istio Sidecar Injection vs Cilium

If you're using **Cilium** as your CNI (this stack), you do **not** need Istio's Envoy sidecar for L7 visibility, mTLS, or traffic shaping — Cilium provides all of this at the eBPF layer without sidecars. Adding Istio on top of Cilium is redundant and increases pod overhead (~50 MB per pod).

Use Istio sidecars when: you need advanced traffic management features Cilium doesn't offer (retries, circuit breakers, traffic mirroring per-service), or your team already has Istio expertise and invested tooling.

---

### Topology Spread Constraints

**Purpose:** Spread pods evenly across nodes/zones — preventing all replicas landing on one node.

```yaml
spec:
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: kubernetes.io/hostname
      whenUnsatisfiable: DoNotSchedule   # hard: pod stays Pending if can't spread
      labelSelector:
        matchLabels:
          app: myapp
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: ScheduleAnyway  # soft: best-effort
      labelSelector:
        matchLabels:
          app: myapp
```

---

### Priority Classes

**Purpose:** Ensure critical workloads get scheduled, even at the cost of evicting lower-priority pods.

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: critical-workload
value: 1000000
globalDefault: false
description: "Production critical. Preempts best-effort pods."
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: best-effort
value: -100
preemptionPolicy: Never
description: "Background batch. Evicted first under pressure."
```

```yaml
spec:
  template:
    spec:
      priorityClassName: critical-workload
```

> Built-in system classes: `system-cluster-critical` (2000000999) and `system-node-critical` (2000001000) — used by kube-dns, Cilium.

---

### Pod Disruption Budgets

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: myapp-pdb
  namespace: myapp
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: myapp
```

```bash
kubectl apply -f myapp-pdb.yaml
kubectl get pdb -n myapp
kubectl describe pdb myapp-pdb -n myapp
```

PDBs only protect against **voluntary** disruptions (drains, upgrades) — not node crashes.

---

### Pod Affinity & Anti-Affinity

**Purpose:** Co-locate pods with related services (affinity) or spread replicas so no two land on the same node/zone (anti-affinity).

```yaml
spec:
  affinity:
    # Hard anti-affinity — never two replicas on the same node
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchLabels:
              app: myapp
          topologyKey: kubernetes.io/hostname

    # Soft preference — prefer to run near the cache pod
    podAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 80
          podAffinityTerm:
            labelSelector:
              matchLabels:
                app: redis-cache
            topologyKey: kubernetes.io/hostname

    # Hard node affinity — only schedule on nodes with SSD
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: disktype
                operator: In
                values: [ssd]
```

```bash
# Label nodes for affinity rules
kubectl label node k3s-node1 disktype=ssd zone=a gpu=true
kubectl label node k3s-node2 disktype=hdd zone=b

# Show node labels
kubectl get nodes --show-labels
kubectl describe node k3s-node1 | grep Labels -A 20
```

---

### Lifecycle Hooks & Graceful Shutdown

**Purpose:** `postStart` runs immediately after container start (useful for warming caches). `preStop` runs before the container receives SIGTERM — use it for graceful draining. `terminationGracePeriodSeconds` controls how long Kubernetes waits before sending SIGKILL.

```yaml
spec:
  terminationGracePeriodSeconds: 60   # default 30 — increase for slow-shutdown apps
  containers:
    - name: myapp
      lifecycle:
        postStart:
          exec:
            command: ["/bin/sh", "-c", "sleep 2 && curl -s http://localhost:8080/warmup"]
        preStop:
          exec:
            # Drain in-flight requests before SIGTERM is sent
            command: ["/bin/sh", "-c", "sleep 5"]
      # For HTTP servers — wait for connections to drain
      # lifecycle:
      #   preStop:
      #     httpGet:
      #       path: /drain
      #       port: 8080
```

> **The SIGTERM race:** Kubernetes simultaneously removes the pod from Service endpoints AND sends SIGTERM. Without a `preStop` sleep, requests already routed to the pod arrive after SIGTERM — causing 502s. A 5-second `preStop` sleep is the most common fix.

```yaml
# Pod-level sysctl (for latency-tuned apps)
spec:
  securityContext:
    sysctls:
      - name: net.core.somaxconn
        value: "65535"
      - name: net.ipv4.tcp_tw_reuse
        value: "1"
  # Note: unsafe sysctls require kubelet --allowed-unsafe-sysctls flag
```

---

### Projected Volumes & Downward API

**Purpose:** Inject cluster metadata — pod name, namespace, node name, resource limits — into the container without hardcoding. Projected volumes combine multiple sources (ServiceAccount tokens, ConfigMaps, Secrets, DownwardAPI) into one mount.

```yaml
spec:
  containers:
    - name: myapp
      env:
        # Downward API as env vars
        - name: POD_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: POD_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        - name: POD_IP
          valueFrom:
            fieldRef:
              fieldPath: status.podIP
        - name: NODE_NAME
          valueFrom:
            fieldRef:
              fieldPath: spec.nodeName
        - name: MEMORY_LIMIT
          valueFrom:
            resourceFieldRef:
              containerName: myapp
              resource: limits.memory
      volumeMounts:
        - name: podinfo
          mountPath: /etc/podinfo
        - name: combined
          mountPath: /etc/projected
  volumes:
    # Downward API as files (useful for labelling metrics)
    - name: podinfo
      downwardAPI:
        items:
          - path: labels
            fieldRef:
              fieldPath: metadata.labels
          - path: annotations
            fieldRef:
              fieldPath: metadata.annotations

    # Projected volume — merge token + configmap + secret into one mount
    - name: combined
      projected:
        sources:
          - serviceAccountToken:
              path: token
              expirationSeconds: 3600
              audience: myapp
          - configMap:
              name: myapp-config
          - secret:
              name: myapp-secrets
```

---

### PVC Resize (Expanding Volumes)

**Purpose:** Expand a PVC without data loss — supported by Longhorn, Rook-Ceph, and most cloud CSI drivers.

```bash
# Confirm the StorageClass allows expansion
kubectl get sc longhorn -o jsonpath='{.allowVolumeExpansion}'   # → true

# Patch the PVC — Kubernetes will expand the underlying volume
kubectl patch pvc myapp-data -n myapp \
  --type='json' \
  -p='[{"op":"replace","path":"/spec/resources/requests/storage","value":"20Gi"}]'

# Watch until expansion completes (may require pod restart for filesystem resize)
kubectl get pvc myapp-data -n myapp -w

# For pods that need to see the new size: delete pod (StatefulSet restarts it)
# For Deployments: rolling restart
kubectl rollout restart deployment myapp -n myapp
```

```yaml
# Force online resize (supported by ext4/xfs with resizefs)
spec:
  resources:
    requests:
      storage: 20Gi    # just edit this value — kubectl apply -f or kubectl edit pvc
```

---

### DaemonSet Patterns

**Purpose:** DaemonSets run exactly one pod per node — used for node-level agents, log shippers, CNI, monitoring.

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: log-shipper
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: log-shipper
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1     # update one node at a time
  template:
    metadata:
      labels:
        app: log-shipper
    spec:
      # DaemonSets often need to tolerate all taints
      tolerations:
        - operator: Exists
      # Access host filesystem for log collection
      volumes:
        - name: varlog
          hostPath:
            path: /var/log
        - name: varlibdockercontainers
          hostPath:
            path: /var/lib/docker/containers
      containers:
        - name: fluent-bit
          image: fluent/fluent-bit:latest
          securityContext:
            runAsNonRoot: false   # log shippers often need root for host file access
          volumeMounts:
            - name: varlog
              mountPath: /var/log
              readOnly: true
```

```bash
# Only run on specific nodes
kubectl label node k3s-node1 role=logging
# Add nodeSelector to DaemonSet spec:
#   nodeSelector:
#     role: logging

kubectl get daemonset -A
kubectl rollout status daemonset/log-shipper -n monitoring
kubectl rollout history daemonset/log-shipper -n monitoring
kubectl rollout undo daemonset/log-shipper -n monitoring
```

---

### ImagePullSecrets & Private Registry Auth

**Purpose:** Pull images from private registries (Harbor, Gitea, GHCR, ECR). Create a `docker-registry` Secret and reference it in the Pod spec or ServiceAccount.

```bash
# Create a registry credential secret
kubectl create secret docker-registry regcred \
  --docker-server=harbor.home.local \
  --docker-username=robot$ci-push \
  --docker-password=<robot-token> \
  --namespace myapp

# Or from an existing Docker/Podman config
kubectl create secret generic regcred \
  --from-file=.dockerconfigjson=$HOME/.docker/config.json \
  --type=kubernetes.io/dockerconfigjson \
  --namespace myapp
```

```yaml
# Reference in a Pod/Deployment
spec:
  imagePullSecrets:
    - name: regcred
  containers:
    - name: myapp
      image: harbor.home.local/myorg/myapp:v1.4.2
```

```yaml
# Attach to a ServiceAccount — all pods using this SA inherit the pull secret
apiVersion: v1
kind: ServiceAccount
metadata:
  name: default
  namespace: myapp
imagePullSecrets:
  - name: regcred
```

```bash
# For ECR — token rotates every 12h, use a CronJob to refresh:
kubectl create cronjob ecr-refresh --schedule="0 */10 * * *" \
  --image=amazon/aws-cli \
  -- sh -c '
    TOKEN=$(aws ecr get-login-password --region eu-west-1)
    kubectl create secret docker-registry regcred \
      --docker-server=<account>.dkr.ecr.eu-west-1.amazonaws.com \
      --docker-username=AWS --docker-password=$TOKEN \
      --namespace myapp --dry-run=client -o yaml | kubectl apply -f -'
```

---

### Debugging with kubectl debug

```bash
# Attach netshoot to a running pod (curl, dig, tcpdump, ss, iperf3)
kubectl debug -it myapp-pod-xyz --image=nicolaka/netshoot --target=myapp -n myapp

# Debug a distroless container (exec is impossible — use ephemeral container)
kubectl debug -it myapp-pod-xyz --image=busybox --target=myapp -n myapp

# Shell into a node
kubectl debug node/k3s-node1 --image=busybox -it -- chroot /host
```

---

## Deployment Strategies Deep Dive

### Rolling Update Tuning

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 10
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2          # allow 2 extra pods above desired during rollout
      maxUnavailable: 0    # never go below desired count (zero-downtime)
      # maxSurge: 25%      # percentage form also valid
      # maxUnavailable: 25%

  # Minimum time a pod must be ready before it's considered available
  minReadySeconds: 10
  
  # Keep old ReplicaSets for rollback history
  revisionHistoryLimit: 5
```

```bash
# Pause a rollout mid-way (inspect canary behaviour)
kubectl rollout pause deployment/myapp -n myapp
kubectl rollout resume deployment/myapp -n myapp

# Check rollout status
kubectl rollout status deployment/myapp -n myapp --timeout=5m

# Full rollout history with annotations
kubectl rollout history deployment/myapp -n myapp
kubectl rollout history deployment/myapp -n myapp --revision=3

# Rollback to a specific revision
kubectl rollout undo deployment/myapp -n myapp --to-revision=3
```

### Recreate Strategy (Downtime Deployments)

```yaml
spec:
  strategy:
    type: Recreate     # kill ALL old pods, then start new ones — accepts downtime
                       # use for: DB schema migrations that break backward compat
```

---

## Autoscaling

### HPA — Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-hpa
  namespace: myapp
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: AverageValue
          averageValue: 512Mi
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 4
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 25
          periodSeconds: 60
```

```bash
kubectl autoscale deployment myapp --cpu-percent=70 --min=2 --max=10 -n myapp
kubectl describe hpa myapp-hpa -n myapp
kubectl get hpa -n myapp -w
kubectl top pods -n myapp
```

> **HPA requires resource requests.** Without `resources.requests.cpu`, HPA shows `<unknown>` — it calculates utilisation as `current / requested`. Use Goldilocks to find the right values.

---

### KEDA (Event-Driven Autoscaling)

**Purpose:** Scale to zero and back based on external event sources — queue depth (RabbitMQ, Kafka, NATS), cron schedules, Prometheus metrics, HTTP traffic, and 60+ scalers.

```bash
helm repo add kedacore https://kedacore.github.io/charts
helm install keda kedacore/keda --namespace keda --create-namespace
```

```yaml
# Scale on RabbitMQ queue depth (scale to zero when idle)
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: worker-scaler
  namespace: myapp
spec:
  scaleTargetRef:
    name: worker-deployment
  minReplicaCount: 0
  maxReplicaCount: 20
  triggers:
    - type: rabbitmq
      metadata:
        host: amqp://user:pass@rabbitmq.myapp.svc:5672/
        queueName: jobs
        queueLength: "5"
---
# Scale on Prometheus metric
triggers:
  - type: prometheus
    metadata:
      serverAddress: http://prometheus.monitoring.svc:9090
      metricName: http_requests_pending
      threshold: "100"
      query: sum(http_requests_pending{job="myapp"})
```

```bash
kubectl get scaledobjects -n myapp
kubectl describe scaledobject worker-scaler -n myapp
```

---

### Prometheus Adapter (Custom Metrics for HPA)

**Purpose:** Bridges Prometheus metrics to the Kubernetes `custom.metrics.k8s.io` API so HPA can scale on arbitrary application metrics (request rate, queue depth, error ratio) without KEDA.

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm upgrade --install prometheus-adapter prometheus-community/prometheus-adapter \
  --namespace monitoring \
  -f ~/k8s/values/prometheus-adapter.yaml
```

```yaml
# ~/k8s/values/prometheus-adapter.yaml
prometheus:
  url: http://kube-prometheus-stack-prometheus.monitoring.svc
  port: 9090
rules:
  custom:
    # Expose http_requests_per_second as a custom metric for HPA
    - seriesQuery: 'http_requests_total{namespace!="",pod!=""}'
      resources:
        overrides:
          namespace: { resource: namespace }
          pod: { resource: pod }
      name:
        matches: "^(.*)_total$"
        as: "${1}_per_second"
      metricsQuery: 'rate(<<.Series>>{<<.LabelMatchers>>}[2m])'
```

```yaml
# HPA using the custom metric
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-custom-hpa
  namespace: myapp
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: 100    # scale up when avg > 100 req/s per pod
```

```bash
# Verify the metric is registered
kubectl get --raw /apis/custom.metrics.k8s.io/v1beta1 | jq '.resources[].name'
kubectl get --raw "/apis/custom.metrics.k8s.io/v1beta1/namespaces/myapp/pods/*/http_requests_per_second" | jq .
```

> **KEDA vs Prometheus Adapter:** KEDA is simpler to configure and supports scale-to-zero. Prometheus Adapter is lighter weight (no extra CRDs) and doesn't require a separate operator. Use KEDA for event-driven scale-to-zero; use Prometheus Adapter when you just need custom metrics for standard HPA.

---

### Cluster Autoscaler

**Purpose:** The standard Kubernetes node autoscaler — watches for unschedulable pods and triggers scale-up of a cloud node group (AWS ASG, GCE MIG, Azure VMSS). Scales down idle nodes after a configurable cool-down period. Use **Karpenter** on AWS/Azure for faster, more cost-efficient provisioning; use Cluster Autoscaler for GKE, generic cloud, or on-prem with custom node groups.

```bash
helm repo add autoscaler https://kubernetes.github.io/autoscaler
helm upgrade --install cluster-autoscaler autoscaler/cluster-autoscaler   --namespace kube-system   --set autoDiscovery.clusterName=homelab   --set awsRegion=eu-central-1   --set rbac.serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=arn:aws:iam::ACCOUNT:role/ClusterAutoscaler
```

```bash
kubectl -n kube-system logs -l app.kubernetes.io/name=cluster-autoscaler -f

# Annotate a node group to allow scale-down of specific nodes
kubectl annotate node k3s-worker-1 cluster-autoscaler.kubernetes.io/scale-down-disabled=true

# Check CA decisions
kubectl -n kube-system get configmap cluster-autoscaler-status -o yaml
```

> **CA vs Karpenter:** Cluster Autoscaler works with pre-defined node groups (fixed instance types). Karpenter provisions any instance type that fits pending pod requirements — often cheaper. For homelab/bare-metal, neither applies; use manual node management or CAPI.

---

### Karpenter (Cloud Node Autoscaler)

**Purpose:** Node autoscaler that provisions exactly the right cloud VM instance type for pending pods.

```bash
helm repo add karpenter https://charts.karpenter.sh
helm upgrade --install karpenter karpenter/karpenter \
  --namespace karpenter --create-namespace \
  --set settings.clusterName=homelab \
  --set settings.interruptionQueue=homelab-karpenter
```

```yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: [amd64]
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: [c, m, r]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: default
  limits:
    cpu: 100
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 1m
```

---

### VPA — Vertical Pod Autoscaler

**Purpose:** Automatically right-sizes pod resource requests/limits based on observed usage. Operates in three modes: `Off` (generate recommendations only), `Initial` (set requests at pod creation), `Auto` (update requests and restart pods when needed).

```bash
# Install VPA (required by Goldilocks and usable standalone)
kubectl apply -f https://github.com/kubernetes/autoscaler/releases/latest/download/vertical-pod-autoscaler.yaml

kubectl get pods -n kube-system -l app=vpa-admission-controller
kubectl get pods -n kube-system -l app=vpa-recommender
kubectl get pods -n kube-system -l app=vpa-updater
```

```yaml
# VPA in recommendation mode — reads suggestions, no automatic restarts
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: myapp-vpa
  namespace: myapp
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  updatePolicy:
    updateMode: "Off"   # Off | Initial | Recreate | Auto
  resourcePolicy:
    containerPolicies:
      - containerName: myapp
        minAllowed:
          cpu: 50m
          memory: 64Mi
        maxAllowed:
          cpu: "2"
          memory: 2Gi
        controlledResources: [cpu, memory]
        controlledValues: RequestsAndLimits
```

```bash
# Read VPA recommendations
kubectl get vpa myapp-vpa -n myapp -o jsonpath='{.status.recommendation}' | jq .
kubectl describe vpa myapp-vpa -n myapp

# Example output — use these values in your Deployment
# containerRecommendations:
#   - containerName: myapp
#     lowerBound: { cpu: 25m, memory: 52Mi }
#     target: { cpu: 100m, memory: 256Mi }     ← set this in requests
#     upperBound: { cpu: 500m, memory: 1Gi }
#     uncappedTarget: { cpu: 100m, memory: 256Mi }
```

> Let VPA collect 24–48 hours of traffic before trusting recommendations. Run in `Off` mode in production (recommendation only) — `Auto` mode restarts pods, which can cause brief downtime.

---

### Goldilocks (Resource Right-Sizing)

**Purpose:** Uses VPA in recommendation mode to suggest the right CPU/memory requests per container based on actual usage.

```bash
kubectl apply -f https://github.com/kubernetes/autoscaler/releases/latest/download/vertical-pod-autoscaler.yaml

helm repo add fairwinds-stable https://charts.fairwinds.com/stable
helm upgrade --install goldilocks fairwinds-stable/goldilocks \
  --namespace goldilocks --create-namespace

kubectl label namespace myapp goldilocks.fairwinds.com/enabled=true
kubectl -n goldilocks port-forward svc/goldilocks-dashboard 8080:80
```

> VPA is in recommendation mode only — it does not change pods automatically. Safe to run in production. Let it collect a few hours of real traffic before trusting its suggestions.
>
> **VPA + HPA:** Never run both scaling on the same metric (CPU/memory). Safe combination: HPA on custom/external metrics (KEDA) + VPA for right-sizing requests.

---

## GPU & AI/ML Workloads

Running GPU-accelerated workloads on Kubernetes requires exposing GPU resources to pods via a device plugin. The NVIDIA GPU Operator automates driver installation, the device plugin, and monitoring. Node Feature Discovery (NFD) labels nodes with hardware capabilities so the scheduler can target GPU nodes correctly.

### Node Feature Discovery (NFD)

**Purpose:** Automatically labels nodes with detected hardware features (CPU flags, PCIe devices, kernel features). Required by the GPU Operator and useful for any workload targeting specific hardware.

```bash
helm repo add nfd https://kubernetes-sigs.github.io/node-feature-discovery/charts
helm upgrade --install nfd nfd/node-feature-discovery \
  --namespace nfd --create-namespace \
  --set worker.config.sources.pci.deviceClassWhitelist=["0200","03","12"]
```

```bash
# See what labels NFD applied to a GPU node
kubectl describe node <gpu-node> | grep -i nvidia
kubectl get node <gpu-node> -o json | jq '.metadata.labels | to_entries[] | select(.key | test("feature.node.kubernetes.io"))'
```

---

### NVIDIA GPU Operator

**Purpose:** Single Helm chart that installs NVIDIA drivers, `nvidia-container-toolkit`, the device plugin, DCGM exporter (GPU metrics), and MIG manager on GPU nodes. Works with k3s, RKE2, and kubeadm.

```bash
helm repo add nvidia https://helm.ngc.nvidia.com/nvidia
helm repo update

helm upgrade --install gpu-operator nvidia/gpu-operator \
  --namespace gpu-operator --create-namespace \
  --set driver.enabled=true \
  --set toolkit.enabled=true \
  --set devicePlugin.enabled=true \
  --set dcgmExporter.enabled=true \
  --set migManager.enabled=false     # enable only for A100/H100 with MIG
```

```bash
# Verify GPUs are visible
kubectl get nodes -l nvidia.com/gpu.present=true
kubectl describe node <gpu-node> | grep "nvidia.com/gpu"
# Should show: nvidia.com/gpu: 1 (or N for multi-GPU nodes)

# Run a quick GPU smoke-test
kubectl run gpu-test --rm -it --restart=Never \
  --image=nvcr.io/nvidia/cuda:12.4.0-base-ubuntu22.04 \
  --limits=nvidia.com/gpu=1 \
  -- nvidia-smi
```

---

### Requesting GPU Resources in Pods

GPU resources are exposed as `nvidia.com/gpu` extended resources. Unlike CPU/memory, GPU limits == requests (the scheduler allocates the whole GPU or not at all).

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: model-inference
  namespace: ai
spec:
  replicas: 1
  selector:
    matchLabels:
      app: model-inference
  template:
    metadata:
      labels:
        app: model-inference
    spec:
      # Schedule only on GPU nodes
      nodeSelector:
        nvidia.com/gpu.present: "true"
      tolerations:
        - key: nvidia.com/gpu
          operator: Exists
          effect: NoSchedule
      containers:
        - name: inference
          image: harbor.home.local/myorg/model-server:latest
          resources:
            limits:
              nvidia.com/gpu: 1      # always set limits = requests for GPUs
              memory: 16Gi
              cpu: "4"
            requests:
              memory: 16Gi
              cpu: "4"
          env:
            - name: NVIDIA_VISIBLE_DEVICES
              value: all
            - name: NVIDIA_DRIVER_CAPABILITIES
              value: compute,utility
```

> **GPU sharing:** By default one pod = one GPU. For multi-tenant GPU sharing, use NVIDIA Time-Slicing (set `devicePlugin.config.sharing.timeSlicing.replicas`) or MIG (A100/H100 only).

---

### GPU Time-Slicing (Shared GPU for Dev/Batch Workloads)

```yaml
# ~/k8s/gpu-time-slicing-config.yaml
# Apply as ConfigMap in gpu-operator namespace
apiVersion: v1
kind: ConfigMap
metadata:
  name: time-slicing-config
  namespace: gpu-operator
data:
  any: |-
    version: v1
    flags:
      migStrategy: none
    sharing:
      timeSlicing:
        renameByDefault: false
        failRequestsGreaterThanOne: false
        resources:
          - name: nvidia.com/gpu
            replicas: 4    # expose 1 physical GPU as 4 virtual GPUs
```

```bash
kubectl apply -f ~/k8s/gpu-time-slicing-config.yaml
helm upgrade gpu-operator nvidia/gpu-operator \
  --namespace gpu-operator \
  --set devicePlugin.config.name=time-slicing-config
```

---

### KEDA GPU Autoscaling (Scale-to-Zero Inference)

Combine KEDA with GPU nodes — scale inference deployments to zero when no requests, back up when queue fills.

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: inference-scaler
  namespace: ai
spec:
  scaleTargetRef:
    name: model-inference
  minReplicaCount: 0          # scale to zero when idle
  maxReplicaCount: 4
  cooldownPeriod: 300
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus.monitoring.svc:9090
        query: sum(inference_queue_depth{namespace="ai"})
        threshold: "1"
```

---

### GPU Metrics with DCGM Exporter

The GPU Operator installs DCGM Exporter which exposes Prometheus metrics for GPU utilisation, memory, temperature, and power draw.

```bash
# Port-forward or use existing Prometheus scrape
kubectl -n gpu-operator port-forward svc/gpu-operator-dcgm-exporter 9400:9400 &
curl http://localhost:9400/metrics | grep DCGM_FI_DEV_GPU_UTIL
```

Key metrics: `DCGM_FI_DEV_GPU_UTIL` (%), `DCGM_FI_DEV_MEM_COPY_UTIL` (%), `DCGM_FI_DEV_POWER_USAGE` (W), `DCGM_FI_DEV_GPU_TEMP` (°C).

```yaml
# Grafana dashboard: import ID 12239 from grafana.com — NVIDIA DCGM Exporter Dashboard
```

---

## KubeVirt — VMs in Kubernetes

**Purpose:** Run full virtual machines as Kubernetes workloads. Uses the same scheduling, networking, storage, and RBAC as pod workloads — but the workload is a KVM VM, not a container. Useful for legacy apps that can't be containerized, Windows workloads, or when you need stronger isolation than containers provide.

```bash
# Deploy the KubeVirt operator
export KUBEVIRT_VERSION=$(curl -s https://api.github.com/repos/kubevirt/kubevirt/releases/latest | jq -r .tag_name)
kubectl apply -f https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/kubevirt-operator.yaml
kubectl apply -f https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/kubevirt-cr.yaml

# Wait for KubeVirt to be ready
kubectl -n kubevirt wait kv kubevirt --for condition=Available --timeout=300s

# Install virtctl CLI
curl -L https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/virtctl-${KUBEVIRT_VERSION}-linux-amd64 \
  -o ~/.local/bin/virtctl && chmod +x ~/.local/bin/virtctl
```

```yaml
# Create a simple VM
apiVersion: kubevirt.io/v1
kind: VirtualMachine
metadata:
  name: ubuntu-vm
  namespace: default
spec:
  running: true
  template:
    metadata:
      labels:
        kubevirt.io/vm: ubuntu-vm
    spec:
      domain:
        devices:
          disks:
            - name: containerdisk
              disk:
                bus: virtio
            - name: cloudinitdisk
              disk:
                bus: virtio
          interfaces:
            - name: default
              masquerade: {}
        resources:
          requests:
            memory: 2Gi
            cpu: "2"
      networks:
        - name: default
          pod: {}
      volumes:
        - name: containerdisk
          containerDisk:
            image: quay.io/kubevirt/ubuntu-container-disk:latest
        - name: cloudinitdisk
          cloudInitNoCloud:
            userDataBase64: |
              I2Nsb3VkLWNvbmZpZwp1c2VyczoKICAtIG5hbWU6IHVidW50dQo=
```

```bash
# VM lifecycle
virtctl start ubuntu-vm
virtctl stop ubuntu-vm
virtctl restart ubuntu-vm

# Console access
virtctl console ubuntu-vm
virtctl vnc ubuntu-vm

# SSH (if VM has SSH server)
virtctl ssh ubuntu-vm --local-ssh=true

# Live migrate a VM to another node (zero-downtime)
virtctl migrate ubuntu-vm

# Expose VM as a Service
virtctl expose vm ubuntu-vm --name ubuntu-ssh --port 22 --type NodePort
```

---

## WebAssembly (WASM) Workloads

**Purpose:** Run WebAssembly modules directly in Kubernetes as workloads — smaller images (KB instead of MB), near-native performance, stronger sandboxing than containers, and true multi-architecture portability without multi-arch builds.

### runwasi (WASM in containerd)

**Purpose:** containerd shim that allows WASM OCI images to run directly alongside container workloads — using the same Kubernetes pod spec, just a different runtime class.

```bash
# Install the wasmtime or spin runtime shim (on each node)
# k3s bundles runwasi — enable it:
cat >> /etc/rancher/k3s/config.yaml << 'EOF'
disable:
  - traefik
kubelet-arg:
  - "allowed-unsafe-sysctls=*"
EOF

# Install the containerd-wasm-shims
curl -sfL https://github.com/deislabs/containerd-wasm-shims/releases/latest/download/containerd-wasm-shims-installer-linux-amd64.sh | sh

# Apply RuntimeClass for WASM
kubectl apply -f - <<EOF
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: wasmtime
handler: wasmtime
EOF
```

```yaml
# Deploy a WASM workload
apiVersion: apps/v1
kind: Deployment
metadata:
  name: wasm-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: wasm-app
  template:
    metadata:
      labels:
        app: wasm-app
    spec:
      runtimeClassName: wasmtime    # use the WASM shim
      containers:
        - name: wasm-app
          image: ghcr.io/myorg/myapp:latest    # OCI image containing .wasm module
          resources:
            requests: { memory: 32Mi, cpu: 100m }
            limits: { memory: 64Mi, cpu: 200m }
```

### SpinKube (Fermyon Spin on Kubernetes)

**Purpose:** Run Fermyon Spin WASM applications natively in Kubernetes. Spin applications start in <1ms, scale to zero instantly, and use the same Kubernetes primitives.

```bash
helm repo add spinoperator https://spinoperator.fermyon.dev
helm install spin-operator spinoperator/spin-operator \
  --namespace spin-operator --create-namespace \
  --wait

# Deploy a Spin app
kubectl apply -f - <<EOF
apiVersion: core.spinoperator.dev/v1alpha1
kind: SpinApp
metadata:
  name: my-spin-app
spec:
  image: "ghcr.io/myorg/my-spin-app:latest"
  replicas: 2
  executor: containerd-shim-spin
EOF
```

---

