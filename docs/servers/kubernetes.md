---
title: Kubernetes & Container Orchestration
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Kubernetes & Container Orchestration

Lightweight and production-grade Kubernetes distributions, cluster management, GitOps, ingress, storage, and observability — all self-hosted on Shani OS.

> ⚠️ **Prerequisites**: Kubernetes requires `vm.max_map_count=524288` and sufficient RAM (2 GB minimum per node, 4 GB+ recommended). Some distributions need `br_netfilter` and IP forwarding enabled. CLI tools (`kubectl`, `helm`, `k9s`, etc.) install via **Nix** (primary) or **Snap** as a fallback — see the install one-liner in the disk layout section below. k3s and MicroK8s bundle their own `kubectl` — you only need a separate install for standalone or remote-cluster access.

---

## Choosing a Distribution

| Distribution | Best For | RAM (min) | Install via | Notes |
|---|---|---|---|---|
| **k3s** | Single-node homelabs, edge | 512 MB | curl installer | Batteries-included, easiest to start |
| **k0s** | Minimal, air-gapped | 1 GB | curl installer | Single binary, no external deps |
| **MicroK8s** | Quick local cluster, addons | 2 GB | **Snap** | Canonical-maintained; DNS, ingress, registry as addons |
| **minikube** | Local dev, driver choice | 2 GB | Nix or **Snap** | Runs via Podman driver on Shani OS |
| **kind** | Lightweight dev/CI | 2 GB | Nix | Runs K8s inside Podman containers |
| **RKE2** | Hardened, production | 4 GB | curl installer | CIS-benchmarked, STIG-ready |
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

# Install k3s (installs as a systemd service automatically, starts on boot)
curl -sfL https://get.k3s.io | sh -

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
curl -sfL https://get.k3s.io | K3S_URL=https://<server-ip>:6443 K3S_TOKEN=<token> sh -
```

### Common k3s Operations

```bash
# Check cluster status
kubectl get nodes -o wide
kubectl get pods -A

# View k3s server logs
sudo journalctl -u k3s -f

# Uninstall k3s (server)
/usr/local/bin/k3s-uninstall.sh

# Uninstall k3s (agent/worker)
/usr/local/bin/k3s-agent-uninstall.sh

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
curl -sSLf https://get.k0s.sh | sudo sh

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
docker tag myapp:latest localhost:32000/myapp:latest
docker push localhost:32000/myapp:latest

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
curl -sfL https://get.rke2.io | sudo sh -

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
export PATH=$PATH:/var/lib/rancher/rke2/bin
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

## cert-manager (Automatic TLS)

**Purpose:** Automatically provision and renew TLS certificates for your Ingress resources — from Let's Encrypt (ACME) or your own internal CA. The Kubernetes equivalent of Caddy's auto-HTTPS.

```bash
helm upgrade --install cert-manager cert-manager/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true
```

**Create a ClusterIssuer for Let's Encrypt:**
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
            class: nginx
```

```bash
kubectl apply -f ~/k8s/letsencrypt-issuer.yaml
```

**Annotate an Ingress to get a cert automatically:**
```yaml
annotations:
  cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
    - hosts:
        - myapp.example.com
      secretName: myapp-tls
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

**Purpose:** Back up and restore Kubernetes cluster resources and persistent volumes. Use Velero to snapshot your entire cluster state to S3-compatible storage (MinIO) — enabling full cluster disaster recovery.

```bash
# Install Velero CLI via Nix
nix-env -iA nixpkgs.velero

# Install Velero with MinIO backend
# Use the MinIO instance from the Backups wiki — create a 'velero' bucket and access key
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:latest \
  --bucket velero-backups \
  --secret-file ~/velero-credentials \
  --use-volume-snapshots=false \
  --backup-location-config \
    region=minio,s3ForcePathStyle=true,s3Url=http://minio.home.local:9000
```

**`~/velero-credentials`:**
```ini
[default]
aws_access_key_id=minioadmin
aws_secret_access_key=changeme
```

**Common operations:**
```bash
# Create a full cluster backup
velero backup create homelab-backup --include-namespaces='*'

# Schedule daily backups at 2 AM
velero schedule create daily-backup --schedule="0 2 * * *"

# List backups
velero backup get

# Restore from backup
velero restore create --from-backup homelab-backup

# Describe a backup (check for errors)
velero backup describe homelab-backup --details
```

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

**Purpose:** Avoid storing plain secrets in Git. Use Sealed Secrets (encrypt secrets for Git storage) or External Secrets Operator (pull from Vault, AWS SSM, etc.).

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
