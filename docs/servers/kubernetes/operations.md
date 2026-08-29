---
title: Kubernetes — Cluster Operations & Platform Engineering
section: Self-Hosting & Servers
updated: 2026-08-28
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

## Platform Engineering

Platform engineering builds internal developer platforms (IDPs) — self-service tooling, golden paths, and guardrails so teams can deploy and operate services without deep Kubernetes expertise. The sections below cover infrastructure-as-code, chaos engineering, lifecycle orchestration, and developer portal tooling.


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

