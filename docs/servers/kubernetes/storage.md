---
title: Kubernetes — Storage
section: Self-Hosting & Servers
updated: 2026-08-28
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

