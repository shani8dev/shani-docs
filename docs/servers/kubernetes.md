---
title: Kubernetes & Container Orchestration
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Kubernetes & Container Orchestration

Lightweight and production-grade Kubernetes distributions, cluster management, GitOps, ingress, storage, and observability — all self-hosted on Shani OS.

> ⚠️ **Prerequisites**: Kubernetes requires `vm.max_map_count=524288` and sufficient RAM (2 GB minimum per node, 4 GB+ recommended). Some distributions need `br_netfilter` and IP forwarding enabled. CLI tools (`kubectl`, `helm`, `k9s`, etc.) install via **Nix** (primary) or **Snap** as a fallback — see the install one-liner in the disk layout section below. k3s and MicroK8s bundle their own `kubectl` — you only need a separate install for standalone or remote-cluster access.

> **Shani OS install note:** `/usr/local` is part of the read-only OS root. The curl-based installers for k3s, k0s, and RKE2 default to writing their binaries there. All three support an environment variable to redirect the binary to `~/.local/bin` (which lives in `@home` and persists across OS updates) — the install commands below include this already. Add `~/.local/bin` to your `PATH` once in `~/.bashrc`:</p>
> ```bash
> echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
> ```

---

## Choosing a Distribution

| Distribution | Best For | RAM (min) | Install via | Notes |
|---|---|---|---|---|
| **k3s** | Single-node homelabs, edge | 512 MB | curl installer (`~/.local/bin`) | Batteries-included, easiest to start |
| **k0s** | Minimal, air-gapped | 1 GB | curl installer (`~/.local/bin`) | Single binary, no external deps |
| **MicroK8s** | Quick local cluster, addons | 2 GB | **Snap** | Canonical-maintained; DNS, ingress, registry as addons |
| **minikube** | Local dev, driver choice | 2 GB | Nix or **Snap** | Runs via Podman driver on Shani OS |
| **kind** | Lightweight dev/CI | 2 GB | Nix | Runs K8s inside Podman containers |
| **RKE2** | Hardened, production | 4 GB | curl installer (`~/.local/bin`) | CIS-benchmarked, STIG-ready |
| **Talos** | Immutable infra, GitOps | 2 GB | talosctl | API-only, no SSH, extremely secure |

---

## Where Kubernetes Lives on Disk

k3s, k0s, and RKE2 are **system services** managed by systemd — their data lives under `/var/lib/rancher/` (k3s/RKE2) or `/var/lib/k0s/` (k0s), which persist across OS updates and rollbacks just like your `@containers` subvolume. Helm chart state and kubeconfig live in `~/.kube/` and `~/.config/helm/` inside `@home`.

```
/var/lib/rancher/k3s/    ← k3s data, etcd snapshots, kubeconfig
/var/lib/k0s/            ← k0s data
~/.kube/config           ← kubeconfig (in @home, survives updates)
~/.config/helm/          ← Helm repos and release cache
```

**Install all CLI tools — Nix (primary):**
```bash
nix-env -iA nixpkgs.kubectl nixpkgs.kubernetes-helm nixpkgs.k9s nixpkgs.argocd nixpkgs.fluxcd nixpkgs.velero nixpkgs.kubeseal nixpkgs.kind nixpkgs.minikube
```

**Snap alternatives** for `kubectl` and `helm` (auto-update, classic confinement):
```bash
snap install kubectl --classic
snap install helm --classic
```

> 💡 `k9s` exists on the Snap Store but is flagged as unmaintained there — use the Nix package instead. `argocd`, `flux`, `velero`, and `kubeseal` CLIs are not on the Snap Store — Nix is the only option.

---

## k3s (Lightweight CNCF Kubernetes)

**Purpose:** Lightweight, CNCF-certified Kubernetes. Ships with containerd, CoreDNS, Flannel, Traefik, local-path provisioner, and metrics-server out of the box. Single binary under 70 MB. Ideal for a single Shani OS node or small multi-node cluster.

### Single-Node Install

```bash
# Kernel prerequisites
sudo sysctl -w vm.max_map_count=524288
echo "vm.max_map_count=524288" | sudo tee /etc/sysctl.d/99-k8s.conf
sudo modprobe br_netfilter
echo "br_netfilter" | sudo tee /etc/modules-load.d/br_netfilter.conf

# Install k3s
# Shani OS has a read-only /usr/local — redirect the binary to ~/.local/bin (in @home)
mkdir -p ~/.local/bin
curl -sfL https://get.k3s.io | INSTALL_K3S_BIN_DIR=~/.local/bin sh -

# Ensure ~/.local/bin is on your PATH (add to ~/.bashrc if not already present)
export PATH="$HOME/.local/bin:$PATH"

# Verify cluster is running
sudo k3s kubectl get nodes
```

**Set up kubeconfig for your user:**
```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config
chmod 600 ~/.kube/config
# Replace 127.0.0.1 with your server IP if accessing remotely
export KUBECONFIG=~/.kube/config
```

**Firewall (multi-node):**
```bash
# API server
sudo firewall-cmd --add-port=6443/tcp --permanent
# Flannel VXLAN
sudo firewall-cmd --add-port=8472/udp --permanent
# Metrics server
sudo firewall-cmd --add-port=10250/tcp --permanent
sudo firewall-cmd --reload
```

### Adding Worker Nodes

```bash
# On the server node — get the join token
sudo cat /var/lib/rancher/k3s/server/node-token

# On each worker node
mkdir -p ~/.local/bin
curl -sfL https://get.k3s.io | INSTALL_K3S_BIN_DIR=~/.local/bin K3S_URL=https://<server-ip>:6443 K3S_TOKEN=<token> sh -
```

### Common k3s Operations

```bash
# Check cluster status
kubectl get nodes -o wide
kubectl get pods -A

# View k3s server logs
sudo journalctl -u k3s -f

# Uninstall k3s (server)
~/.local/bin/k3s-uninstall.sh

# Uninstall k3s (agent/worker)
~/.local/bin/k3s-agent-uninstall.sh

# Restart k3s
sudo systemctl restart k3s

# Drain a node before maintenance
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# Uncordon a node after maintenance
kubectl uncordon <node-name>
```

---

## k0s (Minimal Single Binary)

**Purpose:** Zero-dependency Kubernetes in a single binary. No external etcd, no OS package requirements. Install anywhere, run as a systemd service. Good for immutable-OS setups where you want minimal footprint.

```bash
# Download and install
# Shani OS has a read-only /usr/local — download the binary to ~/.local/bin (in @home)
mkdir -p ~/.local/bin
curl -sSLf https://get.k0s.sh | K0S_INSTALL_PATH=~/.local/bin sudo sh

# Install as a systemd service and start
sudo k0s install controller --single
sudo k0s start

# Get kubeconfig
sudo k0s kubeconfig admin > ~/.kube/config
chmod 600 ~/.kube/config

# Verify
kubectl get nodes
```

**Common operations:**
```bash
# View k0s status
sudo k0s status

# View logs
sudo journalctl -u k0scontroller -f

# Stop and reset
sudo k0s stop
sudo k0s reset
```

---

## MicroK8s (Snap — Addon-Driven Local Cluster)

**Purpose:** Canonical's single-package Kubernetes distribution — installed entirely as a Snap. Ships with a built-in addon system: enable DNS, ingress, a private registry, the dashboard, Prometheus, and more with single commands. The fastest way to get a working cluster with extras on Shani OS without touching the OS root.

```bash
# Install MicroK8s — Snap only, no Nix equivalent
sudo snap install microk8s --classic --channel=1.33/stable

# Add your user to the microk8s group (avoids sudo for every command)
sudo usermod -aG microk8s $USER
mkdir -p ~/.kube && chmod 0700 ~/.kube
# Log out and back in for group change to take effect

# Wait for cluster to be ready
microk8s status --wait-ready

# Enable essential addons
microk8s enable dns
microk8s enable ingress
microk8s enable hostpath-storage   # default StorageClass
microk8s enable registry           # private registry on localhost:32000
microk8s enable dashboard          # Kubernetes Dashboard
microk8s enable metrics-server
```

**Export kubeconfig to use with standard `kubectl`:**
```bash
microk8s config > ~/.kube/config
chmod 600 ~/.kube/config
```

**Common operations:**
```bash
# Check status and enabled addons
microk8s status

# Use the bundled kubectl (no separate install needed)
microk8s kubectl get nodes
microk8s kubectl get pods -A

# Or alias it
echo "alias kubectl='microk8s kubectl'" >> ~/.bashrc

# Stop / start the cluster (without uninstalling)
microk8s stop
microk8s start

# Enable Prometheus + Grafana stack
microk8s enable observability

# Push an image to the built-in registry
# podman-docker shim is pre-installed on Shani OS, but use podman directly:
podman tag myapp:latest localhost:32000/myapp:latest
podman push localhost:32000/myapp:latest --tls-verify=false

# Uninstall
sudo snap remove microk8s
```

**Firewall:**
```bash
sudo firewall-cmd --add-port=16443/tcp --permanent   # MicroK8s API server
sudo firewall-cmd --add-port=10250/tcp --permanent   # Kubelet
sudo firewall-cmd --reload
```

> 💡 MicroK8s stores all cluster data inside the Snap's own directory (`/var/snap/microk8s/`) which lives in `@snapd` and persists across OS updates and rollbacks. It does not use `/var/lib/rancher/` or `/var/lib/k0s/`.

---

## minikube (Local Dev — Podman Driver)

**Purpose:** Single-node local Kubernetes for development and testing. Unlike kind (which uses containers), minikube can use multiple drivers — on Shani OS use the **Podman driver** to avoid needing a VM. Install via Nix or Snap.

```bash
# Install via Nix (primary)
nix-env -iA nixpkgs.minikube

# Or via Snap
snap install minikube

# Start with Podman driver (rootless, no VM needed)
minikube start --driver=podman --container-runtime=containerd

# Verify
minikube status
kubectl get nodes
```

**Common operations:**
```bash
# Open the Kubernetes Dashboard in browser
minikube dashboard

# Get the URL for a NodePort service
minikube service myapp --url

# Load a local Podman image into minikube
minikube image load myapp:latest

# Enable addons
minikube addons enable ingress
minikube addons enable metrics-server
minikube addons list

# Pause cluster (saves RAM without deleting)
minikube pause

# Resume
minikube unpause

# Stop and delete cluster
minikube stop
minikube delete
```

> 💡 Use **kind** when you need multi-node clusters for CI. Use **minikube** when you want a richer local dev experience with addons, a dashboard, and easy service URLs.

---

## kind (Kubernetes in Podman — for Dev/CI)

**Purpose:** Run a full Kubernetes cluster inside Podman containers — no VMs. Use kind for lightweight local development and integration testing in Woodpecker/Forgejo CI pipelines. On Shani OS, kind runs on top of Podman via the `podman-docker` compatibility shim (pre-installed).

```bash
# Install kind via Nix
nix-env -iA nixpkgs.kind

# Tell kind to use Podman
export KIND_EXPERIMENTAL_PROVIDER=podman

# Create a single-node cluster
kind create cluster --name homelab

# Create a multi-node cluster
cat > ~/kind-multinode.yaml << 'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
EOF

kind create cluster --name multinode --config ~/kind-multinode.yaml

# List clusters
kind get clusters

# Load a local image into kind (avoids registry push)
kind load docker-image myapp:latest --name homelab

# Delete cluster
kind delete cluster --name homelab
```

---

## RKE2 (Hardened Production Kubernetes)

**Purpose:** Rancher's security-focused Kubernetes distribution. CIS Kubernetes Benchmark compliant out of the box. Suitable when you need audit logs, PSA policies, and a hardened default configuration.

```bash
# Install on the server node
# Shani OS has a read-only /usr/local — redirect the binary to ~/.local/bin (in @home)
mkdir -p ~/.local/bin
curl -sfL https://get.rke2.io | INSTALL_RKE2_BIN_DIR=~/.local/bin sudo sh -

# Configure
sudo mkdir -p /etc/rancher/rke2
cat | sudo tee /etc/rancher/rke2/config.yaml << 'EOF'
tls-san:
  - <your-server-ip>
  - rke2.home.local
cni: canal
EOF

# Enable and start
sudo systemctl enable --now rke2-server

# Get kubeconfig
sudo cp /etc/rancher/rke2/rke2.yaml ~/.kube/config
sudo chown $USER ~/.kube/config
chmod 600 ~/.kube/config
export PATH="$HOME/.local/bin:/var/lib/rancher/rke2/bin:$PATH"
```

---

## Helm (Kubernetes Package Manager)

**Purpose:** Install, upgrade, and manage complex Kubernetes applications from charts. Most self-hosted apps (cert-manager, ingress-nginx, Longhorn, ArgoCD) are best deployed via Helm.

```bash
# Install via Nix (primary)
nix-env -iA nixpkgs.kubernetes-helm

# Or via Snap
snap install helm --classic

# Add common repos
helm repo add stable https://charts.helm.sh/stable
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add cert-manager https://charts.jetstack.io
helm repo add longhorn https://charts.longhorn.io
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

# Search for a chart
helm search repo ingress-nginx

# Install a chart
helm install my-nginx ingress-nginx/ingress-nginx --namespace ingress-nginx --create-namespace

# List installed releases
helm list -A

# Upgrade a release
helm upgrade my-nginx ingress-nginx/ingress-nginx

# Uninstall
helm uninstall my-nginx -n ingress-nginx

# Show all configurable values for a chart
helm show values ingress-nginx/ingress-nginx
```

---

## Gateway API (Next-Generation Ingress)

**Purpose:** The official successor to Kubernetes Ingress resources. Gateway API provides a richer, more expressive routing model — HTTP routes, gRPC routes, TCP routes, TLS termination, traffic splitting, and header-based routing — all as first-class CRDs rather than annotations. cert-manager, ingress-nginx v1.9+, Cilium, and most modern ingress controllers now support it. Deploy Gateway API alongside (or instead of) `Ingress` resources for new workloads.

```bash
# Install the Gateway API CRDs (standard channel)
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/latest/download/standard-install.yaml

# For experimental features (GRPCRoute, TCPRoute, etc.)
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/latest/download/experimental-install.yaml
```

**Create a GatewayClass and Gateway (ingress-nginx example):**
```yaml
# ~/k8s/gateway.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: nginx
spec:
  controllerName: k8s.io/ingress-nginx
---
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
```

**HTTPRoute — route traffic to a service:**
```yaml
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

```bash
kubectl apply -f ~/k8s/gateway.yaml
kubectl get gateways
kubectl get httproutes
```

> **Gateway API vs Ingress:** Use Gateway API for new workloads — it is the upstream direction. Keep existing Ingress resources as-is unless migrating. Both can coexist in the same cluster.

---

## HPA — Horizontal Pod Autoscaler

**Purpose:** Automatically scales the number of pod replicas in a Deployment or StatefulSet based on observed CPU utilisation, memory, or custom metrics. HPA is the primary scaling mechanism for stateless workloads — it adjusts replica count between a defined min and max as load changes. Pairs with KEDA (below) for event-driven scaling and VPA/Goldilocks for right-sizing resource requests.

**CPU-based HPA (simplest — scales when average CPU > 70%):**
```yaml
# ~/k8s/hpa-cpu.yaml
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
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70    # scale up when avg CPU > 70%
```

**Memory + CPU combined HPA:**
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
      stabilizationWindowSeconds: 60      # wait 60s before scaling up again
      policies:
        - type: Pods
          value: 4
          periodSeconds: 60               # add at most 4 pods per minute
    scaleDown:
      stabilizationWindowSeconds: 300     # wait 5m before scaling down (avoids flapping)
      policies:
        - type: Percent
          value: 25
          periodSeconds: 60               # remove at most 25% of pods per minute
```

**Custom metrics HPA (scale on Prometheus metric via KEDA or Prometheus Adapter):**
```yaml
# Requires either KEDA (recommended) or prometheus-adapter to be installed
# KEDA approach — scale on HTTP request rate:
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: myapp-http-scaler
  namespace: myapp
spec:
  scaleTargetRef:
    name: myapp
  minReplicaCount: 2
  maxReplicaCount: 50
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus.monitoring.svc:9090
        metricName: http_requests_per_second
        threshold: "100"
        query: |
          sum(rate(http_requests_total{job="myapp"}[1m]))
```

**Imperative HPA (quick testing):**
```bash
# Create HPA imperatively
kubectl autoscale deployment myapp --cpu-percent=70 --min=2 --max=10 -n myapp

# Describe HPA — shows current replicas, targets, and last scale event
kubectl describe hpa myapp-hpa -n myapp

# Watch HPA in real time
kubectl get hpa -n myapp -w

# Check current metrics
kubectl top pods -n myapp
kubectl top nodes
```

**Prerequisites — metrics-server must be installed:**
```bash
# k3s: metrics-server is included by default
# Other distributions:
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Verify
kubectl get apiservice v1beta1.metrics.k8s.io
kubectl top nodes
```

> **HPA requires resource requests set on containers.** HPA calculates utilisation as `current_usage / requested`. If `resources.requests.cpu` is unset, HPA cannot calculate CPU percentage and will show `<unknown>` for the metric. Always set requests — use Goldilocks (below) to find the right values.

---

## Kubernetes RBAC (Role-Based Access Control)

**Purpose:** Controls who (ServiceAccounts, users, groups) can do what (verbs: get, list, watch, create, update, patch, delete) on which resources (pods, deployments, secrets, configmaps) in which scope (namespace-scoped via Role/RoleBinding, or cluster-wide via ClusterRole/ClusterRoleBinding). Mastering RBAC is required for any production Kubernetes role — it's how you give CI/CD pipelines minimal permissions, isolate tenant namespaces, and audit access.

**Core concepts:**
```
Role / ClusterRole       — defines permissions (what verbs on what resources)
RoleBinding              — binds a Role to a subject within a namespace
ClusterRoleBinding       — binds a ClusterRole to a subject cluster-wide
Subject                  — User, Group, or ServiceAccount
```

**Namespace-scoped Role (read-only access to pods and logs in one namespace):**
```yaml
# ~/k8s/rbac-readonly.yaml
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

**CI/CD ServiceAccount (minimal deploy permissions for a pipeline):**
```yaml
# ~/k8s/rbac-cicd.yaml
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
    verbs: ["get", "list", "watch", "delete"]   # delete to force rollout
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
kubectl apply -f ~/k8s/rbac-cicd.yaml

# Extract a kubeconfig for the CI/CD ServiceAccount
kubectl create token cicd-deployer -n myapp --duration=8760h
# Use this token in GitHub Actions secrets as KUBECONFIG
```

**ClusterRole (cluster-wide — use sparingly):**
```yaml
# ~/k8s/rbac-cluster-readonly.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: cluster-viewer
rules:
  - apiGroups: [""]
    resources: ["nodes", "namespaces", "persistentvolumes"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments", "statefulsets", "daemonsets"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["metrics.k8s.io"]
    resources: ["nodes", "pods"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: cluster-viewer-binding
subjects:
  - kind: Group
    name: platform-team       # matches OIDC group if using Dex or Keycloak
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: cluster-viewer
  apiGroup: rbac.authorization.k8s.io
```

**Built-in ClusterRoles (use instead of creating your own when possible):**
```bash
# List all built-in ClusterRoles
kubectl get clusterroles | grep -v system:

# Useful built-ins:
# view             — read-only access to most resources (namespace-scoped)
# edit             — read/write most resources, cannot change RBAC
# admin            — full namespace access, can manage RBAC within the namespace
# cluster-admin    — superuser — avoid granting to CI/CD pipelines

# Grant 'edit' to a user in a specific namespace
kubectl create rolebinding myuser-edit \
  --clusterrole=edit \
  --user=developer@example.com \
  --namespace=myapp
```

**Audit and debug RBAC:**
```bash
# Check what a ServiceAccount / user can do
kubectl auth can-i create deployments --as=system:serviceaccount:myapp:cicd-deployer -n myapp
kubectl auth can-i delete secrets --as=system:serviceaccount:myapp:cicd-deployer -n myapp

# List all permissions for a ServiceAccount
kubectl auth can-i --list --as=system:serviceaccount:myapp:cicd-deployer -n myapp

# Who has access to secrets in a namespace?
kubectl get rolebindings,clusterrolebindings -A -o json | \
  python3 -c "
import json,sys
d=json.load(sys.stdin)
for item in d['items']:
    for s in item.get('subjects',[]):
        if item.get('roleRef',{}).get('name','').find('secret') != -1 or True:
            print(item['metadata']['name'], s.get('name',''), item['roleRef']['name'])
" | grep -i secret
```

**Namespace isolation with RBAC + NetworkPolicy (multi-tenant pattern):**
```yaml
# Each team gets their own namespace and ServiceAccount
# with a Role scoped to that namespace only.
# Combined with a NetworkPolicy that blocks cross-namespace traffic:
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
        - podSelector: {}   # allow from same namespace
  egress:
    - to:
        - podSelector: {}   # allow to same namespace
    - ports:
        - port: 53           # allow DNS
          protocol: UDP
```

---

## Karpenter (Node Autoscaling)

**Purpose:** Node autoscaler that provisions exactly the right EC2/cloud VM instance type for pending pods — rather than pre-defining node groups. When a pod is unschedulable, Karpenter launches a new node with the cheapest/fastest fit, and terminates idle nodes aggressively. Most useful when running k3s agents on cloud VMs (Hetzner, AWS, DigitalOcean) and you want cost-efficient autoscaling.

```bash
# Install Karpenter (Helm — configure for your cloud provider)
helm repo add karpenter https://charts.karpenter.sh
helm repo update

helm upgrade --install karpenter karpenter/karpenter \
  --namespace karpenter --create-namespace \
  --set settings.clusterName=homelab \
  --set settings.interruptionQueue=homelab-karpenter
```

**NodePool — define acceptable node shapes:**
```yaml
# ~/k8s/karpenter-nodepool.yaml
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

```bash
kubectl apply -f ~/k8s/karpenter-nodepool.yaml
# Watch Karpenter launch nodes as pending pods arrive
kubectl logs -n karpenter -l app.kubernetes.io/name=karpenter -f
```

---

## Talos Linux (Immutable Kubernetes OS)

**Purpose:** Talos is a minimal, API-only, immutable Linux distribution purpose-built for Kubernetes. There is no SSH, no shell, no package manager — all cluster operations go through the `talosctl` API. This eliminates an entire class of security risks and makes clusters fully declarative. Ideal for homelab users who want a production-grade, GitOps-managed cluster.

### Install

```bash
# Install talosctl via Nix
nix-env -iA nixpkgs.talosctl

# Download the Talos ISO for your hardware
# https://github.com/siderolabs/talos/releases

# Or use the factory image builder for custom hardware:
# https://factory.talos.dev
```

**Bootstrap a single-node cluster:**
```bash
# Generate machine config
talosctl gen config homelab https://<node-ip>:6443 \
  --output-dir ~/talos-config/

# Apply config to the node (boot from ISO first)
talosctl apply-config --insecure \
  --nodes <node-ip> \
  --file ~/talos-config/controlplane.yaml

# Bootstrap etcd (first control plane node only)
talosctl bootstrap --nodes <node-ip> \
  --talosconfig ~/talos-config/talosconfig

# Get kubeconfig
talosctl kubeconfig ~/.kube/config \
  --nodes <node-ip> \
  --talosconfig ~/talos-config/talosconfig

# Verify
kubectl get nodes
```

**Common operations:**
```bash
# Check node health
talosctl health --nodes <node-ip> --talosconfig ~/talos-config/talosconfig

# Read kernel logs
talosctl dmesg --nodes <node-ip>

# Upgrade Talos (zero-downtime, in-place)
talosctl upgrade --nodes <node-ip> --image ghcr.io/siderolabs/installer:<version>

# Upgrade Kubernetes
talosctl upgrade-k8s --to 1.30.0 --nodes <node-ip>

# Get a shell inside a pod (only way to interact with running workloads)
kubectl exec -it <pod> -- /bin/sh
```

> Talos enforces immutability at the OS level — the root filesystem is read-only. All customisation is done via machine configs applied through `talosctl`.

---

## kubeadm (Upstream Reference Install)

**Purpose:** The official upstream Kubernetes installation tool from the Kubernetes project. Every distribution (k3s, k0s, RKE2) is built on top of what kubeadm establishes. It's the most portable way to stand up a production Kubernetes cluster on bare metal or any cloud — no vendor magic, just vanilla upstream Kubernetes. Required knowledge for the CKA exam and many enterprise environments.

```bash
# On Shani OS, install kubeadm and its dependencies via Nix
nix-env -iA nixpkgs.kubeadm nixpkgs.kubelet nixpkgs.kubectl

# Enable required kernel modules
sudo modprobe overlay
sudo modprobe br_netfilter
echo "overlay" | sudo tee /etc/modules-load.d/k8s.conf
echo "br_netfilter" | sudo tee -a /etc/modules-load.d/k8s.conf

# Set sysctl params
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sudo sysctl --system
```

**Initialise the control plane:**
```bash
sudo kubeadm init \
  --pod-network-cidr=10.244.0.0/16 \
  --apiserver-advertise-address=<node-ip>

# Set up kubeconfig
mkdir -p ~/.kube
sudo cp /etc/kubernetes/admin.conf ~/.kube/config
sudo chown $USER:$USER ~/.kube/config

# Install a CNI (Flannel)
kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml

# Get the join command for worker nodes
kubeadm token create --print-join-command
```

**Join a worker node:**
```bash
# Run the join command from the control plane output
sudo kubeadm join <control-plane-ip>:6443 \
  --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash>
```

**Common operations:**
```bash
# Check component status
kubectl get componentstatuses
kubeadm certs check-expiration

# Renew certificates (before they expire)
sudo kubeadm certs renew all

# Upgrade the cluster
sudo kubeadm upgrade plan
sudo kubeadm upgrade apply v1.30.0

# Reset a node (destructive — removes all cluster state)
sudo kubeadm reset
```

---

## Goldilocks (Resource Right-Sizing)

**Purpose:** Goldilocks uses the Kubernetes Vertical Pod Autoscaler (VPA) in recommendation mode to analyse actual resource usage across your namespaces and suggest the right CPU/memory requests and limits for each container. The web dashboard shows current requests vs VPA recommendations and generates ready-to-paste `resources:` blocks for your Helm values files. Eliminates the guesswork of setting resource limits.

```bash
# Install the VPA (required by Goldilocks)
kubectl apply -f https://github.com/kubernetes/autoscaler/releases/latest/download/vertical-pod-autoscaler.yaml

# Install Goldilocks via Helm
helm repo add fairwinds-stable https://charts.fairwinds.com/stable
helm upgrade --install goldilocks fairwinds-stable/goldilocks \
  --namespace goldilocks --create-namespace

# Label a namespace to enable VPA recommendations
kubectl label namespace myapp goldilocks.fairwinds.com/enabled=true

# Port-forward the dashboard
kubectl -n goldilocks port-forward svc/goldilocks-dashboard 8080:80
# Open http://localhost:8080
```

The dashboard shows each deployment with three columns: current requests/limits, VPA lower bound recommendation, and VPA upper bound recommendation. Click any deployment to get a copy-pasteable Helm values block.

> Goldilocks needs at least a few hours of real traffic to produce useful recommendations. It is safe to run in production — VPA is in recommendation mode only, it does not change your pods automatically.

### VPA and HPA Together

A common question is whether you can run VPA and HPA on the same Deployment simultaneously. The answer is: yes, but only if they are scaling on different metrics. If both HPA and VPA try to adjust CPU-based resource settings, they will fight each other in a control loop conflict.

The safe combination: use HPA for replica count based on **custom or external metrics** (e.g., Kafka consumer lag via KEDA, request queue depth), and use VPA to set the right **resource requests** for each replica. This way HPA controls how many pods exist, and VPA controls how much CPU/memory each pod is allocated — orthogonal concerns with no conflict.

Never run HPA on `cpu` or `memory` utilisation and VPA simultaneously on the same Deployment. Pick one for resource-based scaling.

---

## Pod Disruption Budgets

A PodDisruptionBudget (PDB) ensures a minimum number of pods remain available during voluntary disruptions — node drains, cluster upgrades, rolling restarts. Without a PDB, a `kubectl drain` could evict all your pods at once.

```yaml
# ~/k8s/myapp-pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: myapp-pdb
  namespace: myapp
spec:
  minAvailable: 2   # at least 2 pods must always be running
  # Alternatively: maxUnavailable: 1 (at most 1 pod can be down at once)
  selector:
    matchLabels:
      app: myapp
```

```bash
kubectl apply -f myapp-pdb.yaml

# Check PDB status
kubectl get pdb -n myapp
kubectl describe pdb myapp-pdb -n myapp
```

`minAvailable` and `maxUnavailable` accept either an integer (absolute count) or a percentage string (`"50%"`). Set `minAvailable` to one less than your replica count so single-pod drains always succeed, but a simultaneous two-node failure is blocked until the first pod reschedules.

PDBs only protect against **voluntary** disruptions (drains, upgrades). They cannot prevent a node from crashing.

---

## Init Containers and Sidecar Containers

**Init containers** run to completion before any of the main containers in a Pod start. They share the Pod's volumes and network but run sequentially, one at a time. Common uses:

- Wait for a dependency to be ready (database, external service)
- Run database migrations before the app starts
- Fetch secrets or config files and write them to a shared volume

```yaml
# Database migration init container pattern
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
      # Shares the same volumes as main containers if needed
  containers:
    - name: myapp
      image: myapp:v1.4.2
      # Main app only starts after db-migrate exits with code 0
```

**Sidecar containers** run alongside the main container for the full lifetime of the Pod. Common uses: log shipping (Fluentbit), service mesh proxies (Envoy), metrics exporters, secret rotation agents.

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

## StatefulSets

Deployments are for stateless workloads — any pod is interchangeable with any other. StatefulSets are for stateful workloads — databases, message brokers, caches — where each pod has a stable identity that persists across restarts.

**What StatefulSets provide that Deployments don't:**
- **Stable network identity** — pods get predictable DNS names: `pod-0.myservice.namespace.svc.cluster.local`, `pod-1.myservice.namespace.svc.cluster.local`. These names are stable across pod restarts.
- **Ordered deployment** — pods are created and deleted in order (0, 1, 2...). Useful for databases where you want the primary (pod-0) to be fully running before replicas start.
- **PVC templates** — each pod gets its own PersistentVolumeClaim that is not deleted when the pod is deleted or rescheduled.

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: data
spec:
  serviceName: postgres        # must match a Headless Service
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
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:        # each pod gets its own PVC automatically
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 20Gi
---
# Headless Service — gives pods stable DNS names
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: data
spec:
  clusterIP: None             # headless — no load balancing, direct pod DNS
  selector:
    app: postgres
  ports:
    - port: 5432
```

**When to use StatefulSet vs Deployment:**
- StatefulSet: PostgreSQL, Kafka, Elasticsearch, Redis Cluster, ZooKeeper — anything that needs stable identity or per-pod persistent storage.
- Deployment: web servers, API services, workers — anything where pods are interchangeable and share storage via a PVC or don't need local state.

---

## Debugging with kubectl debug

`kubectl exec` requires the container to have a shell. Distroless images (which have no shell, no utilities) make `exec` impossible. `kubectl debug` solves this by injecting an **ephemeral container** — a temporary debug container that shares the target pod's namespaces without modifying the running pod.

```bash
# Attach a busybox debug container to a running pod
kubectl debug -it myapp-pod-xyz \
  --image=busybox \
  --target=myapp \
  -n myapp

# The --target flag shares the process namespace with the myapp container
# You can see its processes with: ps aux
# You can read its filesystem via: ls /proc/1/root/

# Use a richer debug image
kubectl debug -it myapp-pod-xyz \
  --image=nicolaka/netshoot \
  --target=myapp \
  -n myapp
# netshoot includes: curl, dig, tcpdump, ss, netstat, iperf3, and more

# Debug a node directly (runs a privileged pod on the node)
kubectl debug node/k3s-node1 \
  --image=busybox \
  -it -- chroot /host
```

`nicolaka/netshoot` is purpose-built for container network debugging — it has every networking tool you might need without bloating your production images.

---
## ingress-nginx (Ingress Controller)

**Purpose:** Route external HTTP/HTTPS traffic into your cluster. The most widely used ingress controller. Acts as the Kubernetes equivalent of Caddy or Nginx — define `Ingress` resources and it handles routing.

```bash
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=NodePort \
  --set controller.service.nodePorts.http=30080 \
  --set controller.service.nodePorts.https=30443
```

**Example Ingress resource:**
```yaml
# ~/k8s/ingress-example.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  namespace: default
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
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
                  number: 80
```

```bash
kubectl apply -f ~/k8s/ingress-example.yaml
```

---


## NGINX Gateway Fabric (NGF)

**Purpose:** NGINX's implementation of the Kubernetes Gateway API. Unlike ingress-nginx (which uses `Ingress` resources and annotation-heavy config), NGF is built entirely on the Gateway API CRDs — `GatewayClass`, `Gateway`, `HTTPRoute`, `GRPCRoute` — making routing declarative, namespace-scoped, and annotation-free. A single NGF deployment handles external HTTPS (via Caddy), internal gRPC between pods, and cross-namespace routing from one Gateway resource. On Shani OS with k3s, Caddy on the host acts as the TLS terminator and forwards plain HTTP to NGF via a NodePort.

### Architecture on Shani OS

```
Browser / client
  │ HTTPS (tls internal — Step-CA cert from Caddy)
  ▼
Caddy (host, port 443)
  │ HTTP → localhost:30080  (NodePort of nginx-gateway-nginx Service)
  ▼
nginx-gateway-nginx Service :30080 (NodePort)
  │
  ▼
NGF (GatewayClass: nginx)
  ├── HTTPRoute → app pods   (by hostname, e.g. myapp.home.local)
  └── GRPCRoute → gRPC pods  (internal pod-to-pod via ClusterIP or same NodePort)
```

Key design points:
- **Caddy terminates TLS** on the host — NGF receives plain HTTP on port 80. No cert-manager or `tls:` on the Gateway listener needed for homelab.
- **NodePort 30080** — Caddy proxies `reverse_proxy localhost:30080`; `firewall-cmd` only needs to open the Caddy-facing port, not 30080 to the outside.
- **One Gateway, one HTTP listener on port 80** — routing is by hostname only (`home.local` domains). Add new services by adding HTTPRoute manifests, no Caddy config changes needed.
- **ReferenceGrants** — required for any HTTPRoute in the `nginx-gateway` namespace that points to a backend Service in another namespace (cross-namespace is denied by default).

---

### Prerequisites

```bash
# Kernel and sysctl (k3s already sets most of these — verify)
sudo sysctl -w vm.max_map_count=524288
echo "vm.max_map_count=524288" | sudo tee /etc/sysctl.d/99-k8s.conf

# Install kubectl + helm via Nix if not already present
nix-env -iA nixpkgs.kubectl nixpkgs.kubernetes-helm

# Install Gateway API CRDs — standard channel v1.4.1 (required by NGF v2.4.2)
# Includes: GatewayClass, Gateway, HTTPRoute, GRPCRoute, ReferenceGrant
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.1/standard-install.yaml

# Verify all 5 CRDs are Established before proceeding
kubectl get crd | grep gateway.networking.k8s.io
# Expected:
# gatewayclasses.gateway.networking.k8s.io
# gateways.gateway.networking.k8s.io
# grpcroutes.gateway.networking.k8s.io
# httproutes.gateway.networking.k8s.io
# referencegrants.gateway.networking.k8s.io

# Install NGF CRDs (9 nginx-specific CRDs — required before the Helm chart)
kubectl apply -f https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/v2.4.2/deploy/crds.yaml

# Verify NGF CRDs
kubectl get crd | grep gateway.nginx.org
# nginxproxies, nginxgateways, authenticationfilters, clientsettingspolicies,
# observabilitypolicies, proxysettingspolicies, ratelimitpolicies, upstreamsettingspolicies
```

---

### Install NGF

NGF ships as an OCI Helm chart — no `helm repo add` needed.

```bash
helm upgrade --install nginx-gateway-fabric \
  oci://ghcr.io/nginx/charts/nginx-gateway-fabric \
  --version 2.4.2 \
  --namespace nginx-gateway \
  --create-namespace \
  --set nginxGateway.gatewayClassName=nginx \
  --set nginxGateway.replicas=1 \
  --set nginx.replicas=1 \
  --set nginx.autoscaling.enable=false \
  --wait
```

**Full values file for a Shani OS homelab (`~/k8s/ngf-values.yaml`):**
```yaml
nginxGateway:
  gatewayClassName: nginx
  replicas: 1
  gwAPIExperimentalFeatures:
    enable: false       # GRPCRoute is GA since v1.1.0 — experimental flag not needed
  resources:
    requests:
      cpu: 200m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

nginx:
  replicas: 1
  autoscaling:
    enable: false       # single-node homelab — no HPA needed
  container:
    resources:
      requests:
        cpu: 200m
        memory: 256Mi
      limits:
        cpu: 1000m
        memory: 1Gi
```

```bash
helm upgrade --install nginx-gateway-fabric \
  oci://ghcr.io/nginx/charts/nginx-gateway-fabric \
  --version 2.4.2 \
  --namespace nginx-gateway \
  --create-namespace \
  -f ~/k8s/ngf-values.yaml \
  --wait

# Verify pods are running
kubectl -n nginx-gateway get pods
# nginx-gateway-fabric-*  (control plane)
# nginx-gateway-nginx-*   (data plane — NGINX)

# Check GatewayClass is Accepted
kubectl get gatewayclass nginx
# ACCEPTED should be True
```

---

### Expose NGF via NodePort

NGF creates a Service named `nginx-gateway-nginx` when it programs a Gateway. Patch it to NodePort so Caddy on the host can reach it.

```bash
# Patch the Service to NodePort with a fixed port (30080)
kubectl -n nginx-gateway patch svc nginx-gateway-nginx \
  --type='json' \
  -p='[
    {"op":"replace","path":"/spec/type","value":"NodePort"},
    {"op":"add","path":"/spec/ports/0/nodePort","value":30080}
  ]'

# Verify
kubectl -n nginx-gateway get svc nginx-gateway-nginx
# PORT(S): 80:30080/TCP

# Allow the NodePort through firewalld (only needed if other hosts must reach it directly)
# Caddy on localhost reaches it without a firewall rule
sudo firewall-cmd --add-port=30080/tcp --permanent && sudo firewall-cmd --reload
```

> **Tip:** Pin the NodePort in a `values.yaml` or patch it once and leave it. k3s preserves the NodePort across pod restarts and chart upgrades.

---

### Create the Gateway

One Gateway, one HTTP listener on port 80. Caddy handles HTTPS; NGF handles routing by hostname.

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
          from: All       # accept HTTPRoutes and GRPCRoutes from any namespace
```

```bash
kubectl apply -f ~/k8s/ngf-gateway.yaml

# Check the Gateway is Programmed
kubectl -n nginx-gateway describe gateway nginx-gateway
# Conditions: Programmed=True, Accepted=True
```

---

### Caddy configuration

Caddy on the Shani OS host terminates TLS and proxies all `*.home.local` traffic to NGF's NodePort. Add one entry per hostname — no changes to any Kubernetes manifests needed for new virtual hosts.

```caddyfile
# Each service that NGF routes — add a hostname here and an HTTPRoute in k8s

myapp.home.local {
  tls internal
  reverse_proxy localhost:30080 {
    header_up Host {host}   # pass the original Host header so NGF can match the HTTPRoute
  }
}

argocd.home.local {
  tls internal
  reverse_proxy localhost:30080 {
    header_up Host {host}
  }
}

grafana.home.local {
  tls internal
  reverse_proxy localhost:30080 {
    header_up Host {host}
  }
}
```

> **Why `header_up Host {host}`?** NGF matches HTTPRoutes by the `Host` header. Without this, Caddy rewrites the header to `localhost` and NGF returns 404 for every request.

---

### HTTPRoute — routing by hostname

Each application gets an HTTPRoute in the `nginx-gateway` namespace. No Caddyfile change needed for new paths or services — just add an HTTPRoute.

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
      sectionName: http         # bind to the 'http' listener
  hostnames:
    - myapp.home.local
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: myapp
          namespace: myapp-ns   # cross-namespace — needs ReferenceGrant below
          port: 8080
```

```yaml
# ~/k8s/ngf-httproute-argocd.yaml — ArgoCD (runs --insecure, plain HTTP)
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
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: argocd-server
          namespace: argocd
          port: 80
```

```bash
kubectl apply -f ~/k8s/ngf-httproute-myapp.yaml
kubectl apply -f ~/k8s/ngf-httproute-argocd.yaml

# Verify routes are accepted
kubectl -n nginx-gateway get httproute
# ACCEPTED and RESOLVED should both be True
```

---

### GRPCRoute — internal pod-to-pod gRPC

For gRPC between services inside the cluster, pods call the `nginx-gateway-nginx` ClusterIP (or the NodePort for cross-node). NGF matches by hostname and routes to the backend.

```yaml
# ~/k8s/ngf-grpcroute.yaml
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
            service: order.v1.OrderService  # gRPC service name from proto
      backendRefs:
        - name: order-service
          namespace: services-ns
          port: 9090
```

```bash
kubectl apply -f ~/k8s/ngf-grpcroute.yaml
kubectl -n nginx-gateway get grpcroute
```

---

### ReferenceGrants — cross-namespace backend access

HTTPRoutes and GRPCRoutes in `nginx-gateway` cannot reference Services in other namespaces unless a `ReferenceGrant` exists in the **target** namespace. Create one per application namespace.

```yaml
# ~/k8s/ngf-referencegrant.yaml
# Apply this in EACH application namespace (change namespace: below)
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-ngf-gateway
  namespace: myapp-ns            # the namespace containing your Services
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: nginx-gateway   # routes in this namespace may reference backends here
    - group: gateway.networking.k8s.io
      kind: GRPCRoute
      namespace: nginx-gateway
  to:
    - group: ""
      kind: Service
```

```bash
# Apply in each namespace
for ns in argocd myapp-ns services-ns; do
  kubectl apply -f ~/k8s/ngf-referencegrant.yaml -n $ns
done

# Verify
kubectl get referencegrant -A
```

---

### NGF-specific CRDs (policy extensions)

All 9 NGF CRDs are installed via the `deploy/crds.yaml` manifest in the prerequisites step. They enable fine-grained per-route control:

| CRD | Version | Purpose |
|-----|---------|---------|
| `NginxProxy` | v1alpha2 | Global NGINX config attached to GatewayClass |
| `NginxGateway` | v1alpha1 | Per-gateway control-plane tuning |
| `ClientSettingsPolicy` | v1alpha1 | Client→NGINX timeouts and body size limits |
| `ProxySettingsPolicy` | v1alpha1 | NGINX→backend proxy connection tuning |
| `ObservabilityPolicy` | v1alpha1+v1alpha2 | OpenTelemetry tracing per route |
| `RateLimitPolicy` | v1alpha1 | Per-route rate limiting |
| `UpstreamSettingsPolicy` | v1alpha1 | Load-balancing settings per route |
| `AuthenticationFilter` | v1alpha1 | Basic Auth per route |

**Example — rate limit a public route:**
```yaml
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
    rate: 100r/m          # 100 requests per minute
    burst: 20
    key: ${binary_remote_addr}
    zoneSize: 10m
    rejectCode: 429
```

---

### Common operations

```bash
# Check GatewayClass is accepted
kubectl get gatewayclass nginx
# ACCEPTED: True

# Check Gateway is Programmed and see addresses
kubectl -n nginx-gateway describe gateway nginx-gateway

# List all HTTPRoutes and their status
kubectl get httproute -A

# List all GRPCRoutes and their status
kubectl get grpcroute -A

# Check why a route is not resolving (look at Conditions)
kubectl -n nginx-gateway describe httproute myapp-route

# View NGF control plane logs
kubectl -n nginx-gateway logs -l app.kubernetes.io/name=nginx-gateway-fabric -f

# View NGINX data plane logs (access log, errors)
kubectl -n nginx-gateway logs -l app.kubernetes.io/component=nginx -f

# Check the global NginxProxy config (created by Helm as <release>-proxy-config)
kubectl -n nginx-gateway get nginxproxy

# Reload config — NGF reloads NGINX automatically on Route changes
# Watch for successful reloads in the data plane logs:
kubectl -n nginx-gateway logs -l app.kubernetes.io/component=nginx | grep "reload"

# Upgrade NGF
helm upgrade nginx-gateway-fabric \
  oci://ghcr.io/nginx/charts/nginx-gateway-fabric \
  --version 2.4.3 \           # bump version here
  --namespace nginx-gateway \
  -f ~/k8s/ngf-values.yaml

# Uninstall
helm uninstall nginx-gateway-fabric -n nginx-gateway
kubectl delete -f https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/v2.4.2/deploy/crds.yaml
kubectl delete -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.1/standard-install.yaml
```

### Version compatibility

| NGF | Gateway API CRDs | k3s / Kubernetes | Notes |
|-----|-----------------|-----------------|-------|
| v2.4.2 | v1.4.1 | k8s 1.29 – 1.34 | GRPCRoute GA, RateLimitPolicy added |
| v2.3.0 | v1.4.0 | k8s 1.28 – 1.33 | First v1.4.x requirement |
| v2.2.x | v1.2.x | k8s 1.27 – 1.32 | |

> Always match the Gateway API bundle version to the NGF requirement. Installing a newer bundle than NGF expects is safe; an older one causes CRD missing errors at startup.

---

## cert-manager (Automatic TLS)

**Purpose:** Automatically provision and renew TLS certificates for your Ingress resources — from Let's Encrypt (ACME) or your own internal CA (Step-CA). The Kubernetes equivalent of Caddy's auto-HTTPS. The most-installed Helm chart in Kubernetes after ingress controllers.

```bash
helm repo add cert-manager https://charts.jetstack.io
helm upgrade --install cert-manager cert-manager/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true

# Verify all pods are running
kubectl get pods -n cert-manager
```

**ClusterIssuer for Let's Encrypt (HTTP-01 — public domains):**
```yaml
# ~/k8s/letsencrypt-issuer.yaml
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
            class: nginx   # or "nginx-gateway" for NGF
```

**ClusterIssuer for Let's Encrypt (DNS-01 via Cloudflare — wildcard certs):**
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

**ClusterIssuer for internal Step-CA (home.local domains):**

Use this when your cluster services are on `*.home.local` and you want certs from your own CA rather than Let's Encrypt. Requires Step-CA running and its root cert trusted by browsers (see security.md).

```yaml
# ~/k8s/step-ca-issuer.yaml
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
    caBundle: <base64-encoded-step-ca-root-cert>  # kubectl get configmap -n cert-manager step-ca-root -o jsonpath='{.data.root\.crt}' | base64 -w0
    solvers:
      - http01:
          ingress:
            class: nginx
```

**Annotate an Ingress to get a cert automatically:**
```yaml
metadata:
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"   # or "step-ca-internal" for .home.local
spec:
  tls:
    - hosts: [myapp.example.com]
      secretName: myapp-tls
```

**Check certificate status:**
```bash
kubectl get certificate -A
kubectl describe certificate myapp-tls -n myapp

# Force immediate renewal
kubectl annotate certificate myapp-tls -n myapp \
  cert-manager.io/renew-before=999h --overwrite
```

---

## Longhorn (Distributed Block Storage)

**Purpose:** Cloud-native distributed block storage for Kubernetes. Provides `ReadWriteOnce` and `ReadWriteMany` persistent volumes replicated across nodes. The recommended PVC solution for multi-node k3s or RKE2 clusters — replaces the default local-path provisioner with redundancy.

```bash
# Install prerequisites on all nodes
# open-iscsi and nfs-utils — install via Distrobox or a mutable layer if not present
# On Shani OS these are available via Nix:
nix-env -iA nixpkgs.open-iscsi nixpkgs.nfs-utils
sudo systemctl enable --now iscsid

# Install via Helm
helm upgrade --install longhorn longhorn/longhorn \
  --namespace longhorn-system --create-namespace \
  --set defaultSettings.defaultReplicaCount=2

# Watch pods come up
kubectl -n longhorn-system get pods -w
```

**Set Longhorn as the default storage class:**
```bash
kubectl patch storageclass longhorn -p '{"metadata": {"annotations": {"storageclass.kubernetes.io/is-default-class": "true"}}}'
kubectl patch storageclass local-path -p '{"metadata": {"annotations": {"storageclass.kubernetes.io/is-default-class": "false"}}}'
```

**Example PVC using Longhorn:**
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

Access the Longhorn UI via port-forward:
```bash
kubectl -n longhorn-system port-forward svc/longhorn-frontend 8080:80
# Open http://localhost:8080
```

---

## ArgoCD (GitOps Continuous Delivery)

**Purpose:** GitOps-native continuous delivery for Kubernetes. Define your desired cluster state in a Git repo — ArgoCD watches it and automatically syncs your cluster to match. The self-hosted alternative to managed CD platforms. Works natively with Forgejo/Gitea.

```bash
helm upgrade --install argocd argo/argo-cd \
  --namespace argocd --create-namespace \
  --set server.service.type=ClusterIP

# Get the initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# Port-forward to access UI
kubectl -n argocd port-forward svc/argocd-server 8180:443
# Open https://localhost:8180 — user: admin
```

**Install the ArgoCD CLI:**
```bash
nix-env -iA nixpkgs.argocd

# Login
argocd login localhost:8180 --username admin --insecure

# Add your Forgejo/Gitea repo
argocd repo add https://git.home.local/myorg/k8s-manifests \
  --username gitea-user --password <token>
```

**Create an Application pointing at your Git repo:**
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

```bash
kubectl apply -f ~/k8s/argocd-app.yaml
```

**Caddy (expose ArgoCD externally):**
```caddyfile
argocd.home.local {
  tls internal
  reverse_proxy localhost:8180 {
    transport http { tls_insecure_skip_verify }
  }
}
```

---

## Flux CD (GitOps Alternative to ArgoCD)

**Purpose:** CNCF GitOps toolkit. Flux is more CLI- and CRD-native than ArgoCD — no UI by default, fully declarative, and deeply integrated with Helm and Kustomize. Preferred when you want pure-GitOps with no web dashboard.

```bash
# Install Flux CLI via Nix
nix-env -iA nixpkgs.fluxcd

# Bootstrap Flux with a Forgejo/Gitea repo
flux bootstrap gitea \
  --hostname=git.home.local \
  --owner=myorg \
  --repository=k8s-gitops \
  --branch=main \
  --path=clusters/homelab \
  --token-auth

# Check Flux components
kubectl -n flux-system get pods

# Watch reconciliation
flux get all -A

# Force a sync
flux reconcile source git flux-system
flux reconcile kustomization flux-system
```

---

## Kustomize (Config Management)

**Purpose:** Template-free Kubernetes configuration management built into `kubectl`. Overlay base manifests with environment-specific patches — no Helm needed for simpler apps.

```bash
# Apply a kustomization directory
kubectl apply -k ~/k8s/overlays/production/

# Preview what would be applied
kubectl kustomize ~/k8s/overlays/production/
```

**Example structure:**
```
~/k8s/
├── base/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── kustomization.yaml
└── overlays/
    ├── dev/
    │   └── kustomization.yaml   # patches: replica count = 1
    └── production/
        └── kustomization.yaml   # patches: replica count = 3, resource limits
```

---

## Rancher (Multi-Cluster Management UI)

**Purpose:** Web UI for managing multiple Kubernetes clusters — provisioning, RBAC, monitoring, app catalog, and workload management from one dashboard. Best for homelabs with 2+ clusters or when you want a GUI for all cluster operations.

> ⚠️ Rancher must run on a **separate** Shani OS host — not on a k3s/RKE2 node it manages. Run it as a Podman container on a standalone machine or a dedicated VM.

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
```

**Firewall:**
```bash
sudo firewall-cmd --add-service=http --add-service=https --permanent && sudo firewall-cmd --reload
```

Access at `https://<host-ip>`. On first login, set an admin password. Then import or provision clusters from the UI.

**Get the bootstrap password from logs:**
```bash
podman logs rancher 2>&1 | grep "Bootstrap Password"
```

---

## Lens / OpenLens (Desktop Cluster IDE)

**Purpose:** Desktop Kubernetes IDE with a visual cluster explorer, pod log viewer, resource editor, shell access, Prometheus metrics, and Helm release manager. Works with any cluster kubeconfig.

```bash
# Install OpenLens via Flatpak (preferred on Shani OS)
flatpak install flathub dev.k8slens.OpenLens
```

After install, add your kubeconfig — Lens auto-detects all contexts in `~/.kube/config`.

---

## k9s (Terminal Cluster Manager)

**Purpose:** Fast, vim-keybinding terminal UI for navigating Kubernetes resources. Browse pods, deployments, namespaces, logs, events, and exec into containers — all without typing `kubectl` commands.

```bash
# Install via Nix (preferred on Shani OS)
nix-env -iA nixpkgs.k9s

# Launch (uses current kubeconfig context)
k9s

# Target a specific namespace
k9s -n argocd

# Target a specific context
k9s --context k3s-homelab
```

**Key bindings inside k9s:**
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

## Kubernetes Dashboard (Web UI)

**Purpose:** Official Kubernetes web dashboard. Browse and manage cluster resources, view logs, exec into pods, and apply YAML manifests from the browser.

```bash
helm repo add kubernetes-dashboard https://kubernetes.github.io/dashboard/
helm upgrade --install kubernetes-dashboard kubernetes-dashboard/kubernetes-dashboard \
  --namespace kubernetes-dashboard --create-namespace

# Port-forward to access
kubectl -n kubernetes-dashboard port-forward svc/kubernetes-dashboard-kong-proxy 8443:443
# Open https://localhost:8443
```

**Create an admin service account:**
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

# Get login token
kubectl -n kubernetes-dashboard create token admin-user
```

---

## Prometheus + Grafana on Kubernetes (kube-prometheus-stack)

**Purpose:** Full observability stack — Prometheus, Grafana, Alertmanager, node-exporter, kube-state-metrics — deployed as a single Helm chart. Includes pre-built dashboards for cluster, node, pod, and workload metrics.

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --set grafana.adminPassword=changeme \
  --set prometheus.prometheusSpec.retention=15d

# Port-forward Grafana
kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3000:80
# Open http://localhost:3000 — user: admin / changeme
```

**Import additional dashboards:**
- Longhorn: Dashboard ID `13032`
- Ingress NGINX: Dashboard ID `9614`
- ArgoCD: Dashboard ID `14584`

---

## Velero (Cluster Backup & Restore)

**Purpose:** Back up and restore Kubernetes cluster resources and persistent volumes. Use Velero to snapshot your entire cluster state to S3-compatible storage (MinIO) — enabling full cluster disaster recovery, namespace migration between clusters, and pre-upgrade safety snapshots.

```bash
# Install Velero CLI via Nix
nix-env -iA nixpkgs.velero

# Create a MinIO bucket named 'velero-backups' first (via MinIO console or mc)
# Then create a credentials file:
cat > ~/velero-credentials << 'EOF'
[default]
aws_access_key_id=minioadmin
aws_secret_access_key=changeme
EOF

# Install Velero in the cluster with MinIO backend
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:latest \
  --bucket velero-backups \
  --secret-file ~/velero-credentials \
  --use-volume-snapshots=false \
  --use-node-agent \
  --backup-location-config \
    region=minio,s3ForcePathStyle=true,s3Url=http://minio.home.local:9000

# Verify installation
velero version
kubectl get pods -n velero
```

**Common backup operations:**
```bash
# Full cluster backup
velero backup create homelab-$(date +%Y%m%d) --include-namespaces='*'

# Namespace-scoped backup (faster for per-app backups)
velero backup create myapp-backup --include-namespaces myapp

# Backup with TTL (auto-deleted after 30 days)
velero backup create homelab-$(date +%Y%m%d) \
  --include-namespaces='*' \
  --ttl 720h

# List all backups
velero backup get

# Describe a backup (check for errors/warnings)
velero backup describe homelab-20260422 --details

# Download backup logs
velero backup logs homelab-20260422
```

**Scheduled backups (CRD approach — GitOps-friendly):**
```yaml
# ~/k8s/velero-schedule.yaml
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: daily-cluster-backup
  namespace: velero
spec:
  schedule: "0 2 * * *"       # daily at 2 AM
  template:
    includedNamespaces:
      - "*"
    excludedNamespaces:
      - kube-system
      - velero
    storageLocation: default
    ttl: 720h                  # keep 30 days
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
    ttl: 168h                  # keep 7 days
    storageLocation: default
```

```bash
kubectl apply -f ~/k8s/velero-schedule.yaml
velero schedule get
```

**Restore operations:**
```bash
# Restore entire cluster from a backup
velero restore create --from-backup homelab-20260422

# Restore a single namespace (e.g., migrate myapp to a new cluster)
velero restore create myapp-restore \
  --from-backup homelab-20260422 \
  --include-namespaces myapp

# Restore to a different namespace
velero restore create \
  --from-backup homelab-20260422 \
  --include-namespaces myapp \
  --namespace-mappings myapp:myapp-restored

# Watch restore progress
velero restore describe myapp-restore --details
velero restore logs myapp-restore
```

---

## Argo Rollouts (Progressive Delivery)

**Purpose:** Advanced deployment strategies for Kubernetes — canary releases, blue/green deployments, and analysis-gated rollouts. Argo Rollouts replaces standard Kubernetes `Deployment` objects with a `Rollout` CRD that supports traffic splitting, automated metric analysis (via Prometheus), and instant rollback. Pairs naturally with ArgoCD: ArgoCD syncs the desired `Rollout` spec; Argo Rollouts controls how traffic shifts during the deployment.

```bash
# Install Argo Rollouts
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml

# Install the kubectl plugin via Nix
nix-env -iA nixpkgs.argo-rollouts
```

**Canary Rollout example:**
```yaml
# ~/k8s/rollout-canary.yaml
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
        - setWeight: 20          # 20% traffic to new version
        - pause: { duration: 5m } # wait 5 minutes
        - setWeight: 50
        - pause: {}              # manual gate — promote with kubectl argo rollouts promote
        - setWeight: 100
      canaryService: myapp-canary
      stableService: myapp-stable
```

```bash
kubectl apply -f ~/k8s/rollout-canary.yaml

# Watch the rollout progress
kubectl argo rollouts get rollout myapp --watch

# Promote through a manual gate
kubectl argo rollouts promote myapp

# Abort and roll back
kubectl argo rollouts abort myapp
kubectl argo rollouts undo myapp
```

**Blue/Green example:**
```yaml
strategy:
  blueGreen:
    activeService: myapp-active
    previewService: myapp-preview
    autoPromotionEnabled: false   # require manual promotion
    scaleDownDelaySeconds: 30
```

```bash
# Promote the preview to active
kubectl argo rollouts promote myapp
```

> Argo Rollouts integrates with ingress-nginx and Gateway API for traffic splitting — it patches the Ingress or HTTPRoute weights automatically as rollout steps progress.

---

## Network Policies

**Purpose:** Restrict pod-to-pod and pod-to-external traffic. By default all pods can reach all pods — network policies enforce least-privilege network access. Requires a CNI that supports them (Calico, Cilium, Canal).

**Deny all ingress by default, allow only from same namespace:**
```yaml
# ~/k8s/network-policy-default-deny.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: production
spec:
  podSelector: {}
  policyTypes: [Ingress]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-same-namespace
  namespace: production
spec:
  podSelector: {}
  ingress:
    - from:
        - podSelector: {}
```

```bash
kubectl apply -f ~/k8s/network-policy-default-deny.yaml
```

---

## Resource Quotas & Limits

**Purpose:** Prevent a single namespace or workload from consuming all cluster resources. Apply ResourceQuota to namespaces and LimitRange to set defaults for pods.

```yaml
# ~/k8s/namespace-quotas.yaml
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

```bash
kubectl apply -f ~/k8s/namespace-quotas.yaml
```

---

## Secrets Management

**Purpose:** Avoid storing plain secrets in Git. Use Sealed Secrets (encrypt secrets for Git storage) or External Secrets Operator (pull from OpenBao/Infisical/AWS SSM into native k8s Secrets).

### Sealed Secrets

```bash
# Install controller
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

# Install kubeseal CLI via Nix
nix-env -iA nixpkgs.kubeseal

# Seal a secret (safe to commit to Git)
kubectl create secret generic mysecret \
  --from-literal=password=changeme \
  --dry-run=client -o yaml | \
  kubeseal --format yaml > ~/k8s/mysecret-sealed.yaml

# Apply the sealed secret
kubectl apply -f ~/k8s/mysecret-sealed.yaml
```

---

### External Secrets Operator (ESO)

**Purpose:** Sync secrets from external secret stores — OpenBao, Infisical, AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager, Azure Key Vault, and more — into native Kubernetes `Secret` objects. ESO watches `ExternalSecret` CRDs and reconciles them on a schedule; your pods consume plain `Secret` objects and never know the secret came from an external store. The natural companion to OpenBao (from security.md) and Infisical for a GitOps-safe secrets workflow.

```bash
# Install ESO via Helm
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace \
  --set installCRDs=true
```

**Connect ESO to OpenBao (Vault-compatible):**
```yaml
# ~/k8s/eso-openbao-store.yaml
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
# Create the token secret ESO uses to authenticate to OpenBao
kubectl create secret generic openbao-token \
  --namespace external-secrets \
  --from-literal=token=<your-openbao-token>

kubectl apply -f ~/k8s/eso-openbao-store.yaml
```

**Create an ExternalSecret — pull a database password from OpenBao into a k8s Secret:**
```yaml
# ~/k8s/myapp-external-secret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: myapp-db-secret
  namespace: myapp
spec:
  refreshInterval: 1h          # re-sync every hour
  secretStoreRef:
    name: openbao
    kind: ClusterSecretStore
  target:
    name: myapp-db-credentials  # k8s Secret that gets created/updated
    creationPolicy: Owner
  data:
    - secretKey: DB_PASSWORD    # key in the k8s Secret
      remoteRef:
        key: myapp/database     # path in OpenBao
        property: password      # field within the secret
    - secretKey: DB_USERNAME
      remoteRef:
        key: myapp/database
        property: username
```

```bash
kubectl apply -f ~/k8s/myapp-external-secret.yaml

# Check sync status
kubectl get externalsecret -n myapp
kubectl describe externalsecret myapp-db-secret -n myapp
```

**Connect ESO to Infisical:**
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

> **Pattern:** Store all secrets in OpenBao or Infisical. Reference them in k8s manifests via `ExternalSecret` CRDs. Never put plaintext values in Kubernetes YAML — even in private Git repos. ESO rotates the k8s Secret automatically when the upstream value changes (within the `refreshInterval`).

---

## Useful Daily Commands

```bash
# Context management
kubectl config get-contexts
kubectl config use-context k3s-homelab
kubectl config set-context --current --namespace=myapp

# Resource inspection
kubectl get all -n myapp
kubectl describe pod <pod-name> -n myapp
kubectl logs <pod-name> -n myapp --previous  # logs from crashed container
kubectl logs <pod-name> -n myapp -f --tail=100

# Live resource editing
kubectl edit deployment myapp -n myapp

# Apply and diff
kubectl diff -f ~/k8s/deployment.yaml
kubectl apply -f ~/k8s/deployment.yaml

# Scale a deployment
kubectl scale deployment myapp --replicas=3 -n myapp

# Exec into a running pod
kubectl exec -it <pod-name> -n myapp -- /bin/sh

# Copy files to/from a pod
kubectl cp myapp/<pod-name>:/app/logs ./logs/
kubectl cp ./config.yaml myapp/<pod-name>:/app/config.yaml

# Port-forward a service for local access
kubectl port-forward svc/myapp 8080:80 -n myapp

# View events sorted by time
kubectl get events -n myapp --sort-by='.lastTimestamp'

# Watch pods in real-time
kubectl get pods -n myapp -w

# Delete all pods in a namespace (forces restart)
kubectl delete pods --all -n myapp

# Rollout management
kubectl rollout status deployment/myapp -n myapp
kubectl rollout history deployment/myapp -n myapp
kubectl rollout undo deployment/myapp -n myapp  # roll back
```

---

## Caddy Configuration

When exposing cluster services externally, port-forward or use NodePort then proxy through Caddy on the host:

```caddyfile
argocd.home.local   { tls internal; reverse_proxy localhost:8180 { transport http { tls_insecure_skip_verify } } }
rancher.home.local  { tls internal; reverse_proxy localhost:8443 { transport http { tls_insecure_skip_verify } } }
k8s.home.local      { tls internal; reverse_proxy localhost:8443 { transport http { tls_insecure_skip_verify } } }
grafana.home.local  { tls internal; reverse_proxy localhost:3000 }
longhorn.home.local { tls internal; reverse_proxy localhost:8080 }

# NGF-backed services — add header_up Host so NGF can match the HTTPRoute hostname
# Each hostname here needs a matching HTTPRoute in the nginx-gateway namespace
myapp.home.local {
  tls internal
  reverse_proxy localhost:30080 { header_up Host {host} }
}

```

---

## Backup

```bash
# Back up cluster ETCD snapshot (k3s)
sudo k3s etcd-snapshot save --name homelab-$(date +%Y%m%d)
# Snapshots saved to /var/lib/rancher/k3s/server/db/snapshots/

# Back up kubeconfig and helm values
restic backup ~/.kube /home/user/k8s
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `kubectl: connection refused` | Check `k3s`/`k0s` systemd service: `sudo systemctl status k3s`; verify kubeconfig `server:` IP is correct |
| MicroK8s `permission denied` on kubectl | Run `sudo usermod -aG microk8s $USER` then log out and back in; verify with `groups` |
| MicroK8s addon enable fails | Run `microk8s status` to check all daemons are running; check `sudo snap logs microk8s` for errors |
| MicroK8s cluster data lost after Snap refresh | Data lives in `/var/snap/microk8s/` — this persists across `snap refresh`; loss only happens on `snap remove` |
| minikube start fails with Podman driver | Ensure Podman socket is active: `systemctl --user start podman.socket`; try `minikube delete` then re-create |
| minikube `ImagePullBackOff` after `minikube image load` | Confirm the image name in the manifest matches exactly what was loaded; check with `minikube image ls` |
| Node shows `NotReady` | Run `kubectl describe node <name>`; check CNI pods in `kube-system`; verify `br_netfilter` is loaded |
| Pod stuck in `Pending` | No nodes have enough resources — check `kubectl describe pod`; or no PVC bound — check StorageClass exists |
| Pod stuck in `CrashLoopBackOff` | Run `kubectl logs <pod> --previous`; check env vars and volume mounts via `kubectl describe pod` |
| Pod stuck in `ImagePullBackOff` | Image name or tag wrong; registry unreachable; missing `imagePullSecret` for private registry |
| Ingress returns 404 | Verify `ingressClassName: nginx` matches the controller; check the service name and port in the Ingress spec |
| cert-manager certificate stuck `Pending` | Describe the Certificate and CertificateRequest: `kubectl describe cert <name>`; check ClusterIssuer status; ensure port 80 is reachable for HTTP-01 challenge |
| Longhorn volume stuck `Attaching` | Verify `iscsid` is running on all nodes: `sudo systemctl status iscsid`; check Longhorn manager logs |
| Longhorn volume degraded | A replica is on an unavailable node — check node health; Longhorn will rebuild the replica automatically once the node returns |
| ArgoCD app OutOfSync after apply | Check for server-side fields mutated by Kubernetes (e.g. `status`, `managedFields`) — add `ignoreDifferences` to the Application spec |
| ArgoCD unable to connect to Forgejo | Ensure the repo URL uses HTTPS; add the repo with `--insecure-skip-server-verification` if using a self-signed cert |
| Helm upgrade fails mid-release | Run `helm rollback <release> -n <ns>`; if release is stuck in `pending-upgrade`, delete the secret: `kubectl delete secret sh.helm.release.v1.<release>.<revision> -n <ns>` |
| k3s agent not joining | Verify the token matches `/var/lib/rancher/k3s/server/node-token`; check firewall allows port 6443 from worker IPs |
| SonarQube / Elasticsearch OOM | Set `vm.max_map_count=524288` on the host and in `/etc/sysctl.d/99-k8s.conf`; restart the pod |
| Velero backup failing | Check `velero backup logs <name>`; ensure MinIO bucket exists and credentials are correct; verify the velero pod has network access to MinIO |
| k9s shows no resources | Check the active namespace with `:ns`; switch context with `:ctx`; ensure kubeconfig is loaded from `~/.kube/config` |
| Dashboard `Unauthorized` | Token has expired — create a new one: `kubectl -n kubernetes-dashboard create token admin-user` |
| Sealed secret not decrypting | The sealing key in `kube-system` must match the one used to seal — do not delete the `sealed-secrets-key` secret; back it up with `kubectl get secret -n kube-system sealed-secrets-key -o yaml` |
| ExternalSecret stuck `SecretSyncedError` | Check `kubectl describe externalsecret <n>` — common causes: wrong path in `remoteRef.key`, token lacks read permissions in OpenBao, or the `ClusterSecretStore` can't reach the backend URL |
| ESO not refreshing secret | Decrease `refreshInterval` for testing; check ESO operator logs: `kubectl logs -n external-secrets -l app.kubernetes.io/name=external-secrets` |
| cert-manager Certificate stuck `Pending` | `kubectl describe certificate <n> -n <ns>` → look at the `CertificateRequest` and `Order` events; HTTP-01 needs port 80 publicly reachable; DNS-01 needs correct API token and propagation time |
| cert-manager HTTP-01 challenge failing | The ACME solver creates a temporary Ingress — verify your ingress controller is running and the domain resolves publicly; check `kubectl get challenges -A` for error messages |
| Argo Rollouts stuck at canary weight | Verify `canaryService` and `stableService` exist and match the Services in your namespace; check `kubectl argo rollouts get rollout myapp` for error messages |
| Argo Rollouts canary not splitting traffic | ingress-nginx and Gateway API traffic splitting requires the corresponding annotation or HTTPRoute backend weights — check that the controller supports the Rollout's `trafficRouting` config |
| NGF GatewayClass not Accepted | Check NGF control plane logs: `kubectl -n nginx-gateway logs -l app.kubernetes.io/name=nginx-gateway-fabric`; confirm Gateway API CRDs are installed at the correct version (`kubectl get crd | grep gateway.networking.k8s.io`) |
| NGF returns 404 for all requests | The `Host` header is not being forwarded by Caddy — add `header_up Host {host}` inside the `reverse_proxy` block so NGF can match the HTTPRoute hostname |
| NGF HTTPRoute not Accepted | Run `kubectl -n nginx-gateway describe httproute <n>`; common causes: `sectionName` doesn't match a listener name (`http`), `parentRef` namespace wrong, or backend namespace missing a ReferenceGrant |
| NGF GRPCRoute not Accepted | Confirm the GRPCRoute CRD is installed (`kubectl get crd grpcroutes.gateway.networking.k8s.io`); verify `gwAPIExperimentalFeatures.enable: false` — GRPCRoute is GA and the experimental flag is not needed |
| Cross-namespace route returning 503 | ReferenceGrant is missing or in the wrong namespace — it must be in the **target** (backend Service) namespace; run `kubectl get referencegrant -A` to verify |
| NGF NodePort 30080 not reachable from Caddy | Confirm the Service was patched to NodePort: `kubectl -n nginx-gateway get svc nginx-gateway-nginx`; verify `PORT(S): 80:30080/TCP`; `curl http://localhost:30080` should return an NGF 404, not connection refused |
| Caddy proxying to NGF but cert error in browser | Use `tls internal` (not bare `tls`) for `home.local` domains; ensure Step-CA is running and the root cert is trusted by the browser |
| NGF data plane (NGINX) OOMKilled | Increase `nginx.container.resources.limits.memory` in the values file; start at `1Gi` for a homelab under real load |
| ObservabilityPolicy CRD conflict on upgrade | `v1alpha1` must remain `storage: true` — do not change this when upgrading; if NGF crashes with `no kind registered for ObservabilityPolicy`, re-apply `deploy/crds.yaml` from the new version |
