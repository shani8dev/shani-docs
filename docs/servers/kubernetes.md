---
title: Kubernetes & Container Orchestration
section: Self-Hosting & Servers
updated: 2026-04-27
version: 2.0
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal`. When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway`. All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.

# Kubernetes & Container Orchestration

Lightweight and production-grade Kubernetes distributions, cluster management, GitOps, progressive delivery, ingress, storage, security, and observability — all self-hosted on this system.

> ⚠️ **Prerequisites**: Kubernetes requires `vm.max_map_count=524288` and sufficient RAM (2 GB minimum per node, 4 GB+ recommended). Some distributions need `br_netfilter` and IP forwarding enabled. CLI tools (`kubectl`, `helm`, `k9s`, etc.) install via **Nix** (primary) or **Snap** as a fallback. k3s and MicroK8s bundle their own `kubectl` — you only need a separate install for standalone or remote-cluster access.

> **Immutable OS note:** On systems with a read-only OS root, the curl-based installers for k3s, k0s, and RKE2 default to writing their binaries to `/usr/local`. All three support an environment variable to redirect to `~/.local/bin`. Add it to PATH once:
> ```bash
> echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
> ```

---

## Table of Contents

**Core Concepts & Distributions**
1. [Key Concepts](#key-concepts)
2. [Distributions](#distributions)
3. [Disk Layout & CLI Tools](#disk-layout--cli-tools)

**Networking**
4. [Networking & Ingress](#networking--ingress)
5. [DNS](#dns)
6. [TLS & Certificate Management](#tls--certificate-management)
7. [Service Mesh](#service-mesh)
8. [Gateway API — Advanced Patterns](#gateway-api--advanced-patterns)
9. [NetworkPolicy — Default Deny Patterns](#networkpolicy--default-deny-patterns)
10. [MetalLB (Bare-Metal LoadBalancer)](#metallb-bare-metal-loadbalancer)
11. [ExternalDNS](#externaldns-automatic-dns-from-services--ingresses)
12. [ingress-nginx](#ingress-nginx-classic-ingress-controller)

**Storage**
13. [Storage](#storage)
14. [VolumeSnapshots (CSI Snapshots)](#volumesnapshots-csi-snapshots)
15. [NFS & Shared Storage](#nfs--shared-storage)
16. [MinIO (Self-Hosted S3)](#minio-self-hosted-s3)

**Security**
17. [Security & Policy](#security--policy)
18. [Secrets Management](#secrets-management)
19. [Cluster Hardening](#cluster-hardening)
20. [Image Supply Chain Security](#image-supply-chain-security)
21. [SPIFFE/SPIRE — Workload Identity](#spiffespire--workload-identity)
22. [kube-bench (CIS Benchmark)](#kube-bench-cis-kubernetes-benchmark)

**Workloads & Scheduling**
23. [Workload Patterns](#workload-patterns)
24. [Pod Affinity & Anti-Affinity](#pod-affinity--anti-affinity)
25. [Init Containers & Sidecar Patterns](#init-containers--sidecar-patterns)
26. [Workload Patterns (Advanced)](#workload-patterns-advanced)
27. [Deployment Strategies Deep Dive](#deployment-strategies-deep-dive)
28. [Autoscaling](#autoscaling)
29. [VPA — Vertical Pod Autoscaler](#vpa--vertical-pod-autoscaler)
30. [Prometheus Adapter (Custom Metrics for HPA)](#prometheus-adapter-custom-metrics-for-hpa)
31. [GPU & AI/ML Workloads](#gpu--aiml-workloads)

**GitOps & Delivery**
32. [GitOps & Continuous Delivery](#gitops--continuous-delivery)
33. [Advanced GitOps Patterns](#advanced-gitops-patterns)
34. [Progressive Delivery](#progressive-delivery)
35. [In-Cluster CI/CD & Build](#in-cluster-cicd--build)
36. [Forgejo (Self-Hosted Git)](#forgejo-self-hosted-git)
37. [Woodpecker CI](#woodpecker-ci-lightweight-in-cluster-ci)
38. [Local Development & Cluster Intercept](#local-development--cluster-intercept)
39. [Policy as Code — CI Gates](#policy-as-code--ci-gates)

**Observability**
40. [Observability](#observability)
41. [Grafana Dashboards as Code](#grafana-dashboards-as-code)
42. [Thanos (Long-Term Metrics Storage)](#thanos-long-term-metrics-storage)
43. [Alerting & On-Call](#alerting--on-call)
44. [SLO Management](#slo-management)

**Operations & Reliability**
45. [Backup & Disaster Recovery](#backup--disaster-recovery)
46. [Restic (Off-Cluster File Backup)](#restic-off-cluster-file-backup)
47. [etcd Operations & Disaster Recovery](#etcd-operations--disaster-recovery)
48. [Cost Management & Resource Efficiency](#cost-management--resource-efficiency)
49. [Cluster Upgrade Strategies](#cluster-upgrade-strategies)
50. [Network Troubleshooting](#network-troubleshooting)
51. [Multi-Architecture Builds](#multi-architecture-builds)

**Platform & Multi-Cluster**
52. [Platform Engineering](#platform-engineering)
53. [Operator Pattern & Custom Resources](#operator-pattern--custom-resources)
54. [Cluster Management UIs](#cluster-management-uis)
55. [Multi-Tenancy & Audit](#multi-tenancy--audit)
56. [Multi-Cluster](#multi-cluster)
57. [Kubelet Eviction Thresholds](#kubelet-eviction-thresholds)
58. [kubeconfig Management](#kubeconfig-management)
59. [Cluster API (CAPI)](#cluster-api-capi)
60. [KubeVirt — VMs in Kubernetes](#kubevirt--vms-in-kubernetes)
61. [WebAssembly (WASM) Workloads](#webassembly-wasm-workloads)

**Tooling Reference**
62. [Helm — Advanced Usage](#helm--advanced-usage)
63. [Deprecated API Migration](#deprecated-api-migration)
64. [kubectl Power Usage](#kubectl-power-usage)
65. [Daily Operations](#daily-operations)
66. [Container Runtime Debugging (crictl)](#container-runtime-debugging-crictl)
67. [Caddy Configuration Reference](#caddy-configuration-reference)
68. [Troubleshooting](#troubleshooting)
69. [Troubleshooting — Advanced Debug Flows](#troubleshooting--advanced-debug-flows)

**Registries**
70. [Zot (Lightweight OCI Registry)](#zot-lightweight-oci-registry)
71. [Beyla (eBPF Auto-Instrumentation)](#beyla-ebpf-auto-instrumentation--no-code-changes)

**Additional Tooling**
72. [Robusta — Kubernetes Operations Platform](#robusta--kubernetes-operations-platform)
73. [Dagger — Portable CI Engine](#dagger--portable-ci-engine)
74. [Buildpacks & Image Build Strategies](#buildpacks--image-build-strategies)

---

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
2. API server authenticates (cert/token), authorises (RBAC), then admits (Kyverno/OPA webhooks)
3. Object is persisted to etcd
4. The relevant controller's reconciliation loop detects the change (via informer/watch)
5. The controller creates/updates child objects (ReplicaSet → Pods)
6. Scheduler assigns pods to nodes
7. kubelet on the node creates containers via the container runtime

> **Server-side apply (SSA):** `kubectl apply --server-side` moves the field ownership tracking to the API server. Preferred for GitOps — prevents field manager conflicts when multiple tools (ArgoCD, Helm, kubectl) manage overlapping objects. Use `--force-conflicts` to take ownership of conflicting fields.

#### Pod lifecycle states

| State | Meaning |
|-------|---------|
| `Pending` | Scheduled but not yet running (pulling image or waiting for node) |
| `Running` | At least one container is running |
| `Succeeded` | All containers exited with code 0 (for Jobs) |
| `Failed` | All containers exited, at least one non-zero |
| `Unknown` | Node communication lost |
| `CrashLoopBackOff` | Container repeatedly crashes; kubelet backs off exponentially |

#### Kubernetes networking model

1. Every pod gets a unique cluster-routable IP — no port mapping needed between pods
2. Pods on a node can communicate with all pods on all nodes without NAT
3. Agents on a node can communicate with all pods on that node
4. Pods don't know or care about their host IP

Network Policies are a **whitelist** — once you apply one to a pod, only explicitly allowed traffic is permitted. Production pattern: default-deny-all per namespace, then explicit ingress/egress rules.

#### Service types

| Type | Scope | Notes |
|------|-------|-------|
| `ClusterIP` | In-cluster only | Default |
| `NodePort` | External via `nodeIP:nodePort` | Static port on every node |
| `LoadBalancer` | Cloud LB or Cilium LB / MetalLB on bare-metal | Provisions LB IP |
| `ExternalName` | CNAME to external DNS | No proxying |
| `Headless` (`clusterIP: None`) | DNS returns pod IPs directly | Used by StatefulSets |

#### Resources: requests vs limits

`resources.requests` is what the scheduler uses to decide which node can fit the pod. `resources.limits` is enforced at runtime by cgroups — exceed the memory limit and the pod is OOMKilled.

**Golden path:** set requests to typical usage, limits to burst ceiling. Avoid setting neither (scheduler has no information) or `requests == limits` for memory (prevents the kernel reclaiming unused pages).

#### Taints, tolerations, and affinity

A **taint** marks a node as unsuitable for pods that don't explicitly tolerate it. A **toleration** allows a pod to be scheduled on a tainted node. Example: taint GPU nodes with `gpu=true:NoSchedule`; only pods that tolerate it get scheduled there.

**Node affinity:** `preferredDuringSchedulingIgnoredDuringExecution` = soft preference; `requiredDuringScheduling...` = hard requirement.

#### Probes

| Probe | Failure action | Use case |
|-------|---------------|----------|
| `livenessProbe` | kubelet kills and restarts the container | Deadlock detection |
| `readinessProbe` | Pod removed from Service endpoints | Startup delays, temporary unhealthiness |
| `startupProbe` | Disables liveness/readiness until it passes | Slow-starting apps |

#### ConfigMap vs Secret

Both are key-value stores. ConfigMaps are for non-sensitive configuration. Secrets are base64-encoded — **not** encrypted by default. Use ESO + OpenBao or Sealed Secrets for encryption at rest. Volume mounts are preferred over env vars so secrets can be rotated without a pod restart.

#### StatefulSets vs Deployments

**Deployments** assume pods are stateless and interchangeable. **StatefulSets** provide: stable pod names (`pod-0`, `pod-1`), stable DNS, ordered startup/shutdown, and per-pod PVCs. Use StatefulSets for databases, Kafka, ZooKeeper. Rolling updates are slower (one pod at a time) and PVCs are not auto-deleted on scale-down.

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

Before any object is persisted to etcd, it passes through admission controllers. **Mutating** webhooks modify the object (inject sidecars, add labels, set defaults). **Validating** webhooks can reject it (block unsigned images, prevent privileged containers). Tools: Kyverno, OPA/Gatekeeper.

#### Persistent storage — the CSI model

Container Storage Interface (CSI) is the plugin standard. A CSI driver (Longhorn, Rook-Ceph, AWS EBS) implements Create/Attach/Mount. PersistentVolumeClaims are requests for storage. Access modes: `ReadWriteOnce` (one node), `ReadWriteMany` (NFS or Ceph FS), `ReadOnlyMany`.

#### eBPF — the technology behind Cilium

eBPF lets programs run in the Linux kernel safely without kernel modules. Cilium uses eBPF to implement networking, security, and observability at the kernel level — bypassing iptables entirely, enforcing L7 HTTP/gRPC/DNS policies, and exporting flow data to Hubble with lower overhead than any userspace proxy.

#### GitOps mental model

Git is the single source of truth for cluster state. CI builds images and pushes a commit to the manifests repo. ArgoCD/Flux detects the diff and syncs the cluster. Rollback = `git revert`. Audit trail = git history.

```
Code repo → CI (build/test/push image) → update image tag in manifests repo
Manifests repo → ArgoCD/Flux detects diff → syncs cluster → Argo Rollouts canary
```

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

### minikube (Local Dev — Podman Driver)

```bash
nix-env -iA nixpkgs.minikube  # or: snap install minikube
minikube start --driver=podman --container-runtime=containerd
minikube dashboard
minikube service myapp --url
minikube image load myapp:latest
minikube addons enable ingress metrics-server
minikube pause / minikube unpause
minikube stop && minikube delete
```

> Use **kind** for multi-node CI clusters. Use **minikube** for a richer local dev experience with addons and a dashboard.

---

### kind (Kubernetes in Podman — Dev/CI)

```bash
nix-env -iA nixpkgs.kind
export KIND_EXPERIMENTAL_PROVIDER=podman
kind create cluster --name homelab

cat > ~/kind-multinode.yaml << 'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
EOF
kind create cluster --name homelab --config ~/kind-multinode.yaml

kind load docker-image myapp:latest --name homelab
kind delete cluster --name homelab
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

### Cluster API (CAPI) — Declarative Cluster Lifecycle

**Purpose:** Provision and manage Kubernetes clusters using CRDs — define a `Cluster` resource and CAPI provisions control plane + worker nodes on your chosen infrastructure provider (Hetzner, AWS, vSphere).

> Full install, cluster generation, upgrade, and scaling commands are in [Cluster API (CAPI)](#cluster-api-capi).

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

## Networking & Ingress

### Cilium (eBPF CNI — Primary)

**Purpose:** High-performance CNI built on eBPF. Replaces Flannel, Calico, and kube-proxy in one Helm chart. Enforces NetworkPolicies at the kernel level (no iptables), provides L7 HTTP/gRPC/DNS-aware policy, transparent WireGuard node-to-node encryption, and Hubble for real-time flow observability.

> **Why Cilium over Flannel/Calico:** Flannel is L3-only with zero observability. Calico adds BGP but still relies on iptables. Cilium replaces both plus kube-proxy with a single eBPF stack: faster packet processing, L7 policy without sidecars, built-in flow inspection via Hubble, and optional Gateway API support.

#### Install k3s without Flannel/kube-proxy first

See [k3s install](#k3s-lightweight-cncf-kubernetes) — `--flannel-backend=none --disable-kube-proxy --disable-network-policy` are required before installing Cilium.

#### Install Cilium

```bash
nix-env -iA nixpkgs.cilium-cli nixpkgs.hubble

helm repo add cilium https://helm.cilium.io/
helm upgrade --install cilium cilium/cilium \
  --version 1.17.0 \
  --namespace kube-system \
  -f ~/k8s/cilium-values.yaml

cilium status
cilium connectivity test
```

```yaml
# ~/k8s/cilium-values.yaml
kubeProxyReplacement: true
k8sServiceHost: "127.0.0.1"           # k3s API server on localhost
k8sServicePort: "6443"

# Native routing — bypasses iptables entirely
routingMode: native
autoDirectNodeRoutes: true
ipv4NativeRoutingCIDR: "10.42.0.0/16"  # k3s default pod CIDR

# WireGuard transparent encryption (node-to-node)
encryption:
  enabled: true
  type: wireguard

# Hubble observability
hubble:
  enabled: true
  relay:
    enabled: true
  ui:
    enabled: true
  metrics:
    enabled: [dns, drop, tcp, http]

# Gateway API support (coexists with NGF)
gatewayAPI:
  enabled: true

# Built-in LB IPAM (can replace MetalLB for simple setups)
loadBalancer:
  algorithm: maglev
```

#### Firewall ports (multi-node)

```bash
# Remove Flannel VXLAN port if migrating from Flannel: --remove-port=8472/udp
sudo firewall-cmd --add-port=6443/tcp --permanent   # API server
sudo firewall-cmd --add-port=4240/tcp --permanent   # Cilium health
sudo firewall-cmd --add-port=4244/tcp --permanent   # Hubble relay
sudo firewall-cmd --add-port=4245/tcp --permanent   # Hubble peer
sudo firewall-cmd --add-port=51871/udp --permanent  # WireGuard
sudo firewall-cmd --add-port=10250/tcp --permanent  # kubelet
sudo firewall-cmd --reload
```

#### Hubble — live flow inspection

```bash
cilium hubble port-forward &

hubble observe --namespace myapp --follow
hubble observe --namespace myapp --protocol http --follow
hubble observe --verdict DROPPED --follow              # see policy denials in real time
hubble observe --from-pod myapp/frontend --to-pod myapp/backend
```

Port-forward UI: `kubectl -n kube-system port-forward svc/hubble-ui 12000:80 &`

**Caddy:** `hubble.home.local { tls internal; reverse_proxy localhost:12000 }`

#### L7 NetworkPolicy (HTTP-aware)

```yaml
# Allow only specific HTTP methods — standard NetworkPolicy cannot do this
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: myapp
spec:
  endpointSelector:
    matchLabels:
      app: backend
  ingress:
    - fromEndpoints:
        - matchLabels:
            app: frontend
      toPorts:
        - ports:
            - port: "8080"
              protocol: TCP
          rules:
            http:
              - method: GET
                path: /api/.*
              - method: POST
                path: /api/orders
```

#### DNS-aware egress policy

```yaml
# Lock down which external hosts a pod can call
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: myapp-egress
  namespace: myapp
spec:
  endpointSelector:
    matchLabels:
      app: backend
  egress:
    - toFQDNs:
        - matchName: "api.stripe.com"
        - matchPattern: "*.amazonaws.com"
    - toEndpoints:
        - matchLabels:
            k8s:io.kubernetes.pod.namespace: kube-system
      toPorts:
        - ports:
            - port: "53"
              protocol: UDP
```

#### Migrating from Flannel to Cilium

```bash
sudo k3s etcd-snapshot save --name pre-cilium-$(date +%Y%m%d)

# On each node — remove stale CNI config
sudo rm /etc/cni/net.d/10-flannel.conflist
sudo ip link delete flannel.1 2>/dev/null || true
sudo ip link delete cni0 2>/dev/null || true

# Edit /etc/rancher/k3s/config.yaml — add:
# flannel-backend: "none"
# disable-kube-proxy: true
# disable-network-policy: true
sudo systemctl restart k3s

helm upgrade --install cilium cilium/cilium --namespace kube-system -f ~/k8s/cilium-values.yaml
cilium status --wait
```

---

## NetworkPolicy — Default Deny Patterns

### Standard NetworkPolicy (L3/L4)

Cilium enforces these natively alongside `CiliumNetworkPolicy`.

```yaml
# Default deny all ingress for a namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: production
spec:
  podSelector: {}
  policyTypes: [Ingress]
---
# Allow only same-namespace traffic + DNS egress (multi-tenant pattern)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-cross-namespace
  namespace: team-a
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - podSelector: {}
  egress:
    - to:
        - podSelector: {}
    - ports:
        - port: 53
          protocol: UDP
```

---

### MetalLB (Bare-Metal Load Balancer)

**Purpose:** LoadBalancer service support for bare-metal when Cilium's built-in LB IPAM is not sufficient (e.g. when BGP to a real router is needed).

```bash
helm repo add metallb https://metallb.github.io/metallb
helm install metallb metallb/metallb --namespace metallb-system --create-namespace
```

```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: homelab-pool
  namespace: metallb-system
spec:
  addresses:
    - 192.168.1.200-192.168.1.220
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: homelab-l2
  namespace: metallb-system
spec:
  ipAddressPools:
    - homelab-pool
```

> For simple homelab setups, Cilium's built-in `CiliumLoadBalancerIPPool` + `CiliumL2AnnouncementPolicy` replaces MetalLB entirely.

---

### Cilium LB IPAM + L2 Announcement (MetalLB Alternative)

**Purpose:** Cilium's built-in LoadBalancer IP pool — assigns external IPs from your LAN to `LoadBalancer` Services using Layer 2 ARP (like MetalLB L2 mode) or BGP. No additional component needed if you're already running Cilium.

```bash
# Ensure Cilium was installed with L2 announcements enabled
helm upgrade cilium cilium/cilium --namespace kube-system --reuse-values \
  --set l2announcements.enabled=true \
  --set externalIPs.enabled=true \
  --set k8sClientRateLimit.qps=50 \
  --set k8sClientRateLimit.burst=100
```

```yaml
# ~/k8s/cilium-lb-pool.yaml
apiVersion: cilium.io/v2alpha1
kind: CiliumLoadBalancerIPPool
metadata:
  name: homelab-pool
spec:
  cidrs:
    - cidr: 192.168.1.200/29   # 192.168.1.200–207 (8 IPs from your LAN)
  serviceSelector:              # optional: only assign to services with this label
    matchLabels:
      expose: external
---
apiVersion: cilium.io/v2alpha1
kind: CiliumL2AnnouncementPolicy
metadata:
  name: homelab-l2
spec:
  serviceSelector:
    matchLabels:
      expose: external
  nodeSelector:
    matchLabels:
      kubernetes.io/os: linux
  interfaces:
    - eth0              # your node's LAN interface
  externalIPs: true
  loadBalancerIPs: true
```

```bash
kubectl apply -f ~/k8s/cilium-lb-pool.yaml

# Any Service with expose=external label now gets a LAN IP
kubectl get svc -A | grep LoadBalancer

# Verify Cilium ARP announcements
kubectl exec -n kube-system ds/cilium -- cilium l2-responder list
```

> **Cilium BGP** (for peering with a router): enable `bgpControlPlane.enabled=true` in Cilium values and create a `CiliumBGPPeeringPolicy` CRD — better for environments with a proper BGP router (OPNsense, pfSense, a dedicated switch).

---

### Gateway API

The official successor to `Ingress`. Declarative, annotation-free routing. Supported by ingress-nginx, NGF, and Cilium.

```bash
# Standard channel
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/latest/download/standard-install.yaml
# Experimental (adds TCPRoute, TLSRoute, etc.)
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/latest/download/experimental-install.yaml
```

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: main
  namespace: default
spec:
  gatewayClassName: nginx
  listeners:
    - name: http
      port: 80
      protocol: HTTP
    - name: https
      port: 443
      protocol: HTTPS
      tls:
        mode: Terminate
        certificateRefs:
          - name: my-tls-secret
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: myapp
  namespace: default
spec:
  parentRefs:
    - name: main
  hostnames:
    - "myapp.home.local"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: myapp
          port: 80
```

> Use Gateway API for all new workloads — it is the upstream direction. Ingress and Gateway API can coexist.

---

### ingress-nginx (Classic Ingress Controller)

**Purpose:** The most widely deployed Kubernetes ingress controller. Uses `Ingress` resources (the older API, still fully supported). If you're migrating an existing cluster or need compatibility with Helm charts that ship `Ingress` manifests, ingress-nginx is the practical choice. New deployments should prefer NGF + Gateway API.

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=NodePort \
  --set controller.service.nodePorts.http=30080 \
  --set controller.service.nodePorts.https=30443 \
  --set controller.allowSnippetAnnotations=true
```

```yaml
# Basic Ingress
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
  namespace: myapp
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
spec:
  ingressClassName: nginx
  rules:
    - host: myapp.home.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp
                port:
                  number: 8080
  tls:
    - hosts:
        - myapp.home.local
      secretName: myapp-tls    # cert-manager populates this
```

```yaml
# Common useful annotations
nginx.ingress.kubernetes.io/ssl-redirect: "true"
nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
nginx.ingress.kubernetes.io/proxy-connect-timeout: "15"
nginx.ingress.kubernetes.io/rate-limit: "100"           # requests per second
nginx.ingress.kubernetes.io/rate-limit-burst-multiplier: "5"
nginx.ingress.kubernetes.io/auth-type: basic
nginx.ingress.kubernetes.io/auth-secret: basic-auth
nginx.ingress.kubernetes.io/whitelist-source-range: "192.168.1.0/24"
nginx.ingress.kubernetes.io/backend-protocol: "GRPC"    # gRPC backends
nginx.ingress.kubernetes.io/websocket-services: "myapp" # WebSocket support
cert-manager.io/cluster-issuer: letsencrypt-prod        # cert-manager integration
```

```bash
kubectl get ingressclass                          # confirm 'nginx' class exists
kubectl get ingress -A                            # list all Ingress resources
kubectl -n ingress-nginx logs -l app.kubernetes.io/name=ingress-nginx -f
kubectl -n ingress-nginx exec -it deploy/ingress-nginx-controller -- nginx -T  # dump NGINX config
```

> **NGF vs ingress-nginx:** NGF is annotation-free and uses Gateway API CRDs. ingress-nginx is annotation-heavy but has the largest ecosystem of Helm chart compatibility. Use ingress-nginx when your charts ship `Ingress` resources you can't modify.

---

**Purpose:** NGINX's Gateway API implementation. Built entirely on Gateway API CRDs — no annotations. On this system, Caddy terminates TLS on the host and forwards plain HTTP to NGF via NodePort.

#### Architecture

```
Browser → HTTPS → Caddy (host, port 443)
                   → HTTP → localhost:30080 (NodePort)
                              → NGF (GatewayClass: nginx)
                                  ├── HTTPRoute → app pods
                                  └── GRPCRoute → gRPC pods
```

#### Install

```bash
# Gateway API CRDs (v1.4.1 required by NGF v2.4.2)
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.1/standard-install.yaml
kubectl apply -f https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/v2.4.2/deploy/crds.yaml

helm upgrade --install nginx-gateway-fabric \
  oci://ghcr.io/nginx/charts/nginx-gateway-fabric \
  --version 2.4.2 \
  --namespace nginx-gateway --create-namespace \
  -f ~/k8s/ngf-values.yaml --wait
```

```yaml
# ~/k8s/ngf-values.yaml
nginxGateway:
  gatewayClassName: nginx
  replicas: 1
  gwAPIExperimentalFeatures:
    enable: false   # GRPCRoute is GA — not needed
  resources:
    requests: { cpu: 200m, memory: 256Mi }
    limits: { cpu: 500m, memory: 512Mi }
nginx:
  replicas: 1
  autoscaling:
    enable: false
  container:
    resources:
      requests: { cpu: 200m, memory: 256Mi }
      limits: { cpu: 1000m, memory: 1Gi }
```

#### Expose via NodePort

```bash
kubectl -n nginx-gateway patch svc nginx-gateway-nginx \
  --type='json' \
  -p='[{"op":"replace","path":"/spec/type","value":"NodePort"},
       {"op":"add","path":"/spec/ports/0/nodePort","value":30080}]'

kubectl -n nginx-gateway get svc nginx-gateway-nginx   # PORT(S): 80:30080/TCP
```

#### Gateway and HTTPRoute

```yaml
# ~/k8s/ngf-gateway.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: nginx-gateway
  namespace: nginx-gateway
spec:
  gatewayClassName: nginx
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces:
          from: All
```

```yaml
# ~/k8s/ngf-httproute-myapp.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: myapp-route
  namespace: nginx-gateway
spec:
  parentRefs:
    - name: nginx-gateway
      namespace: nginx-gateway
      sectionName: http
  hostnames:
    - myapp.home.local
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: myapp
          namespace: myapp-ns    # cross-namespace — needs ReferenceGrant
          port: 8080
```

```yaml
# ~/k8s/ngf-httproute-argocd.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: argocd-route
  namespace: nginx-gateway
spec:
  parentRefs:
    - name: nginx-gateway
      namespace: nginx-gateway
      sectionName: http
  hostnames:
    - argocd.home.local
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - name: argocd-server
          namespace: argocd
          port: 80
```

#### GRPCRoute

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GRPCRoute
metadata:
  name: order-svc-grpc
  namespace: nginx-gateway
spec:
  parentRefs:
    - name: nginx-gateway
      namespace: nginx-gateway
      sectionName: http
  hostnames:
    - order-service.internal.home.local
  rules:
    - matches:
        - method:
            type: Exact
            service: order.v1.OrderService
      backendRefs:
        - name: order-service
          namespace: services-ns
          port: 9090
```

#### ReferenceGrants (cross-namespace access)

```yaml
# Apply in EACH application namespace that NGF routes to
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-ngf-gateway
  namespace: myapp-ns
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: nginx-gateway
    - group: gateway.networking.k8s.io
      kind: GRPCRoute
      namespace: nginx-gateway
  to:
    - group: ""
      kind: Service
```

```bash
for ns in argocd myapp-ns services-ns; do
  kubectl apply -f ~/k8s/ngf-referencegrant.yaml -n $ns
done
```

#### NGF policy CRDs

| CRD | Purpose |
|-----|---------|
| `RateLimitPolicy` | Per-route rate limiting |
| `ClientSettingsPolicy` | Client→NGINX timeouts and body size |
| `ProxySettingsPolicy` | NGINX→backend proxy tuning |
| `ObservabilityPolicy` | OpenTelemetry tracing per route |
| `AuthenticationFilter` | Basic Auth per route |

```yaml
# Rate limit example
apiVersion: gateway.nginx.org/v1alpha1
kind: RateLimitPolicy
metadata:
  name: myapp-ratelimit
  namespace: nginx-gateway
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: myapp-route
  policy:
    rate: 100r/m
    burst: 20
    key: ${binary_remote_addr}
    zoneSize: 10m
    rejectCode: 429
```

#### NGF version compatibility

| NGF | Gateway API CRDs | Kubernetes |
|-----|-----------------|------------|
| v2.4.2 | v1.4.1 | 1.29–1.34 |
| v2.3.0 | v1.4.0 | 1.28–1.33 |

```bash
kubectl get gatewayclass nginx
kubectl -n nginx-gateway describe gateway nginx-gateway
kubectl get httproute -A
kubectl -n nginx-gateway logs -l app.kubernetes.io/name=nginx-gateway-fabric -f
kubectl -n nginx-gateway logs -l app.kubernetes.io/component=nginx -f

# Upgrade
helm upgrade nginx-gateway-fabric \
  oci://ghcr.io/nginx/charts/nginx-gateway-fabric \
  --version 2.4.3 --namespace nginx-gateway -f ~/k8s/ngf-values.yaml
```


---

## TLS & Certificate Management

### cert-manager (Automatic TLS)

```bash
helm repo add cert-manager https://charts.jetstack.io
helm upgrade --install cert-manager cert-manager/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true

kubectl get pods -n cert-manager
```

#### ClusterIssuer — Let's Encrypt HTTP-01 (public domains)

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: nginx
```

#### ClusterIssuer — Let's Encrypt DNS-01 via Cloudflare (wildcard certs)

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-dns
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-dns-key
    solvers:
      - dns01:
          cloudflare:
            apiTokenSecretRef:
              name: cloudflare-api-token
              key: api-token
```

```bash
kubectl create secret generic cloudflare-api-token \
  --namespace cert-manager \
  --from-literal=api-token=<your-cloudflare-token>
```

#### ClusterIssuer — internal Step-CA (home.local)

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: step-ca-internal
spec:
  acme:
    server: https://step-ca.home.local/acme/acme/directory
    email: admin@home.local
    privateKeySecretRef:
      name: step-ca-acme-key
    caBundle: <base64-encoded-step-ca-root-cert>
    solvers:
      - http01:
          ingress:
            class: nginx
```

```bash
kubectl get certificate -A
kubectl describe certificate myapp-tls -n myapp
```

### trust-manager (Distribute CA Bundles Cluster-Wide)

**Purpose:** cert-manager companion that distributes CA certificates and trust bundles as `ConfigMap` objects across namespaces. Solves the problem of apps needing to trust your internal CA (Step-CA, corporate CA) without baking certs into images.

```bash
helm upgrade --install trust-manager cert-manager/trust-manager \
  --namespace cert-manager --wait
```

```yaml
# ~/k8s/trust-bundle.yaml — distribute Step-CA root cert to all namespaces
apiVersion: trust.cert-manager.io/v1alpha1
kind: Bundle
metadata:
  name: homelab-ca-bundle
spec:
  sources:
    - secret:
        name: step-ca-root          # Secret in cert-manager namespace containing ca.crt
        key: ca.crt
    - useDefaultCAs: true           # also include system CAs
  target:
    configMap:
      key: ca-bundle.crt
    namespaceSelector:
      matchLabels:
        trust: enabled              # label namespaces that should receive the bundle
```

```bash
kubectl apply -f ~/k8s/trust-bundle.yaml

# Label a namespace to receive the bundle
kubectl label namespace myapp trust=enabled

# Verify it landed
kubectl get configmap homelab-ca-bundle -n myapp -o jsonpath='{.data.ca-bundle\.crt}' | head -5
```

```yaml
# Mount it in your app — now it trusts your internal CA
spec:
  containers:
    - name: myapp
      volumeMounts:
        - name: ca-bundle
          mountPath: /etc/ssl/certs/ca-bundle.crt
          subPath: ca-bundle.crt
  volumes:
    - name: ca-bundle
      configMap:
        name: homelab-ca-bundle
```



## Storage

### Longhorn (Distributed Block Storage)

**Purpose:** Cloud-native distributed block storage for multi-node clusters. Provides replicated `ReadWriteOnce` PVs. Recommended for k3s/RKE2 homelab clusters.

```bash
nix-env -iA nixpkgs.open-iscsi nixpkgs.nfs-utils
sudo systemctl enable --now iscsid

helm repo add longhorn https://charts.longhorn.io
helm upgrade --install longhorn longhorn/longhorn \
  --namespace longhorn-system --create-namespace \
  --set defaultSettings.defaultReplicaCount=2

kubectl -n longhorn-system get pods -w
```

```bash
# Set as default StorageClass
kubectl patch storageclass longhorn \
  -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
kubectl patch storageclass local-path \
  -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'

kubectl -n longhorn-system port-forward svc/longhorn-frontend 8080:80
```

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: myapp-data
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: longhorn
  resources:
    requests:
      storage: 10Gi
```

**Caddy:** `longhorn.home.local { tls internal; reverse_proxy localhost:8080 }`

---

### Rook-Ceph (Production Distributed Storage)

**Purpose:** Production-grade distributed storage. Rook manages Ceph, providing block storage, S3-compatible object storage, and `ReadWriteMany` filesystem. Use when you need more than Longhorn: multi-site replication, S3 buckets, or large-scale RWX.

```bash
helm repo add rook-release https://charts.rook.io/release
helm install rook-ceph rook-release/rook-ceph \
  --namespace rook-ceph --create-namespace
```

```yaml
# ~/k8s/rook-cluster.yaml
apiVersion: ceph.rook.io/v1
kind: CephCluster
metadata:
  name: rook-ceph
  namespace: rook-ceph
spec:
  cephVersion:
    image: quay.io/ceph/ceph:v18
  dataDirHostPath: /var/lib/rook
  storage:
    useAllNodes: true
    useAllDevices: true
```

```bash
kubectl apply -f ~/k8s/rook-cluster.yaml
kubectl -n rook-ceph get cephcluster
```

---

### Resource Quotas & LimitRanges

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: compute-quota
  namespace: production
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 8Gi
    limits.cpu: "8"
    limits.memory: 16Gi
    pods: "20"
---
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
    - default:
        memory: 512Mi
        cpu: 500m
      defaultRequest:
        memory: 128Mi
        cpu: 100m
      type: Container
```

---

### VolumeSnapshots (CSI Snapshots)

**Purpose:** Point-in-time snapshots of PVCs. Supported by Longhorn, Rook-Ceph, and most cloud CSI drivers. Snapshots are stored as `VolumeSnapshot` objects — clone them into new PVCs for test environments or pre-upgrade backups.

```bash
# Install snapshot CRDs and controller (required for all CSI snapshot support)
kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/external-snapshotter/master/client/config/crd/snapshot.storage.k8s.io_volumesnapshotclasses.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/external-snapshotter/master/client/config/crd/snapshot.storage.k8s.io_volumesnapshotcontents.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/external-snapshotter/master/client/config/crd/snapshot.storage.k8s.io_volumesnapshots.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/external-snapshotter/master/deploy/kubernetes/snapshot-controller/rbac-snapshot-controller.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/external-snapshotter/master/deploy/kubernetes/snapshot-controller/setup-snapshot-controller.yaml
```

```yaml
# VolumeSnapshotClass — Longhorn example
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshotClass
metadata:
  name: longhorn-snapclass
  annotations:
    snapshot.storage.kubernetes.io/is-default-class: "true"
driver: driver.longhorn.io
deletionPolicy: Delete
---
# Take a snapshot
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: myapp-data-snap-20260427
  namespace: myapp
spec:
  volumeSnapshotClassName: longhorn-snapclass
  source:
    persistentVolumeClaimName: myapp-data
```

```yaml
# Restore: create a new PVC from the snapshot
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: myapp-data-restored
  namespace: myapp
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: longhorn
  resources:
    requests:
      storage: 10Gi
  dataSource:
    name: myapp-data-snap-20260427
    kind: VolumeSnapshot
    apiGroup: snapshot.storage.k8s.io
```

```bash
kubectl get volumesnapshot -n myapp
kubectl describe volumesnapshot myapp-data-snap-20260427 -n myapp
kubectl get volumesnapshotcontent   # cluster-scoped backing object
```

---

### StorageClass Reference

Common StorageClass parameters for the distributions used in this stack:

| StorageClass | Provisioner | Access Modes | Notes |
|---|---|---|---|
| `longhorn` | `driver.longhorn.io` | RWO | Replicated block; default for k3s/RKE2 homelab |
| `local-path` | `rancher.io/local-path` | RWO | k3s built-in; not replicated — single node only |
| `rook-ceph-block` | `rook-ceph.rbd.csi.ceph.com` | RWO | Ceph RBD block; production |
| `rook-cephfs` | `rook-ceph.cephfs.csi.ceph.com` | RWX | Ceph FS; ReadWriteMany |
| `nfs-client` | `nfs.csi.k8s.io` | RWX | NFS-backed; see NFS section |

```bash
kubectl get sc                             # list all StorageClasses
kubectl describe sc longhorn               # see parameters and provisioner
kubectl get pvc -A | grep -v Bound         # find unbound PVCs (problem indicator)
```



## Security & Policy

### Kubernetes RBAC

```yaml
# Namespace-scoped read-only Role
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: myapp
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pod-reader-binding
  namespace: myapp
subjects:
  - kind: User
    name: developer@example.com
    apiGroup: rbac.authorization.k8s.io
  - kind: Group
    name: dev-team
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

```yaml
# CI/CD ServiceAccount — minimal deploy permissions
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cicd-deployer
  namespace: myapp
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: deployer
  namespace: myapp
rules:
  - apiGroups: ["apps"]
    resources: ["deployments", "statefulsets"]
    verbs: ["get", "list", "update", "patch"]
  - apiGroups: [""]
    resources: ["configmaps", "services"]
    verbs: ["get", "list", "update", "patch", "create"]
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: cicd-deployer-binding
  namespace: myapp
subjects:
  - kind: ServiceAccount
    name: cicd-deployer
    namespace: myapp
roleRef:
  kind: Role
  name: deployer
  apiGroup: rbac.authorization.k8s.io
```

```bash
kubectl auth can-i create deployments --as=system:serviceaccount:myapp:cicd-deployer -n myapp
kubectl auth can-i --list --as=system:serviceaccount:myapp:cicd-deployer -n myapp
kubectl create token cicd-deployer -n myapp --duration=8760h

# Built-in ClusterRoles — use before creating custom ones
kubectl create rolebinding myuser-edit \
  --clusterrole=edit --user=developer@example.com --namespace=myapp
# view (read-only), edit (read/write), admin (full namespace), cluster-admin (superuser — avoid for CI)
```

---

### Pod Security Admission (PSA)

**Purpose:** Kubernetes 1.25+ enforces security standards at the namespace level via labels.

| Profile | Description | Use Case |
|---------|-------------|----------|
| `privileged` | No restrictions | kube-system, CNI pods |
| `baseline` | Prevents known privilege escalations | Most workloads |
| `restricted` | Hardened; requires non-root, read-only root FS | Production apps |

```bash
kubectl label namespace myapp \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/enforce-version=latest \
  pod-security.kubernetes.io/warn=restricted \
  pod-security.kubernetes.io/audit=restricted

# Dry-run — preview what would fail before enforcing
kubectl label namespace myapp pod-security.kubernetes.io/enforce=restricted --dry-run=server
```

### SecurityContext — production hardening

```yaml
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 3000
    fsGroup: 2000
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: myapp
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: [ALL]
          add: [NET_BIND_SERVICE]    # only what is needed
      volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: cache
          mountPath: /app/cache
  volumes:
    - name: tmp
      emptyDir: {}
    - name: cache
      emptyDir: {}
```

---

### Kyverno (Kubernetes-Native Policy Engine)

**Purpose:** Write policies as YAML CRDs — no Rego. Validates, mutates, and generates resources. Simpler than OPA/Gatekeeper for most teams.

```bash
helm repo add kyverno https://kyverno.github.io/kyverno/
helm install kyverno kyverno/kyverno --namespace kyverno --create-namespace
```

```yaml
# Require resource limits on all pods
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-resource-limits
spec:
  validationFailureAction: Enforce
  rules:
    - name: check-limits
      match:
        any:
          - resources:
              kinds: [Pod]
      validate:
        message: "Resource limits are required."
        pattern:
          spec:
            containers:
              - resources:
                  limits:
                    memory: "?*"
                    cpu: "?*"
---
# Disallow privileged containers
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-privileged
spec:
  validationFailureAction: Enforce
  rules:
    - name: no-privileged
      match:
        any:
          - resources:
              kinds: [Pod]
      validate:
        message: "Privileged containers are not allowed."
        pattern:
          spec:
            containers:
              - =(securityContext):
                  =(privileged): false
---
# Auto-generate NetworkPolicy + PSS labels for every new managed namespace
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: namespace-bootstrap
spec:
  rules:
    - name: add-default-deny
      match:
        any:
          - resources:
              kinds: [Namespace]
              selector:
                matchLabels:
                  managed: "true"
      generate:
        apiVersion: networking.k8s.io/v1
        kind: NetworkPolicy
        name: default-deny-ingress
        namespace: "{{request.object.metadata.name}}"
        synchronize: true
        data:
          spec:
            podSelector: {}
            policyTypes: [Ingress]
    - name: add-pss-labels
      match:
        any:
          - resources:
              kinds: [Namespace]
              selector:
                matchLabels:
                  managed: "true"
      mutate:
        patchStrategicMerge:
          metadata:
            labels:
              pod-security.kubernetes.io/enforce: restricted
              pod-security.kubernetes.io/enforce-version: latest
```

```bash
# Creating a new namespace now auto-generates NetworkPolicy + PSS labels
kubectl create namespace myapp && kubectl label namespace myapp managed=true

kubectl get policyreport -A
kubectl describe clusterpolicyreport
kubectl apply -f policy.yaml --dry-run=server
```

---

### OPA/Gatekeeper (Rego-Based Policy Engine)

**Purpose:** More expressive than Kyverno for complex cross-resource validation and external data. Steeper learning curve (Rego language).

```bash
helm repo add gatekeeper https://open-policy-agent.github.io/gatekeeper/charts
helm install gatekeeper gatekeeper/gatekeeper --namespace gatekeeper-system --create-namespace
```

```yaml
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: k8srequiredlabels
spec:
  crd:
    spec:
      names:
        kind: K8sRequiredLabels
      validation:
        openAPIV3Schema:
          type: object
          properties:
            labels:
              type: array
              items:
                type: string
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8srequiredlabels
        violation[{"msg": msg}] {
          provided := {label | input.review.object.metadata.labels[label]}
          required := {label | label := input.parameters.labels[_]}
          missing := required - provided
          count(missing) > 0
          msg := sprintf("Missing required labels: %v", [missing])
        }
---
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sRequiredLabels
metadata:
  name: require-team-label
spec:
  match:
    kinds:
      - apiGroups: ["apps"]
        kinds: ["Deployment"]
    namespaces: [myapp, staging, production]
  parameters:
    labels: ["team", "environment"]
```

---

### Falco (Runtime Threat Detection)

**Purpose:** CNCF-graduated runtime security. Uses eBPF to inspect every syscall — detecting shell executions inside containers, unexpected file writes, privilege escalation, and unexpected outbound connections in real time.

```bash
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm install falco falcosecurity/falco \
  --namespace falco --create-namespace \
  --set driver.kind=ebpf \
  --set falcosidekick.enabled=true \
  --set falcosidekick.config.slack.webhookurl="https://hooks.slack.com/..." \
  --set falcosidekick.config.ntfy.hostport="http://ntfy.home.local" \
  --set falcosidekick.config.ntfy.topic="falco-alerts"
```

```yaml
# /etc/falco/rules.d/custom.yaml
- rule: Shell in Container
  desc: A shell was spawned in a container
  condition: >
    spawned_process and container and
    proc.name in (bash, sh, zsh, dash) and
    not proc.pname in (bash, sh, zsh)
  output: >
    Shell in container (user=%user.name container=%container.name
    image=%container.image.repository:%container.image.tag cmd=%proc.cmdline)
  priority: WARNING

- rule: Unexpected Outbound Connection
  desc: Container made an outbound connection to an unexpected IP
  condition: >
    outbound and container and
    not fd.sip in (192.168.0.0/16, 10.0.0.0/8) and
    not proc.name in (curl, wget, apt-get)
  output: >
    Unexpected outbound (container=%container.name ip=%fd.sip cmd=%proc.cmdline)
  priority: WARNING
```

```bash
kubectl logs -n falco -l app.kubernetes.io/name=falco -f
kubectl port-forward -n falco svc/falco-falcosidekick-ui 2802:2802
```

---

### kube-bench (CIS Kubernetes Benchmark)

**Purpose:** Runs the CIS Kubernetes Benchmark checks against your cluster nodes — checking API server flags, etcd permissions, kubelet config, RBAC, and more. Run after initial cluster setup and before production hardening sign-off.

```bash
# Run as a one-shot Job on the control plane node
kubectl apply -f https://raw.githubusercontent.com/aquasecurity/kube-bench/main/job.yaml
kubectl logs job/kube-bench

# Or run directly on a node (requires root)
nix-env -iA nixpkgs.kube-bench
sudo kube-bench run --targets master    # control plane checks
sudo kube-bench run --targets node      # worker node checks
sudo kube-bench run --targets etcd      # etcd checks

# Output formats
sudo kube-bench run --json | jq '.Controls[].tests[].results[] | select(.status == "FAIL")'
sudo kube-bench run --targets master --benchmark cis-1.9
```

```bash
# Quick summary of failures
sudo kube-bench 2>/dev/null | grep -E "^\[FAIL\]"
```

> Run `kube-bench` after every major cluster upgrade. For RKE2, use `--benchmark cis-1.23` — RKE2 is designed to pass out-of-the-box with minimal additional hardening.



## Secrets Management

### Sealed Secrets

**Purpose:** Encrypt Kubernetes Secrets for safe Git storage. The in-cluster controller holds the private key and decrypts at apply time.

```bash
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

nix-env -iA nixpkgs.kubeseal

kubectl create secret generic mysecret \
  --from-literal=password=changeme \
  --dry-run=client -o yaml | \
  kubeseal --format yaml > ~/k8s/mysecret-sealed.yaml

kubectl apply -f ~/k8s/mysecret-sealed.yaml
```

> Back up the sealing key: `kubectl get secret -n kube-system sealed-secrets-key -o yaml`. Losing it makes all sealed secrets unrecoverable.

---

### SOPS + age (File-Level Encryption for GitOps)

**Purpose:** Mozilla SOPS encrypts entire YAML files (or specific values) using `age` keys or cloud KMS. Unlike Sealed Secrets (Kubernetes-specific) or ESO (needs a running secrets backend), SOPS works at the file level — any tool that reads the file sees plaintext; Git sees ciphertext. Flux has native SOPS integration.

```bash
# Install
nix-env -iA nixpkgs.sops nixpkgs.age

# Generate an age key pair
age-keygen -o ~/.config/sops/age/keys.txt   # save the public key from stdout

# Configure SOPS — which keys to use for which files
cat > ~/.sops.yaml << 'EOF'
creation_rules:
  - path_regex: k8s/.*\.yaml$
    age: age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # your public key
  - path_regex: clusters/.*/secrets/.*\.yaml$
    age: >-
      age1xxxxxxxx,   # team member 1
      age1yyyyyyyy    # team member 2 (multi-recipient)
EOF
```

```bash
# Encrypt a Kubernetes Secret manifest
sops --encrypt k8s/secrets/myapp-secrets.yaml > k8s/secrets/myapp-secrets.enc.yaml
git add k8s/secrets/myapp-secrets.enc.yaml  # safe to commit

# Decrypt for local editing
sops k8s/secrets/myapp-secrets.enc.yaml     # opens in $EDITOR, re-encrypts on save

# Encrypt specific values only (leave structure readable in Git)
sops --encrypt --encrypted-regex '^(data|stringData)$' k8s/secrets/myapp-secrets.yaml
```

#### Flux SOPS Integration

Flux has native SOPS decryption — no sidecar, no webhook.

```bash
# Create the age key as a cluster secret (done once — not committed to Git)
kubectl create secret generic sops-age \
  --namespace flux-system \
  --from-file=age.agekey=$HOME/.config/sops/age/keys.txt
```

```yaml
# ~/k8s-gitops/clusters/homelab/flux-system/kustomization.yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: flux-system
  namespace: flux-system
spec:
  interval: 10m
  path: ./clusters/homelab
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  decryption:
    provider: sops
    secretRef:
      name: sops-age   # the secret created above
```

```bash
# Verify Flux is decrypting — check the Kustomization status
flux get kustomizations
kubectl describe kustomization flux-system -n flux-system
```

> **SOPS vs Sealed Secrets vs ESO:**
> - **SOPS**: file-level encryption; works with any GitOps tool; no cluster dependency for decryption setup (key is a static secret); best for Flux + age
> - **Sealed Secrets**: asymmetric encryption tied to the cluster controller; simple for `kubectl apply` workflows; controller must exist to decrypt
> - **ESO**: pulls live secrets from an external store; best when secrets rotate frequently or must be audited

---

### helm-secrets (SOPS for Helm values)

**Purpose:** Helm plugin that decrypts SOPS-encrypted values files on the fly — so you can store sensitive `values-prod.yaml` encrypted in Git and pass them directly to `helm upgrade`.

```bash
helm plugin install https://github.com/jkroepke/helm-secrets
nix-env -iA nixpkgs.sops nixpkgs.age   # if not already installed
```

```bash
# Encrypt your sensitive values file
sops --encrypt values-prod-secrets.yaml > values-prod-secrets.enc.yaml

# Use encrypted values with helm (decrypts transparently)
helm secrets upgrade myapp ./charts/myapp \
  -f values-prod.yaml \
  -f values-prod-secrets.enc.yaml

# Or with helmfile
# helmfile.yaml:
# releases:
#   - name: myapp
#     values:
#       - values-prod.yaml
#       - secrets://values-prod-secrets.enc.yaml
helmfile apply
```

> `helm-secrets` uses the `secrets://` URI prefix so helmfile knows to decrypt before passing to Helm.

---

### External Secrets Operator (ESO)

**Purpose:** Sync secrets from OpenBao, Infisical, HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager, or Azure Key Vault into native Kubernetes `Secret` objects.

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace \
  --set installCRDs=true
```

#### Connect to OpenBao

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: openbao
spec:
  provider:
    vault:
      server: "http://openbao.home.local:8200"
      path: "secret"
      version: "v2"
      auth:
        tokenSecretRef:
          name: openbao-token
          namespace: external-secrets
          key: token
```

```bash
kubectl create secret generic openbao-token \
  --namespace external-secrets \
  --from-literal=token=<your-openbao-token>
```

#### Connect to Infisical

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: infisical
spec:
  provider:
    infisical:
      auth:
        universalAuthCredentials:
          clientId:
            name: infisical-creds
            namespace: external-secrets
            key: clientId
          clientSecret:
            name: infisical-creds
            namespace: external-secrets
            key: clientSecret
      secretsScope:
        projectSlug: myproject
        environmentSlug: prod
```

#### Pull a secret from OpenBao

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: myapp-db-secret
  namespace: myapp
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: openbao
    kind: ClusterSecretStore
  target:
    name: myapp-db-credentials
    creationPolicy: Owner
  data:
    - secretKey: DB_PASSWORD
      remoteRef:
        key: myapp/database
        property: password
    - secretKey: DB_USERNAME
      remoteRef:
        key: myapp/database
        property: username
```

```bash
kubectl get externalsecret -n myapp
kubectl describe externalsecret myapp-db-secret -n myapp
```

> **Pattern:** Store all secrets in OpenBao or Infisical. Reference via `ExternalSecret` CRDs. Never put plaintext values in Kubernetes YAML — even in private Git repos.

---

## Workload Patterns

### Init Containers and Sidecars

**Init containers** run to completion before main containers start — DB migrations, waiting for dependencies, fetching config from a secret store. **Sidecar containers** run alongside the main container for its full lifetime (log shipping, metrics exporters). Kubernetes 1.29+ supports native sidecars via `initContainers[].restartPolicy: Always`.

> Full examples including native sidecars, the SIGTERM race pattern, and the Istio vs Cilium sidecar comparison are in [Init Containers & Sidecar Patterns](#init-containers--sidecar-patterns).

---

### Pod Affinity & Anti-Affinity

Control pod placement relative to other pods or node labels. The most common pattern is **hard anti-affinity** — preventing two replicas from landing on the same node.

```yaml
spec:
  template:
    spec:
      affinity:
        # Hard anti-affinity — never two replicas on the same node
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector:
                matchLabels:
                  app: myapp
              topologyKey: kubernetes.io/hostname
```

> For the full pattern including soft affinity, node affinity, `kubectl label` examples, and zone spreading, see [Workload Patterns (Advanced)](#workload-patterns-advanced).

---

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

## GitOps & Continuous Delivery

### GitOps end-to-end workflow

```
Developer pushes to feature branch
  → CI runs tests (Woodpecker / Forgejo Actions)
  → CI builds image via Kaniko → pushes to Harbor
  → CI signs image with Cosign
  → CI updates image tag in GitOps manifests repo
  → ArgoCD / Flux detects the change
  → ArgoCD syncs — applies new Deployment to cluster
  → Argo Rollouts performs canary (5% → 50% → 100%)
  → Prometheus checks error rate during canary window
  → Healthy → promote. Degraded → automatic rollback.
```

**Separate app code from deployment config.** Application repo contains code; GitOps repo contains manifests or Helm values. Rollback = `git revert`. Audit trail = git history.

---

### ArgoCD (GitOps Continuous Delivery)

```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm upgrade --install argocd argo/argo-cd \
  --namespace argocd --create-namespace \
  --set server.service.type=ClusterIP

kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d

kubectl -n argocd port-forward svc/argocd-server 8180:443
```

```bash
nix-env -iA nixpkgs.argocd
argocd login localhost:8180 --username admin --insecure

argocd repo add https://git.home.local/myorg/k8s-manifests \
  --username gitea-user --password <token>
```

```yaml
# ~/k8s/argocd-app.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: homelab-apps
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://git.home.local/myorg/k8s-manifests
    targetRevision: HEAD
    path: apps/
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

**Caddy:** `argocd.home.local { tls internal; reverse_proxy localhost:8180 { transport http { tls_insecure_skip_verify } } }`

---

### Flux CD (GitOps Alternative)

```bash
nix-env -iA nixpkgs.fluxcd

flux bootstrap gitea \
  --hostname=git.home.local \
  --owner=myorg \
  --repository=k8s-gitops \
  --branch=main \
  --path=clusters/homelab \
  --token-auth

kubectl -n flux-system get pods
flux get all -A
flux reconcile source git flux-system
flux reconcile kustomization flux-system
```

---

### Kargo (Multi-Stage Promotion)

**Purpose:** Kubernetes-native promotion engine. Bridges CI (building images) and ArgoCD/Flux (deploying) with ordered promotion pipelines — dev → staging → prod — with approval gates, verification steps, and rollback.

```bash
helm repo add kargo https://charts.kargo.akuity.io
helm install kargo kargo/kargo \
  --namespace kargo --create-namespace \
  --set api.adminAccount.passwordHash="$(htpasswd -bnBC 10 '' changeme | tr -d ':\n')"

nix-env -iA nixpkgs.kargo
kargo login https://localhost:31444 --admin --password changeme
```

| Resource | Role |
|----------|------|
| `Warehouse` | Subscribes to image/chart/Git sources, produces `Freight` |
| `Freight` | Immutable versioned bundle of artifact versions |
| `Stage` | Named environment (dev, staging, prod) consuming Freight |
| `Promotion` | The act of moving Freight from one Stage to the next |

```yaml
# ~/k8s/kargo-project.yaml
apiVersion: kargo.akuity.io/v1alpha1
kind: Project
metadata:
  name: myapp
---
apiVersion: kargo.akuity.io/v1alpha1
kind: Warehouse
metadata:
  name: myapp-warehouse
  namespace: myapp
spec:
  subscriptions:
    - image:
        repoURL: harbor.home.local/myorg/myapp
        semverConstraint: ">=1.0.0"
        discoveryLimit: 5
---
apiVersion: kargo.akuity.io/v1alpha1
kind: Stage
metadata:
  name: dev
  namespace: myapp
spec:
  requestedFreight:
    - origin:
        kind: Warehouse
        name: myapp-warehouse
      sources:
        direct: true
  promotionTemplate:
    spec:
      steps:
        - uses: git-clone
          config:
            repoURL: https://git.home.local/myorg/k8s-manifests
            checkout: [{ branch: main, path: ./src }]
        - uses: kustomize-set-image
          config:
            path: src/overlays/dev
            images: [{ image: harbor.home.local/myorg/myapp }]
        - uses: git-commit
          config: { path: ./src }
        - uses: git-push
          config: { path: ./src }
        - uses: argocd-update
          config:
            apps: [{ name: myapp-dev, sources: [{ repoURL: https://git.home.local/myorg/k8s-manifests }] }]
---
apiVersion: kargo.akuity.io/v1alpha1
kind: Stage
metadata:
  name: staging
  namespace: myapp
spec:
  requestedFreight:
    - origin:
        kind: Warehouse
        name: myapp-warehouse
      sources:
        stages: [dev]    # only promotes after dev succeeds
  promotionTemplate:
    spec:
      steps:
        - uses: git-clone
          config: { repoURL: https://git.home.local/myorg/k8s-manifests, checkout: [{ branch: main, path: ./src }] }
        - uses: kustomize-set-image
          config: { path: src/overlays/staging, images: [{ image: harbor.home.local/myorg/myapp }] }
        - uses: git-commit
          config: { path: ./src }
        - uses: git-push
          config: { path: ./src }
        - uses: argocd-update
          config: { apps: [{ name: myapp-staging }] }
---
apiVersion: kargo.akuity.io/v1alpha1
kind: Stage
metadata:
  name: prod
  namespace: myapp
spec:
  requestedFreight:
    - origin:
        kind: Warehouse
        name: myapp-warehouse
      sources:
        stages: [staging]   # approval gate before prod
  promotionTemplate:
    spec:
      steps:
        - uses: git-clone
          config: { repoURL: https://git.home.local/myorg/k8s-manifests, checkout: [{ branch: main, path: ./src }] }
        - uses: kustomize-set-image
          config: { path: src/overlays/prod, images: [{ image: harbor.home.local/myorg/myapp }] }
        - uses: git-commit
          config: { path: ./src }
        - uses: git-push
          config: { path: ./src }
        - uses: argocd-update
          config: { apps: [{ name: myapp-prod }] }
```

```bash
kubectl apply -f ~/k8s/kargo-project.yaml
kargo get freight --project myapp
kargo promote --project myapp --freight <freight-id> --stage staging
kargo get promotions --project myapp --stage prod
```

> **Kargo vs ArgoCD Image Updater:** Kargo adds ordered promotion gates, freight verification, approval workflows, and multi-source tracking. Use Kargo when you have multiple environments and need guardrails between them.

---

### Kustomize (Config Management)

```bash
kubectl apply -k ~/k8s/overlays/production/
kubectl kustomize ~/k8s/overlays/production/
```

```
~/k8s/
├── base/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── kustomization.yaml
└── overlays/
    ├── dev/        # replicas=1, reduced resources
    ├── staging/    # replicas=2
    └── prod/       # replicas=5, HPA enabled
```

```yaml
# k8s/overlays/prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
images:
  - name: myapp
    newTag: "v1.4.2"   # CI updates this via `kustomize edit set image`
patches:
  - path: patch.yaml
```

---

### Flux Image Automation

```bash
flux install --components-extra=image-reflector-controller,image-automation-controller
```

```yaml
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImageRepository
metadata:
  name: myapp
  namespace: flux-system
spec:
  image: harbor.home.local/myorg/myapp
  interval: 1m
---
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImagePolicy
metadata:
  name: myapp
  namespace: flux-system
spec:
  imageRepositoryRef:
    name: myapp
  policy:
    semver:
      range: ">=1.0.0"
---
apiVersion: image.toolkit.fluxcd.io/v1beta1
kind: ImageUpdateAutomation
metadata:
  name: myapp
  namespace: flux-system
spec:
  interval: 1m
  sourceRef:
    kind: GitRepository
    name: flux-system
  git:
    checkout:
      ref:
        branch: main
    commit:
      author:
        email: fluxcdbot@home.local
        name: fluxcdbot
      messageTemplate: "chore: update {{range .Updated.Images}}{{println .}}{{end}}"
    push:
      branch: main
  update:
    path: ./clusters/homelab
    strategy: Setters
```

---

### Flux Notifications

**Purpose:** Flux's notification-controller sends alerts to Slack, Teams, Discord, ntfy, or any webhook when reconciliations fail, succeed, or when image updates are committed. Essential for knowing when GitOps diverges or deployments break.

```bash
# Ensure notification-controller is installed (included by default)
flux check
kubectl get pods -n flux-system | grep notification
```

```yaml
# ~/k8s-gitops/clusters/homelab/flux-system/notifications.yaml

# 1. Provider — where to send alerts
apiVersion: notification.toolkit.fluxcd.io/v1beta3
kind: Provider
metadata:
  name: slack-ops
  namespace: flux-system
spec:
  type: slack
  channel: "#k8s-gitops"
  secretRef:
    name: slack-webhook-url    # kubectl create secret generic slack-webhook-url --from-literal=address=https://hooks.slack.com/...
---
# ntfy alternative (self-hosted push notifications)
apiVersion: notification.toolkit.fluxcd.io/v1beta3
kind: Provider
metadata:
  name: ntfy-flux
  namespace: flux-system
spec:
  type: ntfy
  address: http://ntfy.home.local/flux-alerts
---
# 2. Alert — which events to watch and where to send them
apiVersion: notification.toolkit.fluxcd.io/v1beta3
kind: Alert
metadata:
  name: flux-system-alert
  namespace: flux-system
spec:
  providerRef:
    name: slack-ops
  eventSeverity: error       # info | warning | error
  eventSources:
    - kind: GitRepository
      name: "*"              # all GitRepositories
    - kind: Kustomization
      name: "*"              # all Kustomizations
    - kind: HelmRelease
      name: "*"
  summary: "Flux reconciliation failure"
---
# Alert on image updates (so you know when a new image tag was auto-committed)
apiVersion: notification.toolkit.fluxcd.io/v1beta3
kind: Alert
metadata:
  name: image-update-alert
  namespace: flux-system
spec:
  providerRef:
    name: slack-ops
  eventSeverity: info
  eventSources:
    - kind: ImageUpdateAutomation
      name: "*"
```

```bash
kubectl apply -f ~/k8s-gitops/clusters/homelab/flux-system/notifications.yaml

# Check alert status
flux get alerts -n flux-system
kubectl describe alert flux-system-alert -n flux-system

# Manually trigger a test event
flux reconcile source git flux-system
```

> **Tip:** Use `eventSeverity: info` for image updates (informational) and `eventSeverity: error` for failures. Mixing them into one alert floods Slack — separate providers are cleaner.

---

## Progressive Delivery

Progressive delivery is the practice of releasing to a subset of traffic before rolling out fully.

| Strategy | Traffic Split | Rollback Speed | Cost | Best For |
|----------|-------------|---------------|------|----------|
| **Rolling Update** | Gradual pod replacement | Medium | 1× | Default; simple apps |
| **Blue/Green** | 100% flip | Instant | 2× | Zero-downtime; easy rollback |
| **Canary** | Percentage-based | Automatic on SLO breach | ~1.1× | Risk reduction; metric-gated |
| **Feature Flags** | Per-user in-app | Instant flag toggle | 1× | A/B testing; dark launches |

### Argo Rollouts

**Purpose:** Advanced deployment strategies for Kubernetes — canary, blue/green, and analysis-gated rollouts. Replaces standard `Deployment` with a `Rollout` CRD. Pairs naturally with ArgoCD.

```bash
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts \
  -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml

nix-env -iA nixpkgs.argo-rollouts
```

```yaml
# Canary rollout
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: myapp
  namespace: default
spec:
  replicas: 5
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
        - name: myapp
          image: myapp:v2
          ports:
            - containerPort: 8080
  strategy:
    canary:
      steps:
        - setWeight: 20
        - pause: { duration: 5m }
        - setWeight: 50
        - pause: {}               # manual gate — promote with kubectl argo rollouts promote
        - setWeight: 100
      canaryService: myapp-canary
      stableService: myapp-stable
```

```yaml
# Blue/Green
strategy:
  blueGreen:
    activeService: myapp-active
    previewService: myapp-preview
    autoPromotionEnabled: false
    scaleDownDelaySeconds: 30
```

```bash
kubectl argo rollouts get rollout myapp --watch
kubectl argo rollouts promote myapp
kubectl argo rollouts abort myapp
kubectl argo rollouts undo myapp
```

---

## In-Cluster CI/CD & Build

### Forgejo (Self-Hosted Git)

**Purpose:** Lightweight, self-hosted Git service — the forge this entire GitOps stack pushes to and pulls from. Forgejo is a community fork of Gitea. Stores repositories, issues, wikis, and CI configuration.

```bash
helm repo add forgejo https://codeberg.org/forgejo-contrib/forgejo-helm
helm upgrade --install forgejo forgejo/forgejo \
  --namespace forgejo --create-namespace \
  -f ~/k8s/forgejo-values.yaml
```

```yaml
# ~/k8s/forgejo-values.yaml
gitea:
  admin:
    username: admin
    email: admin@home.local
    # password set via env var GITEA__security__INSTALL_LOCK=true at first start
  config:
    server:
      DOMAIN: git.home.local
      ROOT_URL: https://git.home.local
      SSH_DOMAIN: git.home.local
    database:
      DB_TYPE: postgres
      HOST: postgres.data.svc.cluster.local:5432
      NAME: forgejo
      USER: forgejo
    cache:
      ADAPTER: redis
      HOST: redis://redis.data.svc.cluster.local:6379

persistence:
  enabled: true
  size: 20Gi
  storageClass: longhorn

postgresql-ha:
  enabled: false   # use external Postgres (CloudNativePG recommended)

redis-cluster:
  enabled: false   # use external Redis
```

```bash
# Create a repository via API
curl -X POST "https://git.home.local/api/v1/user/repos" \
  -H "Content-Type: application/json" \
  -H "Authorization: token $FORGEJO_TOKEN" \
  -d '{"name":"k8s-manifests","private":true,"auto_init":true}'

# Create a deploy key for ArgoCD / Flux
curl -X POST "https://git.home.local/api/v1/repos/myorg/k8s-manifests/keys" \
  -H "Authorization: token $FORGEJO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"argocd","key":"ssh-ed25519 AAAA...","read_only":true}'
```

**Caddy:** `git.home.local { tls internal; reverse_proxy forgejo.forgejo.svc.cluster.local:3000 { header_up Host {host} } }`

---

### Woodpecker CI (Lightweight In-Cluster CI)

**Purpose:** Lightweight, container-native CI system that integrates directly with Forgejo. Pipelines are `.woodpecker.yml` files in the repository root. Each step runs in a container — no agent to maintain.

```bash
helm repo add woodpecker https://woodpecker-ci.org/helm-charts
helm upgrade --install woodpecker woodpecker/woodpecker \
  --namespace woodpecker --create-namespace \
  -f ~/k8s/woodpecker-values.yaml
```

```yaml
# ~/k8s/woodpecker-values.yaml
# Forgejo OAuth app: Settings → Applications → OAuth2 Applications
# Redirect URI: https://ci.home.local/authorize
server:
  env:
    WOODPECKER_FORGEJO: "true"
    WOODPECKER_FORGEJO_URL: https://git.home.local
    WOODPECKER_FORGEJO_CLIENT: <oauth-client-id>
    WOODPECKER_FORGEJO_SECRET: <oauth-client-secret>
    WOODPECKER_ADMIN: admin
    WOODPECKER_HOST: https://ci.home.local
    WOODPECKER_AGENT_SECRET: <random-32-char-string>
    WOODPECKER_DATABASE_DRIVER: postgres
    WOODPECKER_DATABASE_DATASOURCE: "postgres://woodpecker:pass@postgres.data.svc:5432/woodpecker?sslmode=disable"

agent:
  env:
    WOODPECKER_SERVER: woodpecker-server.woodpecker.svc.cluster.local:9000
    WOODPECKER_AGENT_SECRET: <same-secret-as-server>
    WOODPECKER_MAX_WORKFLOWS: 4
    WOODPECKER_BACKEND: kubernetes   # run pipeline steps as Kubernetes Jobs
    WOODPECKER_BACKEND_K8S_NAMESPACE: woodpecker
    WOODPECKER_BACKEND_K8S_STORAGE_CLASS: longhorn
    WOODPECKER_BACKEND_K8S_VOLUME_SIZE: 10G
```

#### Pipeline examples

```yaml
# .woodpecker.yml — full build, scan, sign, push pipeline
when:
  branch: main
  event: push

steps:
  - name: test
    image: golang:1.23-alpine
    commands:
      - go test ./...
      - go vet ./...

  - name: build-image
    image: gcr.io/kaniko-project/executor:latest
    settings:
      registry: harbor.home.local
      repo: myorg/myapp
      tags:
        - latest
        - ${CI_COMMIT_SHA:0:8}
    secrets: [docker_config]   # registry credentials from Woodpecker secrets

  - name: scan
    image: aquasec/trivy:latest
    commands:
      - trivy image --exit-code 1 --severity HIGH,CRITICAL
          harbor.home.local/myorg/myapp:${CI_COMMIT_SHA:0:8}

  - name: sign
    image: gcr.io/projectsigstore/cosign:latest
    commands:
      - cosign sign --key env://COSIGN_KEY
          harbor.home.local/myorg/myapp:${CI_COMMIT_SHA:0:8}
    secrets: [cosign_key]

  - name: update-manifests
    image: alpine/git:latest
    commands:
      - git clone https://git.home.local/myorg/k8s-manifests /tmp/manifests
      - cd /tmp/manifests
      - sed -i "s|myapp:.*|myapp:${CI_COMMIT_SHA:0:8}|" overlays/prod/kustomization.yaml
      - git config user.email "ci@home.local"
      - git config user.name "Woodpecker CI"
      - git commit -am "chore: update myapp to ${CI_COMMIT_SHA:0:8}"
      - git push
    secrets: [gitea_token]
```

```yaml
# Parallel matrix build (multi-arch)
steps:
  - name: build-${PLATFORM}
    image: gcr.io/kaniko-project/executor:latest
    matrix:
      PLATFORM: [linux/amd64, linux/arm64]
    settings:
      platforms: ${PLATFORM}
      destination: harbor.home.local/myorg/myapp:${CI_COMMIT_SHA:0:8}-${PLATFORM##*/}
```

```bash
# Woodpecker CLI
nix-env -iA nixpkgs.woodpecker-cli

woodpecker-cli pipeline ls --repo myorg/myapp
woodpecker-cli pipeline start --repo myorg/myapp
woodpecker-cli log --repo myorg/myapp --pipeline <id> --step build-image
```

**Caddy:** `ci.home.local { tls internal; reverse_proxy woodpecker-server.woodpecker.svc.cluster.local:8000 { header_up Host {host} } }`

> **Woodpecker vs Tekton:** Woodpecker is much simpler to operate — pipelines are YAML in the repo, no PipelineRun CRDs required. Use Tekton when you need event-driven triggers via TriggerBinding/EventListener or supply chain attestation via Tekton Chains. Use Woodpecker for everything else.

---

### Tekton Pipelines

```bash
kubectl apply -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml
kubectl apply -f https://storage.googleapis.com/tekton-releases/dashboard/latest/release.yaml
kubectl apply -f https://storage.googleapis.com/tekton-releases/triggers/latest/release.yaml

nix-env -iA nixpkgs.tekton-client
kubectl -n tekton-pipelines port-forward svc/tekton-dashboard 9097:9097
```

```yaml
apiVersion: tekton.dev/v1
kind: Task
metadata:
  name: hello
spec:
  steps:
    - name: echo
      image: alpine
      script: echo "Hello from Tekton"
---
apiVersion: tekton.dev/v1
kind: PipelineRun
metadata:
  generateName: hello-run-
spec:
  pipelineRef:
    name: hello-pipeline
```

```bash
tkn pipelinerun logs -f --last
```

---

### Tekton Chains (Supply Chain Security)

**Purpose:** Adds SLSA provenance generation on top of Tekton. After a TaskRun completes, Chains captures attestations, signs them with Cosign/KMS, and stores them in an OCI registry or Rekor transparency log.

```bash
kubectl apply -f https://storage.googleapis.com/tekton-releases/chains/latest/release.yaml
cosign generate-key-pair k8s://tekton-chains/signing-secrets
cosign verify-attestation --key cosign.pub myregistry/myimage:latest
```

---

### Kaniko (In-Cluster Image Building)

**Purpose:** Build OCI images inside Kubernetes pods — no Docker daemon, no root privileges.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: build-myapp
spec:
  template:
    spec:
      containers:
        - name: kaniko
          image: gcr.io/kaniko-project/executor:latest
          args:
            - --context=git://git.home.local/myorg/myapp
            - --dockerfile=Containerfile
            - --destination=harbor.home.local/myorg/myapp:latest
            - --cache=true
            - --cache-repo=harbor.home.local/myorg/myapp-cache
          volumeMounts:
            - name: regcred
              mountPath: /kaniko/.docker
      volumes:
        - name: regcred
          secret:
            secretName: registry-credentials
            items:
              - key: .dockerconfigjson
                path: config.json
      restartPolicy: Never
```

---

### Argo Workflows (Data & ML Pipelines)

```bash
kubectl create namespace argo
kubectl apply -n argo \
  -f https://github.com/argoproj/argo-workflows/releases/latest/download/install.yaml

nix-env -iA nixpkgs.argo
argo submit -n argo --watch ~/k8s/workflow.yaml
argo list -n argo
argo logs -n argo my-workflow
```

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: data-pipeline-
spec:
  entrypoint: main
  templates:
    - name: main
      dag:
        tasks:
          - name: ingest
            template: python-step
            arguments:
              parameters: [{ name: cmd, value: "python ingest.py" }]
          - name: transform
            template: python-step
            dependencies: [ingest]
            arguments:
              parameters: [{ name: cmd, value: "python transform.py" }]
    - name: python-step
      inputs:
        parameters:
          - name: cmd
      container:
        image: python:3.12-slim
        command: [sh, -c]
        args: ["{{inputs.parameters.cmd}}"]
```

---

## Image Supply Chain Security

### Harbor (Self-Hosted OCI Registry)

**Purpose:** CNCF-graduated container registry with built-in Trivy scanning, image signing, RBAC, robot accounts, and replication. Preferred over plain Gitea/Forgejo package registry for production.

```bash
helm repo add harbor https://helm.goharbor.io
helm upgrade --install harbor harbor/harbor \
  --namespace harbor --create-namespace \
  --set expose.type=clusterIP \
  --set expose.tls.enabled=false \
  --set externalURL=https://harbor.home.local \
  --set harborAdminPassword=changeme \
  --set persistence.persistentVolumeClaim.registry.size=50Gi

kubectl -n harbor get pods -w
```

Enable Trivy scanning in Harbor UI: **Administration → Interrogation Services → Enable**. Harbor scans every image on push automatically.

```bash
# Create a robot account for CI
curl -X POST "https://harbor.home.local/api/v2.0/projects/myorg/robots" \
  -H "Content-Type: application/json" -u "admin:changeme" \
  -d '{"name":"ci-push","duration":365,"permissions":[{"kind":"project","namespace":"myorg","access":[{"resource":"repository","action":"push"},{"resource":"repository","action":"pull"}]}]}'
```

**Caddy:** `harbor.home.local { tls internal; reverse_proxy harbor-core.harbor.svc.cluster.local:80 { header_up Host {host} } }`

---

### Cosign (Container Image Signing)

**Purpose:** Cryptographically sign container images. Signatures stored in the OCI registry alongside the image. Pair with Kyverno to enforce only signed images run in production.

```bash
nix-env -iA nixpkgs.cosign

cosign generate-key-pair k8s://cosign-system/cosign

cosign sign --key cosign.key \
  --annotations "git-sha=$(git rev-parse HEAD)" \
  --annotations "build-date=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  harbor.home.local/myorg/myapp:v1.4.2

cosign verify --key cosign.pub harbor.home.local/myorg/myapp:v1.4.2
```

```yaml
# .woodpecker.yml — sign after Kaniko push
steps:
  - name: sign-image
    image: gcr.io/projectsigstore/cosign:latest
    environment:
      COSIGN_KEY:
        from_secret: cosign_private_key
    commands:
      - cosign sign --key env://COSIGN_KEY
          --annotations "git-sha=${CI_COMMIT_SHA}"
          harbor.home.local/myorg/myapp:${CI_COMMIT_SHA}
```

#### Enforce signed images with Kyverno

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-signed-images
spec:
  validationFailureAction: Enforce
  background: false
  rules:
    - name: check-image-signature
      match:
        any:
          - resources:
              kinds: [Pod]
              namespaces: [production, staging]
      verifyImages:
        - imageReferences:
            - "harbor.home.local/myorg/*"
          attestors:
            - entries:
                - keys:
                    publicKeys: |-
                      -----BEGIN PUBLIC KEY-----
                      <your-cosign-public-key>
                      -----END PUBLIC KEY-----
```

---

### Trivy (Vulnerability & IaC Scanning)

**Purpose:** CNCF-graduated all-in-one scanner for container images, Helm charts, Kubernetes manifests, Terraform/OpenTofu, and running clusters. Also generates SBOMs.

```bash
nix-env -iA nixpkgs.trivy

trivy image --severity HIGH,CRITICAL harbor.home.local/myorg/myapp:latest
trivy config ~/k8s/charts/myapp/
trivy k8s --report=summary cluster
trivy image --format cyclonedx --output myapp-sbom.json harbor.home.local/myorg/myapp:latest
trivy sbom myapp-sbom.json
```

#### Trivy Operator (continuous in-cluster scanning)

```bash
helm repo add aqua https://aquasecurity.github.io/helm-charts/
helm install trivy-operator aqua/trivy-operator \
  --namespace trivy-system --create-namespace \
  --set trivy.ignoreUnfixed=true

kubectl get vulnerabilityreports -A
kubectl get configauditreports -A
kubectl describe vulnerabilityreport <pod-name> -n myapp
```

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

## Service Mesh

### Linkerd (Lightweight mTLS Service Mesh)

**Purpose:** CNCF-graduated ultra-lightweight service mesh. Adds automatic mTLS between services, per-route observability, retries, circuit breaking, and traffic shifting — no code changes required. Uses Rust micro-proxies (`linkerd-proxy`).

> **Cilium vs Linkerd:** Cilium provides eBPF-based L7 observability and WireGuard node-to-node encryption without sidecars. Linkerd adds **per-workload** SPIFFE identity and clean per-route retry budgets via `ServiceProfile`. Use Cilium for CNI + network policy + Hubble. Add Linkerd only when you specifically need per-route retry budgets, circuit breaking, or the `linkerd viz routes` golden metrics UX.

```bash
nix-env -iA nixpkgs.linkerd

linkerd check --pre
linkerd install --crds | kubectl apply -f -
linkerd install | kubectl apply -f -
linkerd check

linkerd viz install | kubectl apply -f -
linkerd viz check
linkerd viz dashboard &
```

#### Inject the mesh

```bash
kubectl annotate namespace myapp linkerd.io/inject=enabled
kubectl get deploy myapp -n myapp -o yaml | linkerd inject - | kubectl apply -f -

linkerd -n myapp check --proxy
linkerd viz stat deploy -n myapp
linkerd viz routes deploy/myapp -n myapp
linkerd viz tap deploy/myapp -n myapp
linkerd viz edges pod -n myapp     # verify mTLS on all connections
```

#### ServiceProfile — per-route retries and timeouts

```yaml
# ~/k8s/linkerd-serviceprofile.yaml
apiVersion: linkerd.io/v1alpha2
kind: ServiceProfile
metadata:
  name: myapp.myapp.svc.cluster.local
  namespace: myapp
spec:
  routes:
    - name: POST /api/orders
      condition:
        method: POST
        pathRegex: /api/orders
      responseClasses:
        - condition:
            status:
              min: 500
              max: 599
          isFailure: true
      retryBudget:
        retryRatio: 0.2
        minRetriesPerSecond: 10
        ttl: 10s
      timeout: 2000ms
```

```bash
kubectl apply -f ~/k8s/linkerd-serviceprofile.yaml
linkerd viz routes -n myapp svc/myapp
```

#### Traffic splitting (canary via SMI)

```yaml
apiVersion: split.smi-spec.io/v1alpha2
kind: TrafficSplit
metadata:
  name: myapp-split
  namespace: myapp
spec:
  service: myapp
  backends:
    - service: myapp-stable
      weight: 90
    - service: myapp-canary
      weight: 10
```

**Caddy:** `linkerd.home.local { tls internal; reverse_proxy localhost:50750 }`

---

## Backup & Disaster Recovery

### Velero (Cluster Backup & Restore)

```bash
nix-env -iA nixpkgs.velero

cat > ~/velero-credentials << 'EOF'
[default]
aws_access_key_id=minioadmin
aws_secret_access_key=changeme
EOF

velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:latest \
  --bucket velero-backups \
  --secret-file ~/velero-credentials \
  --use-volume-snapshots=false \
  --use-node-agent \
  --backup-location-config \
    region=minio,s3ForcePathStyle=true,s3Url=http://minio.home.local:9000
```

```bash
velero backup create homelab-$(date +%Y%m%d) --include-namespaces='*'
velero backup create myapp-backup --include-namespaces myapp --ttl 720h
velero backup get
velero backup describe homelab-20260427 --details
velero backup logs homelab-20260427
```

#### Scheduled backups

```yaml
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: daily-cluster-backup
  namespace: velero
spec:
  schedule: "0 2 * * *"
  template:
    includedNamespaces: ["*"]
    excludedNamespaces: [kube-system, velero]
    storageLocation: default
    ttl: 720h
    snapshotVolumes: false
---
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: hourly-myapp-backup
  namespace: velero
spec:
  schedule: "0 * * * *"
  template:
    includedNamespaces: [myapp]
    ttl: 168h
    storageLocation: default
```

#### Restore

```bash
velero restore create --from-backup homelab-20260427
velero restore create myapp-restore \
  --from-backup homelab-20260427 \
  --include-namespaces myapp

# Restore to a different namespace (migration pattern)
velero restore create \
  --from-backup homelab-20260427 \
  --include-namespaces myapp \
  --namespace-mappings myapp:myapp-restored
```

---

### etcd Snapshots (k3s)

```bash
sudo k3s etcd-snapshot save --name homelab-$(date +%Y%m%d)
# Saved to: /var/lib/rancher/k3s/server/db/snapshots/
```

---

### Restic (Off-Cluster File Backup)

**Purpose:** Deduplicated, encrypted backup of kubeconfig, manifests, etcd snapshots, and persistent data to local disk, SFTP, S3/MinIO, or Backblaze B2. The complement to Velero (which backs up Kubernetes objects) — restic backs up the raw files.

```bash
nix-env -iA nixpkgs.restic

# Initialise a repository (MinIO example)
export AWS_ACCESS_KEY_ID=minioadmin
export AWS_SECRET_ACCESS_KEY=changeme
restic -r s3:http://minio.home.local:9000/restic-backups init

# Or initialise to a local path
restic -r /mnt/backup/restic init

# Back up kubeconfigs, manifests, and etcd snapshots
restic -r s3:http://minio.home.local:9000/restic-backups \
  --password-file ~/.restic-password \
  backup \
  ~/.kube \
  ~/k8s \
  /var/lib/rancher/k3s/server/db/snapshots/ \
  --tag k8s-homelab \
  --exclude '*.log'

# List snapshots
restic -r s3:http://minio.home.local:9000/restic-backups snapshots

# Restore a specific snapshot
restic -r s3:http://minio.home.local:9000/restic-backups \
  restore latest --target /tmp/restore --include ~/.kube

# Check repository health
restic -r s3:http://minio.home.local:9000/restic-backups check

# Prune old snapshots (keep 7 daily, 4 weekly, 12 monthly)
restic -r s3:http://minio.home.local:9000/restic-backups forget \
  --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
```

```yaml
# CronJob — automated daily backup from inside the cluster
apiVersion: batch/v1
kind: CronJob
metadata:
  name: restic-backup
  namespace: backup
spec:
  schedule: "0 3 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: restic
              image: restic/restic:latest
              command:
                - sh
                - -c
                - |
                  restic snapshots || restic init
                  restic backup /data --tag k8s-pvc
                  restic forget --keep-daily 7 --keep-weekly 4 --prune
              env:
                - name: RESTIC_REPOSITORY
                  value: s3:http://minio.minio.svc:9000/restic-backups
                - name: RESTIC_PASSWORD
                  valueFrom:
                    secretKeyRef:
                      name: restic-credentials
                      key: password
                - name: AWS_ACCESS_KEY_ID
                  valueFrom:
                    secretKeyRef:
                      name: restic-credentials
                      key: aws-access-key-id
                - name: AWS_SECRET_ACCESS_KEY
                  valueFrom:
                    secretKeyRef:
                      name: restic-credentials
                      key: aws-secret-access-key
              volumeMounts:
                - name: data
                  mountPath: /data
                  readOnly: true
          volumes:
            - name: data
              persistentVolumeClaim:
                claimName: myapp-data
```

```bash
# Backblaze B2 backend (cheap, reliable offsite)
export B2_ACCOUNT_ID=<account-id>
export B2_ACCOUNT_KEY=<app-key>
restic -r b2:my-bucket:k8s-backups init
restic -r b2:my-bucket:k8s-backups backup ~/.kube ~/k8s
```

---


### Crossplane (Kubernetes-Native IaC)

**Purpose:** Manage cloud infrastructure as Kubernetes CRDs. Define a `PostgreSQLInstance` and Crossplane provisions the actual RDS or Cloud SQL instance.

```bash
helm repo add crossplane-stable https://charts.crossplane.io/stable
helm install crossplane crossplane-stable/crossplane \
  --namespace crossplane-system --create-namespace

kubectl apply -f - <<EOF
apiVersion: pkg.crossplane.io/v1
kind: Provider
metadata:
  name: provider-hetzner
spec:
  package: xpkg.upbound.io/crossplane-contrib/provider-hetzner:latest
EOF

kubectl get providers
```

---

### LitmusChaos (Chaos Engineering)

**Purpose:** CNCF project for chaos engineering on Kubernetes. Inject pod deletion, network latency, CPU hog, memory hog, node drain — then measure SLO compliance.

> **Chaos Monkey note:** Netflix's Chaos Monkey targets AWS Auto Scaling Groups — not applicable to self-hosted Kubernetes. LitmusChaos is the correct tool here.

```bash
helm repo add litmuschaos https://litmuschaos.github.io/litmus-helm/
helm install chaos litmuschaos/litmus \
  --namespace litmus --create-namespace \
  --set portal.frontend.service.type=ClusterIP

kubectl port-forward svc/chaos-litmus-frontend-service 9091:9091 -n litmus
```

```yaml
apiVersion: litmuschaos.io/v1alpha1
kind: ChaosEngine
metadata:
  name: nginx-chaos
  namespace: default
spec:
  appinfo:
    appns: default
    applabel: "app=nginx"
    appkind: deployment
  chaosServiceAccount: litmus-admin
  experiments:
    - name: pod-delete
      spec:
        components:
          env:
            - { name: TOTAL_CHAOS_DURATION, value: "60" }
            - { name: CHAOS_INTERVAL, value: "10" }
            - { name: FORCE, value: "false" }
        probe:
          - name: check-error-rate
            type: promProbe
            mode: Continuous
            promProbe/inputs:
              endpoint: http://prometheus.monitoring.svc:9090
              query: 'sum(rate(http_requests_total{status=~"5.."}[1m])) / sum(rate(http_requests_total[1m]))'
              comparator:
                type: float
                criteria: "<="
                value: "0.01"   # fail experiment if error rate > 1%
```

```bash
kubectl apply -f ~/k8s/chaos-pod-delete.yaml
kubectl get chaosresult nginx-chaos-pod-delete -o jsonpath='{.status.experimentStatus.verdict}'
```

**Caddy:** `chaos.home.local { tls internal; reverse_proxy localhost:9091 }`

---

### Keptn (Application Lifecycle Orchestration)

**Purpose:** Event-driven orchestration for continuous deployment, SLO-based quality gates, and automated remediation. Integrates with Argo Rollouts and Prometheus.

```bash
nix-env -iA nixpkgs.keptn
helm repo add keptn https://charts.keptn.sh
helm install keptn keptn/keptn --namespace keptn --create-namespace \
  --set=control-plane.apiGatewayNginx.type=ClusterIP
kubectl -n keptn get pods
```

---

### Golden Paths (Platform Engineering Practice)

**Purpose:** Pre-built, opinionated templates for creating new services — encoding your team's best practices so developers can scaffold a production-ready service in minutes.

```bash
nix-env -iA nixpkgs.cookiecutter
cookiecutter git+https://git.home.local/platform/golden-paths.git --directory python-service
# Or use Forgejo template repositories: Settings → "Template Repository"
```

#### Runbook template (add to every service repo)

```markdown
# Runbook: {{service_name}}

#### Symptoms → Actions

| Symptom | First check | Fix |
|---------|-------------|-----|
| 5xx errors | `kubectl logs <pod>` | Check DB connectivity; restart |
| High latency | Grafana → upstream latency panel | Scale up replicas |
| OOMKilled | `kubectl describe pod` events | Increase memory limit |
| Health check failing | `curl http://localhost:PORT/health` | Check env vars; verify DB migration ran |

#### Escalation
- Primary on-call: check Grafana OnCall schedule
- Slack: #incidents
- Postmortem: file within 48 hours of resolution
```

---

### Port (Internal Developer Portal)

**Purpose:** IDP alternative to Backstage. Visual UI, integrates with GitHub/GitLab/Jira/ArgoCD/Kubernetes via webhooks.

> **Backstage vs Port:** Backstage is fully self-hosted and extensible but requires maintenance. Port is SaaS with a generous free tier — use it for a polished IDP with minimal ops overhead.

```bash
helm repo add port-labs https://port-labs.github.io/helm-charts
helm install port-k8s-exporter port-labs/port-k8s-exporter \
  --create-namespace --namespace port-k8s-exporter \
  --set secret.secrets.portClientId="YOUR_CLIENT_ID" \
  --set secret.secrets.portClientSecret="YOUR_CLIENT_SECRET"
```

---

## Cluster Management UIs

### k9s (Terminal Cluster Manager)

```bash
nix-env -iA nixpkgs.k9s
k9s
k9s -n argocd
k9s --context k3s-homelab
```

| Key | Action |
|-----|--------|
| `:pod` | Switch to pods view |
| `:deploy` | Switch to deployments |
| `l` | View logs for selected pod |
| `s` | Shell into selected pod |
| `d` | Describe resource |
| `ctrl-d` | Delete resource |
| `?` | Help / keybinding list |

---

### Headlamp (Modern Kubernetes Web UI)

```yaml
# ~/headlamp/compose.yaml
services:
  headlamp:
    image: ghcr.io/headlamp-k8s/headlamp:latest
    ports:
      - 127.0.0.1:4466:4466
    volumes:
      - ~/.kube:/root/.kube:ro
    command: -in-cluster=false -kubeconfig /root/.kube/config
    restart: unless-stopped
```

```bash
cd ~/headlamp && podman-compose up -d
```

**Caddy:** `headlamp.home.local { tls internal; reverse_proxy localhost:4466 }`

---

### Kubernetes Dashboard (Official Web UI)

```bash
helm repo add kubernetes-dashboard https://kubernetes.github.io/dashboard/
helm upgrade --install kubernetes-dashboard kubernetes-dashboard/kubernetes-dashboard \
  --namespace kubernetes-dashboard --create-namespace

kubectl -n kubernetes-dashboard port-forward svc/kubernetes-dashboard-kong-proxy 8443:443
```

```yaml
# ~/k8s/dashboard-admin.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: admin-user
  namespace: kubernetes-dashboard
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: admin-user
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: admin-user
    namespace: kubernetes-dashboard
```

```bash
kubectl apply -f ~/k8s/dashboard-admin.yaml
kubectl -n kubernetes-dashboard create token admin-user
```

**Caddy:** `k8s.home.local { tls internal; reverse_proxy localhost:8443 { transport http { tls_insecure_skip_verify } } }`

---

### Rancher (Multi-Cluster Management)

> ⚠️ Run Rancher on a **separate** host — not on a k3s/RKE2 node it manages.

```yaml
# ~/rancher/compose.yaml
services:
  rancher:
    image: rancher/rancher:latest
    ports:
      - 0.0.0.0:80:80
      - 0.0.0.0:443:443
    volumes:
      - /home/user/rancher:/var/lib/rancher:Z
    privileged: true
    restart: unless-stopped
```

```bash
cd ~/rancher && podman-compose up -d
podman logs rancher 2>&1 | grep "Bootstrap Password"
sudo firewall-cmd --add-service=http --add-service=https --permanent && sudo firewall-cmd --reload
```

---

### Lens / OpenLens (Desktop Cluster IDE)

```bash
flatpak install flathub dev.k8slens.OpenLens
```

After install, add your kubeconfig — Lens auto-detects all contexts in `~/.kube/config`.

---

## Multi-Tenancy & Audit

### vCluster (Virtual Kubernetes Clusters)

**Purpose:** Fully isolated virtual Kubernetes clusters inside a single physical cluster. Each vCluster has its own API server and etcd but runs as pods on the host. Tenants get cluster-admin on their vCluster without any access to the host.

```bash
curl -L -o ~/.local/bin/vcluster \
  "https://github.com/loft-sh/vcluster/releases/latest/download/vcluster-linux-amd64"
chmod +x ~/.local/bin/vcluster

vcluster create team-a --namespace team-a-vcluster
vcluster connect team-a --namespace team-a-vcluster

# Inside the vCluster — full admin, no host access
kubectl get nodes
kubectl create namespace myapp

vcluster disconnect
vcluster list
```

---

### Kubernetes Audit Logging

**Purpose:** Every API server request logged — who did what, when, and with what response. Essential for security investigations and compliance (SOC2, PCI).

```yaml
# /etc/kubernetes/audit-policy.yaml
apiVersion: audit.k8s.io/v1
kind: Policy
omitStages: [RequestReceived]
rules:
  - level: RequestResponse
    resources:
      - group: ""
        resources: ["secrets"]
  - level: RequestResponse
    resources:
      - group: ""
        resources: ["pods/exec", "pods/portforward", "pods/attach"]
  - level: Request
    verbs: ["create", "update", "patch", "delete"]
    resources:
      - group: apps
        resources: ["deployments", "statefulsets", "daemonsets"]
  - level: Request
    verbs: ["create", "update", "patch", "delete"]
    resources:
      - group: rbac.authorization.k8s.io
        resources: ["roles", "rolebindings", "clusterroles", "clusterrolebindings"]
  - level: Metadata
```

#### Enable in k3s

```bash
cat >> /etc/rancher/k3s/config.yaml << 'EOF'
kube-apiserver-arg:
  - "audit-log-path=/var/log/k3s/audit.log"
  - "audit-policy-file=/etc/kubernetes/audit-policy.yaml"
  - "audit-log-maxage=30"
  - "audit-log-maxbackup=10"
  - "audit-log-maxsize=100"
EOF
sudo systemctl restart k3s
```

#### Ship audit logs to Loki (Alloy config)

```yaml
loki.source.file "k3s_audit" {
  targets = [{ __path__ = "/var/log/k3s/audit.log", job = "k3s-audit" }]
  forward_to = [loki.write.default.receiver]
}
```

#### Query audit logs in Grafana (LogQL)

```logql
{job="k3s-audit"} | json | objectRef_resource="secrets" | verb="get"
{job="k3s-audit"} | json | objectRef_subresource="exec"
{job="k3s-audit"} | json | responseStatus_code >= 401
{job="k3s-audit"} | json | user_username="admin" | verb=~"create|update|patch|delete"
```

---

## Helm — Advanced Usage

### Helmfile (Declarative Multi-Chart Management)

```bash
nix-env -iA nixpkgs.helmfile
helm plugin install https://github.com/databus23/helm-diff

helmfile diff            # preview all pending changes
helmfile apply           # apply all releases in dependency order
helmfile apply --selector app=monitoring
```

```yaml
# ~/k8s/helmfile.yaml
repositories:
  - name: prometheus-community
    url: https://prometheus-community.github.io/helm-charts
  - name: grafana
    url: https://grafana.github.io/helm-charts
  - name: argo
    url: https://argoproj.github.io/argo-helm
  - name: longhorn
    url: https://charts.longhorn.io
  - name: cilium
    url: https://helm.cilium.io/

releases:
  - name: cilium
    chart: cilium/cilium
    namespace: kube-system
    version: ">=1.17.0"
    values: [~/k8s/values/cilium.yaml]
    labels: { app: networking }

  - name: kube-prometheus-stack
    chart: prometheus-community/kube-prometheus-stack
    namespace: monitoring
    createNamespace: true
    version: ">=58.0.0"
    values: [~/k8s/values/prometheus.yaml]
    labels: { app: monitoring }

  - name: loki
    chart: grafana/loki
    namespace: monitoring
    values: [~/k8s/values/loki.yaml]
    needs: [monitoring/kube-prometheus-stack]
    labels: { app: monitoring }

  - name: argocd
    chart: argo/argo-cd
    namespace: argocd
    createNamespace: true
    values: [~/k8s/values/argocd.yaml]
    labels: { app: gitops }

  - name: longhorn
    chart: longhorn/longhorn
    namespace: longhorn-system
    createNamespace: true
    values: [~/k8s/values/longhorn.yaml]
    labels: { app: storage }
```

---

### OCI Helm charts

```bash
# Install directly from OCI (no helm repo add required)
helm install myapp oci://ghcr.io/myorg/charts/myapp --version 1.2.3

helm package ./myapp-chart
helm push myapp-1.2.3.tgz oci://ghcr.io/myorg/charts/
helm registry login ghcr.io --username myuser --password <token>
```

---

### Helm schema validation

Add `values.schema.json` to your chart to validate values at install/upgrade time:

```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["image", "resources"],
  "properties": {
    "image": {
      "type": "object",
      "required": ["repository", "tag"],
      "properties": {
        "repository": { "type": "string" },
        "tag": { "type": "string", "pattern": "^v[0-9]+\\.[0-9]+\\.[0-9]+$" }
      }
    },
    "replicaCount": { "type": "integer", "minimum": 1, "maximum": 50 },
    "resources": { "type": "object", "required": ["requests", "limits"] }
  }
}
```

---

### Useful Helm commands

```bash
helm list -A                                              # all releases, all namespaces
helm get values myapp -n myapp --all                      # effective values after merge
helm template myapp ./myapp-chart -f values.yaml          # render without installing
helm diff upgrade myapp ./myapp-chart -f values.yaml -n myapp  # requires helm-diff plugin
helm rollback myapp 2 -n myapp
helm history myapp -n myapp
helm test myapp -n myapp
helm uninstall myapp -n myapp
```

---

## Daily Operations

```bash
# Context and namespace management
kubectl config get-contexts
kubectl config use-context k3s-homelab
kubectl config set-context --current --namespace=myapp
kubectl ctx k3s-homelab      # krew ctx plugin
kubectl ns monitoring        # krew ns plugin

# Resource inspection
kubectl get all -n myapp
kubectl describe pod <pod-name> -n myapp
kubectl logs <pod-name> -n myapp --previous
kubectl logs <pod-name> -n myapp -f --tail=100
kubectl get events -n myapp --sort-by='.lastTimestamp'

# Live editing and diffing
kubectl edit deployment myapp -n myapp
kubectl diff -f ~/k8s/deployment.yaml
kubectl apply -f ~/k8s/deployment.yaml

# Scaling
kubectl scale deployment myapp --replicas=3 -n myapp
kubectl rollout status deployment/myapp -n myapp
kubectl rollout history deployment/myapp -n myapp
kubectl rollout undo deployment/myapp -n myapp

# Pod exec and file operations
kubectl exec -it <pod-name> -n myapp -- /bin/sh
kubectl cp myapp/<pod-name>:/app/logs ./logs/
kubectl cp ./config.yaml myapp/<pod-name>:/app/config.yaml

# Port-forwarding
kubectl port-forward svc/myapp 8080:80 -n myapp

# Watch pods
kubectl get pods -n myapp -w

# Node maintenance
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
kubectl uncordon <node-name>
kubectl delete pods --all -n myapp
```

### API Server & Cluster Health Checks

```bash
# API server liveness / readiness / startup endpoints
# Access via kubectl proxy or directly from a node
kubectl get --raw /healthz          # overall health (ok = healthy)
kubectl get --raw /readyz           # readiness (includes each check)
kubectl get --raw /livez            # liveness
kubectl get --raw /readyz?verbose   # show individual component status

# Example readyz verbose output:
# [+] ping ok
# [+] etcd ok
# [+] informer-sync ok
# [-] poststarthook/rbac/bootstrap-roles failed — transient at startup

# Component status (deprecated in 1.19+ but still works on most clusters)
kubectl get componentstatuses

# Node conditions — spot DiskPressure, MemoryPressure, PIDPressure
kubectl get nodes -o custom-columns=\
'NAME:.metadata.name,READY:.status.conditions[-1].status,REASON:.status.conditions[-1].reason'

# Check all non-running pods cluster-wide
kubectl get pods -A --field-selector='status.phase!=Running,status.phase!=Succeeded'

# Cluster-wide resource summary
kubectl top nodes
kubectl top pods -A --sort-by=memory | head -20

# etcd health (k3s)
sudo k3s etcd-snapshot ls
kubectl -n kube-system exec -it $(kubectl -n kube-system get pods -l component=etcd -o name | head -1) \
  -- etcdctl endpoint health --cacert=/etc/kubernetes/pki/etcd/ca.crt \
     --cert=/etc/kubernetes/pki/etcd/server.crt \
     --key=/etc/kubernetes/pki/etcd/server.key
```

---

### Container Runtime Debugging (crictl)

`crictl` is the CRI-compliant CLI for interacting with containerd or CRI-O directly — bypassing Kubernetes entirely. Use it when `kubectl exec` fails, when a pod won't start due to runtime errors, or when you need to manage images at the node level.

```bash
# crictl talks to the container runtime socket — set it once
export CONTAINER_RUNTIME_ENDPOINT=unix:///run/containerd/containerd.sock
# Or for k3s:
export CONTAINER_RUNTIME_ENDPOINT=unix:///run/k3s/containerd/containerd.sock

# List running containers (bypass kubectl)
crictl ps
crictl ps -a                             # include stopped containers

# Inspect a container
crictl inspect <container-id>
crictl inspect <container-id> | jq .info.runtimeSpec.process.env

# Get logs directly from runtime (works even if pod is Terminating)
crictl logs <container-id>
crictl logs -f <container-id>            # follow

# Exec into a container (like kubectl exec, but via runtime)
crictl exec -it <container-id> /bin/sh

# List pods known to the runtime
crictl pods
crictl pods --name myapp

# Image management
crictl images                            # list all cached images
crictl rmi <image-id>                    # delete a specific image
crictl rmi --prune                       # remove all unused images (reclaim disk)
crictl pull harbor.home.local/myorg/myapp:v1.4.2  # pull without kubectl

# Inspect image layers
crictl inspecti harbor.home.local/myorg/myapp:v1.4.2

# Stop and remove a container (emergency — prefer kubectl delete pod)
crictl stop <container-id>
crictl rm <container-id>

# Check containerd snapshotter (overlayfs is default)
ctr -n k8s.io snapshots ls | head -10
```

```bash
# Containerd health check
sudo systemctl status containerd
sudo journalctl -u containerd -f

# For k3s — containerd embedded, use k3s CLI
sudo k3s ctr images ls
sudo k3s ctr containers ls
sudo k3s ctr namespaces ls      # k8s.io = Kubernetes namespace in containerd
```

> `crictl` is read-mostly safe. `crictl rm` and `crictl rmi` bypass Kubernetes garbage collection — kubelet will recreate pods it expects to be running, but use with care on production nodes.

---

## Caddy Configuration Reference

```caddyfile
# Port-forward / direct services (run kubectl port-forward before starting Caddy)
argocd.home.local   { tls internal; reverse_proxy localhost:8180 { transport http { tls_insecure_skip_verify } } }
rancher.home.local  { tls internal; reverse_proxy localhost:8443 { transport http { tls_insecure_skip_verify } } }
k8s.home.local      { tls internal; reverse_proxy localhost:8443 { transport http { tls_insecure_skip_verify } } }
grafana.home.local  { tls internal; reverse_proxy localhost:3000 }
longhorn.home.local { tls internal; reverse_proxy localhost:8080 }
headlamp.home.local { tls internal; reverse_proxy localhost:4466 }
opencost.home.local { tls internal; reverse_proxy localhost:9090 }
chaos.home.local    { tls internal; reverse_proxy localhost:9091 }
loki.home.local     { tls internal; reverse_proxy localhost:3100 }
hubble.home.local   { tls internal; reverse_proxy localhost:12000 }
linkerd.home.local  { tls internal; reverse_proxy localhost:50750 }
oncall.home.local   { tls internal; reverse_proxy localhost:8082 }

# Harbor — needs Host header passthrough
harbor.home.local {
  tls internal
  reverse_proxy harbor-core.harbor.svc.cluster.local:80 {
    header_up Host {host}
  }
}

# NGF-backed services — header_up Host is required so NGF can match HTTPRoute hostname
# Each hostname needs a matching HTTPRoute in nginx-gateway namespace
myapp.home.local {
  tls internal
  reverse_proxy localhost:30080 { header_up Host {host} }
}

argocd-ngf.home.local {
  tls internal
  reverse_proxy localhost:30080 { header_up Host {host} }
}

grafana-ngf.home.local {
  tls internal
  reverse_proxy localhost:30080 { header_up Host {host} }
}
```

> **Why `header_up Host {host}`?** NGF matches HTTPRoutes by the `Host` header. Without this, Caddy rewrites it to `localhost` and NGF returns 404 for every request.

---

## Troubleshooting

### General cluster issues

| Issue | Solution |
|-------|----------|
| `kubectl: connection refused` | `sudo systemctl status k3s`; verify kubeconfig `server:` IP |
| Node shows `NotReady` | `kubectl describe node <n>`; check CNI pods in `kube-system`; verify `br_netfilter` loaded |
| Pod stuck in `Pending` | No nodes have enough resources, or PVC not bound — check StorageClass exists |
| Pod stuck in `CrashLoopBackOff` | `kubectl logs <pod> --previous`; check env vars and volume mounts |
| Pod stuck in `ImagePullBackOff` | Image name/tag wrong; registry unreachable; missing `imagePullSecret` |
| Pod `OOMKilled` | Container exceeded memory limit — `kubectl describe pod <pod>` shows `Reason: OOMKilled`; increase `limits.memory` or reduce app memory usage; use Goldilocks to right-size |
| Pod `OOMKilled` on node startup | Node-level `vm.max_map_count` too low (Elasticsearch etc.) — set `vm.max_map_count=524288` in sysctl |
| Namespace stuck `Terminating` | Finalizers blocking deletion — `kubectl get namespace <ns> -o json \| jq '.spec.finalizers = []' \| kubectl replace --raw "/api/v1/namespaces/<ns>/finalize" -f -` |
| `etcdserver: mvcc: database space exceeded` | etcd DB too large — run compaction and defragmentation (see etcd Operations section) |
| Node `DiskPressure` | Clean up unused images: `crictl rmi --prune`; check Longhorn replica space |

---

### Distribution-specific

| Issue | Solution |
|-------|----------|
| MicroK8s `permission denied` | `sudo usermod -aG microk8s $USER` then log out/in |
| MicroK8s addon enable fails | `microk8s status`; `sudo snap logs microk8s` |
| minikube start fails with Podman driver | `systemctl --user start podman.socket`; `minikube delete` then re-create |
| minikube `ImagePullBackOff` after image load | Confirm image name matches exactly; check with `minikube image ls` |
| k3s agent not joining | Verify token matches `/var/lib/rancher/k3s/server/node-token`; check firewall allows 6443 |
| kubeadm node stays `NotReady` | CNI not installed — apply CNI manifest immediately after `kubeadm init` |
| kubeadm `certificate has expired` | `sudo kubeadm certs renew all && sudo systemctl restart kubelet` |
| kubeadm init: container runtime not running | `sudo systemctl status containerd`; verify `--cri-socket` flag |

---

### Cilium / Networking

| Issue | Solution |
|-------|----------|
| Pods can't reach each other after Cilium install | Delete stale config: `sudo rm /etc/cni/net.d/10-flannel.conflist`; restart pods |
| `hubble observe` returns no flows | `kubectl -n kube-system get pods -l k8s-app=hubble-relay` |
| L7 policy not enforced | Verify `envoy.enabled=true` (implied by Cilium 1.17+); check `cilium-envoy` DaemonSet |
| WireGuard broken after node reboot | `lsmod | grep wireguard`; `sudo modprobe wireguard` |
| kube-proxy still running | k3s not started with `--disable-kube-proxy`; reinstall with the flag |
| `cilium status` shows errors | `cilium connectivity test`; check `cilium` DaemonSet pods in `kube-system` |

---

### Ingress / Gateway

| Issue | Solution |
|-------|----------|
| Ingress returns 404 | Verify `ingressClassName: nginx` matches controller; check service name and port |
| NGF GatewayClass not Accepted | Check NGF logs; confirm Gateway API CRDs installed at correct version |
| NGF returns 404 for all requests | Add `header_up Host {host}` inside Caddy's `reverse_proxy` block |
| NGF HTTPRoute not Accepted | Check `sectionName` matches listener; verify `parentRef` namespace; check ReferenceGrant |
| Cross-namespace route returning 503 | ReferenceGrant must be in the **target** namespace; `kubectl get referencegrant -A` |
| NGF NodePort 30080 not reachable | `kubectl -n nginx-gateway get svc nginx-gateway-nginx` — confirm `80:30080/TCP` |
| NGF data plane OOMKilled | Increase `nginx.container.resources.limits.memory` to `1Gi` minimum |
| ObservabilityPolicy CRD conflict on upgrade | Re-apply `deploy/crds.yaml` from the new NGF version |

---

### Storage

| Issue | Solution |
|-------|----------|
| Longhorn volume stuck `Attaching` | `sudo systemctl status iscsid`; check Longhorn manager logs |
| Longhorn volume degraded | Replica on unavailable node — Longhorn rebuilds once node returns |
| PDB blocks node drain | `kubectl describe pdb`; temporarily patch `minAvailable: 0` if safe, then restore |

---

### GitOps & Delivery

| Issue | Solution |
|-------|----------|
| ArgoCD app OutOfSync after apply | Add `ignoreDifferences` to Application spec for server-side mutated fields |
| ArgoCD unable to connect to Forgejo | Use HTTPS; add `--insecure-skip-server-verification` for self-signed cert |
| Helm upgrade fails mid-release | `helm rollback <release> -n <ns>`; if stuck `pending-upgrade`, delete the stuck secret |
| Argo Rollouts stuck at canary weight | Verify `canaryService` and `stableService` exist; `kubectl argo rollouts get rollout myapp` |
| Kargo Warehouse not discovering images | Check image registry credentials; verify `semverConstraint` matches published tags |
| Kargo promotion stuck | `kubectl -n myapp describe promotion <n>`; verify ArgoCD app name matches stage config |

---

### Secrets

| Issue | Solution |
|-------|----------|
| Sealed secret not decrypting | Sealing key must match — never delete `sealed-secrets-key`; back it up |
| ExternalSecret stuck `SecretSyncedError` | `kubectl describe externalsecret <n>` — wrong `remoteRef.key`, bad permissions, or unreachable backend |
| ESO not refreshing secret | Decrease `refreshInterval` for testing; check ESO operator logs |

---

### Autoscaling

| Issue | Solution |
|-------|----------|
| HPA shows `<unknown>` for CPU | `resources.requests.cpu` must be set — HPA calculates `current / requested` |
| VPA and HPA conflict | Never run both on same metric (CPU/memory); HPA on external metrics + VPA for sizing |
| StatefulSet pod stuck `Terminating` | Check finalizers: `kubectl get pod <pod> -o json | jq .metadata.finalizers` |
| Init container stuck `Init:0/1` | `kubectl logs <pod> -c <init-container-name>` |

---

### Certificates

| Issue | Solution |
|-------|----------|
| cert-manager Certificate stuck `Pending` | `kubectl describe certificate <n>` → look at `CertificateRequest` and `Order` events |
| cert-manager HTTP-01 challenge failing | Domain must resolve publicly; check `kubectl get challenges -A` |
| cert-manager DNS-01 challenge failing | Check Cloudflare/provider credentials; `kubectl describe challenge -A`; verify TXT record propagated |
| cert-manager `ACME account not found` | Delete and recreate the `ClusterIssuer` privateKeySecretRef secret |
| Certificate in `Ready: False` loop | `kubectl describe certificaterequest -A`; look for rate limit errors from Let's Encrypt (429) |
| cert-manager pods crashlooping after CRD install | CRD version mismatch — reinstall with `--set installCRDs=true` or apply CRDs manually first |
| trust-manager bundle not appearing in namespace | Namespace missing `trust: enabled` label; `kubectl label namespace myapp trust=enabled` |
| Internal CA cert not trusted by pods | trust-manager Bundle not applied; check `kubectl get bundle -A` and namespace label |
| kubeadm cert expiry breaking cluster | `sudo kubeadm certs check-expiration`; renew with `sudo kubeadm certs renew all && sudo systemctl restart kubelet` |

---

### Observability

| Issue | Solution |
|-------|----------|
| k9s shows no resources | Check active namespace `:ns`; switch context `:ctx` |
| Dashboard `Unauthorized` | `kubectl -n kubernetes-dashboard create token admin-user` |
| Headlamp shows no clusters | Ensure kubeconfig mounted read-only; `server:` URL reachable from container |
| Loki shows no logs | Check Promtail/Alloy pods; verify `lokiAddress` matches Loki service name |
| Loki ingestion rate limit errors | Increase `ingestionRate` and `ingestionBurstSize` in Loki values; or reduce log volume with Promtail pipeline stages |
| Tempo shows no traces | Check OTel Collector receiving spans; verify `endpoint` in Instrumentation CRD |
| Prometheus scraping fails (`connection refused`) | Target pod has no `metrics` port; ServiceMonitor label doesn't match `serviceMonitorSelector`; check `kubectl get servicemonitor -A` |
| Grafana datasource "no data" for Prometheus | URL must be `http://kube-prometheus-stack-prometheus.monitoring.svc:9090`; test with **Explore** tab |
| AlertManager not sending | Config YAML invalid — run `amtool check-config alertmanager.yaml`; check inhibit rules aren't silencing everything |
| PrometheusRule alerts not showing in AlertManager | Labels must include `release: kube-prometheus-stack`; check `kubectl get prometheusrule -A` |
| SonarQube / Elasticsearch OOM | `vm.max_map_count=524288` on host; restart pod |

---

### etcd

| Issue | Solution |
|-------|----------|
| `etcdserver: mvcc: database space exceeded` | Run compact + defrag (see etcd Operations section); increase `--quota-backend-bytes` |
| etcd leader election constantly changing | Clock skew between nodes — ensure NTP is synced: `timedatectl status`; check `etcdctl endpoint status` |
| etcd cluster has no quorum (2 of 3 nodes down) | Force new cluster from snapshot: `k3s server --cluster-reset`; restore latest etcd snapshot |
| etcd high latency (>100ms p99) | Disk I/O contention — move etcd data to a dedicated SSD; check `etcdctl endpoint status --write-out=table` |
| k3s etcd snapshot restore fails | Ensure k3s is stopped (`systemctl stop k3s`); correct path in `--cluster-reset-restore-path`; restart k3s after reset |
| etcd `request timeout` in API server logs | etcd overloaded; check `etcd_disk_wal_fsync_duration_seconds_bucket` in Prometheus |


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

## Advanced GitOps Patterns

### ArgoCD App of Apps

**Purpose:** A single ArgoCD `Application` (the "parent") manages a directory of other `Application` manifests (the "children"). This is the standard pattern for managing many apps across many clusters from a single GitOps repo.

```
~/k8s-gitops/
├── apps/
│   ├── kustomization.yaml          ← parent Application points here
│   ├── myapp.yaml                  ← child Application
│   ├── monitoring.yaml             ← child Application
│   └── ingress.yaml                ← child Application
└── clusters/
    └── homelab/
        └── parent-app.yaml         ← the App of Apps
```

```yaml
# ~/k8s-gitops/clusters/homelab/parent-app.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: homelab-root
  namespace: argocd
  finalizers: [resources-finalizer.argocd.argoproj.io]
spec:
  project: default
  source:
    repoURL: https://git.home.local/myorg/k8s-gitops
    targetRevision: HEAD
    path: apps/
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

```yaml
# ~/k8s-gitops/apps/myapp.yaml — a child Application
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://git.home.local/myorg/k8s-gitops
    targetRevision: HEAD
    path: releases/myapp
  destination:
    server: https://kubernetes.default.svc
    namespace: myapp
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

```bash
kubectl apply -f ~/k8s-gitops/clusters/homelab/parent-app.yaml
argocd app list
argocd app sync homelab-root
```

---

### ArgoCD ApplicationSet (Dynamic App Generation)

**Purpose:** Generate many `Application` resources from a single `ApplicationSet` — one per environment, one per Git directory, or one per cluster. Eliminates copy-paste when you have many apps or many clusters.

```yaml
# Generate an Application for every directory in apps/
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: cluster-apps
  namespace: argocd
spec:
  generators:
    - git:
        repoURL: https://git.home.local/myorg/k8s-gitops
        revision: HEAD
        directories:
          - path: "apps/*"          # one Application per subdirectory
  template:
    metadata:
      name: "{{path.basename}}"
    spec:
      project: default
      source:
        repoURL: https://git.home.local/myorg/k8s-gitops
        targetRevision: HEAD
        path: "{{path}}"
      destination:
        server: https://kubernetes.default.svc
        namespace: "{{path.basename}}"
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true
---
# Generate one Application per cluster (multi-cluster pattern)
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: multi-cluster-myapp
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - cluster: homelab
            url: https://kubernetes.default.svc
            env: production
          - cluster: staging
            url: https://staging.k8s.home.local:6443
            env: staging
  template:
    metadata:
      name: "myapp-{{cluster}}"
    spec:
      project: default
      source:
        repoURL: https://git.home.local/myorg/k8s-gitops
        targetRevision: HEAD
        path: "apps/myapp/overlays/{{env}}"
      destination:
        server: "{{url}}"
        namespace: myapp
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
```

---

### Flux HelmRelease & Kustomization

**Purpose:** Flux's native CRDs for managing Helm releases and Kustomize overlays declaratively in Git — the Flux equivalent of ArgoCD Applications.

```yaml
# ~/k8s-gitops/clusters/homelab/monitoring/kustomization.yaml (Flux Kustomization)
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: monitoring
  namespace: flux-system
spec:
  interval: 10m
  sourceRef:
    kind: GitRepository
    name: flux-system
  path: ./releases/monitoring
  prune: true
  wait: true
  timeout: 5m
  healthChecks:
    - apiVersion: apps/v1
      kind: Deployment
      name: kube-prometheus-stack-grafana
      namespace: monitoring
---
# HelmRelease — Flux manages a Helm release declaratively
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: kube-prometheus-stack
  namespace: monitoring
spec:
  interval: 30m
  chart:
    spec:
      chart: kube-prometheus-stack
      version: ">=58.0.0"
      sourceRef:
        kind: HelmRepository
        name: prometheus-community
        namespace: flux-system
  values:
    grafana:
      adminPassword: changeme
    prometheus:
      prometheusSpec:
        retention: 15d
  upgrade:
    remediation:
      retries: 3
  rollback:
    timeout: 5m
    cleanupOnFail: true
---
# HelmRepository — the chart source
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: prometheus-community
  namespace: flux-system
spec:
  interval: 30m
  url: https://prometheus-community.github.io/helm-charts
```

```bash
flux get helmreleases -A
flux reconcile helmrelease kube-prometheus-stack -n monitoring
flux suspend helmrelease kube-prometheus-stack -n monitoring    # pause updates
flux resume helmrelease kube-prometheus-stack -n monitoring
```

---

## Policy as Code — CI Gates

### Conftest (Policy Testing in CI)

**Purpose:** Test Kubernetes manifests against OPA/Rego policies **before** they reach the cluster — in CI, as a pre-commit hook, or in your IDE. Fails the pipeline if a manifest would violate a policy.

```bash
nix-env -iA nixpkgs.conftest

# Test a manifest against policies
conftest test ~/k8s/deployment.yaml --policy ~/policies/

# Test a rendered Helm chart
helm template myapp ./myapp-chart -f values.yaml | conftest test -
```

```rego
# ~/policies/no-latest-tag.rego
package main

deny[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  endswith(container.image, ":latest")
  msg := sprintf("Container '%s' uses ':latest' tag — pin to a specific version", [container.name])
}

deny[msg] {
  input.kind == "Deployment"
  not input.spec.template.spec.securityContext.runAsNonRoot
  msg := sprintf("Deployment '%s' must set runAsNonRoot: true", [input.metadata.name])
}

warn[msg] {
  input.kind == "Deployment"
  not input.spec.template.spec.containers[_].resources.limits
  msg := sprintf("Deployment '%s' has no resource limits", [input.metadata.name])
}
```

```yaml
# .woodpecker.yml — conftest gate in CI
steps:
  - name: policy-check
    image: openpolicyagent/conftest:latest
    commands:
      - conftest test k8s/ --policy policies/ --all-namespaces
      - helm template myapp ./chart -f values.yaml | conftest test -
```

---

### kubeconform (Manifest Schema Validation)

**Purpose:** Fast Kubernetes manifest validation against the upstream API schema — catches wrong field names, missing required fields, and version mismatches before applying to a cluster. Much faster than kubeval (which is unmaintained).

```bash
nix-env -iA nixpkgs.kubeconform

# Validate all manifests in a directory
kubeconform -strict -summary ~/k8s/

# Validate a Helm render
helm template myapp ./myapp-chart -f values.yaml | kubeconform -strict -

# Validate with CRD schemas (Flux, ArgoCD, etc.)
kubeconform \
  -schema-location default \
  -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' \
  -strict -summary ~/k8s/
```

```yaml
# .woodpecker.yml — schema validation in CI
steps:
  - name: kubeconform
    image: ghcr.io/yannh/kubeconform:latest
    commands:
      - kubeconform -strict -summary k8s/
      - helm template myapp ./chart -f values.yaml | kubeconform -strict -
```

---

## Network Troubleshooting

### netshoot (In-Cluster Network Debugging)

**Purpose:** `nicolaka/netshoot` is a comprehensive network troubleshooting container — it includes `curl`, `wget`, `dig`, `nslookup`, `tcpdump`, `ss`, `netstat`, `iperf3`, `traceroute`, `mtr`, `nmap`, and more. Use it as an ephemeral container or standalone pod.

```bash
# Attach to a running pod (ephemeral — no restart required)
kubectl debug -it <pod-name> -n myapp \
  --image=nicolaka/netshoot \
  --target=myapp

# Run as standalone pod in a namespace to test connectivity
kubectl run netshoot -n myapp --rm -it --restart=Never \
  --image=nicolaka/netshoot -- bash

# Inside netshoot:
curl -v http://backend-svc.myapp.svc.cluster.local:8080/health
dig backend-svc.myapp.svc.cluster.local
nslookup kubernetes.default.svc.cluster.local
tcpdump -i any -n port 8080
ss -tulnp
iperf3 -c backend-svc -p 5201 -t 10    # bandwidth test

# DNS resolution troubleshooting
dig @10.96.0.10 backend-svc.myapp.svc.cluster.local    # 10.96.0.10 = kube-dns ClusterIP
```

---

### Inspektor Gadget (eBPF-Based Cluster Debugging)

**Purpose:** Collection of eBPF-based tools for debugging networking, tracing, and security in Kubernetes — without modifying workloads. Built on Cilium's eBPF library. Runs as a DaemonSet; queried via `kubectl gadget`.

```bash
kubectl krew install gadget
kubectl gadget deploy

# Trace all DNS queries in a namespace
kubectl gadget trace dns -n myapp

# Watch all network connections being opened
kubectl gadget trace tcp -n myapp

# Trace syscalls for a specific pod
kubectl gadget trace exec -n myapp --podname myapp-xyz

# Detect privilege escalation attempts
kubectl gadget trace capabilities -n myapp

# Watch which files a pod opens
kubectl gadget trace open -n myapp --podname myapp-xyz

# Top processes by network usage
kubectl gadget top tcp -n myapp

# Profile CPU usage with stack traces
kubectl gadget profile cpu -n myapp --podname myapp-xyz --timeout 30
```

---

### Node Problem Detector

**Purpose:** Kubernetes DaemonSet that detects node-level problems (kernel panics, OOM events, disk pressure, NTP failures, container runtime crashes) and reports them as node conditions or events. Alerts fire via Prometheus.

```bash
helm repo add deliveryhero https://charts.deliveryhero.io/
helm install node-problem-detector deliveryhero/node-problem-detector \
  --namespace kube-system \
  --set metrics.enabled=true \
  --set metrics.serviceMonitor.enabled=true
```

```yaml
# PrometheusRule for node-problem-detector alerts
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: node-problem-alerts
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  groups:
    - name: node-problems
      rules:
        - alert: NodeKernelDeadlock
          expr: kube_node_status_condition{condition="KernelDeadlock",status="true"} == 1
          for: 5m
          labels: { severity: critical }
          annotations:
            summary: "Node {{ $labels.node }} has a kernel deadlock"

        - alert: NodeReadonlyFilesystem
          expr: kube_node_status_condition{condition="ReadonlyFilesystem",status="true"} == 1
          for: 5m
          labels: { severity: critical }
          annotations:
            summary: "Node {{ $labels.node }} filesystem is read-only"
```

---

## Cluster Hardening

### Descheduler

**Purpose:** The Kubernetes scheduler places pods at creation time but never moves them. The Descheduler runs periodically and evicts pods that violate scheduling policies — pods on overloaded nodes, topology spread violations, expired affinities — triggering the scheduler to re-place them more optimally.

```bash
helm repo add descheduler https://kubernetes-sigs.github.io/descheduler/
helm install descheduler descheduler/descheduler \
  --namespace kube-system \
  --set schedule="*/10 * * * *"
```

```yaml
# ~/k8s/descheduler-policy.yaml
apiVersion: "descheduler/v1alpha2"
kind: "DeschedulerPolicy"
profiles:
  - name: default
    pluginConfig:
      - name: DefaultEvictor
        args:
          ignorePvcPods: true
          evictSystemCriticalPods: false
          nodeFit: true
    plugins:
      balance:
        enabled:
          - LowNodeUtilization
          - RemoveDuplicates
          - RemovePodsViolatingTopologySpreadConstraint
      deschedule:
        enabled:
          - RemovePodsViolatingNodeAffinity
          - RemovePodsViolatingInterPodAntiAffinity
          - RemovePodsHavingTooManyRestarts
```

---

### CIS Kubernetes Benchmark — kube-bench

**Purpose:** Run the CIS Kubernetes Benchmark against your cluster to find misconfigurations: insecure API server flags, missing audit logging, overly permissive RBAC, unencrypted etcd, and more. Essential before declaring a cluster "production-ready".

```bash
# Run against a k3s node
kubectl apply -f https://raw.githubusercontent.com/aquasecurity/kube-bench/main/job.yaml
kubectl logs job/kube-bench

# Or run directly (finds binaries automatically)
docker run --pid=host -v /etc:/etc:ro -v /var:/var:ro \
  -v $(which kubectl):/usr/local/mount-from-host/bin/kubectl \
  -e KUBECONFIG=$KUBECONFIG \
  --rm aquasec/kube-bench:latest \
  run --targets=master,node,etcd,policies
```

```bash
# Target specific section
kube-bench run --check 1.2.6    # check a specific CIS item
kube-bench run --targets=master --json | jq '.[] | select(.status=="FAIL")'
```

---

### Production Cluster Hardening Checklist

| Area | Check | Tool |
|------|-------|------|
| **API Server** | Audit logging enabled | k3s config / kubeadm |
| **API Server** | Anonymous auth disabled | `--anonymous-auth=false` |
| **RBAC** | No `cluster-admin` granted to workloads | `kubectl auth can-i --list` |
| **RBAC** | CI/CD uses minimal ServiceAccount | Dedicated Role per namespace |
| **Pods** | `restricted` PSA on all namespaces | `pod-security.kubernetes.io/enforce=restricted` |
| **Pods** | `runAsNonRoot: true` on all containers | Kyverno policy |
| **Pods** | `readOnlyRootFilesystem: true` | SecurityContext |
| **Pods** | Resource limits set on all containers | Kyverno policy |
| **Pods** | No `hostNetwork`, `hostPID`, `hostIPC` | Kyverno policy |
| **Images** | No `:latest` tags in production | conftest / Kyverno |
| **Images** | All images signed (Cosign) | Kyverno `verifyImages` |
| **Images** | Continuous vulnerability scanning | Trivy Operator |
| **Network** | Default-deny NetworkPolicy in every namespace | Kyverno generate |
| **Network** | mTLS between services | Linkerd / Cilium WireGuard |
| **Secrets** | No plaintext secrets in Git | Sealed Secrets / ESO |
| **Secrets** | Secrets mounted as volumes, not env vars | Kyverno policy |
| **Runtime** | Falco detecting shell exec / file writes | Falco DaemonSet |
| **etcd** | Encrypted at rest | `--encryption-provider-config` |
| **Nodes** | CIS benchmark passing | kube-bench |
| **Nodes** | Node Problem Detector deployed | DaemonSet |
| **Backups** | Velero scheduled daily | Velero Schedule CRD |
| **Backups** | etcd snapshots to off-cluster storage | k3s etcd-snapshot + restic |

---

### Kubelet Eviction Thresholds

The kubelet monitors node resources and evicts pods when thresholds are crossed. **Soft** eviction gives pods a grace period; **hard** eviction is immediate.

```yaml
# /etc/rancher/k3s/config.yaml (k3s) or kubelet config file (kubeadm)
# For k3s, add under kubelet-arg:
kubelet-arg:
  # Hard eviction — immediate, no grace period
  - "eviction-hard=memory.available<200Mi"
  - "eviction-hard=nodefs.available<5%"
  - "eviction-hard=nodefs.inodesFree<5%"
  - "eviction-hard=imagefs.available<10%"
  # Soft eviction — gives pods eviction-max-pod-grace-period to terminate cleanly
  - "eviction-soft=memory.available<500Mi"
  - "eviction-soft=nodefs.available<10%"
  - "eviction-soft-grace-period=memory.available=90s"
  - "eviction-soft-grace-period=nodefs.available=2m"
  # Minimum reclaim — how much to free above threshold to avoid thrashing
  - "eviction-minimum-reclaim=memory.available=0Mi"
  - "eviction-minimum-reclaim=nodefs.available=500Mi"
  # Prevent new pods from being scheduled when node is under pressure
  - "eviction-pressure-transition-period=5m"
```

```bash
# Check current node conditions (MemoryPressure, DiskPressure, PIDPressure)
kubectl describe node <node> | grep -A5 "Conditions:"
kubectl get node <node> -o jsonpath='{.status.conditions[*].type}'

# Check eviction stats
kubectl get events -A --field-selector=reason=Evicted | tail -20
```

> **Rule of thumb for homelab:** Set hard `memory.available<200Mi` and `nodefs.available<5%`. Without eviction thresholds, nodes can OOM-kill the kubelet itself, making the node permanently unresponsive.

---

### kubeconfig Management

Manage multiple clusters — merge configs, switch contexts, and set up OIDC authentication.

```bash
# View all contexts
kubectl config get-contexts
kubectl config current-context

# Switch context
kubectl config use-context k3s-homelab
kubectl ctx k3s-homelab   # krew ctx plugin — faster

# Merge two kubeconfigs (e.g., adding a new cluster)
KUBECONFIG=~/.kube/config:~/.kube/new-cluster.yaml \
  kubectl config view --flatten > ~/.kube/merged-config && \
  mv ~/.kube/merged-config ~/.kube/config

# Add a cluster, user, and context manually
kubectl config set-cluster homelab \
  --server=https://192.168.1.10:6443 \
  --certificate-authority=/etc/rancher/k3s/server/tls/server-ca.crt

kubectl config set-credentials homelab-admin \
  --client-certificate=~/.kube/admin.crt \
  --client-key=~/.kube/admin.key

kubectl config set-context homelab \
  --cluster=homelab \
  --user=homelab-admin \
  --namespace=default

# Rename a context
kubectl config rename-context old-name new-name

# Delete a context/cluster/user
kubectl config delete-context old-cluster
kubectl config delete-cluster old-cluster
kubectl config delete-user old-user
```

#### OIDC Authentication (SSO for kubectl)

Integrate with Dex, Keycloak, or any OIDC provider so team members authenticate with their SSO credentials instead of shared kubeconfig certs.

```bash
# Install kubelogin (kubectl-oidc_login plugin)
kubectl krew install oidc-login

# Test OIDC flow
kubectl oidc-login setup \
  --oidc-issuer-url=https://dex.home.local \
  --oidc-client-id=kubectl \
  --oidc-client-secret=<secret>
```

```yaml
# ~/.kube/config — OIDC user entry
users:
  - name: alice@home.local
    user:
      exec:
        apiVersion: client.authentication.k8s.io/v1beta1
        command: kubectl
        args:
          - oidc-login
          - get-token
          - --oidc-issuer-url=https://dex.home.local
          - --oidc-client-id=kubectl
          - --oidc-client-secret=<secret>
          - --oidc-extra-scope=groups
```

```yaml
# kube-apiserver flags (add to k3s config.yaml under kube-apiserver-arg:)
kube-apiserver-arg:
  - "oidc-issuer-url=https://dex.home.local"
  - "oidc-client-id=kubectl"
  - "oidc-username-claim=email"
  - "oidc-groups-claim=groups"
```

```bash
# Bind a ClusterRole to an OIDC group
kubectl create clusterrolebinding dev-team-view \
  --clusterrole=view \
  --group=dev-team   # must match the 'groups' claim from OIDC provider
```

---

## Multi-Cluster

### Cluster Federation — Admiralty

**Purpose:** Schedule pods across multiple Kubernetes clusters as if they were one — useful when a cluster fills up or you need cross-cloud placement. Pods submitted to a source cluster are transparently delegated to a target cluster.

```bash
helm repo add admiralty https://charts.admiralty.io
helm install admiralty admiralty/multicluster-scheduler \
  --namespace admiralty --create-namespace
```

```yaml
# Annotate a Deployment to allow cross-cluster scheduling
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  annotations:
    multicluster.admiralty.io/elect: ""
spec:
  replicas: 3
  # rest of spec unchanged — Admiralty shadows pods to available clusters
```

---

### Submariner (Cross-Cluster L3 Networking)

**Purpose:** Connect multiple Kubernetes clusters at the network layer — enabling pod-to-pod and service-to-service communication across clusters without a VPN. Used for active-active multi-cluster where services in cluster-A call services in cluster-B directly.

```bash
curl -Ls https://get.submariner.io | bash
export PATH=$PATH:~/.local/bin

# Deploy broker (coordination cluster — can be a separate lightweight cluster)
subctl deploy-broker --kubeconfig ~/.kube/cluster1.yaml

# Join each cluster to the broker
subctl join --kubeconfig ~/.kube/cluster1.yaml broker-info.subm --clusterid cluster1
subctl join --kubeconfig ~/.kube/cluster2.yaml broker-info.subm --clusterid cluster2

# Export a service from cluster1 so cluster2 can reach it
kubectl --context cluster1 apply -f - <<EOF
apiVersion: multicluster.x-k8s.io/v1alpha1
kind: ServiceExport
metadata:
  name: myapp
  namespace: myapp
EOF

# From cluster2: curl http://myapp.myapp.svc.clusterset.local
```

---

## Zot (Lightweight OCI Registry)

**Purpose:** CNCF sandbox project — a minimal, OCI-only container registry written in Go. Far lighter than Harbor (~50MB binary, no dependencies), ORAS-compatible, suitable for air-gapped environments or homelabs where Harbor's full feature set is unnecessary.

```bash
helm repo add project-zot http://zotregistry.dev/helm-charts
helm install zot project-zot/zot \
  --namespace zot --create-namespace \
  --set service.type=ClusterIP \
  -f ~/k8s/zot-values.yaml
```

```yaml
# ~/k8s/zot-values.yaml
configFiles:
  config.json: |
    {
      "distSpecVersion": "1.1.0",
      "storage": {
        "rootDirectory": "/var/lib/registry"
      },
      "http": {
        "address": "0.0.0.0",
        "port": "5000",
        "auth": {
          "htpasswd": {
            "path": "/etc/zot/htpasswd"
          }
        }
      },
      "log": { "level": "info" },
      "extensions": {
        "search": { "enable": true },
        "ui": { "enable": true },
        "scrub": { "enable": true }
      }
    }

persistence:
  enabled: true
  size: 50Gi
```

```bash
kubectl -n zot port-forward svc/zot 5000:5000

# Push an image
podman tag myapp:latest localhost:5000/myorg/myapp:latest
podman push localhost:5000/myorg/myapp:latest --tls-verify=false

# List images via ORAS
oras repo ls localhost:5000
oras repo tags localhost:5000/myorg/myapp
```

**Caddy:** `registry.home.local { tls internal; reverse_proxy zot.zot.svc.cluster.local:5000 { header_up Host {host} } }`

> **Harbor vs Zot:** Harbor if you need RBAC, replication, a web UI, and integrated Trivy scanning. Zot if you need a minimal OCI-compliant store for a homelab or air-gapped cluster.

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


### Policy & Hardening

| Issue | Solution |
|-------|----------|
| conftest passes locally but fails in CI | Ensure `--policy` path and `--all-namespaces` flag match CI config |
| kubeconform fails on CRD resources | Add `-schema-location` for CRD catalog URL; use `--ignore-missing-schemas` during migration |
| kube-bench says API server flags missing | For k3s, set flags via `kube-apiserver-arg:` in `/etc/rancher/k3s/config.yaml` |
| PSA blocks system namespace pods | Add `pod-security.kubernetes.io/enforce=privileged` to `kube-system` before enforcing elsewhere |
| Kyverno webhook times out | `kubectl get pods -n kyverno`; scale replicas; check `--webhookTimeout` |

### Multi-Cluster & Registry

| Issue | Solution |
|-------|----------|
| Submariner tunnel not establishing | Check UDP 4500/4800 between nodes; verify broker token; `subctl diagnose all` |
| Zot push rejected 401 | Verify htpasswd credentials; check `auth.htpasswd.path` in config.json |
| Admiralty pods stuck Pending | Check `MultiClusterSchedulingProfile` on target cluster; verify Admiralty version compatibility |
| Harbor push fails: `unknown blob` | Harbor storage PVC full — check `kubectl -n harbor get pvc` |
| Harbor DB migration error on upgrade | Check `harbor-database` pod logs; run migration job manually if needed |

### Alerting

| Issue | Solution |
|-------|----------|
| AlertManager not sending alerts | Check `kubectl -n monitoring get pods`; view config: `kubectl -n monitoring get secret alertmanager-main -o yaml` |
| PrometheusRule not picked up | Labels must match `prometheus.prometheusSpec.ruleSelector`; add `release: kube-prometheus-stack` label |
| ServiceMonitor metrics missing | Labels must match `prometheus.serviceMonitorSelector`; check `kubectl get servicemonitor -A` |
| Grafana OnCall not receiving alerts | Verify Grafana alert notification policy points to OnCall integration |
| Beyla shows no metrics | Check DaemonSet is running; verify kernel ≥5.8; check eBPF capabilities (`SYS_ADMIN` or CAP_BPF) |

---

## DNS

### CoreDNS (Cluster DNS)

**Purpose:** CoreDNS is the default cluster DNS in all distributions. Every Service gets a DNS record (`<svc>.<ns>.svc.cluster.local`). Every pod's `/etc/resolv.conf` is configured to use it automatically.

#### DNS resolution inside pods

```
# Pattern:                         Example
<svc>                              → myapp                          (same namespace only)
<svc>.<namespace>                  → myapp.production
<svc>.<namespace>.svc              → myapp.production.svc
<svc>.<namespace>.svc.cluster.local → myapp.production.svc.cluster.local  (always works)

# StatefulSet pods get stable DNS
<pod>.<svc>.<ns>.svc.cluster.local → postgres-0.postgres.data.svc.cluster.local

# Headless service returns all pod IPs via DNS A records
dig postgres.data.svc.cluster.local   # returns postgres-0, postgres-1, postgres-2 IPs
```

#### ndots and the search domain trap

`ndots:5` is the default — a query for `api.stripe.com` first tries:
1. `api.stripe.com.myapp.svc.cluster.local`
2. `api.stripe.com.svc.cluster.local`
3. `api.stripe.com.cluster.local`
4. `api.stripe.com.` (actual lookup)

This adds latency for every external call. Fix for latency-sensitive pods:

```yaml
spec:
  dnsConfig:
    options:
      - name: ndots
        value: "2"    # only try cluster.local search for short names; go direct for FQDNs
      - name: single-request-reopen   # prevents race condition in some DNS resolvers
```

#### Customise CoreDNS

```bash
kubectl -n kube-system edit configmap coredns
```

```
# Common Corefile additions:
.:53 {
    errors
    health
    ready
    kubernetes cluster.local in-addr.arpa ip6.arpa {
        pods insecure
        fallthrough in-addr.arpa ip6.arpa
    }

    # Forward internal domain to an internal DNS server
    forward home.local 192.168.1.1

    # Rewrite a hostname inside the cluster
    rewrite name myapp.old.cluster.local myapp.myapp.svc.cluster.local

    # Cache TTL
    cache 30

    # Stub zone — resolve a domain via a different DNS server
    import /etc/coredns/custom/*.server

    forward . /etc/resolv.conf
    log
    loop
    reload
    loadbalance
}
```

```bash
# Restart CoreDNS to pick up changes
kubectl rollout restart deployment coredns -n kube-system

# Debug DNS from inside a pod
kubectl run dnsutils --rm -it --restart=Never --image=registry.k8s.io/e2e-test-images/jessie-dnsutils:1.3 -- bash
# inside: nslookup kubernetes.default, dig myapp.myapp.svc.cluster.local
```

---

### ExternalDNS (Sync Ingress to DNS Provider)

**Purpose:** Automatically creates DNS records in Cloudflare, Route53, or your own DNS server when you create Ingress/Gateway/Service resources — no manual DNS management.

```bash
helm repo add external-dns https://kubernetes-sigs.github.io/external-dns/
helm upgrade --install external-dns external-dns/external-dns \
  --namespace external-dns --create-namespace \
  -f ~/k8s/external-dns-values.yaml
```

```yaml
# ~/k8s/external-dns-values.yaml — Cloudflare provider
provider:
  name: cloudflare
env:
  - name: CF_API_TOKEN
    valueFrom:
      secretKeyRef:
        name: cloudflare-credentials
        key: api-token
txtOwnerId: homelab                  # unique ID to identify records this instance manages
domainFilters:
  - example.com
policy: sync                         # upsert-only (safer) or sync (also deletes stale records)
sources:
  - ingress
  - gateway-httproute                # Gateway API support
  - service
```

```bash
kubectl create secret generic cloudflare-credentials \
  --namespace external-dns \
  --from-literal=api-token=<your-token>

# Watch ExternalDNS process records
kubectl -n external-dns logs -l app.kubernetes.io/name=external-dns -f

# Annotate an Ingress to target a specific hostname
kubectl annotate ingress myapp \
  external-dns.alpha.kubernetes.io/hostname=myapp.example.com \
  external-dns.alpha.kubernetes.io/ttl=60
```

---

## Workload Patterns (Advanced)

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

## kubectl Power Usage

### Output Formatting & Filtering

```bash
# JSONPath — extract specific fields
kubectl get pods -n myapp -o jsonpath='{.items[*].metadata.name}'
kubectl get pod myapp-xyz -o jsonpath='{.status.containerStatuses[0].restartCount}'
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.capacity.memory}{"\n"}{end}'

# Go template — more powerful formatting
kubectl get pods -o go-template='{{range .items}}{{.metadata.name}}{{"\n"}}{{end}}'

# Custom columns
kubectl get pods -o custom-columns=\
'NAME:.metadata.name,STATUS:.status.phase,NODE:.spec.nodeName,IMAGE:.spec.containers[0].image'

# Sort
kubectl get pods --sort-by='.metadata.creationTimestamp'
kubectl get pods --sort-by='.status.containerStatuses[0].restartCount'

# Field selectors
kubectl get pods --field-selector=status.phase=Running
kubectl get pods --field-selector=spec.nodeName=k3s-node1
kubectl get events --field-selector=involvedObject.name=myapp-xyz

# Label selectors
kubectl get pods -l app=myapp,environment=production
kubectl get pods -l 'environment in (production,staging)'
kubectl get pods -l 'app notin (debug,test)'

# All resources in a namespace (including CRDs)
kubectl api-resources --verbs=list --namespaced -o name | \
  xargs -I{} kubectl get {} --ignore-not-found -n myapp

# Watch with custom columns
kubectl get pods -w -o custom-columns='NAME:.metadata.name,STATUS:.status.phase'
```

### kubectl Explain & Discovery

```bash
# Explain any field, including nested
kubectl explain pod.spec.containers.securityContext
kubectl explain deployment.spec.strategy
kubectl explain horizontalpodautoscaler.spec.behavior

# Discover available API resources
kubectl api-resources
kubectl api-resources --namespaced=false        # cluster-scoped only
kubectl api-resources | grep -i batch

# Check API versions available in your cluster
kubectl api-versions | sort

# Explain a CRD field
kubectl explain ciliumnetworkpolicy.spec.ingress

# Discover supported flags for a resource
kubectl explain clusterissuer --api-version=cert-manager.io/v1
```

### kubectl Patch Patterns

```bash
# Strategic merge patch — merge nested fields
kubectl patch deployment myapp -n myapp --type=strategic \
  --patch='{"spec":{"template":{"spec":{"containers":[{"name":"myapp","image":"myapp:v2"}]}}}}'

# JSON patch — precise array operations
kubectl patch service myapp -n myapp --type='json' \
  -p='[{"op":"replace","path":"/spec/type","value":"NodePort"}]'

# Add a label
kubectl patch namespace myapp --type='json' \
  -p='[{"op":"add","path":"/metadata/labels/environment","value":"production"}]'

# Remove a finalizer (use when resource is stuck Terminating)
kubectl patch pod myapp-xyz -n myapp --type='json' \
  -p='[{"op":"remove","path":"/metadata/finalizers"}]'

# Remove a finalizer from a namespace stuck Terminating
kubectl get namespace terminating-ns -o json | \
  jq '.spec.finalizers = []' | \
  kubectl replace --raw "/api/v1/namespaces/terminating-ns/finalize" -f -

# Server-Side Apply — declarative and field-manager aware (preferred over apply -f)
kubectl apply --server-side -f ~/k8s/deployment.yaml
kubectl apply --server-side --field-manager=my-tool -f ~/k8s/deployment.yaml
```

### Useful One-Liners

```bash
# Restart all deployments in a namespace
kubectl rollout restart deployment -n myapp

# Delete all evicted pods cluster-wide
kubectl get pods -A --field-selector=status.phase=Failed \
  -o json | kubectl delete -f -

# Force delete a stuck pod
kubectl delete pod myapp-xyz -n myapp --grace-period=0 --force

# Get all images running in the cluster
kubectl get pods -A -o jsonpath='{range .items[*]}{range .spec.containers[*]}{.image}{"\n"}{end}{end}' | sort -u

# Find which pods are using the most memory
kubectl top pods -A --sort-by=memory

# Find all pods NOT running
kubectl get pods -A --field-selector='status.phase!=Running,status.phase!=Succeeded'

# Copy a secret between namespaces
kubectl get secret mysecret -n source-ns -o yaml | \
  sed 's/namespace: source-ns/namespace: target-ns/' | \
  kubectl apply -f -

# Get a pod's effective environment variables (including from secrets/configmaps)
kubectl exec myapp-xyz -n myapp -- env | sort

# Verify what a ServiceAccount can do
kubectl auth can-i --list --as=system:serviceaccount:myapp:default -n myapp

# Find which node a pod is on
kubectl get pod myapp-xyz -n myapp -o wide

# Get events sorted by time for a specific pod
kubectl get events -n myapp --field-selector=involvedObject.name=myapp-xyz --sort-by='.lastTimestamp'

# Watch resource changes in real time (like a live diff)
kubectl get deploy myapp -n myapp -w -o json | jq '.spec.replicas'

# Get clean YAML without cluster-added noise (requires krew neat plugin)
kubectl get deployment myapp -n myapp -o yaml | kubectl neat

# Show all cluster-wide events sorted by time (great for debugging upgrades)
kubectl get events -A --sort-by='.lastTimestamp' | tail -30

# Check node conditions (MemoryPressure, DiskPressure, PIDPressure)
kubectl get nodes -o custom-columns='NAME:.metadata.name,CONDITIONS:.status.conditions[*].type,STATUS:.status.conditions[*].status'
```

---

## Operator Pattern & Custom Resources

### Understanding Operators

**Purpose:** A Kubernetes Operator extends the API with custom resources (CRDs) and implements a control loop that reconciles desired state. An operator for PostgreSQL would watch `PostgreSQLCluster` CRDs and provision/manage actual database pods. Everything in this stack — Cilium, ArgoCD, Longhorn, cert-manager — is implemented as operators.

#### Operator maturity levels (OperatorHub model)

| Level | Capability |
|-------|-----------|
| 1 — Basic Install | Automated deployment |
| 2 — Seamless Upgrades | Manages upgrades |
| 3 — Full Lifecycle | Backup, recovery, failure handling |
| 4 — Deep Insights | Metrics, alerts, log processing |
| 5 — Auto Pilot | Horizontal/vertical scaling, auto-config |

#### Key operators to know for production databases

```bash
# CloudNativePG — PostgreSQL operator (Level 5)
helm repo add cnpg https://cloudnative-pg.github.io/charts
helm upgrade --install cnpg cnpg/cloudnative-pg \
  --namespace cnpg-system --create-namespace
```

```yaml
# CloudNativePG Cluster — highly available PostgreSQL
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: postgres-cluster
  namespace: data
spec:
  instances: 3               # 1 primary + 2 read replicas
  storage:
    size: 20Gi
    storageClass: longhorn
  postgresql:
    parameters:
      max_connections: "200"
      shared_buffers: "256MB"
  backup:
    retentionPolicy: "30d"
    barmanObjectStore:
      destinationPath: s3://backups/postgres
      s3Credentials:
        accessKeyId:
          name: backup-creds
          key: ACCESS_KEY_ID
        secretAccessKey:
          name: backup-creds
          key: ACCESS_SECRET_KEY
```

```bash
kubectl get cluster -n data
kubectl get pods -n data                  # postgres-cluster-1, -2, -3
kubectl exec -it postgres-cluster-1 -n data -- psql -U postgres

# Promote a replica to primary
kubectl cnpg promote postgres-cluster postgres-cluster-2 -n data

# Trigger a backup
kubectl cnpg backup postgres-cluster -n data
```

```bash
# Strimzi — Apache Kafka operator
helm repo add strimzi https://strimzi.io/charts/
helm install strimzi strimzi/strimzi-kafka-operator \
  --namespace kafka --create-namespace
```

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata:
  name: my-cluster
  namespace: kafka
spec:
  kafka:
    replicas: 3
    storage:
      type: persistent-claim
      size: 50Gi
      class: longhorn
    config:
      offsets.topic.replication.factor: 3
      transaction.state.log.replication.factor: 3
  zookeeper:
    replicas: 3
    storage:
      type: persistent-claim
      size: 10Gi
  entityOperator:
    topicOperator: {}
    userOperator: {}
```

```bash
# Redis Operator (Spotahome)
helm repo add redis-operator https://spotahome.github.io/redis-operator
helm install redis-operator redis-operator/redis-operator \
  --namespace redis-system --create-namespace
```

```yaml
apiVersion: databases.spotahome.com/v1
kind: RedisFailover
metadata:
  name: redis-cluster
  namespace: data
spec:
  sentinel:
    replicas: 3
  redis:
    replicas: 3
    storage:
      persistentVolumeClaim:
        metadata:
          name: redis-data
        spec:
          accessModes: [ReadWriteOnce]
          storageClass: longhorn
          resources:
            requests:
              storage: 10Gi
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

## Multi-Architecture Builds

### Building Multi-Platform Images (amd64 + arm64)

**Purpose:** Build images that run on both x86 servers and ARM nodes (Raspberry Pi, AWS Graviton, Apple Silicon) from a single manifest. Stored as an OCI index in the registry.

```bash
# Using Podman (buildx equivalent)
podman manifest create myapp-manifest

podman build --platform linux/amd64 -t myapp:amd64 .
podman build --platform linux/arm64 -t myapp:arm64 .

podman manifest add myapp-manifest myapp:amd64
podman manifest add myapp-manifest myapp:arm64

podman manifest push myapp-manifest harbor.home.local/myorg/myapp:latest

# Using Docker buildx (for CI on Docker hosts)
docker buildx create --use --name multiarch
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --push \
  -t harbor.home.local/myorg/myapp:latest .
```

```yaml
# Kaniko in CI — multi-arch via parallel jobs
# .woodpecker.yml
steps:
  - name: build-amd64
    image: gcr.io/kaniko-project/executor:latest
    args:
      - --context=git://git.home.local/myorg/myapp
      - --platform=linux/amd64
      - --destination=harbor.home.local/myorg/myapp:${CI_COMMIT_SHA}-amd64

  - name: build-arm64
    image: gcr.io/kaniko-project/executor:latest-arm64
    args:
      - --context=git://git.home.local/myorg/myapp
      - --platform=linux/arm64
      - --destination=harbor.home.local/myorg/myapp:${CI_COMMIT_SHA}-arm64

  - name: create-manifest
    image: mplatform/manifest-tool:latest
    commands:
      - manifest-tool push from-args \
          --platforms linux/amd64,linux/arm64 \
          --template harbor.home.local/myorg/myapp:${CI_COMMIT_SHA}-ARCH \
          --target harbor.home.local/myorg/myapp:${CI_COMMIT_SHA}
```

```bash
# Verify a manifest image is multi-arch
podman manifest inspect harbor.home.local/myorg/myapp:latest | jq '.manifests[].platform'

# Node labels for architecture-based scheduling
kubectl get nodes -o custom-columns='NODE:.metadata.name,ARCH:.status.nodeInfo.architecture'

# Schedule only on arm64 nodes
spec:
  nodeSelector:
    kubernetes.io/arch: arm64
```

---

## Deprecated API Migration

### Finding and Fixing Deprecated APIs

**Purpose:** Kubernetes removes deprecated API versions between minor releases. Applying a manifest with a removed API version hard-fails. Catch these before upgrading.

```bash
# Install pluto — scans for deprecated/removed APIs
nix-env -iA nixpkgs.pluto

# Scan live cluster resources
pluto detect-all-in-cluster

# Scan a Helm release
helm get manifest myapp -n myapp | pluto detect -

# Scan local manifests
pluto detect-files -d ~/k8s/

# Target a specific Kubernetes version
pluto detect-all-in-cluster --target-versions k8s=v1.32.0

# Install nova — finds outdated Helm chart versions
helm plugin install https://github.com/FairwindsOps/nova
nova find --wide
```

```bash
# Common API migrations (as of 1.25–1.32):
# PodSecurityPolicy (removed 1.25)        → PSA labels (built-in)
# Ingress networking.k8s.io/v1beta1       → networking.k8s.io/v1
# HPA autoscaling/v2beta1                 → autoscaling/v2
# CronJob batch/v1beta1                   → batch/v1
# PodDisruptionBudget policy/v1beta1      → policy/v1
# FlowSchema/PriorityLevelConfiguration v1beta1 → v1

# Migrate a live resource in-place
kubectl convert -f myapp-deployment.yaml --output-version apps/v1
```

```yaml
# .woodpecker.yml — pluto check in CI
steps:
  - name: deprecated-api-check
    image: us-docker.pkg.dev/fairwinds-ops/oss/pluto:latest
    commands:
      - pluto detect-files -d k8s/ --target-versions k8s=v1.33.0
      - helm template myapp ./chart -f values.yaml | pluto detect -
```

---

## NFS & Shared Storage

### NFS Subdir External Provisioner

**Purpose:** Dynamically provision PVCs backed by an NFS server — the simplest way to get `ReadWriteMany` access mode in a homelab without Rook-Ceph.

```bash
helm repo add nfs-subdir-external-provisioner \
  https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner/

helm install nfs-provisioner \
  nfs-subdir-external-provisioner/nfs-subdir-external-provisioner \
  --namespace kube-system \
  --set nfs.server=192.168.1.50 \
  --set nfs.path=/exports/k8s \
  --set storageClass.name=nfs-client \
  --set storageClass.reclaimPolicy=Retain \
  --set storageClass.archiveOnDelete=false
```

```yaml
# ReadWriteMany PVC (shared across multiple pods/nodes)
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: shared-data
  namespace: myapp
spec:
  accessModes: [ReadWriteMany]
  storageClassName: nfs-client
  resources:
    requests:
      storage: 50Gi
```

```bash
kubectl get storageclass nfs-client
kubectl get pvc shared-data -n myapp
# ACCESSMODES shows RWX — multiple pods on different nodes can mount simultaneously
```

---

## MinIO (Self-Hosted S3)

**Purpose:** S3-compatible object storage for Kubernetes — used as the Velero backup target, Loki log storage, Tempo trace storage, and Harbor registry backend. The standard self-hosted S3 replacement.

```bash
helm repo add minio https://charts.min.io/
helm upgrade --install minio minio/minio \
  --namespace minio --create-namespace \
  --set rootUser=minioadmin \
  --set rootPassword=changeme \
  --set persistence.storageClass=longhorn \
  --set persistence.size=100Gi \
  --set service.type=ClusterIP
```

```bash
# Install mc (MinIO client)
nix-env -iA nixpkgs.minio-client

mc alias set homelab http://localhost:9000 minioadmin changeme
mc mb homelab/velero-backups
mc mb homelab/loki-logs
mc mb homelab/tempo-traces

# List buckets and objects
mc ls homelab/
mc ls homelab/velero-backups/

# Set lifecycle policy (auto-delete after 30 days)
mc ilm add homelab/loki-logs --expiry-days 30

# Watch live access log
mc admin trace homelab
```

```bash
kubectl -n minio port-forward svc/minio 9000:9000 9001:9001
# Console at http://localhost:9001
```

**Caddy:** `minio.home.local { tls internal; reverse_proxy localhost:9001 }`

#### Use MinIO as Loki backend (replacing local filesystem)

```yaml
# ~/k8s/values/loki.yaml
loki:
  storage:
    type: s3
    s3:
      endpoint: http://minio.minio.svc:9000
      region: us-east-1
      bucketnames: loki-logs
      accessKeyId: minioadmin
      secretAccessKey: changeme
      s3ForcePathStyle: true
      insecure: true
  commonConfig:
    replication_factor: 1
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

## Gateway API — Advanced Patterns

### Header-Based Routing & Traffic Mirroring

```yaml
# Route by header — canary for specific users
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: myapp-header-canary
  namespace: nginx-gateway
spec:
  parentRefs:
    - name: nginx-gateway
      sectionName: http
  hostnames: [myapp.home.local]
  rules:
    # Route beta users to canary (header: X-Beta: true)
    - matches:
        - headers:
            - name: X-Beta
              value: "true"
      backendRefs:
        - name: myapp-canary
          namespace: myapp-ns
          port: 8080

    # Everyone else gets stable
    - backendRefs:
        - name: myapp-stable
          namespace: myapp-ns
          port: 8080
---
# URL rewriting
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: myapp-rewrite
spec:
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api/v1
      filters:
        - type: URLRewrite
          urlRewrite:
            path:
              type: ReplacePrefixMatch
              replacePrefixMatch: /api
      backendRefs:
        - name: myapp
          port: 8080
---
# Traffic mirroring — send 100% to prod, copy to staging (dark launch)
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: myapp-mirror
spec:
  rules:
    - backendRefs:
        - name: myapp-prod
          port: 8080
      filters:
        - type: RequestMirror
          requestMirror:
            backendRef:
              name: myapp-staging
              port: 8080
```

---

## Troubleshooting — Advanced Debug Flows

### kubectl Quick Debug Flows

```bash
# ---- Pod won't start ----
kubectl describe pod <pod> -n myapp           # check Events section
kubectl logs <pod> -n myapp --previous        # logs from last crash
kubectl get events -n myapp --sort-by='.lastTimestamp' | tail -20

# ---- Service not reachable ----
# 1. Confirm endpoints exist
kubectl get endpoints myapp -n myapp          # should show pod IPs
# 2. Test from inside the cluster
kubectl run curl --rm -it --restart=Never --image=curlimages/curl -- \
  curl -v http://myapp.myapp.svc.cluster.local:8080/health
# 3. Check NetworkPolicy isn't blocking
hubble observe --to-pod myapp/<pod> --verdict DROPPED

# ---- Node is NotReady ----
kubectl describe node <node>                  # check Conditions section
ssh <node> 'sudo journalctl -u kubelet -n 50'
ssh <node> 'sudo systemctl status containerd'

# ---- PVC stuck Pending ----
kubectl describe pvc myapp-data -n myapp      # check Events
kubectl get sc                                # confirm StorageClass exists
kubectl get pods -n longhorn-system           # check CSI driver pods

# ---- OOMKilled ----
kubectl describe pod <pod> -n myapp | grep -A5 "OOMKilled"
kubectl top pod <pod> -n myapp --containers
# Fix: increase limits or fix memory leak

# ---- CrashLoopBackOff ----
kubectl logs <pod> -n myapp --previous
kubectl exec -it <pod> -n myapp -- /bin/sh    # if shell available
kubectl debug -it <pod> --image=busybox --target=myapp -n myapp  # if distroless

# ---- Certificate not provisioning ----
kubectl get certificate -n myapp
kubectl get certificaterequest -n myapp
kubectl get order -n myapp                    # ACME HTTP-01 / DNS-01 state
kubectl get challenge -n myapp               # challenge in progress?
kubectl describe challenge -n myapp          # detailed ACME error

# ---- ArgoCD OutOfSync (ignoring normal fields) ----
# ignoreDifferences for fields that Kubernetes/operators mutate:
spec:
  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas           # if HPA manages replicas
    - group: ""
      kind: Service
      jsonPointers:
        - /spec/clusterIP          # assigned by Kubernetes
        - /spec/clusterIPs
```

### Resource Debugging Checklist

```bash
# Full resource dump for a namespace — useful for incident handoff
kubectl get all,cm,secret,pvc,ingress,httproute,certificate,externalsecret \
  -n myapp -o yaml > /tmp/myapp-snapshot-$(date +%Y%m%d-%H%M).yaml

# Compare two snapshots
diff /tmp/myapp-snapshot-before.yaml /tmp/myapp-snapshot-after.yaml

# Cluster-wide resource count (spot runaway resource creation)
kubectl get pods -A --no-headers | wc -l
kubectl get pvc -A --no-headers | wc -l

# Top nodes and pods
kubectl top nodes
kubectl top pods -A --sort-by=memory | head -20
kubectl top pods -A --sort-by=cpu | head -20

# Find who owns a pod (trace back to Deployment/StatefulSet)
kubectl tree pod myapp-xyz -n myapp    # requires krew tree plugin
```

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

## Init Containers & Sidecar Patterns

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

## etcd Operations & Disaster Recovery

etcd is the sole persistent state store for Kubernetes. Losing etcd without a backup means losing the entire cluster configuration — all Deployments, Secrets, ConfigMaps, CRDs, and RBAC rules. Back it up regularly.

### k3s etcd Snapshots

k3s uses an embedded etcd (or SQLite for single-node) and handles snapshots natively.

```bash
# Manual snapshot (stored in /var/lib/rancher/k3s/server/db/snapshots/ by default)
sudo k3s etcd-snapshot save --name homelab-$(date +%Y%m%d-%H%M)

# List snapshots
sudo k3s etcd-snapshot ls

# Schedule automatic snapshots (add to k3s config)
# /etc/rancher/k3s/config.yaml:
#   etcd-snapshot-schedule-cron: "0 */6 * * *"   # every 6 hours
#   etcd-snapshot-retention: 10

# Restore from snapshot (STOP k3s first)
sudo systemctl stop k3s
sudo k3s server --cluster-reset --cluster-reset-restore-path=/var/lib/rancher/k3s/server/db/snapshots/homelab-20260427-0600
sudo systemctl start k3s
```

---

### kubeadm / Vanilla etcd Backup & Restore

For clusters not using k3s (kubeadm, RKE2, k0s), use `etcdctl` directly. etcd runs as a static pod on the control plane node(s).

```bash
# Install etcdctl (version must match your etcd version)
ETCD_VER=v3.5.12
curl -L https://github.com/etcd-io/etcd/releases/download/${ETCD_VER}/etcd-${ETCD_VER}-linux-amd64.tar.gz | tar xz
sudo mv etcd-${ETCD_VER}-linux-amd64/etcdctl /usr/local/bin/

# Find etcd certs location
sudo cat /etc/kubernetes/manifests/etcd.yaml | grep -E "cert|key|ca"
```

```bash
# Take a snapshot backup
ETCDCTL_API=3 etcdctl snapshot save /tmp/etcd-backup-$(date +%Y%m%d-%H%M).db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# Verify the backup
ETCDCTL_API=3 etcdctl snapshot status /tmp/etcd-backup-*.db --write-out=table
```

```bash
# ---- RESTORE PROCEDURE ----
# 1. Stop the control plane components (move manifests out)
sudo mv /etc/kubernetes/manifests /etc/kubernetes/manifests.bak

# 2. Restore snapshot to a new data directory
ETCDCTL_API=3 etcdctl snapshot restore /tmp/etcd-backup-20260427.db \
  --data-dir=/var/lib/etcd-restore \
  --name=master-1 \
  --initial-cluster=master-1=https://127.0.0.1:2380 \
  --initial-advertise-peer-urls=https://127.0.0.1:2380

# 3. Replace old data dir
sudo mv /var/lib/etcd /var/lib/etcd.old
sudo mv /var/lib/etcd-restore /var/lib/etcd

# 4. Restore manifests
sudo mv /etc/kubernetes/manifests.bak /etc/kubernetes/manifests

# 5. Restart kubelet
sudo systemctl restart kubelet
```

---

### etcd Health & Defragmentation

etcd accumulates historical revisions and can grow unbounded. Compact and defragment periodically.

```bash
# Check etcd cluster health
ETCDCTL_API=3 etcdctl endpoint health \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# Check cluster member list
ETCDCTL_API=3 etcdctl member list \
  --endpoints=https://127.0.0.1:2379 ...

# Get current revision
ETCDCTL_API=3 etcdctl endpoint status --write-out=json \
  --endpoints=https://127.0.0.1:2379 ... | jq .[].Status.header.revision

# Compact to current revision (reduces key space)
REV=$(ETCDCTL_API=3 etcdctl endpoint status ... -w json | jq -r '.[0].Status.header.revision')
ETCDCTL_API=3 etcdctl compact $REV ...

# Defragment (reclaim disk space — brief latency spike)
ETCDCTL_API=3 etcdctl defrag \
  --endpoints=https://127.0.0.1:2379 ...

# etcd DB size before/after
ETCDCTL_API=3 etcdctl endpoint status --write-out=table ...
```

> **Production guidance:** Automate backups to off-cluster object storage (MinIO/S3). Test your restore procedure quarterly — an untested backup is not a backup.

---

> **Application-level backup with Velero** is covered in [Backup & Disaster Recovery](#backup--disaster-recovery). Unlike etcd snapshots (which restore the whole cluster), Velero restores individual namespaces and PVCs — use both strategies together.

---

## Cost Management & Resource Efficiency

Running Kubernetes without resource governance leads to wasted infrastructure spend — oversized requests that starve real workloads, idle namespaces consuming quotas, and forgotten development clusters burning cloud credits.

### Kubecost (Cost Visibility)

**Purpose:** Real-time cost allocation by namespace, deployment, label, and team. Shows cost per pod, identifies wasted spend, and provides right-sizing recommendations.

```bash
helm repo add kubecost https://kubecost.github.io/cost-analyzer/
helm upgrade --install kubecost kubecost/cost-analyzer \
  --namespace kubecost --create-namespace \
  --set kubecostToken=""   # free tier — no token needed
```

```bash
kubectl -n kubecost port-forward svc/kubecost-cost-analyzer 9090:9090
# Open http://localhost:9090
```

```bash
# Query cost via API
curl http://localhost:9090/model/allocation?window=7d&aggregate=namespace | jq .
curl http://localhost:9090/model/savings | jq .recommendations
```

---

### OpenCost (CNCF Open Standard)

**Purpose:** CNCF-graduated cost monitoring standard. Lightweight alternative to Kubecost (free, OSS). Integrates with Prometheus.

```bash
helm repo add opencost https://opencost.github.io/opencost-helm-chart
helm install opencost opencost/opencost \
  --namespace opencost --create-namespace \
  --set opencost.exporter.cloudProviderApiKey="" \
  --set opencost.prometheus.internal.enabled=true
```

```bash
kubectl port-forward -n opencost service/opencost 9003:9003 9090:9090
# UI: http://localhost:9090
# API: curl http://localhost:9003/allocation/compute?window=1d
```

---

### Resource Efficiency Best Practices

**LimitRanges as namespace defaults** — ensures every pod gets requests/limits even if the developer forgot:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: namespace-defaults
  namespace: dev
spec:
  limits:
    - type: Container
      default:           # limits if not specified
        cpu: 500m
        memory: 512Mi
      defaultRequest:    # requests if not specified
        cpu: 100m
        memory: 128Mi
      max:               # hard ceiling
        cpu: "4"
        memory: 8Gi
    - type: PersistentVolumeClaim
      max:
        storage: 50Gi    # prevent runaway PVC creation
```

**Namespace ResourceQuotas per team:**

```yaml
# Apply per team namespace — prevents any one team from exhausting the cluster
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
  namespace: team-a
spec:
  hard:
    requests.cpu: "8"
    requests.memory: 16Gi
    limits.cpu: "16"
    limits.memory: 32Gi
    persistentvolumeclaims: "10"
    requests.storage: 200Gi
    pods: "50"
    services: "20"
    secrets: "50"
    configmaps: "50"
```

**Idle namespace cleanup** — flag namespaces with no running pods for review:

```bash
# Find namespaces with no running pods
kubectl get ns -o name | while read ns; do
  count=$(kubectl get pods -n ${ns#*/} --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)
  [ "$count" -eq 0 ] && echo "${ns#*/} — no running pods"
done
```

---

### Goldilocks Integration with Cost

Goldilocks + OpenCost together: Goldilocks tells you the right size, OpenCost tells you the cost delta of right-sizing.

```bash
# Find the highest-cost overprovisioned deployments
kubectl -n goldilocks port-forward svc/goldilocks-dashboard 8080:80 &
# Filter by namespace, sort by waste
```

---

## Cluster Upgrade Strategies

Kubernetes releases three minor versions per year. Staying within two versions of current ensures security patches and avoids deprecated API removal surprises. Never skip more than one minor version in a single upgrade.

### k3s Upgrade (Channel-Based)

```bash
# Check current version
kubectl version --short

# Manual upgrade (systemctl-managed k3s)
curl -sfL https://get.k3s.io | INSTALL_K3S_BIN_DIR=~/.local/bin \
  INSTALL_K3S_VERSION=v1.32.3+k3s1 sh -

# Automated with the System Upgrade Controller
kubectl apply -f https://github.com/rancher/system-upgrade-controller/releases/latest/download/system-upgrade-controller.yaml
```

```yaml
# ~/k8s/k3s-upgrade-plan.yaml
apiVersion: upgrade.cattle.io/v1
kind: Plan
metadata:
  name: k3s-server
  namespace: system-upgrade
spec:
  concurrency: 1
  cordon: true
  channel: https://update.k3s.io/v1-release/channels/stable
  upgrade:
    image: rancher/k3s-upgrade
  drain:
    force: true
---
apiVersion: upgrade.cattle.io/v1
kind: Plan
metadata:
  name: k3s-agent
  namespace: system-upgrade
spec:
  concurrency: 2
  cordon: true
  prepare:
    image: rancher/k3s-upgrade
    args: ["prepare", "k3s-server"]
  channel: https://update.k3s.io/v1-release/channels/stable
  upgrade:
    image: rancher/k3s-upgrade
  drain:
    force: true
  nodeSelector:
    matchExpressions:
      - {key: node-role.kubernetes.io/control-plane, operator: DoesNotExist}
```

```bash
kubectl apply -f ~/k8s/k3s-upgrade-plan.yaml
kubectl -n system-upgrade get plans
kubectl -n system-upgrade get jobs -w
```

---

### kubeadm Upgrade (Minor Version)

```bash
# Step 1 — upgrade kubeadm
nix-env -iA nixpkgs.kubeadm   # installs target version

# Step 2 — check what will change
sudo kubeadm upgrade plan

# Step 3 — apply the upgrade (control plane only)
sudo kubeadm upgrade apply v1.32.3

# Step 4 — upgrade kubelet and kubectl on the control plane node
nix-env -iA nixpkgs.kubelet nixpkgs.kubectl
sudo systemctl restart kubelet

# Step 5 — drain and upgrade each worker node
kubectl drain <worker-node> --ignore-daemonsets --delete-emptydir-data
# On the worker node:
nix-env -iA nixpkgs.kubeadm nixpkgs.kubelet
sudo kubeadm upgrade node
sudo systemctl restart kubelet
# Back on control plane:
kubectl uncordon <worker-node>
```

---

### Pre-Upgrade Checklist

```bash
# 1. Check API deprecations — will any manifests break?
kubectl api-resources --api-group=apps
# Install kubent (Kubernetes deprecation checker):
nix-env -iA nixpkgs.kubent
kubent                   # scans all live objects against deprecation table

# 2. Check Helm chart compatibility with target K8s version
helm search repo <chart> --versions | head -5

# 3. Snapshot etcd before upgrading
sudo k3s etcd-snapshot save --name pre-upgrade-$(date +%Y%m%d)

# 4. Check PodDisruptionBudgets — draining nodes must not violate them
kubectl get pdb -A

# 5. Confirm all nodes are healthy
kubectl get nodes
kubectl get pods -A | grep -v Running | grep -v Completed

# 6. Check Cilium/CNI compatibility with target K8s version
cilium version
```

---

### Talos Linux Upgrade

```bash
# Upgrade Talos OS (node by node)
talosctl upgrade \
  --nodes <node-ip> \
  --image ghcr.io/siderolabs/installer:v1.9.5 \
  --talosconfig ~/talos-config/talosconfig

# Upgrade Kubernetes control plane on Talos
talosctl upgrade-k8s \
  --nodes <control-plane-ip> \
  --to 1.32.3 \
  --talosconfig ~/talos-config/talosconfig

# Monitor upgrade
talosctl dmesg -f --nodes <node-ip>
kubectl get nodes -w
```


---

## Local Development & Cluster Intercept

A major pain point in microservices development: "how do I test my local code against real cluster services?" These tools solve it differently — each has trade-offs.

| Tool | Approach | Best For |
|------|----------|----------|
| **mirrord** | Intercepts traffic at the kernel level; your local process runs as if it's inside the cluster | Single service dev with full cluster context |
| **Telepresence** | Replaces a cluster pod with a local proxy; routes traffic bidirectionally | Replacing a specific deployment during dev |
| **Tilt** | Watches files, rebuilds/redeploys on save; dev cluster orchestration | Full inner loop automation |
| **Skaffold** | Build → push → deploy pipeline on file change | CI-like local flow; GKE-native |
| **ko** | Build Go container images without Dockerfiles; OCI-native | Go services with minimal build friction |

---

### mirrord (Run Local Code in Cluster Context)

**Purpose:** mirrord intercepts the local process at the OS level — your local service reads from the cluster's file system, environment variables, and DNS, and receives a mirror of real cluster traffic. Zero code changes. Zero cluster modifications. The most transparent intercept tool.

```bash
# Install
nix-env -iA nixpkgs.mirrord
# or:
curl -fsSL https://raw.githubusercontent.com/metalbear-co/mirrord/main/scripts/install.sh | bash

# Run your local process in the context of a cluster pod
# mirrord intercepts at the syscall level — your process thinks it's running in the pod
mirrord exec --target pod/myapp-xyz-abc -n myapp -- python app.py

# Target a deployment (picks a random pod)
mirrord exec --target deployment/myapp -n myapp -- node server.js

# Mirror traffic (copy) without stealing it from the real pod
mirrord exec --target deployment/myapp -n myapp \
  --mirror-mode -- ./myapp-binary

# Use a mirrord config file (recommended for teams)
mirrord exec --config-file .mirrord/mirrord.json -- python app.py
```

```json
// .mirrord/mirrord.json — checked into the repo
{
  "target": {
    "path": "deployment/myapp",
    "namespace": "myapp"
  },
  "feature": {
    "network": {
      "incoming": "mirror",
      "outgoing": { "unix_streams": true }
    },
    "fs": "read",
    "env": true
  }
}
```

```bash
# IDE integration — run from VS Code launch config
# .vscode/launch.json:
# "type": "mirrord",
# "target": "deployment/myapp"

# Check what mirrord is intercepting
mirrord ls --target deployment/myapp -n myapp
```

> **mirrord vs Telepresence:** mirrord operates at the OS syscall layer — no cluster-side agent or privileged DaemonSet required. Telepresence requires a `traffic-agent` sidecar injected into the target pod. For most homelab/self-hosted setups, mirrord is simpler to install and works without cluster-admin for the agent.

---

### Telepresence (Bidirectional Cluster-Local Bridge)

**Purpose:** Replaces a running pod with a local proxy. All traffic destined for the cluster service gets routed to your local machine. Your local process can reach all cluster services by name.

```bash
# Install
curl -fL https://app.getambassador.io/download/tel2/linux/amd64/latest/telepresence -o /usr/local/bin/telepresence
chmod +x /usr/local/bin/telepresence

# Connect (installs Traffic Manager in cluster once)
telepresence connect

# After connect — your laptop can reach cluster services directly
curl http://myapp.myapp.svc.cluster.local:8080/health

# Intercept a deployment — route cluster traffic to your local port 8080
telepresence intercept myapp --namespace myapp --port 8080:8080

# Run your local code (receives real cluster traffic)
python app.py

# List active intercepts
telepresence list -n myapp

# Leave intercept
telepresence leave myapp-myapp

# Disconnect
telepresence quit
```

---

### Tilt (Inner Development Loop Orchestration)

**Purpose:** Watches your source files, rebuilds container images incrementally, applies Kubernetes manifests, and streams logs — all in one terminal. The fastest inner loop for Kubernetes-native development.

```bash
nix-env -iA nixpkgs.tilt
# or: curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash
```

```python
# Tiltfile (Python-like DSL)
# Build the image when source changes
docker_build(
    'harbor.home.local/myorg/myapp',
    '.',
    dockerfile='Containerfile',
    live_update=[
        # Sync Python files without a full rebuild
        sync('./src', '/app/src'),
        run('pip install -r requirements.txt', trigger=['requirements.txt']),
    ]
)

# Apply Kubernetes manifests
k8s_yaml(['k8s/deployment.yaml', 'k8s/service.yaml'])

# Define the resource for port-forwarding and log grouping
k8s_resource(
    'myapp',
    port_forwards='8080:8080',
    labels=['backend']
)

# Depend on a Helm chart
helm_resource('nginx-gateway-fabric',
    chart='oci://ghcr.io/nginx/charts/nginx-gateway-fabric',
    namespace='nginx-gateway',
    labels=['infra']
)
```

```bash
tilt up          # starts the dev loop
tilt down        # tears down
tilt ci          # run in CI mode (exit after all resources healthy)
```

---

### Skaffold (Build-Deploy Inner Loop)

**Purpose:** Google's build-test-deploy loop tool. Watches sources, builds images with Kaniko/Docker/Buildpacks, pushes to registry, and deploys via Helm or kubectl. Strong GKE integration but works everywhere.

```bash
nix-env -iA nixpkgs.skaffold
```

```yaml
# skaffold.yaml
apiVersion: skaffold/v4beta9
kind: Config
metadata:
  name: myapp
build:
  artifacts:
    - image: harbor.home.local/myorg/myapp
      docker:
        dockerfile: Containerfile
      sync:
        infer: ["**/*.py"]    # hot-reload Python without rebuild
  local:
    push: true
    useBuildkit: true
deploy:
  helm:
    releases:
      - name: myapp
        chartPath: charts/myapp
        valuesFiles:
          - charts/myapp/values-dev.yaml
        setValues:
          image.tag: "{{.IMAGE_TAG}}"
profiles:
  - name: ci
    build:
      artifacts:
        - image: harbor.home.local/myorg/myapp
          kaniko:
            cache: { repo: harbor.home.local/myorg/myapp-cache }
```

```bash
skaffold dev          # watch mode — rebuild/redeploy on change
skaffold run          # one-shot build and deploy
skaffold build        # build only (use in CI)
skaffold delete       # clean up
```

---

### ko (Build Go Images Without Dockerfiles)

**Purpose:** Build Go binaries directly into OCI container images — no Dockerfile, no Docker daemon. Produces minimal images with the Go binary and its dependencies only. Ideal for Go-based controllers and operators.

```bash
nix-env -iA nixpkgs.ko
export KO_DOCKER_REPO=harbor.home.local/myorg

# Build and push a Go binary as an OCI image
ko build ./cmd/myapp

# Build and apply Kubernetes manifests (replaces image references automatically)
ko apply -f k8s/

# Use a specific base image
KO_DEFAULTBASEIMAGE=gcr.io/distroless/static:nonroot ko build ./cmd/myapp

# Multi-arch build
GOARCH=arm64 ko build ./cmd/myapp
```

---

## SPIFFE/SPIRE — Workload Identity

**Purpose:** SPIFFE (Secure Production Identity Framework for Everyone) is the CNCF standard for workload identity. SPIRE is the reference implementation. Every pod gets a cryptographically verifiable X.509 SVID (SPIFFE Verifiable Identity Document) — even across clusters and clouds. This is the foundation for zero-trust between services.

> **Why SPIFFE over Kubernetes ServiceAccounts?** ServiceAccount tokens are Kubernetes-scoped and rotate on a fixed schedule. SPIFFE SVIDs are short-lived (minutes), automatically rotated, and can federate across clusters, VMs, and clouds — enabling mTLS between services that don't share a Kubernetes cluster.

```bash
# Install SPIRE on Kubernetes
kubectl apply -f https://spiffe.io/downloads/spire-crds.yaml

helm repo add spiffe https://spiffe.github.io/helm-charts/
helm upgrade --install spire spiffe/spire \
  --namespace spire-system --create-namespace \
  --set spire-server.trustDomain=homelab.local \
  --set spire-agent.trustDomain=homelab.local
```

```bash
# Register a workload (automatic via k8s attestor)
kubectl exec -n spire-system spire-server-0 -- \
  /opt/spire/bin/spire-server entry create \
  -spiffeID spiffe://homelab.local/ns/myapp/sa/myapp \
  -parentID spiffe://homelab.local/k8s-workload-registrar/myapp/node \
  -selector k8s:ns:myapp \
  -selector k8s:sa:myapp

# Check registered entries
kubectl exec -n spire-system spire-server-0 -- \
  /opt/spire/bin/spire-server entry show

# Verify a pod has received its SVID
kubectl exec -n myapp deploy/myapp -- \
  /opt/spire/bin/spire-agent api fetch x509 -socketPath /run/spire/sockets/agent.sock
```

```yaml
# Mount the SPIFFE workload API socket in your pod
spec:
  volumes:
    - name: spiffe-workload-api
      csi:
        driver: "csi.spiffe.io"
        readOnly: true
  containers:
    - name: myapp
      volumeMounts:
        - name: spiffe-workload-api
          mountPath: /run/spire/sockets
          readOnly: true
      env:
        - name: SPIFFE_ENDPOINT_SOCKET
          value: unix:///run/spire/sockets/agent.sock
```

> **Cilium + SPIFFE:** Cilium's mTLS uses WireGuard at the node level. SPIFFE/SPIRE adds per-workload identity for zero-trust that survives pod migration and multi-cluster federation.

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

## Cluster API (CAPI)

**Purpose:** Declarative, Kubernetes-native cluster lifecycle management. Define clusters as CRDs — create, upgrade, scale, and delete entire Kubernetes clusters the same way you manage application workloads. Supports AWS, Azure, GCP, vSphere, bare-metal (via Tinkerbell), and more.

```bash
# Install clusterctl
curl -L https://github.com/kubernetes-sigs/cluster-api/releases/latest/download/clusterctl-linux-amd64 \
  -o ~/.local/bin/clusterctl && chmod +x ~/.local/bin/clusterctl

# Initialize CAPI with a provider (e.g., Docker for local testing)
clusterctl init --infrastructure docker

# Check installed providers
clusterctl describe provider --all

# Generate a cluster manifest
clusterctl generate cluster capi-test \
  --flavor development \
  --kubernetes-version v1.32.3 \
  --control-plane-machine-count=1 \
  --worker-machine-count=2 > capi-test-cluster.yaml

kubectl apply -f capi-test-cluster.yaml

# Watch provisioning
clusterctl describe cluster capi-test
kubectl get machines -A -w

# Get the kubeconfig for the new cluster
clusterctl get kubeconfig capi-test > ~/.kube/capi-test.kubeconfig
export KUBECONFIG=~/.kube/capi-test.kubeconfig
kubectl get nodes
```

```yaml
# Example: Cluster object (infrastructure-agnostic)
apiVersion: cluster.x-k8s.io/v1beta1
kind: Cluster
metadata:
  name: production-cluster
  namespace: default
spec:
  clusterNetwork:
    pods:
      cidrBlocks: ["192.168.0.0/16"]
  infrastructureRef:
    apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
    kind: DockerCluster     # swap for AWSCluster, AzureCluster, etc.
    name: production-cluster
  controlPlaneRef:
    apiVersion: controlplane.cluster.x-k8s.io/v1beta1
    kind: KubeadmControlPlane
    name: production-cluster-cp
```

```bash
# Upgrade a managed cluster
clusterctl upgrade plan
kubectl patch kubeadmcontrolplane production-cluster-cp \
  --type=merge \
  -p '{"spec":{"version":"v1.33.0"}}'

# Scale workers
kubectl scale machinedeployment production-cluster-md-0 --replicas=5

# Delete the cluster (removes all cloud resources)
kubectl delete cluster production-cluster
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

## Robusta — Kubernetes Operations Platform

**Purpose:** Robusta enriches Prometheus alerts with context — when an alert fires, Robusta automatically attaches pod logs, recent events, CPU/memory graphs, and related Kubernetes objects to the Slack/Teams notification. It also runs automated playbooks (auto-remediation) and provides a full Kubernetes observability UI.

```bash
pip install robusta-cli --break-system-packages
robusta gen-config        # generates generated_values.yaml interactively

helm repo add robusta https://robusta-charts.storage.googleapis.com
helm upgrade --install robusta robusta/robusta \
  --namespace robusta --create-namespace \
  -f generated_values.yaml
```

```yaml
# ~/k8s/robusta-playbooks.yaml — custom automated actions
customPlaybooks:
  # Auto-remediation: restart pod on OOMKilled
  - triggers:
      - on_pod_oom_killer:
          rate_limit: 3600  # max once per hour per pod
    actions:
      - restart_pod: {}
      - create_finding:
          title: "OOMKilled: $pod auto-restarted"
          severity: LOW

  # Enrichment: add thread dump to Java OOM alerts
  - triggers:
      - on_prometheus_alert:
          alert_name: JavaOOM
    actions:
      - java_thread_dump: {}
      - alert_enrichment: {}

  # Silence an alert that fires during deployments
  - triggers:
      - on_prometheus_alert:
          alert_name: KubePodCrashLooping
    actions:
      - alert_suppress_if_deploying: {}
```

```bash
kubectl -n robusta get pods
kubectl -n robusta logs -l app.kubernetes.io/name=robusta-runner -f

# Trigger a test finding
robusta playbooks trigger prometheus_alert AlertName=Watchdog namespace=default
```

---

## Dagger — Portable CI Engine

**Purpose:** Define CI pipelines in real code (Go, Python, TypeScript) that run identically locally and in any CI system. Dagger pipelines are container-native — each step is a container, results are cached across runs.

```bash
# Install Dagger CLI
curl -L https://dl.dagger.io/dagger/install.sh | sh
mv bin/dagger ~/.local/bin/

# Or via nix (may be behind on version)
nix-env -iA nixpkgs.dagger
```

```python
# dagger/main.py — Python SDK example
import dagger
import anyio

async def main():
    async with dagger.Connection() as client:
        # Build and test a Go app
        src = client.host().directory(".")
        
        build = (
            client.container()
            .from_("golang:1.23-alpine")
            .with_mounted_directory("/src", src)
            .with_workdir("/src")
            .with_exec(["go", "build", "-o", "myapp", "./cmd/myapp"])
            .with_exec(["go", "test", "./..."])
        )
        
        # Get the binary
        binary = await build.file("/src/myapp").export("./myapp")
        
        # Build the final minimal image
        image = (
            client.container()
            .from_("gcr.io/distroless/static:nonroot")
            .with_file("/myapp", build.file("/src/myapp"))
            .with_entrypoint(["/myapp"])
        )
        
        # Push to registry
        await image.publish("harbor.home.local/myorg/myapp:latest")

anyio.run(main)
```

```bash
# Run the pipeline locally (same containers as CI)
dagger run python dagger/main.py

# Run in CI (Woodpecker example)
# .woodpecker.yml:
# steps:
#   - name: build
#     image: python:3.12
#     commands:
#       - pip install dagger-io
#       - python dagger/main.py
```

> **Dagger vs Tekton:** Tekton is cluster-native and fits Kubernetes-only workflows. Dagger is language-native — the same pipeline runs in your terminal, GitHub Actions, GitLab CI, or Tekton. Use Dagger when your developers need to run CI locally without a cluster.

---

## Buildpacks & Image Build Strategies

A comparison of in-cluster and local image build strategies:

| Tool | Approach | Image size | Requires Docker | SBOM | Best for |
|------|----------|-----------|-----------------|------|----------|
| **Docker/Podman** | Dockerfile | Varies | Yes/No | Manual | General purpose |
| **Kaniko** | Dockerfile, no daemon | Varies | No | Manual | In-cluster CI |
| **ko** | Go source → OCI | Minimal | No | Auto | Go controllers/operators |
| **Buildpacks (pack)** | Source → image, no Dockerfile | Optimized | Yes (or buildpackd) | Auto | App developers; PaaS-style |
| **Buildah** | Dockerfile, rootless | Varies | No | Manual | Rootless environments |
| **Buildkit** | Dockerfile, cache mounts | Varies | No (standalone) | Manual | Advanced Dockerfile features |

### Cloud Native Buildpacks (pack CLI)

**Purpose:** Build production OCI images from source code without a Dockerfile. Detects language/runtime automatically. Generates SBOMs. Produces reproducible, optimized images.

```bash
nix-env -iA nixpkgs.pack

# Auto-detect and build
pack build harbor.home.local/myorg/myapp:latest \
  --path ./myapp-source \
  --builder paketobuildpacks/builder-jammy-base

# Build with a specific buildpack
pack build harbor.home.local/myorg/myapp:latest \
  --buildpack gcr.io/paketo-buildpacks/python \
  --path .

# Generate SBOM during build
pack build myapp:latest --sbom-output-dir ./sbom/

# Inspect what buildpack was used
pack inspect-image harbor.home.local/myorg/myapp:latest
```

