---
title: Kubernetes — Security & Policy
section: Self-Hosting & Servers
updated: 2026-08-28
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

