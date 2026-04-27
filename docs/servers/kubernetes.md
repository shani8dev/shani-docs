---
title: Kubernetes & Container Orchestration
section: Self-Hosting & Servers
updated: 2026-04-27
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

1. [Key Concepts](#key-concepts)
2. [Distributions](#distributions)
3. [Disk Layout & CLI Tools](#disk-layout--cli-tools)
4. [Networking & Ingress](#networking--ingress)
5. [DNS](#dns)
6. [TLS & Certificate Management](#tls--certificate-management)
7. [Storage](#storage)
8. [NFS & Shared Storage](#nfs--shared-storage)
9. [MinIO (Self-Hosted S3)](#minio-self-hosted-s3)
10. [Security & Policy](#security--policy)
11. [Secrets Management](#secrets-management)
12. [Workload Patterns](#workload-patterns)
13. [Workload Patterns (Advanced)](#workload-patterns-advanced)
14. [Deployment Strategies Deep Dive](#deployment-strategies-deep-dive)
15. [Autoscaling](#autoscaling)
16. [GitOps & Continuous Delivery](#gitops--continuous-delivery)
17. [Advanced GitOps Patterns](#advanced-gitops-patterns)
18. [Progressive Delivery](#progressive-delivery)
19. [In-Cluster CI/CD & Build](#in-cluster-cicd--build)
20. [Image Supply Chain Security](#image-supply-chain-security)
21. [Policy as Code — CI Gates](#policy-as-code--ci-gates)
22. [Observability](#observability)
23. [Grafana Dashboards as Code](#grafana-dashboards-as-code)
24. [Alerting & On-Call](#alerting--on-call)
25. [Service Mesh](#service-mesh)
26. [Backup & Disaster Recovery](#backup--disaster-recovery)
27. [Platform Engineering](#platform-engineering)
28. [Operator Pattern & Custom Resources](#operator-pattern--custom-resources)
29. [Cluster Management UIs](#cluster-management-uis)
30. [Multi-Tenancy & Audit](#multi-tenancy--audit)
31. [Helm — Advanced Usage](#helm--advanced-usage)
32. [Cluster Hardening](#cluster-hardening)
33. [Deprecated API Migration](#deprecated-api-migration)
34. [Network Troubleshooting](#network-troubleshooting)
35. [Multi-Architecture Builds](#multi-architecture-builds)
36. [Multi-Cluster](#multi-cluster)
37. [Zot (Lightweight OCI Registry)](#zot-lightweight-oci-registry)
38. [Beyla (eBPF Auto-Instrumentation)](#beyla-ebpf-auto-instrumentation--no-code-changes)
39. [kubectl Power Usage](#kubectl-power-usage)
40. [Gateway API — Advanced Patterns](#gateway-api--advanced-patterns)
41. [Daily Operations](#daily-operations)
42. [Caddy Configuration Reference](#caddy-configuration-reference)
43. [Troubleshooting](#troubleshooting)

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

#### RBAC mental model

Every action is: a **verb** (`get`, `list`, `watch`, `create`, `update`, `patch`, `delete`) on a **resource** (`pods`, `deployments`, `secrets`) in a **namespace**. A Role defines allowed combinations; a RoleBinding binds it to a subject. ClusterRole/ClusterRoleBinding apply cluster-wide.

```bash
kubectl auth can-i --list --as system:serviceaccount:default:myapp
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

#### DORA metrics

Four metrics measure software delivery performance: **Deployment Frequency**, **Lead Time for Changes** (commit to production), **Change Failure Rate** (% of deployments causing incidents), and **Time to Restore** (MTTR). Elite teams: multiple deploys/day, <1h lead time, <5% failure rate, <1h recovery. These predict team health — low deployment frequency predicts burnout; high failure rate predicts firefighting culture.

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

**Purpose:** Provision and manage Kubernetes clusters using CRDs. Define a `Cluster` resource and CAPI provisions control plane + worker nodes on your chosen infrastructure provider (Hetzner, AWS, vSphere).

```bash
nix-env -iA nixpkgs.clusterctl
clusterctl init --infrastructure hetzner

clusterctl generate cluster my-workload \
  --kubernetes-version v1.30.0 \
  --control-plane-machine-count 1 \
  --worker-machine-count 2 \
  > my-workload-cluster.yaml

kubectl apply -f my-workload-cluster.yaml
clusterctl describe cluster my-workload
clusterctl get kubeconfig my-workload > ~/.kube/my-workload.kubeconfig
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

kubectl ctx k3s-homelab
kubectl ns monitoring
kubectl tree deployment myapp
kubectl neat get pod myapp-xyz
kubectl df-pv
```

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

### NGINX Gateway Fabric (NGF)

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

---

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

**Init containers** run to completion before main containers start — DB migrations, waiting for dependencies, fetching config from a secret store.

```yaml
spec:
  initContainers:
    - name: db-migrate
      image: myapp:v1.4.2
      command: ["python", "manage.py", "migrate", "--noinput"]
      env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: myapp-secrets
              key: database-url
  containers:
    - name: myapp
      image: myapp:v1.4.2
```

**Sidecar containers** run alongside the main container for its full lifetime. Common uses: log shipping (Fluentbit), metrics exporters. With Cilium as CNI, you do **not** need Envoy sidecars for L7 visibility — Cilium handles this at the node level.

```yaml
spec:
  containers:
    - name: myapp
      image: myapp:latest
    - name: log-shipper
      image: fluent/fluent-bit:latest
      volumeMounts:
        - name: log-volume
          mountPath: /var/log/app
  volumes:
    - name: log-volume
      emptyDir: {}
```

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

### Karpenter (Node Autoscaling)

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

### OpenCost (Kubernetes Cost Monitoring)

**Purpose:** Real-time cost visibility — which namespace, deployment, or label is spending what, broken down by CPU, RAM, storage, and network.

```bash
kubectl apply -f https://raw.githubusercontent.com/opencost/opencost/develop/kubernetes/opencost.yaml
kubectl port-forward -n opencost svc/opencost 9090:9090 9003:9003
```

```yaml
# ~/k8s/opencost-values.yaml — custom on-prem pricing
opencost:
  customPricing:
    enabled: true
    provider: custom
    costModel:
      CPU: "0.01"
      RAM: "0.005"
      storage: "0.0001"
      network: "0.0"
```

```bash
curl "http://localhost:9003/allocation?window=7d&aggregate=namespace" | python3 -m json.tool
curl "http://localhost:9003/allocation?window=24h&aggregate=deployment"
curl "http://localhost:9003/allocation?window=7d&aggregate=label:team"
```

**Caddy:** `opencost.home.local { tls internal; reverse_proxy localhost:9090 }`

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

restic backup ~/.kube ~/k8s
```

---

## Platform Engineering

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

---

### Observability

| Issue | Solution |
|-------|----------|
| k9s shows no resources | Check active namespace `:ns`; switch context `:ctx` |
| Dashboard `Unauthorized` | `kubectl -n kubernetes-dashboard create token admin-user` |
| Headlamp shows no clusters | Ensure kubeconfig mounted read-only; `server:` URL reachable from container |
| Loki shows no logs | Check Promtail/Alloy pods; verify `lokiAddress` matches Loki service name |
| Tempo shows no traces | Check OTel Collector receiving spans; verify `endpoint` in Instrumentation CRD |
| SonarQube / Elasticsearch OOM | `vm.max_map_count=524288` on host; restart pod |


---

## Alerting & On-Call

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

## Additional Troubleshooting

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
