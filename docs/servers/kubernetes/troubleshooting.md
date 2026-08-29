---
title: Kubernetes — Troubleshooting
section: Self-Hosting & Servers
updated: 2026-08-28
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
| KEDA ScaledObject shows 0 replicas but queue has messages | Check `kubectl describe scaledobject` for trigger errors; verify secret ref for queue credentials |
| KEDA scale-to-zero doesn't recover | Check `pollingInterval` and `cooldownPeriod`; confirm trigger metric is reachable from KEDA namespace |
| Cluster Autoscaler not scaling up | Check `cluster-autoscaler-status` ConfigMap; ensure node group max not hit; check for unschedulable pods vs pending pods |
| StatefulSet pod stuck `Terminating` | Check finalizers: `kubectl get pod <pod> -o json \| jq .metadata.finalizers` |
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


---

### Policy & Hardening

| Issue | Solution |
|-------|----------|
| conftest passes locally but fails in CI | Ensure `--policy` path and `--all-namespaces` flag match CI config |
| kubeconform fails on CRD resources | Add `-schema-location` for CRD catalog URL; use `--ignore-missing-schemas` during migration |
| kube-bench says API server flags missing | For k3s, set flags via `kube-apiserver-arg:` in `/etc/rancher/k3s/config.yaml` |
| PSA blocks system namespace pods | Add `pod-security.kubernetes.io/enforce=privileged` to `kube-system` before enforcing elsewhere |
| Kyverno webhook times out | `kubectl get pods -n kyverno`; scale replicas; check `--webhookTimeout` |

---

### Multi-Tenancy

| Issue | Solution |
|-------|----------|
| vCluster pods stuck Pending | Check host cluster has resources; verify `storageClass` exists in host namespace |
| vCluster kubeconfig connection refused | Ensure port-forward is running: `vcluster connect <name> -n <ns>` |
| Kubernetes Audit logs not appearing in Loki | Verify Alloy `kubernetes_audit` config; check `--audit-log-path` in k3s config |

---

### Multi-Cluster & Registry

| Issue | Solution |
|-------|----------|
| Submariner tunnel not establishing | Check UDP 4500/4800 between nodes; verify broker token; `subctl diagnose all` |
| Zot push rejected 401 | Verify htpasswd credentials; check `auth.htpasswd.path` in config.json |
| Admiralty pods stuck Pending | Check `MultiClusterSchedulingProfile` on target cluster; verify Admiralty version compatibility |
| Harbor push fails: `unknown blob` | Harbor storage PVC full — check `kubectl -n harbor get pvc` |
| Harbor DB migration error on upgrade | Check `harbor-database` pod logs; run migration job manually if needed |

---

### Alerting

| Issue | Solution |
|-------|----------|
| AlertManager not sending alerts | Check `kubectl -n monitoring get pods`; view config: `kubectl -n monitoring get secret alertmanager-main -o yaml` |
| PrometheusRule not picked up | Labels must match `prometheus.prometheusSpec.ruleSelector`; add `release: kube-prometheus-stack` label |
| ServiceMonitor metrics missing | Labels must match `prometheus.serviceMonitorSelector`; check `kubectl get servicemonitor -A` |
| Grafana OnCall not receiving alerts | Verify Grafana alert notification policy points to OnCall integration |
| Beyla shows no metrics | Check DaemonSet is running; verify kernel ≥5.8; check eBPF capabilities (`SYS_ADMIN` or CAP_BPF) |

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
