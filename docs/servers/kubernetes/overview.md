---
title: Kubernetes Overview — Key Concepts & Distributions
section: Self-Hosting & Servers
updated: 2026-08-28
---

## Table of Contents

**Core Concepts & Distributions**
1. [Key Concepts](#key-concepts) *(Control Plane, Networking, RBAC, Storage, eBPF, GitOps, Namespaces, Labels, Deployments, Events, and more)*
2. [Distributions](#distributions)
3. [Disk Layout & CLI Tools](#disk-layout-cli-tools)

**Networking**
4. [Networking & Ingress](#networking-ingress)
5. [DNS](#dns)
6. [NetworkPolicy — Default Deny Patterns](#networkpolicy-default-deny-patterns)
7. [TLS & Certificate Management](#tls-certificate-management)
8. [Service Mesh](#service-mesh)
9. [Gateway API — Advanced Patterns](#gateway-api-advanced-patterns)
10. [Network Troubleshooting](#network-troubleshooting)

**Storage**
11. [Storage](#storage)
12. [NFS & Shared Storage](#nfs-shared-storage)
13. [MinIO (Self-Hosted S3)](#minio-self-hosted-s3)

**Security**
14. [Security & Policy](#security-policy) *(includes Resource Quotas & LimitRanges)*
15. [Secrets Management](#secrets-management)
16. [Image Supply Chain Security](#image-supply-chain-security)
17. [SPIFFE/SPIRE — Workload Identity](#spiffespire-workload-identity)
18. [Cluster Hardening](#cluster-hardening)

**Workloads & Scheduling**
19. [Workload Patterns](#workload-patterns) *(includes Init Containers, Sidecars, StatefulSets, Jobs, DaemonSets, Affinity, Lifecycle Hooks, and more)*
20. [Deployment Strategies Deep Dive](#deployment-strategies-deep-dive)
21. [Autoscaling](#autoscaling) *(includes Cluster Autoscaler, Karpenter, HPA, VPA, KEDA, Goldilocks)*
22. [GPU & AI/ML Workloads](#gpu-aiml-workloads)
23. [KubeVirt — VMs in Kubernetes](#kubevirt-vms-in-kubernetes)
24. [WebAssembly (WASM) Workloads](#webassembly-wasm-workloads)

**GitOps & Delivery**
25. [GitOps & Continuous Delivery](#gitops-continuous-delivery)
26. [Advanced GitOps Patterns](#advanced-gitops-patterns)
27. [Progressive Delivery](#progressive-delivery)
28. [In-Cluster CI/CD & Build](#in-cluster-cicd-build)
29. [Local Development & Cluster Intercept](#local-development-cluster-intercept) *(includes minikube, kind)*
30. [Policy as Code — CI Gates](#policy-as-code-ci-gates)
31. [Buildpacks & Image Build Strategies](#buildpacks-image-build-strategies)
32. [Multi-Architecture Builds](#multi-architecture-builds)

**Observability**
33. [Observability](#observability) *(includes Prometheus AlertManager config, ServiceMonitor/PodMonitor, DORA metrics)*
34. [Grafana Dashboards as Code](#grafana-dashboards-as-code)
35. [SLO Management](#slo-management)
36. [Beyla (eBPF Auto-Instrumentation — No Code Changes)](#beyla-ebpf-auto-instrumentation-no-code-changes)
37. [Grafana OnCall (On-Call Scheduling & Escalation)](#grafana-oncall-on-call-scheduling-escalation)

**Operations & Reliability**
38. [Backup & Disaster Recovery](#backup-disaster-recovery)
39. [etcd Operations & Disaster Recovery](#etcd-operations-disaster-recovery)
40. [Cost Management & Resource Efficiency](#cost-management-resource-efficiency)
41. [Cluster Upgrade Strategies](#cluster-upgrade-strategies)

**Platform & Multi-Cluster**
42. [Platform Engineering](#platform-engineering) *(Crossplane, LitmusChaos, Keptn, Golden Paths, Port)*
43. [Operator Pattern & Custom Resources](#operator-pattern-custom-resources)
44. [Cluster API (CAPI)](#cluster-api-capi)
45. [Multi-Cluster](#multi-cluster)
46. [Multi-Tenancy & Audit](#multi-tenancy-audit)
47. [Cluster Management UIs](#cluster-management-uis)

**Tooling Reference**
52. [Helm — Advanced Usage](#helm-advanced-usage)
53. [kubectl Power Usage](#kubectl-power-usage)
54. [Deprecated API Migration](#deprecated-api-migration)
55. [Daily Operations](#daily-operations)
56. [Caddy Configuration Reference](#caddy-configuration-reference)
57. [Zot (Lightweight OCI Registry)](#zot-lightweight-oci-registry)
58. [Robusta — Kubernetes Operations Platform](#robusta-kubernetes-operations-platform)
59. [Dagger — Portable CI Engine](#dagger-portable-ci-engine)

**Troubleshooting**
60. [Troubleshooting](#troubleshooting)
61. [Troubleshooting — Advanced Debug Flows](#troubleshooting-advanced-debug-flows)


## Key Concepts

#### Control plane components

| Component | Role |
|-----------|------|
| **kube-apiserver** | Front door — all kubectl commands hit this. Validates, authenticates, and persists objects to etcd. |
| **etcd** | Distributed key-value store where all cluster state lives. Losing etcd without a backup = losing the cluster. |
| **kube-scheduler** | Watches for unscheduled pods; assigns them to nodes based on resources, taints/tolerations, affinity. |
| **kube-controller-manager** | Runs reconciliation loops: Deployment controller, ReplicaSet controller, Node controller, etc. |
| **cloud-controller-manager** | Talks to the cloud API to provision LoadBalancers, PersistentVolumes (EBS, GCE PD), etc. |

#### Node components

| Component | Role |
|-----------|------|
| **kubelet** | Runs on every node; ensures pod containers are running and healthy. |
| **kube-proxy** | Maintains iptables/ipvs rules for Service routing. Replaced by Cilium eBPF in this stack. |
| **Container runtime** | containerd, CRI-O, or Docker (via shim). |
| **CNI plugin** | Provides pod networking. This stack uses **Cilium** (eBPF) — replaces Flannel and kube-proxy. |

#### What happens when you run `kubectl apply`

1. kubectl sends a `PATCH` or `POST` to kube-apiserver
2. API server **authenticates** the request (client cert or bearer token)
3. API server **authorises** via RBAC — is this subject allowed to perform this verb on this resource?
4. **Mutating admission webhooks** run (Kyverno mutate, inject sidecars, set defaults) — object may be changed
5. Object is **validated** against the OpenAPI schema
6. **Validating admission webhooks** run (Kyverno validate, OPA/Gatekeeper) — may reject the request
7. Object is **persisted to etcd**
8. The relevant controller's informer detects the change and its reconciliation loop runs
9. The controller creates/updates child objects (Deployment → ReplicaSet → Pods)
10. Scheduler assigns pending pods to nodes based on resources, taints, affinity
11. kubelet on the target node pulls the image and creates containers via the container runtime

> **Server-side apply (SSA):** `kubectl apply --server-side` moves the field ownership tracking to the API server. Preferred for GitOps — prevents field manager conflicts when multiple tools (ArgoCD, Helm, kubectl) manage overlapping objects. Use `--force-conflicts` to take ownership of conflicting fields.

#### Pod lifecycle states

Kubernetes reports two distinct concepts: the **phase** (official API field `status.phase`) and the **status reason** shown by `kubectl get pods` in the STATUS column.

**Official phases:**

| Phase | Meaning |
|-------|---------| 
| `Pending` | Pod accepted but containers not yet running — scheduling, image pull, or PVC binding in progress |
| `Running` | Pod bound to a node; at least one container is running, starting, or restarting |
| `Succeeded` | All containers exited with code 0 (terminal — used by Jobs) |
| `Failed` | All containers have terminated; at least one exited non-zero or was killed |
| `Unknown` | Pod state cannot be determined — typically the node is unreachable |

**Common STATUS reasons (not phases, shown in `kubectl get pods`):**

| Status | What it means |
|--------|--------------|
| `Terminating` | Pod received a delete request; waiting for graceful shutdown and finalizer removal |
| `CrashLoopBackOff` | Container repeatedly crashes; kubelet backs off exponentially (1s → 2s → 4s → … → 5m max) |
| `ImagePullBackOff` / `ErrImagePull` | Registry unreachable, or image/tag not found |
| `Init:0/2` | Waiting for init containers (0 of 2 complete) |
| `PodInitializing` | Init containers done; app containers starting |
| `ContainerCreating` | Image pulled; container runtime is creating the container |
| `OOMKilled` | Container exceeded `limits.memory`; killed by the Linux OOM killer |
| `Completed` | All containers exited 0 (Job/CronJob pod) |

#### Kubernetes networking model

1. Every pod gets a unique cluster-routable IP — no port mapping needed between pods
2. Pods on a node can communicate with all pods on all nodes without NAT
3. Agents on a node can communicate with all pods on that node
4. Pods don't know or care about their host IP

Network Policies are **additive whitelists** — by default, all pod-to-pod traffic is allowed. The moment any NetworkPolicy selects a pod, only traffic explicitly permitted by *any* matching policy is allowed. Production pattern: apply a default-deny-all policy to every namespace, then add explicit ingress/egress allow rules per service. Cilium extends standard NetworkPolicy with L7 (HTTP/gRPC/DNS) rules.

#### Service types

| Type | Scope | Notes |
|------|-------|-------|
| `ClusterIP` | In-cluster only | Default |
| `NodePort` | External via `nodeIP:nodePort` | Static port on every node |
| `LoadBalancer` | Cloud LB or Cilium LB / MetalLB on bare-metal | Provisions LB IP |
| `ExternalName` | CNAME to external DNS | No proxying |
| `Headless` (`clusterIP: None`) | DNS returns pod IPs directly | Used by StatefulSets |

#### Resources: requests vs limits

`resources.requests` is what the scheduler uses to decide which node can fit the pod. `resources.limits` is enforced at runtime by cgroups.

**How limits are enforced:**
- **Memory:** hard limit — exceed it and the container is OOMKilled immediately
- **CPU:** soft throttle — the container's CPU is rate-limited (not killed); it just runs slower

```yaml
resources:
  requests:
    cpu: 100m       # 0.1 vCPU — used by scheduler to place the pod
    memory: 256Mi   # used by scheduler and OOM killer
  limits:
    cpu: 500m       # throttled at 0.5 vCPU — never OOMKilled for CPU
    memory: 512Mi   # OOMKilled if exceeded
```

**Golden path:** set `requests` to typical (p50) usage, `limits` to burst ceiling (p99). Avoid:
- Setting neither: scheduler is blind, QoS becomes BestEffort (first evicted)
- `requests == limits` for memory: prevents kernel from reclaiming unused pages (can waste RAM)
- No memory limit at all: one runaway container can crash the node

> Use **Goldilocks** to derive right-sized values from VPA recommendations based on actual traffic.

#### Taints, tolerations, and affinity

A **taint** marks a node as unsuitable for pods that don't explicitly tolerate it. A **toleration** on a pod opts it in to a tainted node.

**Taint effects:**

| Effect | Behaviour |
|--------|-----------|
| `NoSchedule` | New pods without a matching toleration are not scheduled here; existing pods stay |
| `PreferNoSchedule` | Scheduler tries to avoid placing pods here, but will if no other node fits |
| `NoExecute` | Existing pods without a matching toleration are evicted; new ones are not scheduled |

```bash
# Taint a GPU node — only GPU workloads get scheduled
kubectl taint node gpu-node1 gpu=true:NoSchedule

# Add toleration to a pod spec
tolerations:
  - key: "gpu"
    operator: "Equal"
    value: "true"
    effect: "NoSchedule"

# Remove a taint (note the trailing -)
kubectl taint node gpu-node1 gpu=true:NoSchedule-
```

**Node affinity vs node selector:**
- `nodeSelector`: simple key/value match (legacy, less flexible)
- `nodeAffinity`: `requiredDuringSchedulingIgnoredDuringExecution` = hard requirement; `preferredDuringSchedulingIgnoredDuringExecution` = soft preference (weighted)

> **Taints + tolerations vs affinity:** Taints *repel* pods (node says "not you"). Affinity *attracts* pods (pod says "I want that node"). Use both together: taint GPU nodes AND add affinity to GPU pods so they land on GPU nodes and nowhere else.

#### Probes

| Probe | Failure action | Use case |
|-------|---------------|----------|
| `livenessProbe` | kubelet kills and restarts the container | Deadlock detection — use conservatively |
| `readinessProbe` | Pod removed from Service endpoints | Startup delays, temporary unhealthiness (DB reconnect, cache warm) |
| `startupProbe` | Disables liveness/readiness until it passes | Slow-starting apps (JVM, ML model load) |

**Probe mechanisms** (all three probes support all mechanisms):
- `exec` — runs a command inside the container; exit 0 = healthy
- `httpGet` — HTTP GET; status 200–399 = healthy
- `tcpSocket` — TCP connect; success = healthy
- `grpc` — gRPC health check protocol (1.24+)

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 15    # wait before first probe — tune per app startup time
  periodSeconds: 10
  failureThreshold: 3        # 3 consecutive failures → restart
  timeoutSeconds: 5

startupProbe:
  httpGet:
    path: /healthz
    port: 8080
  failureThreshold: 30       # 30 × 10s = 5 min max startup time
  periodSeconds: 10
```

> **Common mistake:** A liveness probe that hits your app's external DB will kill the pod when the DB is slow — making an outage worse. Liveness probes should only check the process itself (deadlock, infinite loop). Readiness probes can check DB connectivity.

#### ConfigMap vs Secret

Both are key-value stores mounted into pods as volumes or environment variables.

| | ConfigMap | Secret |
|-|-----------|--------|
| **Content** | Non-sensitive config (feature flags, app settings) | Sensitive data (passwords, tokens, TLS certs) |
| **Encoding** | Plain text | Base64-encoded (not encrypted — just encoded) |
| **RBAC** | Standard | Separate `get secrets` permission; restrict tightly |
| **Encryption at rest** | No | Only with EncryptionConfiguration or external KMS |

```yaml
# Volume mount (preferred) — changes take effect without pod restart (~60s propagation)
volumes:
  - name: config
    configMap:
      name: myapp-config
  - name: creds
    secret:
      secretName: myapp-secrets
      defaultMode: 0400    # read-only for owner

# Env var (less preferred — requires pod restart to pick up changes)
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: myapp-secrets
        key: db-password
```

> **Encryption at rest:** By default, Secrets are stored as base64 in etcd — anyone with etcd access can read them. Enable Kubernetes EncryptionConfiguration with an AES-GCM provider, or use ESO + OpenBao/Vault for proper secret management. Sealed Secrets encrypts the manifest itself (safe to commit to Git).

#### StatefulSets vs Deployments

| | Deployment | StatefulSet |
|-|------------|-------------|
| **Pod identity** | Random names (`myapp-xyz`) | Stable ordinal names (`myapp-0`, `myapp-1`) |
| **DNS** | Single service DNS | Per-pod DNS (`myapp-0.myapp.ns.svc.cluster.local`) |
| **Storage** | Shared PVC or ephemeral | Per-pod PVCs (via `volumeClaimTemplates`) |
| **Startup order** | All pods start in parallel | Sequential by default (0 → 1 → 2) |
| **Use case** | Stateless apps, APIs, workers | Databases, Kafka, Elasticsearch, ZooKeeper |
| **PVC on scale-down** | N/A | PVCs are **not** deleted — manual cleanup required |

```bash
# Stateful DNS — predictable and stable even after pod restart
nslookup postgres-0.postgres.data.svc.cluster.local
```

#### QoS Classes

Kubernetes assigns every pod a Quality of Service class based on its resource configuration. This determines eviction order under memory pressure.

| QoS Class | Condition | Eviction priority |
|-----------|-----------|-------------------|
| `Guaranteed` | Every container has `requests == limits` for CPU **and** memory | Last evicted |
| `Burstable` | At least one container has a request or limit set | Middle |
| `BestEffort` | No requests or limits set on any container | First evicted |

```bash
kubectl get pod myapp-xyz -n myapp -o jsonpath='{.status.qosClass}'
```

> **Rule of thumb:** Production services should be `Guaranteed` (avoids OOMKill surprises) or `Burstable` with memory limits set. `BestEffort` is only appropriate for non-critical batch jobs.

#### OwnerReferences & Garbage Collection

Every object created by a controller carries an `ownerReferences` field pointing back to its parent. When the parent is deleted, the garbage collector cascades deletion to all owned objects (unless `--cascade=orphan` is used).

```bash
# See who owns a ReplicaSet
kubectl get replicaset myapp-abc123 -n myapp -o jsonpath='{.metadata.ownerReferences}'

# Delete a Deployment but keep its pods (orphan)
kubectl delete deployment myapp -n myapp --cascade=orphan
```

#### ResourceVersion & Optimistic Concurrency

Every Kubernetes object has a `resourceVersion` field that changes on every write. The API server uses it for **optimistic concurrency** — if you `PUT` an object with a stale `resourceVersion`, the request is rejected with `409 Conflict`. This prevents lost updates when two controllers modify the same object simultaneously.

```bash
kubectl get deployment myapp -n myapp -o jsonpath='{.metadata.resourceVersion}'
```

#### RBAC fundamentals

Every action is: a **verb** (`get`, `list`, `watch`, `create`, `update`, `patch`, `delete`) on a **resource** (`pods`, `deployments`, `secrets`) in a **namespace**. A Role defines allowed combinations; a RoleBinding binds it to a subject. ClusterRole/ClusterRoleBinding apply cluster-wide.

```bash
kubectl auth can-i --list --as system:serviceaccount:default:myapp
```

#### `kubectl explain` — built-in API reference

Never leave the terminal to look up YAML fields:

```bash
kubectl explain pod.spec.containers.securityContext
kubectl explain deployment.spec.strategy.rollingUpdate
kubectl explain --recursive deployment.spec    # show full tree
kubectl api-resources                          # list all resource kinds
kubectl api-resources --api-group=cilium.io    # filter by API group
```

#### Admission webhooks

Before any object is persisted to etcd, it passes through two phases of admission control:

1. **Mutating admission** — webhooks may modify the object (inject sidecars, add labels, set resource defaults). Runs first so validators see the final object.
2. **Validating admission** — webhooks may reject the object but cannot modify it (block unsigned images, enforce policy). Runs second.

Both phases run in parallel across all registered webhooks within each phase. A single webhook can implement both. Tools: Kyverno (YAML-native), OPA/Gatekeeper (Rego).

> If a webhook is unavailable and its `failurePolicy` is `Fail`, all matching requests are rejected. Set `failurePolicy: Ignore` for non-critical webhooks, and ensure webhook pods have `priorityClass: system-cluster-critical`.

#### Persistent storage — the CSI model

Container Storage Interface (CSI) is the plugin standard. A CSI driver (Longhorn, Rook-Ceph, AWS EBS) implements the Create/Attach/Mount lifecycle.

- **PersistentVolume (PV):** the actual storage resource (provisioned manually or dynamically by a StorageClass)
- **PersistentVolumeClaim (PVC):** a pod's request for storage — size, access mode, and StorageClass
- **StorageClass:** defines the provisioner and parameters; `reclaimPolicy: Retain` (keep data on PVC delete) vs `Delete` (destroy it)

**Access modes:**
- `ReadWriteOnce` (RWO) — mounted read/write by one node at a time; block storage (Longhorn, EBS)
- `ReadWriteMany` (RWX) — mounted read/write by multiple nodes; NFS, CephFS
- `ReadOnlyMany` (ROX) — mounted read-only by multiple nodes

```bash
kubectl get pv           # cluster-scoped — shows all volumes and their RECLAIM POLICY
kubectl get pvc -A       # namespace-scoped — pod's view of storage
kubectl describe pv <pv-name>   # see which PVC is bound and the reclaim policy
```

#### eBPF — the technology behind Cilium

**eBPF** (extended Berkeley Packet Filter) lets sandboxed programs run in the Linux kernel without writing kernel modules. The kernel verifies programs are safe (no infinite loops, no out-of-bounds access) before loading them.

**Why it matters for Kubernetes:**
- **Traditional path:** packets hit iptables → kube-proxy → userspace proxy → pod. Slow, stateful, hard to debug.
- **Cilium/eBPF path:** packets are processed at the kernel network layer by eBPF programs — no iptables rules, no kube-proxy, no extra hops.

| Capability | How Cilium uses eBPF |
|------------|---------------------|
| **Networking** | Replaces kube-proxy; pod routing at kernel speed |
| **L7 Policy** | HTTP/gRPC/DNS-aware NetworkPolicy without Envoy sidecar injection |
| **Encryption** | Transparent WireGuard node-to-node via eBPF |
| **Observability** | Hubble captures all pod flows at kernel level; zero app changes |
| **Load balancing** | Maglev consistent hashing in kernel (DSR mode for direct return) |

> Kernel version ≥5.10 recommended for full Cilium features; ≥5.8 for Beyla eBPF auto-instrumentation.

#### GitOps mental model

Git is the **single source of truth** for cluster state. Nobody applies manifests manually — everything flows through Git.

```
Code repo ──→ CI (build/test/push image)
                    │
                    ↓
           Manifests repo (update image tag, Helm values)
                    │
                    ↓
           ArgoCD / Flux (detects diff every ~3 min or via webhook)
                    │
                    ↓
           Kubernetes cluster (reconciled to match Git)
```

**Key properties:**
- **Rollback** = `git revert` → automatic re-sync, no `kubectl rollout undo`
- **Audit trail** = git history and PR comments (who changed what, when, and why)
- **Drift detection** = ArgoCD/Flux detects and can auto-correct manual `kubectl` changes
- **Disaster recovery** = re-apply the Git repo to a new cluster to recreate state

> **Drift:** any change made directly with `kubectl apply` that wasn't committed to Git. GitOps tools report this as `OutOfSync` and can auto-revert it. Use `kubectl apply --dry-run=server` to preview without drifting.

#### Observability pillars

| Pillar | Tool in this stack | What it shows |
|--------|-------------------|---------------|
| **Metrics** | Prometheus + Grafana | CPU, memory, error rates, latency percentiles |
| **Logs** | Loki + Promtail/Alloy | Full log lines with LogQL querying |
| **Traces** | OpenTelemetry + Tempo | Request path across microservices, per-span latency |
| **Flows** | Cilium Hubble | Pod-to-pod network flows, dropped packets, L7 requests |

#### OpenTelemetry Collector (Central Signal Pipeline)

The OpenTelemetry Collector is the recommended way to receive, process, and export all three signal types (metrics, logs, traces) in one place. It decouples your apps from the backend — swap Tempo for Jaeger, or Loki for Elasticsearch, by changing the Collector config, not your code.

```bash
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm upgrade --install otel-collector open-telemetry/opentelemetry-collector \
  --namespace monitoring \
  -f ~/k8s/values/otel-collector.yaml
```

```yaml
# ~/k8s/values/otel-collector.yaml
mode: deployment   # or 'daemonset' to collect from every node

config:
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
      send_batch_size: 512
    memory_limiter:
      check_interval: 1s
      limit_mib: 512

  exporters:
    otlp/tempo:
      endpoint: http://tempo.monitoring.svc:4317
      tls:
        insecure: true
    loki:
      endpoint: http://loki.monitoring.svc:3100/loki/api/v1/push
    prometheus:
      endpoint: 0.0.0.0:8889   # scrape endpoint for Prometheus

  service:
    pipelines:
      traces:
        receivers: [otlp]
        processors: [memory_limiter, batch]
        exporters: [otlp/tempo]
      logs:
        receivers: [otlp]
        processors: [memory_limiter, batch]
        exporters: [loki]
      metrics:
        receivers: [otlp, prometheus]
        processors: [memory_limiter, batch]
        exporters: [prometheus]
```

```bash
# Instrument your app — point OTLP endpoint to the collector
# OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector.monitoring.svc:4317

kubectl get pods -n monitoring -l app.kubernetes.io/name=opentelemetry-collector
kubectl logs -n monitoring -l app.kubernetes.io/name=opentelemetry-collector -f
```


#### DORA metrics

Four metrics measure software delivery performance: **Deployment Frequency**, **Lead Time for Changes** (commit to production), **Change Failure Rate** (% of deployments causing incidents), and **Time to Restore** (MTTR). Elite teams: multiple deploys/day, <1h lead time, <5% failure rate, <1h recovery. These predict team health — low deployment frequency predicts burnout; high failure rate predicts firefighting culture.

#### Finalizers

Finalizers are keys stored in `metadata.finalizers` that block deletion of an object until removed. When you `kubectl delete` an object with finalizers, Kubernetes marks it `Terminating` but doesn't remove it — it waits for a controller to do cleanup work and remove the finalizer. Common example: a PVC with a finalizer that prevents deletion while a pod is still using it.

```bash
# See finalizers on a resource
kubectl get pvc myapp-data -n myapp -o jsonpath='{.metadata.finalizers}'

# Remove a stuck finalizer manually (use with caution — bypasses cleanup)
kubectl patch pvc myapp-data -n myapp --type=json   -p='[{"op":"remove","path":"/metadata/finalizers/0"}]'
```

#### Field Managers & Server-Side Apply (SSA)

Server-Side Apply (SSA) moves field ownership tracking to the API server. Each tool (kubectl, ArgoCD, Helm) is a named **field manager** that "owns" the fields it sets. Conflicts arise when two managers try to own the same field.

```bash
# Check who owns which fields
kubectl get deployment myapp -n myapp   -o jsonpath='{.metadata.managedFields}' | jq .

# SSA apply — take ownership of fields declared in the manifest
kubectl apply --server-side -f deployment.yaml

# Force-take ownership of a conflicting field
kubectl apply --server-side --force-conflicts -f deployment.yaml

# Set a custom field manager name (important when multiple tools manage the same object)
kubectl apply --server-side --field-manager=argocd -f deployment.yaml
```

#### Lease & Leader Election

Kubernetes controllers use `Lease` objects in the `kube-node-lease` namespace for leader election — ensuring only one replica of a controller is active at a time. Node heartbeats are also tracked via Leases.

```bash
# View node heartbeat leases
kubectl get lease -n kube-node-lease

# View leader election leases for controllers
kubectl get lease -n kube-system

# Check which controller replica is the current leader
kubectl get lease kube-controller-manager -n kube-system -o json | jq .spec.holderIdentity
```

#### imagePullPolicy

Controls when the kubelet re-pulls an image from the registry.

| Policy | Behaviour | When to use |
|--------|-----------|-------------|
| `IfNotPresent` | Pull only if image not cached on node | Default for versioned tags — fastest restarts |
| `Always` | Pull on every pod start | Required when tag is mutable (e.g. `latest`, `main`) |
| `Never` | Never pull — fail if image not present | Air-gapped nodes; pre-loaded images |

```yaml
containers:
  - name: myapp
    image: harbor.home.local/myorg/myapp:v1.4.2   # versioned tag → IfNotPresent is safe
    imagePullPolicy: IfNotPresent
```

> **Rule:** Always use a specific digest or immutable tag in production — `imagePullPolicy: Always` with `:latest` is a reliability footgun (different nodes may pull different versions).

#### externalTrafficPolicy and internalTrafficPolicy

`externalTrafficPolicy` controls whether a `NodePort` or `LoadBalancer` service distributes traffic across all nodes (`Cluster`) or only routes to nodes that have a local pod (`Local`).

| Policy | Behaviour | Trade-off |
|--------|-----------|-----------|
| `Cluster` (default) | Any node can receive traffic; kube-proxy/Cilium forwards to any pod | Source IP is SNAT'd — pod sees node IP, not client IP |
| `Local` | Only nodes with a running pod receive traffic | Preserves client source IP; uneven load if pods are on few nodes |

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  type: LoadBalancer
  externalTrafficPolicy: Local    # preserve client IP; Cilium/MetalLB only routes to nodes with pods
  internalTrafficPolicy: Local    # cluster-internal traffic also prefers local pod (avoids extra hop)
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 8080
```

> Use `Local` when you need real client IPs in access logs or when you use Cilium's DSR (Direct Server Return) mode for extra performance.

#### ReadinessGates

`readinessGates` let external controllers (like a load balancer controller or Argo Rollouts) declare additional conditions that must be `True` before a pod is considered ready and added to Service endpoints.

```yaml
spec:
  readinessGates:
    - conditionType: target-health.elbv2.k8s.aws/my-tg   # example: AWS ALB controller
```

```bash
# Check pod readiness gate status
kubectl get pod myapp-xyz -n myapp -o jsonpath='{.status.conditions}'  | jq .
# Look for conditionType entries with status "True" / "False"
```

#### Autoscaling recap

| Tool | Mechanism |
|------|-----------|
| **HPA** | Scales pod replicas on CPU/memory or custom metrics |
| **VPA** | Adjusts resource requests/limits (recommendation mode via Goldilocks) |
| **KEDA** | Event-driven scaling including scale-to-zero |
| **Cluster Autoscaler / Karpenter** | Adds/removes nodes based on pending pods |

---

#### Namespaces

Namespaces are a virtual partition of a cluster — they scope names, RBAC, ResourceQuotas, NetworkPolicies, and LimitRanges. Objects with the same name can exist in different namespaces. `kube-system` holds control-plane components; `default` is the initial user namespace. Namespaces do **not** provide network isolation on their own — use NetworkPolicies for that.

```bash
kubectl get namespaces
kubectl create namespace myapp
kubectl config set-context --current --namespace=myapp   # set default namespace
kubectl get pods -A                                       # all namespaces
kubectl get pods -n kube-system                          # specific namespace
```

> **Production pattern:** One namespace per application/service. Use `ResourceQuota` and `LimitRange` to cap what each namespace can consume.

---

#### Labels & Selectors

Labels are `key: value` pairs attached to any Kubernetes object. They are the **primary mechanism** Kubernetes uses to group and target objects — Services use them to find pods, Deployments use them to own ReplicaSets, NetworkPolicies use them to apply rules, and node affinity uses node labels.

```yaml
metadata:
  labels:
    app: myapp
    version: v1.4.2
    environment: production
    team: backend
```

```bash
kubectl get pods -l app=myapp                            # equality selector
kubectl get pods -l 'environment in (production,staging)'  # set-based selector
kubectl label pod myapp-xyz canary=true                  # add label
kubectl label pod myapp-xyz canary-                      # remove label
kubectl get pods --show-labels
```

**Selector types:**
- **Equality-based** (`=`, `==`, `!=`): used in Services, ReplicationControllers
- **Set-based** (`in`, `notin`, `exists`): used in Deployments, Jobs, DaemonSets, affinity rules

> Labels are indexed and queryable. Keep them consistent across your fleet — `app`, `version`, `environment`, `team`, `component` are common conventions (see `app.kubernetes.io/` well-known labels).

---

#### Annotations

Annotations are also `key: value` pairs but are **not** used for selection. They carry arbitrary metadata — tool configuration, last-applied values, build IDs, Slack channel, runbook URLs.

```yaml
metadata:
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: "..."
    prometheus.io/scrape: "true"                       # Prometheus scrape hint
    prometheus.io/port: "8080"
    kubernetes.io/change-cause: "deploy v1.4.2 fix OOM"  # shown in rollout history
    link/runbook: "https://wiki.home.local/runbooks/myapp"
```

> Values can be any string including JSON. Unlike labels, annotations are not indexed — don't use them as selectors.

---

#### Deployments & ReplicaSets

A **Deployment** manages the desired state of a stateless application. You declare `replicas: 3` and `image: myapp:v2`, and the Deployment controller creates a **ReplicaSet** to maintain that count. On update, the Deployment creates a new ReplicaSet and scales it up while scaling the old one down — this is the rolling update.

```
Deployment
  └── ReplicaSet (v2 — active)       3/3 pods
  └── ReplicaSet (v1 — scaled down)  0/3 pods  ← kept for rollback
```

```bash
kubectl get replicasets -n myapp        # see all RSes owned by the Deployment
kubectl rollout history deployment/myapp -n myapp   # see revision history
kubectl rollout undo deployment/myapp -n myapp      # roll back to previous RS
```

> `revisionHistoryLimit` (default 10) controls how many old ReplicaSets are kept. Set to 3–5 in production to avoid cluttering the namespace.

---

#### Events

Kubernetes Events record what happened to an object — image pulls, scheduling decisions, probe failures, OOMKills. They are the first thing to check when a pod won't start.

```bash
kubectl describe pod myapp-xyz -n myapp          # events at the bottom
kubectl get events -n myapp --sort-by='.lastTimestamp' | tail -30
kubectl get events -n myapp --field-selector reason=OOMKilling
kubectl get events -A --field-selector type=Warning   # all warnings cluster-wide
```

Events expire after ~1 hour by default. For persistent event storage, use a tool like `event-exporter` to ship events to Loki.

---

#### restartPolicy

Controls what happens when a container in a pod exits.

| Policy | Behaviour | Use Case |
|--------|-----------|----------|
| `Always` | Restart on any exit (default for Deployments/DaemonSets) | Long-running services |
| `OnFailure` | Restart only on non-zero exit | Jobs that should retry |
| `Never` | Never restart | One-shot jobs; debugging |

> Pods with `restartPolicy: Never` move to `Failed` phase on non-zero exit. Pods with `Always` go to `CrashLoopBackOff` if they keep crashing.

---

#### hostNetwork, hostPID, hostIPC

These pod-level flags break container isolation in exchange for performance or access to host resources. **Avoid in production unless absolutely necessary** — they are blocked by `restricted` PSA profile.

| Flag | Effect | Legitimate use |
|------|--------|----------------|
| `hostNetwork: true` | Pod uses the node's network namespace; bypasses CNI | Node-local monitoring agents (Cilium, Falco) |
| `hostPID: true` | Pod can see all processes on the node | Debugging tools, eBPF profilers |
| `hostIPC: true` | Pod shares the node's IPC namespace | High-performance shared-memory workloads |

---

## Distributions

| Distribution | Best For | RAM (min) | Install via | Notes |
|---|---|---|---|---|
| **k3s** | Single-node homelabs, edge | 512 MB | curl installer (`~/.local/bin`) | Batteries-included, easiest to start |
| **k0s** | Minimal, air-gapped | 1 GB | curl installer (`~/.local/bin`) | Single binary, no external deps |
| **MicroK8s** | Quick local cluster, addons | 2 GB | **Snap** | Canonical-maintained; DNS, ingress, registry as addons |
| **minikube** | Local dev, driver choice | 2 GB | Nix or **Snap** | Runs via Podman driver |
| **kind** | Lightweight dev/CI | 2 GB | Nix | Runs K8s inside Podman containers |
| **RKE2** | Hardened, production | 4 GB | curl installer (`~/.local/bin`) | CIS-benchmarked, STIG-ready |
| **Talos** | Immutable infra, GitOps | 2 GB | talosctl | API-only, no SSH, extremely secure |
| **kubeadm** | Vanilla upstream, CKA study | 2 GB | Nix | Full manual setup; deepest understanding |

---

### k3s (Lightweight CNCF Kubernetes)

**Purpose:** Lightweight, CNCF-certified Kubernetes. Ships with containerd, CoreDNS, and local-path provisioner. Single binary under 70 MB. Install with `--flannel-backend=none --disable-kube-proxy` to use Cilium as the CNI (see [Networking & Ingress](#networking--ingress)).

#### Single-node install (with Cilium CNI)

```bash
sudo sysctl -w vm.max_map_count=524288
echo "vm.max_map_count=524288" | sudo tee /etc/sysctl.d/99-k8s.conf
sudo modprobe br_netfilter
echo "br_netfilter" | sudo tee /etc/modules-load.d/br_netfilter.conf

mkdir -p ~/.local/bin
curl -sfL https://get.k3s.io | INSTALL_K3S_BIN_DIR=~/.local/bin sh -s - \
  --flannel-backend=none \
  --disable-kube-proxy \
  --disable-network-policy \
  --disable=traefik          # remove if using NGF

mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config
chmod 600 ~/.kube/config
export KUBECONFIG=~/.kube/config
# Now install Cilium — see Networking & Ingress
```

#### Adding worker nodes

```bash
sudo cat /var/lib/rancher/k3s/server/node-token   # on server

mkdir -p ~/.local/bin
curl -sfL https://get.k3s.io | INSTALL_K3S_BIN_DIR=~/.local/bin \
  K3S_URL=https://<server-ip>:6443 K3S_TOKEN=<token> sh -
```

#### Common k3s operations

```bash
kubectl get nodes -o wide
kubectl get pods -A
sudo journalctl -u k3s -f
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
kubectl uncordon <node-name>
sudo k3s etcd-snapshot save --name homelab-$(date +%Y%m%d)
~/.local/bin/k3s-uninstall.sh
~/.local/bin/k3s-agent-uninstall.sh
```

---

### k0s (Minimal Single Binary)

```bash
mkdir -p ~/.local/bin
curl -sSLf https://get.k0s.sh | K0S_INSTALL_PATH=~/.local/bin sudo sh
sudo k0s install controller --single
sudo k0s start
sudo k0s kubeconfig admin > ~/.kube/config && chmod 600 ~/.kube/config
kubectl get nodes
```

```bash
sudo k0s status
sudo journalctl -u k0scontroller -f
sudo k0s stop && sudo k0s reset
```

---

### MicroK8s (Snap — Addon-Driven)

```bash
sudo snap install microk8s --classic --channel=1.33/stable
sudo usermod -aG microk8s $USER && mkdir -p ~/.kube && chmod 0700 ~/.kube
# Log out and back in

microk8s status --wait-ready
microk8s enable dns ingress hostpath-storage registry dashboard metrics-server
microk8s enable observability   # full Prometheus + Grafana stack

microk8s config > ~/.kube/config && chmod 600 ~/.kube/config
```

> MicroK8s stores data in `/var/snap/microk8s/` — persists across `snap refresh`, lost only on `snap remove`.

**Firewall:**
```bash
sudo firewall-cmd --add-port=16443/tcp --add-port=10250/tcp --permanent && sudo firewall-cmd --reload
```

---

### Talos Linux (Immutable Kubernetes OS)

**Purpose:** Minimal, API-only, immutable Linux distribution purpose-built for Kubernetes. No SSH, no shell, no package manager — all operations go through `talosctl`.

```bash
nix-env -iA nixpkgs.talosctl

talosctl gen config homelab https://<node-ip>:6443 --output-dir ~/talos-config/
talosctl apply-config --insecure --nodes <node-ip> --file ~/talos-config/controlplane.yaml
talosctl bootstrap --nodes <node-ip> --talosconfig ~/talos-config/talosconfig
talosctl kubeconfig ~/.kube/config --nodes <node-ip> --talosconfig ~/talos-config/talosconfig

kubectl get nodes
```

```bash
talosctl health --nodes <node-ip>
talosctl dmesg --nodes <node-ip>
talosctl upgrade --nodes <node-ip> --image ghcr.io/siderolabs/installer:<version>
talosctl upgrade-k8s --to 1.31.0 --nodes <node-ip>
```

---

### RKE2 (Hardened Production Kubernetes)

```bash
mkdir -p ~/.local/bin
curl -sfL https://get.rke2.io | INSTALL_RKE2_BIN_DIR=~/.local/bin sh -
sudo systemctl enable --now rke2-server
sudo cp /etc/rancher/rke2/rke2.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config && chmod 600 ~/.kube/config
export PATH="$HOME/.local/bin:/var/lib/rancher/rke2/bin:$PATH"
kubectl get nodes
```

---

### kubeadm (Upstream Reference Install)

> **When to use:** exact upstream behaviour, CKA/CKS study, or specific version without distribution packaging. k3s is almost always easier for homelab.

#### Prerequisites

```bash
sudo modprobe overlay && sudo modprobe br_netfilter
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sudo sysctl --system

nix-env -iA nixpkgs.containerd
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
sudo systemctl enable --now containerd

nix-env -iA nixpkgs.kubeadm nixpkgs.kubelet nixpkgs.kubectl
sudo systemctl enable kubelet
```

#### Initialise control plane

```bash
sudo kubeadm init \
  --pod-network-cidr=10.244.0.0/16 \
  --apiserver-advertise-address=<node-ip> \
  --cri-socket=unix:///run/containerd/containerd.sock

mkdir -p ~/.kube
sudo cp /etc/kubernetes/admin.conf ~/.kube/config
sudo chown $USER:$USER ~/.kube/config

# Install CNI — Cilium preferred (eBPF, kube-proxy replacement, L7 policy)
helm repo add cilium https://helm.cilium.io/
helm install cilium cilium/cilium --namespace kube-system \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost=<node-ip> --set k8sServicePort=6443
# Flannel fallback (simpler, no L7): kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml
```

#### HA control plane (3 nodes)

```bash
sudo kubeadm init \
  --control-plane-endpoint "lb.home.local:6443" \
  --upload-certs \
  --pod-network-cidr=10.244.0.0/16
# Run the printed --control-plane join command on nodes 2 and 3
# Run the standard join command on workers
```

#### Certificate management

```bash
kubeadm certs check-expiration
sudo kubeadm certs renew all
sudo systemctl restart kubelet
```

> Set a calendar reminder every 11 months — kubeadm certs expire after 1 year and break the cluster silently.

#### Cluster upgrade

```bash
sudo kubeadm upgrade plan
sudo kubeadm upgrade apply v1.31.0
nix-env -iA nixpkgs.kubelet nixpkgs.kubectl && sudo systemctl restart kubelet
kubectl drain <worker-node> --ignore-daemonsets --delete-emptydir-data
# On worker: sudo kubeadm upgrade node && sudo systemctl restart kubelet
kubectl uncordon <worker-node>
```

#### Join workers

```bash
kubeadm token create --print-join-command   # regenerate join command if needed
sudo kubeadm join <control-plane-ip>:6443 \
  --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash> \
  --cri-socket=unix:///run/containerd/containerd.sock
```

---

## Disk Layout & CLI Tools

```
/var/lib/rancher/k3s/    ← k3s data, etcd snapshots
/var/lib/k0s/            ← k0s data
~/.kube/config           ← kubeconfig (in @home, survives OS updates)
~/.config/helm/          ← Helm repos and release cache
~/k8s/                   ← your manifests, values files, helmfile.yaml
```

#### Install all CLI tools — Nix (primary)

```bash
nix-env -iA nixpkgs.kubectl nixpkgs.kubernetes-helm nixpkgs.k9s \
  nixpkgs.argocd nixpkgs.fluxcd nixpkgs.velero nixpkgs.kubeseal \
  nixpkgs.kind nixpkgs.minikube nixpkgs.clusterctl nixpkgs.talosctl \
  nixpkgs.cilium-cli nixpkgs.hubble nixpkgs.krew nixpkgs.tekton-client \
  nixpkgs.helmfile nixpkgs.cosign nixpkgs.trivy nixpkgs.linkerd
```

**Snap alternatives** (for `kubectl` and `helm` only):
```bash
snap install kubectl --classic && snap install helm --classic
```

> `k9s` on Snap is unmaintained — use Nix. `argocd`, `flux`, `velero`, `kubeseal` are Nix-only.

#### Kubectl plugins (krew)

```bash
nix-env -iA nixpkgs.krew
kubectl krew update

kubectl krew install ctx         # kubectl ctx — switch contexts fast
kubectl krew install ns          # kubectl ns — switch namespaces
kubectl krew install neat        # clean kubectl get -o yaml output
kubectl krew install tree        # resource ownership tree
kubectl krew install whoami      # show current auth identity
kubectl krew install node-shell  # shell into a node
kubectl krew install df-pv       # disk usage of PersistentVolumes
kubectl krew install images      # list all container images in cluster
kubectl krew install konfig      # merge/split kubeconfig files
kubectl krew install gadget      # eBPF-based cluster debugging (Inspektor Gadget)
kubectl krew install stern       # multi-pod log tailing (alternative: via nix)
kubectl krew install popeye      # cluster resource linter
kubectl krew install score       # Kubernetes manifest quality scoring

kubectl ctx k3s-homelab
kubectl ns monitoring
kubectl tree deployment myapp
kubectl neat get pod myapp-xyz
kubectl df-pv
```

#### stern — multi-pod log tailing

`stern` tails logs from multiple pods simultaneously, with coloured output and regex filtering. Installed via Nix (preferred) or the krew `stern` plugin.

```bash
nix-env -iA nixpkgs.stern

# Tail all pods matching a regex
stern myapp -n myapp

# Tail across namespaces
stern myapp -A

# Filter by container
stern myapp -c api -n myapp

# Tail with timestamps and JSON parsing
stern myapp -n myapp --timestamps --output json | jq '.message'

# Tail only error logs
stern myapp -n myapp -i "error|ERROR|WARN"

# Tail since a time window
stern myapp -n myapp --since 1h
```

#### k9s — TUI cluster dashboard

```bash
nix-env -iA nixpkgs.k9s
k9s
```

Key bindings inside k9s:

| Key | Action |
|-----|--------|
| `:pod` | Switch to pods view |
| `:ns` | Switch namespace |
| `:ctx` | Switch context |
| `l` | Logs |
| `s` | Shell exec |
| `d` | Describe |
| `e` | Edit YAML |
| `Ctrl+d` | Delete |
| `Shift+f` | Port-forward |
| `?` | All shortcuts |
| `/` | Filter |
| `x` | Decode secrets |

---

