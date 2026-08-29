---
title: Kubernetes — GitOps & Continuous Delivery
section: Self-Hosting & Servers
updated: 2026-08-28
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

