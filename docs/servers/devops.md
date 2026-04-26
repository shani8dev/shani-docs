---
title: DevOps & Developer Infrastructure
section: Self-Hosting & Servers
updated: 2026-04-22
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.


# DevOps & Developer Infrastructure

CI/CD, code hosting, container orchestration, HA clusters, IaC, artifact management, and developer tooling — all self-hosted on this system.

> **Install convention:** CLI tools and dev runtimes install via **Nix** (primary) or **Snap** (fallback). GUI apps go via **Flatpak**. Services and servers run as rootless **Podman** containers. On immutable OS distributions the root filesystem is read-only — use Nix, Snap, or Distrobox rather than system package managers for user-space tooling.

## Key Concepts

**CI/CD Pipeline Stages:**
A production pipeline typically has these gates in order: (1) **Lint/Format** — `tflint`, `black`, `eslint`; (2) **Unit Tests** — fast, no external deps; (3) **Build** — compile or build container image; (4) **SAST** — Semgrep, Checkov; (5) **Integration Tests** — spin up dependencies; (6) **Container Scan** — Trivy; (7) **Push** — tag and push to registry; (8) **Deploy to Staging** — Argo Rollouts canary; (9) **Smoke Tests**; (10) **Promote to Prod** — manual gate or auto on metrics.

**Idempotency in automation:** An operation is idempotent if running it multiple times produces the same result as running it once. Ansible modules are idempotent — running `apt: name=nginx state=present` 100 times does not install nginx 100 times. Terraform is idempotent — re-applying the same config changes nothing if the state matches. Write all your automation with idempotency in mind: check before act, not act then check.

**Immutable infrastructure:** Rather than patching running servers (mutable), you build a new image with the change applied and replace the running instance. Container-based workloads are inherently immutable — you don't patch a running container, you rebuild the image and redeploy. Shani OS is an immutable OS for the same reason: updates replace the root filesystem atomically.

**GitOps vs traditional CD:** Traditional CD has the pipeline push changes to the cluster (`kubectl apply` from CI). GitOps inverts this — a reconciler inside the cluster (ArgoCD, Flux) watches a Git repo and *pulls* the desired state. Benefits: every change is a Git commit (full audit trail), the cluster can self-heal by re-syncing, and the pipeline never needs cluster credentials.

**Trunk-based development vs feature branches:** Trunk-based development has everyone committing directly to `main` (or short-lived branches that merge in hours, not weeks). Feature flags gate incomplete work rather than long-lived branches. This reduces merge conflicts and keeps CI fast. Most high-performing teams (per DORA research) practice trunk-based development.

**Shift-left security:** Moving security checks earlier in the development lifecycle — ideally before code is committed (pre-commit hooks, IDE plugins) rather than post-deployment. Semgrep in pre-commit is more shift-left than ZAP in staging. The earlier a finding, the cheaper it is to fix.

**Ephemeral environments:** On-demand environments provisioned for a specific PR or feature, then destroyed. Every PR gets its own isolated test environment with a URL like `pr-123.staging.example.com`. Enables parallel testing with no environment contention. Typically provisioned via Kubernetes namespaces + Argo Rollouts or Helm + preview URLs from Ingress.

**Blue/Green vs Canary vs Rolling — when to use each:**
- **Rolling update** (Kubernetes default): replace pods one at a time. Zero downtime but brief period with mixed versions. Good for stateless workloads, low risk.
- **Blue/Green**: maintain two identical environments, flip traffic instantly. Expensive (2× resources) but instant rollback. Good for scheduled maintenance windows or database migrations.
- **Canary**: route 5–10% of traffic to new version, watch metrics, then promote. Best for high-traffic services where you want to catch regressions with real traffic before a full rollout.

**Service mesh concepts (Istio/Linkerd):** A service mesh adds a sidecar proxy (Envoy for Istio, a lightweight proxy for Linkerd) to every pod. The sidecar intercepts all in/out traffic, enabling: mTLS between services without app code changes, traffic shifting (canary), circuit breaking, retries, and distributed tracing. The control plane (Istiod) pushes policy to all sidecars. This is separate from Cilium, which does similar things at the eBPF kernel level without sidecars.

**On-call rotation essentials:** DORA's Time to Restore (MTTR) metric is directly tied to how well on-call is set up. The key components are: (1) alerting with high signal-to-noise (no alert fatigue — every page must be actionable), (2) runbooks linked from alerts, (3) a defined escalation chain, (4) postmortems after every incident. Grafana OnCall handles scheduling and escalation; your Prometheus alerts are the input.

**Rollback vs roll-forward:** Rolling back means deploying the previous known-good version. Roll-forward means quickly patching the broken version and deploying again. For stateless services, rollback is easier — `kubectl argo rollouts undo` or `kubectl rollout undo`. For services with database migrations, rollback may be impossible if the migration isn't reversible — which is why forward-compatible migrations (add column, then backfill, then make non-null) are a standard practice.

**Environment parity:** Dev, staging, and prod should be as similar as possible in config, dependencies, and infrastructure shape. Differences cause "works on staging" bugs. Using the same Helm chart with different `values.yaml` per environment (or Kustomize overlays) is the standard approach to maintaining parity while allowing necessary differences (replica count, resource limits, domain names).



**Terraform state — the source of truth for your infrastructure:** Terraform's state file (`terraform.tfstate`) maps your configuration to real infrastructure resources. It tracks resource IDs, attributes, and dependencies. Without state, Terraform can't know what it has already created. Problems with local state: (1) it can't be shared across a team, (2) it's lost if the machine is lost. Remote state (S3/MinIO backend with DynamoDB/Redis locking) is mandatory for team use — it enables state locking (prevents concurrent applies), versioning (rollback if state is corrupted), and separation from the code. `terraform import` adds existing resources to state; `terraform state rm` removes resources from tracking without destroying them.

**Ansible vs Terraform — what each is for:** Terraform is declarative and idempotent for infrastructure provisioning — it manages the lifecycle of resources (create, update, destroy) by reconciling desired state with actual state. Ansible is procedural and idempotent for configuration management — it runs tasks in sequence on existing hosts (install packages, write config files, restart services). The canonical split: Terraform provisions the VM; Ansible configures what's running on it. Both can overlap (Terraform has file provisioners; Ansible has cloud modules) but the mental models are different. Mixing them without a clear boundary creates maintenance nightmares.

**Policy-as-code — making compliance automatic:** Policy-as-code tools (Checkov, tfsec, OPA/Rego, Kyverno) express infrastructure and Kubernetes policies as code that can be version-controlled, reviewed, and automatically enforced. Instead of a checklist that relies on humans, a Checkov rule blocks a Terraform plan that opens port 22 to 0.0.0.0/0. OPA Gatekeeper prevents a `kubectl apply` of a deployment with no resource limits. The shift: compliance moves from a post-deployment audit to a pre-deployment gate in the CI pipeline. Every IaC commit passes through policy checks before reaching production.

**Terraform modules — reusable infrastructure components:** A module is a directory of Terraform files with defined inputs (variables) and outputs. Instead of copy-pasting the same VPC/subnet/security-group configuration across 10 environments, you write it once as a module and call it with different variable values. The public Terraform Registry hosts community modules (AWS VPC, GKE cluster, etc.). Internal modules (stored in your Git repo) encode your organisation's standards — a module that provisions a PostgreSQL instance always includes backup configuration, monitoring, and correct security groups, because those are baked in. Modules are the IaC equivalent of application libraries.
---

---

## Table of Contents

- [Code Hosting](#code-hosting)
- [CI/CD](#cicd)
- [Container & Image Tools](#container--image-tools)
- [Kubernetes & Orchestration](#kubernetes--orchestration)
- [HA Clusters](#ha-clusters)
- [Infrastructure as Code](#infrastructure-as-code)
- [Artifact & Dependency Management](#artifact--dependency-management)
- [Service Discovery & Orchestration](#service-discovery--orchestration)
- [Developer Environments & Utilities](#developer-environments--utilities)
- [Internal Platforms](#internal-platforms)
- [Hardware & Embedded](#hardware--embedded)
- [IoT & SCADA Tools](#iot--scada-tools)
- [Security CLI Tools](#security-cli-tools)
- [Education & Training Platforms](#education--training-platforms)
- [Key Concepts](#key-concepts)

---

## Code Hosting

> Full setup, compose files, and common operations for code hosting tools live in the [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools). This section covers DevOps integration patterns.

### Gitea / Forgejo

For compose files, CLI operations, SSH setup, and Gitea Classroom patterns, see the [Developer Tools wiki → Gitea & Forgejo](https://docs.shani.dev/doc/servers/devtools#gitea--forgejo).

Configure SSH clients to use `Port 2222` for `git.home.local`.

### GitLab CE

For compose file and setup, see the [Developer Tools wiki → GitLab CE](https://docs.shani.dev/doc/servers/devtools#gitlab-ce).

---

## CI/CD

> Compose files and basic setup for self-hosted CI runners live in the [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools). This section covers CI/CD pipeline patterns, GitHub Actions workflows, and cloud-CI integration.

### Woodpecker CI

For compose file, server/agent setup, and Gitea OAuth integration, see the [Developer Tools wiki → Woodpecker CI](https://docs.shani.dev/doc/servers/devtools#woodpecker-ci).

---

### Forgejo Actions Runner

For compose file and registration steps, see the [Developer Tools wiki → Forgejo Actions Runner](https://docs.shani.dev/doc/servers/devtools#forgejo-actions-runner).

**Example workflow** (`.forgejo/workflows/ci.yml`):
```yaml
on: [push]
jobs:
  test:
    runs-on: docker
    steps:
      - uses: actions/checkout@v4
      - run: echo "Hello from Forgejo Actions"
```

---

### Jenkins

For compose file, initial setup, and common CLI operations, see the [Developer Tools wiki → Jenkins](https://docs.shani.dev/doc/servers/devtools#jenkins-enterprise-cicd).


### OpenFeature + Flagd (Feature Flag Management)

**Purpose:** OpenFeature is a vendor-neutral FHIR-like standard for feature flags — your application code calls the OpenFeature SDK and any backend (Flagd, LaunchDarkly, Unleash, CloudBees) can be swapped without code changes. Flagd is the lightweight, self-hosted reference backend: it reads flag definitions from a config file or Kubernetes CRDs, evaluates them with targeting rules, and serves them over gRPC or HTTP. Increasingly standard in platform engineering stacks.

```yaml
# ~/flagd/compose.yaml
services:
  flagd:
    image: ghcr.io/open-feature/flagd:latest
    ports:
      - 127.0.0.1:8013:8013   # gRPC
      - 127.0.0.1:8014:8014   # HTTP
    volumes:
      - /home/user/flagd/flags.json:/flags.json:ro,Z
    command: start --uri file:///flags.json
    restart: unless-stopped
```

```bash
cd ~/flagd && podman-compose up -d
```

**Example `flags.json`:**
```json
{
  "$schema": "https://flagd.dev/schema/v0/flags.json",
  "flags": {
    "new-checkout-flow": {
      "state": "ENABLED",
      "variants": { "on": true, "off": false },
      "defaultVariant": "off",
      "targeting": {
        "if": [
          { "in": [{ "var": "email" }, ["beta@example.com"]] },
          "on", "off"
        ]
      }
    }
  }
}
```

**Use from Python:**
```python
from openfeature import api
from openfeature.provider.flagd import FlagdProvider

api.set_provider(FlagdProvider())
client = api.get_client()
enabled = client.get_boolean_value("new-checkout-flow", False, {"email": "user@example.com"})
```

---

### Score (Platform-Agnostic Workload Spec)

**Purpose:** Score is a developer-centric workload specification format — like `docker-compose.yaml` but platform-agnostic. Developers write a `score.yaml` describing their workload (containers, resources, environment) once, and `score-compose` or `score-k8s` translates it to a `compose.yaml` or Kubernetes manifests respectively. Eliminates the need for developers to know Kubernetes YAML while keeping platform teams in control of how workloads are deployed.

```bash
# Install via Nix
nix-env -iA nixpkgs.score-compose nixpkgs.score-k8s

# Initialise a Score project
score-compose init
score-k8s init

# Generate a compose.yaml from score.yaml
score-compose generate score.yaml --output compose.yaml

# Generate Kubernetes manifests from score.yaml
score-k8s generate score.yaml --output manifests/
```

**Example `score.yaml`:**
```yaml
apiVersion: score.dev/v1b1
metadata:
  name: my-service
containers:
  web:
    image: myapp:latest
    variables:
      DB_URL: ${resources.db.host}:${resources.db.port}/${resources.db.name}
    ports:
      - name: http
        port: 8080
resources:
  db:
    type: postgres
```

---

### Dagger (Portable Pipelines as Code)

**Purpose:** Write CI/CD pipelines in Python, Go, TypeScript, or PHP — not YAML. Pipelines run identically on your workstation (via Podman) and in any CI system. Eliminates "works on CI but not locally" problems.

```bash
# Install Dagger CLI — Nix (primary)
nix-env -iA nixpkgs.dagger

# Or via Snap
snap install dagger --classic

# Point Dagger at the rootless Podman socket
export _EXPERIMENTAL_DAGGER_RUNNER_HOST=unix:///run/user/$UID/podman/podman.sock

# Initialise a Dagger module
dagger init --sdk=python

# Run a function locally
dagger call build --source=.
```

**Example `main.py`:**
```python
import dagger
from dagger import dag, function, object_type

@object_type
class MyPipeline:
    @function
    async def build(self, source: dagger.Directory) -> dagger.Container:
        return (
            dag.container()
            .from_("python:3.12-slim")
            .with_directory("/app", source)
            .with_workdir("/app")
            .with_exec(["pip", "install", "-r", "requirements.txt"])
            .with_exec(["python", "-m", "pytest"])
        )
```

---

### GitHub Actions (Cloud CI/CD — github.com)

**Purpose:** GitHub's native CI/CD system. Workflows are YAML files in `.github/workflows/` that trigger on push, pull request, schedule, or manual dispatch.

> **Note:** `act` (below) runs GitHub Actions workflows locally using Podman. For self-hosted runners, see the [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools).

**Workflow structure and triggers:**
```yaml
# .github/workflows/ci.yaml
name: CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * 1'    # weekly at 2 AM Monday
  workflow_dispatch:         # manual trigger from GitHub UI
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: 'staging'
        type: choice
        options: [staging, prod]
```

**Complete CI workflow (build, test, push image):**
```yaml
# .github/workflows/ci.yaml (continued)
env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: 'pip'

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Run tests
        run: pytest tests/ --tb=short --junitxml=test-results.xml

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: test-results.xml

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata (tags, labels)
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=sha-
            type=ref,event=branch
            type=semver,pattern={{version}}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### Dependency Caching in CI

The `cache-from: type=gha` above caches Docker image layers. For faster dependency installs (pip, npm, Go modules), use `actions/cache` keyed on the lockfile hash — so the cache is invalidated only when dependencies actually change:

```yaml
# Python
- uses: actions/cache@v4
  with:
    path: ~/.cache/pip
    key: ${{ runner.os }}-pip-${{ hashFiles('requirements.txt') }}
    restore-keys: ${{ runner.os }}-pip-

# Node.js
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}
    restore-keys: ${{ runner.os }}-node-

# Go modules
- uses: actions/cache@v4
  with:
    path: ~/go/pkg/mod
    key: ${{ runner.os }}-go-${{ hashFiles('go.sum') }}
    restore-keys: ${{ runner.os }}-go-
```

The `restore-keys` fallback uses a partial cache (the most recent cache for this OS, even with a different lockfile hash) — a partial cache hit is still much faster than downloading all dependencies from scratch.
```yaml
# .github/workflows/deploy.yaml
name: Deploy

on:
  workflow_run:
    workflows: ["CI Pipeline"]
    types: [completed]
    branches: [main]

jobs:
  deploy-staging:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    environment:
      name: staging
      url: https://staging.example.com
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to staging
        run: |
          echo "${{ secrets.KUBECONFIG }}" | base64 -d > kubeconfig
          kubectl --kubeconfig kubeconfig set image deployment/myapp \
            myapp=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:sha-${{ github.sha }} \
            -n staging

  deploy-prod:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment:
      name: production         # requires manual approval in GitHub Environments settings
      url: https://example.com
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        run: |
          echo "${{ secrets.KUBECONFIG_PROD }}" | base64 -d > kubeconfig
          kubectl --kubeconfig kubeconfig set image deployment/myapp \
            myapp=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:sha-${{ github.sha }} \
            -n production
```

**Reusable workflows (DRY — define once, call from many repos):**
```yaml
# .github/workflows/reusable-test.yaml  (in a shared repo)
name: Reusable Test
on:
  workflow_call:
    inputs:
      python-version:
        required: false
        default: '3.12'
        type: string
    secrets:
      TEST_DB_URL:
        required: true

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ inputs.python-version }}
      - run: pytest
        env:
          DATABASE_URL: ${{ secrets.TEST_DB_URL }}
```

```yaml
# .github/workflows/ci.yaml  (in a consumer repo)
jobs:
  test:
    uses: myorg/shared-workflows/.github/workflows/reusable-test.yaml@main
    with:
      python-version: '3.11'
    secrets:
      TEST_DB_URL: ${{ secrets.TEST_DB_URL }}
```

**Branching strategy — GitHub Flow (standard for CD teams):**
```
main ──────────────────────────────── (always deployable, protected)
  ├── feature/add-login ─────────► PR ─► merge ─► auto-deploy staging
  ├── fix/null-pointer ──────────► PR ─► merge ─► auto-deploy staging
  └── release/v1.2 ─────────────► PR ─► merge ─► manual approve prod
```

**Branch protection rules (configure in GitHub Settings → Branches):**
```yaml
# Typical main branch protection:
# - Require PR before merging (no direct push)
# - Require status checks: ci/test, ci/lint, security/scan
# - Require at least 1 approving review
# - Dismiss stale reviews when new commits pushed
# - Require branches to be up to date before merging
# - Restrict who can push to matching branches: team:platform-engineers
```

**Terraform plan/apply with GitHub Actions (Infrastructure PR workflow):**
```yaml
# .github/workflows/terraform.yaml
name: Terraform

on:
  pull_request:
    paths: ['terraform/**']
  push:
    branches: [main]
    paths: ['terraform/**']

jobs:
  terraform:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: terraform/

    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "~1.9"

      - name: Terraform Init
        run: terraform init
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

      - name: tflint
        uses: terraform-linters/setup-tflint@v4
      - run: tflint --recursive

      - name: Checkov security scan
        uses: bridgecrewio/checkov-action@v12
        with:
          directory: terraform/
          quiet: true
          soft_fail: false

      - name: Terraform Plan
        if: github.event_name == 'pull_request'
        run: terraform plan -no-color -out=tfplan
        env:
          TF_VAR_environment: ${{ github.base_ref }}

      - name: Comment plan on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const plan = require('fs').readFileSync('tfplan.txt', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '```hcl\n' + plan + '\n```'
            });

      - name: Terraform Apply
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        run: terraform apply -auto-approve tfplan
```

**Secrets management in GitHub Actions:**
```bash
# Set repository secrets via CLI
gh secret set KUBECONFIG --body "$(cat ~/.kube/config | base64)"
gh secret set REGISTRY_PASSWORD < ~/.docker-password

# Set environment-scoped secrets (staging vs prod isolation)
gh secret set DATABASE_URL --env staging --body "postgres://..."
gh secret set DATABASE_URL --env production --body "postgres://..."

# List secrets (names only — values never shown)
gh secret list
gh secret list --env production
```

**Matrix builds (test across multiple versions):**
```yaml
jobs:
  test:
    strategy:
      matrix:
        python-version: ['3.10', '3.11', '3.12']
        os: [ubuntu-latest, ubuntu-22.04]
      fail-fast: false      # don't cancel other matrix jobs on failure
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}
```

**Self-hosted runner on this system (route CI jobs to your own machine):**
```yaml
# ~/github-runner/compose.yaml
services:
  github-runner:
    image: myoung34/github-runner:latest
    environment:
      REPO_URL: https://github.com/myorg/myrepo
      RUNNER_TOKEN: <token-from-github-settings-actions-runners>
      RUNNER_NAME: shani-runner-01
      RUNNER_WORKDIR: /tmp/github-runner
      LABELS: self-hosted,linux,shani-os
    volumes:
      - /run/user/${UID}/podman/podman.sock:/var/run/docker.sock:ro
    restart: unless-stopped
```

```bash
cd ~/github-runner && podman-compose up -d
```

In your workflows, use `runs-on: [self-hosted, shani-os]` to route jobs to this runner.

---

### act (Local GitHub Actions Runner)

**Purpose:** Run GitHub Actions workflows locally without pushing to GitHub. Reads `.github/workflows/*.yml` and runs them in containers. Use for local iteration before pushing.

```bash
# Install act — Nix
nix-env -iA nixpkgs.act

# Run the default push event
act

# Run a specific job
act -j build

# Pass secrets
act --secret-file .secrets

# Dry run
act -n
```

---

### Renovate Bot

**Purpose:** Automated dependency update PRs — outdated container image tags, npm/pip/cargo packages, Actions versions. Works natively with Gitea and Forgejo.


**Schedule with a systemd timer:**
```bash
cat > ~/.config/systemd/user/renovate.service << 'EOF'
[Unit]
Description=Renovate Dependency Updater

[Service]
Type=oneshot
WorkingDirectory=/home/user/renovate
ExecStart=podman-compose run --rm renovate
EOF

cat > ~/.config/systemd/user/renovate.timer << 'EOF'
[Unit]
Description=Weekly Renovate Run

[Timer]
OnCalendar=weekly
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user enable --now renovate.timer
```

**Minimal `renovate.json`:**
```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:base"],
  "automerge": false
}
```

---

### SonarQube (Code Quality & Security)

For compose file and setup, see the [Developer Tools wiki → SonarQube](https://docs.shani.dev/doc/servers/devtools#sonarqube-code-quality--security).

> Requires `vm.max_map_count=524288` and `fs.file-max=131072` on the host. Set persistently:
> ```bash
> echo 'vm.max_map_count=524288' | sudo tee -a /etc/sysctl.d/sonar.conf
> sudo sysctl -p /etc/sysctl.d/sonar.conf
> ```

---

## Container & Image Tools

### Private Container Registry

For compose file and setup, see the [Developer Tools wiki → Private Container Registry](https://docs.shani.dev/doc/servers/devtools#private-container-registry).

```bash
# Tag and push
podman tag myimage localhost:5000/myimage:latest
podman push localhost:5000/myimage:latest
```

Add `unqualified-search-registries = ["localhost:5000"]` to `/etc/containers/registries.conf` to allow unverified pushes in development.

---

### Harbor (Enterprise Container Registry)

For compose file (official installer) and setup, see the [Developer Tools wiki → Harbor](https://docs.shani.dev/doc/servers/devtools#harbor-enterprise-container-registry).

```bash
# Push images
podman login registry.home.local
podman tag myapp:latest registry.home.local/myproject/myapp:latest
podman push registry.home.local/myproject/myapp:latest
```

**Woodpecker CI push step:**
```yaml
# .woodpecker.yml
steps:
  build-and-push:
    image: woodpeckerci/plugin-docker-buildx
    settings:
      registry: registry.home.local
      repo: registry.home.local/myproject/myapp
      username:
        from_secret: harbor_user
      password:
        from_secret: harbor_password
      tags: [latest, "${CI_COMMIT_SHA}"]
```

---

### Buildah & Skopeo (OCI Image Tools)

**Purpose:** Buildah builds OCI images without a daemon and without root — perfect for rootless CI. Skopeo inspects, copies, and signs images across registries without pulling them fully.

```bash
# Install via Nix (primary)
nix-env -iA nixpkgs.buildah nixpkgs.skopeo
```

**Buildah:**
```bash
# Build from a Containerfile
buildah build -t myapp:latest .

# Scripted build (no Containerfile)
ctr=$(buildah from alpine:latest)
buildah run $ctr -- apk add --no-cache python3
buildah config --entrypoint '["python3", "-m", "http.server"]' $ctr
buildah commit $ctr myapp:latest
buildah rm $ctr

# Push to registry
buildah push myapp:latest docker://localhost:5000/myapp:latest
```

**Skopeo:**
```bash
# Inspect without pulling
skopeo inspect docker://nginx:alpine

# Copy between registries (no full pull)
skopeo copy docker://nginx:alpine docker://localhost:5000/nginx:alpine

# Copy all tags
skopeo copy --all docker://nginx docker://localhost:5000/nginx

# Delete from registry
skopeo delete docker://localhost:5000/myapp:old

# Sync an entire repo to a local mirror
skopeo sync --src docker --dest dir nginx:alpine /tmp/mirror/
```

---

### Mailpit (Email Testing)

For compose file and setup, see the [Developer Tools wiki → Mailpit](https://docs.shani.dev/doc/servers/devtools#mailpit-email-testing).


---

## Kubernetes & Orchestration

For all Kubernetes distributions (k3s, k0s, MicroK8s, RKE2, Talos), cluster management, GitOps tooling, ingress, storage, and platform engineering tools, see the [Kubernetes & Container Orchestration wiki](https://docs.shani.dev/doc/servers/kubernetes).

---

## HA Clusters

All HA cluster compose files (PostgreSQL/Patroni, Redis Sentinel, Valkey Cluster, MongoDB, Kafka, Cassandra, ScyllaDB, RabbitMQ, Elasticsearch, OpenSearch, VictoriaMetrics, etcd) are in the dedicated [Clusters wiki](https://docs.shani.dev/doc/servers/clusters).

### Choosing the Right HA Strategy

| Service | Strategy | Compose Path | Tolerates Node Loss |
|---------|----------|-------------|---------------------|
| PostgreSQL | Patroni + etcd + HAProxy | `~/patroni/` | 1 of 2 |
| Redis / Valkey | Sentinel (3 sentinels + replicas) | `~/redis-sentinel/` | 1 of 3 |
| Redis / Valkey | Native Cluster (6 nodes, 3+3) | `~/valkey-cluster/` | 1 per shard |
| MongoDB | Replica Set (3 nodes) | `~/mongodb-rs/` | 1 of 3 |
| Kafka | KRaft (3 nodes) | `~/kafka-cluster/` | 1 of 3 |
| Cassandra | Ring (3 nodes, RF=3) | `~/cassandra-cluster/` | 1 of 3 |
| ScyllaDB | Ring (3 nodes, RF=3) | `~/scylladb-cluster/` | 1 of 3 |
| RabbitMQ | Cluster + Quorum Queues | `~/rabbitmq-cluster/` | 1 of 3 |
| Elasticsearch | 3-node master/data | `~/elk-cluster/` | 1 of 3 |
| OpenSearch | 3-node cluster manager | `~/opensearch-cluster/` | 1 of 3 |
| VictoriaMetrics | vminsert/vmselect/vmstorage | `~/victoriametrics-cluster/` | 1 of 2 storage |
| etcd | 3-node Raft | `~/etcd-cluster/` | 1 of 3 |

---

## Infrastructure as Code

### OpenTofu / Terraform

**Purpose:** Declarative cloud and on-premise infrastructure provisioning. OpenTofu is the open-source, BSL-free fork of Terraform and is drop-in compatible.

```bash
# Install OpenTofu via Nix (preferred — open source)
nix-env -iA nixpkgs.opentofu

# Or Terraform via Nix
nix-env -iA nixpkgs.terraform

# Both also available via Snap
snap install opentofu --classic
snap install terraform --classic
```

```bash
tofu init        # download providers
tofu plan        # preview changes
tofu apply       # apply
tofu destroy     # remove all managed resources
tofu fmt -recursive
tofu validate
tofu import aws_instance.web i-1234567890abcdef0
```

**Example `main.tf` — manage a Podman container:**
```hcl
terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {
  host = "unix:///run/user/${UID}/podman/podman.sock"
}

resource "docker_container" "nginx" {
  name  = "nginx-tf"
  image = "nginx:alpine"
  ports {
    internal = 80
    external = 8099
  }
}
```

**Remote state in MinIO (self-hosted S3):**
```hcl
terraform {
  backend "s3" {
    bucket                      = "tofu-state"
    key                         = "homelab/terraform.tfstate"
    region                      = "us-east-1"
    endpoint                    = "http://minio.home.local:9000"
    access_key                  = "minioadmin"
    secret_key                  = "changeme"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    force_path_style            = true
  }
}
```

> Never commit `terraform.tfstate` to Git — it contains secrets in plaintext. Use the MinIO backend from the [Backups wiki](https://docs.shani.dev/doc/servers/backups-sync#minio-self-hosted-s3-backup-target).

**Terraform Module Structure (modularization best practice):**
```
terraform/
├── modules/
│   ├── k8s-namespace/        # reusable module: creates namespace + RBAC + quota
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── monitoring-stack/     # reusable module: deploys Prometheus + Grafana
│   └── network/              # reusable module: VPC, subnets, firewall rules
├── environments/
│   ├── dev/
│   │   ├── main.tf           # calls modules with dev-specific vars
│   │   ├── terraform.tfvars  # dev values
│   │   └── backend.tf        # remote state: s3://tofu-state/dev/terraform.tfstate
│   ├── staging/
│   └── prod/
└── .terraform.lock.hcl       # provider version lock — always commit this
```

```hcl
# modules/k8s-namespace/variables.tf
variable "name"        { type = string }
variable "environment" { type = string }
variable "team"        { type = string }
variable "cpu_limit"   { type = string; default = "4" }
variable "mem_limit"   { type = string; default = "8Gi" }

# modules/k8s-namespace/main.tf
resource "kubernetes_namespace" "this" {
  metadata {
    name = var.name
    labels = {
      environment = var.environment
      team        = var.team
      managed-by  = "terraform"      # tagging policy: always present
    }
  }
}

resource "kubernetes_resource_quota" "this" {
  metadata { name = "default-quota"; namespace = kubernetes_namespace.this.metadata[0].name }
  spec {
    hard = {
      "limits.cpu"    = var.cpu_limit
      "limits.memory" = var.mem_limit
    }
  }
}

# environments/prod/main.tf — consume the module
module "myapp_ns" {
  source      = "../../modules/k8s-namespace"
  name        = "myapp"
  environment = "prod"
  team        = "platform"
  cpu_limit   = "8"
  mem_limit   = "16Gi"
}
```

**Remote state with state locking (prevents concurrent apply conflicts):**
```hcl
# environments/prod/backend.tf
terraform {
  backend "s3" {
    bucket                      = "tofu-state"
    key                         = "prod/terraform.tfstate"
    region                      = "us-east-1"
    endpoint                    = "http://minio.home.local:9000"
    access_key                  = "minioadmin"
    secret_key                  = "changeme"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    force_path_style            = true

    # State locking via DynamoDB (for AWS) or the S3 backend's built-in locking
    # MinIO's S3 backend supports native state locking (no DynamoDB needed with OpenTofu 1.7+)
    use_lockfile = true
  }
}
```

**Drift detection (detect infrastructure changes made outside Terraform):**
```bash
# Detect drift between state and real infrastructure
tofu plan -detailed-exitcode
# Exit code 0 = no changes; 1 = error; 2 = changes detected (drift)

# Refresh state from real infrastructure (updates state without changing infra)
tofu refresh

# Import a resource created manually (bring it under Terraform management)
tofu import kubernetes_namespace.myapp myapp

# Automated drift detection via systemd timer
cat > ~/.config/systemd/user/tofu-drift.service << 'EOF'
[Unit]
Description=OpenTofu Drift Detection

[Service]
Type=oneshot
WorkingDirectory=/home/user/terraform/environments/prod
ExecStart=/bin/bash -c 'tofu plan -detailed-exitcode 2>&1 | \
  grep -E "(must be replaced|will be destroyed|has changed)" && \
  curl -s -d "Terraform drift detected in prod" http://ntfy.home.local/infra-alerts || true'
EOF

cat > ~/.config/systemd/user/tofu-drift.timer << 'EOF'
[Unit]
Description=Daily Terraform Drift Check
[Timer]
OnCalendar=daily
Persistent=true
[Install]
WantedBy=timers.target
EOF

systemctl --user enable --now tofu-drift.timer
```

**Policy guardrails with tflint + Checkov + tfsec:**
```bash
# Install tflint (Terraform linter — catches provider-specific mistakes)
nix-env -iA nixpkgs.tflint

# Install Checkov (security policy scanner for IaC — multi-framework)
pip install checkov --break-system-packages

# Install tfsec (focused Terraform security scanner, fast, no Python dep)
nix-env -iA nixpkgs.tfsec

# tflint: lint all modules
tflint --recursive --format=compact

# Checkov: security scan (fails on critical findings)
checkov -d terraform/ \
  --check CKV_K8S_8,CKV_K8S_9,CKV_K8S_14,CKV_K8S_35 \
  --soft-fail-on MEDIUM \
  -o cli

# Common checks relevant to Kubernetes Terraform:
# CKV_K8S_8  — containers must have readiness probes
# CKV_K8S_9  — containers must have liveness probes
# CKV_K8S_14 — image tag must not be 'latest'
# CKV_K8S_35 — secrets must not be in environment variables
# CKV_K8S_43 — image must use digest (not mutable tag)

# tfsec: fast, Terraform-native security scan (good for CI gates)
tfsec terraform/
tfsec terraform/ --severity CRITICAL   # fail only on critical
tfsec terraform/ --format json         # machine-readable output
tfsec terraform/ --out results.json    # write to file for ingestion by Defect Dojo

# Inline suppression (when a finding is intentional — add to the .tf resource):
# #tfsec:ignore:aws-s3-enable-bucket-logging
```

> **Checkov vs tfsec:** Use both. Checkov covers Terraform, Kubernetes YAML, Dockerfiles, GitHub Actions, Helm charts, and CloudFormation in one tool. tfsec is Terraform-only but faster and catches different edge cases. Run tfsec as a fast pre-commit gate and Checkov as the full CI scan. Both integrate with Defect Dojo via JSON output.

**Integrate in CI (Woodpecker / Forgejo Actions):**
```yaml
# .woodpecker.yml — add after the tofu plan step
- name: iac-security-scan
  image: bridgecrew/checkov
  commands:
    - checkov -d terraform/ -o cli -o json --output-file-path /dev/null,results.json
    - "[ $(jq '.summary.failed' results.json) -eq 0 ] || exit 1"
```

**Tagging and naming policy (enforced via tflint rules):**
```hcl
# .tflint.hcl — project-level tflint config
plugin "aws" { enabled = true; version = "0.32.0"; source = "github.com/terraform-linters/tflint-ruleset-aws" }
plugin "kubernetes" { enabled = true }

rule "terraform_required_tags" {
  enabled = true
  # Enforce that every resource has these tags:
  required_tags = ["environment", "team", "managed-by", "cost-center"]
}

rule "terraform_naming_convention" {
  enabled = true
  # Enforce snake_case naming for all resources
  format = "snake_case"
}
```

**Promote changes across Dev → UAT → Prod:**
```bash
# Pattern: same module, different tfvars per environment
# Dev:     tofu apply -var-file=dev.tfvars    (auto-applied on merge to develop)
# UAT:     tofu apply -var-file=uat.tfvars    (requires PR approval)
# Prod:    tofu apply -var-file=prod.tfvars   (requires second approval + plan review)

# Workspace approach (alternative — single state tree, multiple workspaces):
tofu workspace new dev
tofu workspace new uat
tofu workspace new prod
tofu workspace select prod
tofu plan -var-file=prod.tfvars
tofu apply -var-file=prod.tfvars

# Always plan before apply in prod
tofu plan -out=prod.tfplan -var-file=prod.tfvars
# (review prod.tfplan output)
tofu apply prod.tfplan   # applies exactly what was planned — no surprises
```

---

### Ansible (Configuration Management)

**Purpose:** Agentless configuration management and automation over SSH. Define desired server state in YAML playbooks. No agent on remote hosts — just SSH and Python.

```bash
# Install via Nix
nix-env -iA nixpkgs.ansible

# Or via Snap
snap install ansible --classic
```

**Inventory (`~/ansible/inventory.ini`):**
```ini
[webservers]
web1.home.local ansible_user=user
web2.home.local ansible_user=user

[databases]
db1.home.local ansible_user=user

[all:vars]
ansible_ssh_private_key_file=~/.ssh/id_ed25519
```

**Common ad-hoc commands:**
```bash
ansible all -i inventory.ini -m ping
ansible webservers -i inventory.ini -m shell -a "uptime"
ansible all -i inventory.ini -m copy -a "src=./config.conf dest=/etc/myapp/config.conf"
ansible-playbook -i inventory.ini playbook.yaml --check --diff
```

**Example playbook:**
```yaml
---
- name: Configure web servers
  hosts: webservers
  become: true
  tasks:
    - name: Ensure nginx is installed
      package:
        name: nginx
        state: present

    - name: Deploy nginx config
      template:
        src: templates/nginx.conf.j2
        dest: /etc/nginx/nginx.conf
      notify: Restart nginx

    - name: Ensure nginx is running
      service:
        name: nginx
        state: started
        enabled: true

  handlers:
    - name: Restart nginx
      service:
        name: nginx
        state: restarted
```

```bash
ansible-playbook -i inventory.ini playbook.yaml
ansible-playbook -i inventory.ini playbook.yaml --tags "deploy"
ansible-playbook -i inventory.ini playbook.yaml --limit web1.home.local
ansible-vault encrypt vars/secrets.yaml
ansible-playbook -i inventory.ini playbook.yaml --ask-vault-pass
```

**AWX (Ansible Tower OSS — Web UI):**

AWX provides a web UI, RBAC, job scheduling, inventory management, and notifications on top of Ansible. The recommended install method is the AWX Operator on Kubernetes, but a standalone Docker Compose setup is available for homelab use.

```yaml
# ~/awx/compose.yaml
# AWX requires postgres and redis; the operator handles this on k8s
# For a quick homelab setup, use the AWX operator on k3s instead:
#   kubectl apply -f https://raw.githubusercontent.com/ansible/awx-operator/main/deploy/awx-operator.yaml
# Then create an AWX custom resource — see AWX operator docs.
# Direct compose: use the community awx-on-docker project:
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: awx
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: awx
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  awx_web:
    image: ansible/awx:latest
    ports: ["127.0.0.1:8052:8052"]
    environment:
      SECRET_KEY: "run: openssl rand -hex 32"
      DATABASE_HOST: postgres
      DATABASE_USER: awx
      DATABASE_PASSWORD: changeme
      DATABASE_NAME: awx
      REDIS_HOST: redis
      AWX_ADMIN_USER: admin
      AWX_ADMIN_PASSWORD: changeme
    depends_on: [postgres, redis]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/awx && podman-compose up -d
# Access at http://localhost:8052 — default login: admin / changeme
```

**Caddy:**
```caddyfile
awx.home.local { tls internal; reverse_proxy localhost:8052 }
```

---

### Pulumi (IaC in Real Languages)

**Purpose:** IaC using Python, TypeScript, Go, C#, or Java — no DSL. State stored in Pulumi Cloud or self-hosted in S3-compatible storage. Popular in developer-centric teams.

```bash
# Install via Nix
nix-env -iA nixpkgs.pulumi
# Or via Snap
snap install pulumi --classic

# Login to self-hosted MinIO backend
pulumi login s3://pulumi-state?endpoint=http://minio.home.local:9000&region=us-east-1&s3ForcePathStyle=true

pulumi new python
pulumi preview
pulumi up
pulumi destroy
pulumi stack output
```

---

### Terragrunt (OpenTofu / Terraform Wrapper)

**Purpose:** Thin wrapper around OpenTofu/Terraform that solves two real problems at scale: **DRY remote state configuration** (define your MinIO backend once, inherit it across all modules) and **multi-module orchestration** (deploy 20 modules in dependency order with one command). Essential once you outgrow a single `main.tf` — typical use case is a `live/` directory tree where every folder is an independent tofu root with no copy-pasted backend blocks.

```bash
# Install via Nix
nix-env -iA nixpkgs.terragrunt

# Or via Snap
snap install terragrunt --classic
```

**Recommended directory structure:**
```
live/
├── terragrunt.hcl          ← root config: shared remote state + provider defaults
├── homelab/
│   ├── k8s-cluster/
│   │   └── terragrunt.hcl  ← module config: inherits root, declares dependencies
│   ├── dns/
│   │   └── terragrunt.hcl
│   └── namespaces/
│       └── terragrunt.hcl
└── prod/
    └── ...
```

**Root `terragrunt.hcl` — define MinIO backend once:**
```hcl
# live/terragrunt.hcl
remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = {
    bucket   = "tofu-state"
    key      = "${path_relative_to_include()}/terraform.tfstate"
    region   = "us-east-1"
    endpoint = "http://minio.home.local:9000"
    access_key                  = get_env("MINIO_ACCESS_KEY", "minioadmin")
    secret_key                  = get_env("MINIO_SECRET_KEY", "changeme")
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    force_path_style            = true
  }
}

# Inject default provider config into every child module
generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
provider "hetzner" {
  token = get_env("HCLOUD_TOKEN")
}
EOF
}
```

**Child `terragrunt.hcl` — inherit root, declare dependency:**
```hcl
# live/homelab/namespaces/terragrunt.hcl
include "root" {
  path = find_in_parent_folders()   # walks up until it finds the root terragrunt.hcl
}

terraform {
  source = "../../../modules//k8s-namespace"
}

dependency "cluster" {
  config_path = "../k8s-cluster"
  mock_outputs = {
    cluster_endpoint = "https://127.0.0.1:6443"  # used in plan when cluster doesn't exist yet
  }
}

inputs = {
  cluster_endpoint = dependency.cluster.outputs.cluster_endpoint
  namespaces       = ["monitoring", "apps", "security"]
}
```

**Common commands:**
```bash
# Plan/apply a single module
cd live/homelab/k8s-cluster && terragrunt plan
cd live/homelab/k8s-cluster && terragrunt apply

# Apply ALL modules in dependency order (the killer feature)
cd live/homelab && terragrunt run-all apply

# Destroy all modules in reverse dependency order
cd live/homelab && terragrunt run-all destroy

# Plan all — great for PRs to see the full blast radius
cd live && terragrunt run-all plan

# Only run modules that changed (compares to last apply state)
terragrunt run-all apply --terragrunt-modules-that-include root.hcl

# Graph the dependency tree
terragrunt graph-dependencies | dot -Tpng > deps.png
```

> **OpenTofu + Terragrunt + MinIO** is the fully self-hosted, BSL-free equivalent of the Terraform Cloud / HCP Terraform stack. All state stays in your MinIO bucket; Terragrunt handles the DRY config and orchestration.

---

### Packer (Machine Image Builder)

**Purpose:** Build identical VM templates, cloud AMIs, container base images, or ISOs from a single HCL template. Common for teams using vSphere, AWS, Azure, or bare-metal.

```bash
# Install via Nix
nix-env -iA nixpkgs.packer

packer init .
packer validate myimage.pkr.hcl
packer build myimage.pkr.hcl
packer build -var "version=1.2.3" myimage.pkr.hcl
PACKER_LOG=1 packer build myimage.pkr.hcl   # debug mode
```

### Cloud Provider CLIs (AWS / GCP / Azure / Hetzner)

**Purpose:** Command-line interfaces for managing cloud resources directly — provisioning VMs, managing object storage, configuring DNS, pulling logs, and scripting infrastructure tasks. On Shani OS all CLIs install via Nix; none require a system-level package manager.

> **Homelab + cloud hybrid:** The most common this system pattern is running core services on-prem and using a VPS (Hetzner, DigitalOcean, Vultr) for public-facing ingress, offsite backups, or a WireGuard exit node. Hetzner Cloud is the primary cloud provider referenced throughout these docs — best price/performance ratio in Europe with a clean API.

**Hetzner Cloud CLI (`hcloud`) — primary:**
```bash
# Install via Nix
nix-env -iA nixpkgs.hcloud

# Authenticate (get token from Hetzner Cloud Console → Project → API Tokens)
hcloud context create homelab
# Paste token when prompted — stored in ~/.config/hcloud/cli.toml

# Common operations
hcloud server list
hcloud server create --name vpn-node --type cx22 --image ubuntu-24.04 --location nbg1 \
  --ssh-key ~/.ssh/id_ed25519.pub

hcloud server ssh vpn-node
hcloud server delete vpn-node

# Volumes (persistent block storage)
hcloud volume create --name data --size 50 --server vpn-node
hcloud volume list

# Firewall
hcloud firewall create --name homelab-fw
hcloud firewall add-rule homelab-fw --direction in --protocol tcp --port 22 --source-ips 0.0.0.0/0
hcloud firewall apply-to-resource homelab-fw --type server --server vpn-node

# Floating IPs (static public IP that survives server recreation)
hcloud floating-ip create --type ipv4 --home-location nbg1
hcloud floating-ip assign <ip-id> vpn-node

# Private networks (connect VMs without public IPs)
hcloud network create --name homelab-net --ip-range 10.0.0.0/16
hcloud network add-subnet homelab-net --network-zone eu-central --type server --ip-range 10.0.1.0/24
hcloud server attach-to-network vpn-node --network homelab-net --ip 10.0.1.1
```

**AWS CLI:**
```bash
# Install via Nix
nix-env -iA nixpkgs.awscli2

# Configure (credentials from IAM → Users → Security credentials)
aws configure
# Or use environment variables (preferred for CI):
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION

# Common operations
aws s3 ls
aws s3 cp backup.tar.gz s3://my-bucket/backups/
aws s3 sync /home/user/data/ s3://my-bucket/data/ --delete

# EC2
aws ec2 describe-instances --query 'Reservations[*].Instances[*].[InstanceId,State.Name,PublicIpAddress]' --output table
aws ec2 start-instances --instance-ids i-1234567890abcdef0
aws ec2 stop-instances --instance-ids i-1234567890abcdef0

# SSM (connect without opening port 22)
aws ssm start-session --target i-1234567890abcdef0

# ECR (container registry)
aws ecr get-login-password --region eu-west-1 | \
  podman login --username AWS --password-stdin 123456789.dkr.ecr.eu-west-1.amazonaws.com

# CloudWatch logs
aws logs tail /aws/lambda/my-function --follow
```

**GCP CLI (`gcloud`):**
```bash
# Install via Nix
nix-env -iA nixpkgs.google-cloud-sdk

# Authenticate
gcloud auth login
gcloud config set project my-project-id

# Common operations
gcloud compute instances list
gcloud compute ssh my-vm --zone europe-west1-b

# GCS (Cloud Storage)
gcloud storage ls
gcloud storage cp backup.tar.gz gs://my-bucket/backups/
gcloud storage rsync -r /home/user/data/ gs://my-bucket/data/

# GCR (Artifact Registry)
gcloud auth configure-docker europe-west1-docker.pkg.dev
podman push europe-west1-docker.pkg.dev/my-project/my-repo/myapp:latest

# Cloud Run
gcloud run deploy myapp --image europe-west1-docker.pkg.dev/my-project/my-repo/myapp:latest \
  --region europe-west1 --allow-unauthenticated
```

**Azure CLI:**
```bash
# Install via Nix
nix-env -iA nixpkgs.azure-cli

# Authenticate
az login                          # browser-based
az login --use-device-code        # for headless/SSH sessions

# Common operations
az vm list --output table
az vm start --resource-group myRG --name myVM
az vm stop  --resource-group myRG --name myVM

# Azure Blob Storage
az storage blob upload --account-name mystorageacct \
  --container-name backups --name backup.tar.gz --file backup.tar.gz

# ACR (container registry)
az acr login --name myregistry
podman push myregistry.azurecr.io/myapp:latest

# AKS
az aks get-credentials --resource-group myRG --name myAKS
kubectl get nodes
```

---

### cloud-init (VM Bootstrap Automation)

**Purpose:** Industry-standard mechanism for bootstrapping cloud VMs and bare-metal nodes on first boot. A `user-data` YAML file is passed to the instance at creation time (via the cloud provider API or a local `nocloud` source) — cloud-init runs it once, before your configuration management tool takes over. Used to: create users and SSH keys, install base packages, write files, run bootstrap scripts, and configure the system for Ansible/OpenTofu to manage.

> On Shani OS itself, cloud-init is not used (Shani uses its own atomic update mechanism). This section covers provisioning *other* machines from Shani OS — Hetzner VMs, bare-metal nodes, Proxmox VMs — using cloud-init user-data files you create and pass via `hcloud` or Proxmox.

**Minimal user-data (Hetzner Ubuntu VM):**
```yaml
# ~/cloud-init/base-server.yaml
#cloud-config

# Create a non-root admin user
users:
  - name: ops
    groups: [sudo, docker]
    shell: /bin/bash
    sudo: ALL=(ALL) NOPASSWD:ALL
    ssh_authorized_keys:
      - ssh-ed25519 AAAA...your-public-key... ops@shani

# Disable password auth entirely
ssh_pwauth: false
disable_root: true

# Install base packages
packages:
  - curl
  - git
  - htop
  - fail2ban
  - ufw

# Run once on first boot
runcmd:
  - ufw allow 22/tcp
  - ufw allow 80/tcp
  - ufw allow 443/tcp
  - ufw --force enable
  - systemctl enable --now fail2ban
  - curl -fsSL https://get.docker.com | sh    # or install Podman

# Write a file on the new VM
write_files:
  - path: /etc/motd
    content: |
      Managed by Shani homelab. Do not edit manually.
    permissions: '0644'
```

**Provision a Hetzner VM with cloud-init:**
```bash
hcloud server create \
  --name vpn-exit-01 \
  --type cx22 \
  --image ubuntu-24.04 \
  --location nbg1 \
  --ssh-key ~/.ssh/id_ed25519.pub \
  --user-data-from-file ~/cloud-init/base-server.yaml

# Watch the bootstrap complete (takes 60–90 seconds)
hcloud server ssh vpn-exit-01 -- "cloud-init status --wait && journalctl -u cloud-init --no-pager"
```

**Provision a Proxmox VM with cloud-init (nocloud source):**
```bash
# Download a cloud image (Ubuntu 24.04 cloud-ready)
wget https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img

# Create a VM template in Proxmox
qm create 9000 --name ubuntu-template --memory 2048 --cores 2 --net0 virtio,bridge=vmbr0
qm importdisk 9000 noble-server-cloudimg-amd64.img local-lvm
qm set 9000 --scsihw virtio-scsi-pci --scsi0 local-lvm:vm-9000-disk-0
qm set 9000 --ide2 local-lvm:cloudinit   # attach cloud-init drive
qm set 9000 --boot c --bootdisk scsi0
qm set 9000 --serial0 socket --vga serial0
qm set 9000 --ipconfig0 ip=dhcp
qm template 9000

# Clone template and pass your user-data
qm clone 9000 101 --name worker-01 --full
qm set 101 --cicustom "user=local:snippets/base-server.yaml"
qm set 101 --ipconfig0 "ip=192.168.1.101/24,gw=192.168.1.1"
qm start 101
```

**WireGuard exit node via cloud-init (one-shot VPN provisioning):**
```yaml
# ~/cloud-init/wireguard-exit.yaml
#cloud-config
packages: [wireguard]

write_files:
  - path: /etc/wireguard/wg0.conf
    permissions: '0600'
    content: |
      [Interface]
      PrivateKey = <server-private-key>
      Address = 10.8.0.1/24
      ListenPort = 51820
      PostUp   = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
      PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

      [Peer]
      PublicKey = <client-public-key>
      AllowedIPs = 10.8.0.2/32

runcmd:
  - sysctl -w net.ipv4.ip_forward=1
  - echo "net.ipv4.ip_forward=1" >> /etc/sysctl.d/99-wireguard.conf
  - systemctl enable --now wg-quick@wg0
  - ufw allow 51820/udp
  - ufw --force enable
```

```bash
hcloud server create --name wg-exit-eu --type cx22 --image ubuntu-24.04 \
  --location nbg1 --user-data-from-file ~/cloud-init/wireguard-exit.yaml
```

**Validate user-data before sending:**
```bash
# Install cloud-init validator
pip install cloud-init --break-system-packages

# Validate syntax
cloud-init schema --config-file ~/cloud-init/base-server.yaml
```

---

### Chef / Puppet

> **Note:** Chef and Puppet use persistent agents installed on managed hosts — incompatible with Shani OS's immutable, read-only root. Use **Ansible** (agentless, SSH + Python) for configuration management on this system. Chef/Puppet are listed here for awareness when working in enterprise environments that already use them; on this system, Ansible with AWX is the supported path.

---

## Artifact & Dependency Management

### JFrog Artifactory OSS

For compose file and setup, see the [Developer Tools wiki → JFrog Artifactory OSS](https://docs.shani.dev/doc/servers/devtools#jfrog-artifactory-oss-universal-artifact-repository).

```bash
# Push a Docker image
podman tag myapp:latest localhost:8182/my-docker-local/myapp:latest
podman push localhost:8182/my-docker-local/myapp:latest

# Upload a generic artifact
curl -u admin:password -T ./myapp.tar.gz \
  "http://localhost:8181/artifactory/generic-local/myapp-1.0.tar.gz"
```

---

### Nexus Repository OSS

For compose file and setup, see the [Developer Tools wiki → Nexus Repository OSS](https://docs.shani.dev/doc/servers/devtools#nexus-repository-oss-maven-npm-pypi-docker-proxy).

```bash
# Configure npm to proxy through Nexus
npm config set registry http://localhost:8091/repository/npm-proxy/

# Push a Docker image
podman tag myapp:latest localhost:8092/myapp:latest
podman push localhost:8092/myapp:latest
```

> ⚠️ Nexus requires at least 4 GB RAM. Set `-Xms2703m -Xmx2703m` via `INSTALL4J_ADD_VM_PARAMS` to cap memory.

---

## Service Discovery & Orchestration

### Consul (Service Discovery & Service Mesh)

For compose file and setup, see the [Developer Tools wiki → Consul](https://docs.shani.dev/doc/servers/devtools#consul-service-discovery--service-mesh).

```bash
# Install Consul CLI — Nix
nix-env -iA nixpkgs.consul

consul members
consul kv put myapp/config/db_host "db.home.local"
consul kv get myapp/config/db_host
consul health service myapp
dig @127.0.0.1 -p 8600 myapp.service.consul
```

---

### Nomad (Workload Orchestrator)

For compose file and setup, see the [Developer Tools wiki → Nomad](https://docs.shani.dev/doc/servers/devtools#nomad-workload-orchestrator).

```bash
# Install Nomad CLI — Nix
nix-env -iA nixpkgs.nomad

nomad node status
nomad job run ~/nomad/jobs/nginx.nomad
nomad job status nginx
nomad alloc logs <alloc-id>
nomad job scale nginx web 3
```

**Example job file:**
```hcl
job "nginx" {
  datacenters = ["dc1"]
  type        = "service"

  group "web" {
    count = 1

    network {
      port "http" { static = 8099 }
    }

    task "nginx" {
      driver = "docker"
      config {
        image = "nginx:alpine"
        ports = ["http"]
      }
      resources {
        cpu    = 100
        memory = 128
      }
    }
  }
}
```

---

## Developer Environments & Utilities

### code-server (VS Code in Browser)

For compose file and setup, see the [Developer Tools wiki → code-server](https://docs.shani.dev/doc/servers/devtools#code-server).

---

### Coder (Cloud Development Environments)

For compose file and setup, see the [Developer Tools wiki → Coder](https://docs.shani.dev/doc/servers/devtools#gitpod--coder-cloud-development-environments).

---

### Windmill (Workflow & Script Automation)

For compose file and setup, see the [Developer Tools wiki → Windmill](https://docs.shani.dev/doc/servers/devtools#windmill-workflow--script-automation).

---

### Matomo (Web Analytics)

For compose file and setup, see the [Developer Tools wiki → Matomo](https://docs.shani.dev/doc/servers/devtools#matomo-web-analytics).


---

### Plausible Analytics

**Purpose:** Lightweight, privacy-first Google Analytics alternative. Cookie-free, GDPR-compliant out of the box, and embeds as a single 1 KB script. Far simpler to operate than Matomo — no session-replay or heatmaps, but pageviews, bounce rate, referrers, top pages, and UTM campaigns in a clean UI. Good fit for sites that need basic analytics without GDPR cookie banners.

```yaml
# ~/plausible/compose.yaml
services:
  plausible_db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: plausible_db
      POSTGRES_USER: plausible
      POSTGRES_PASSWORD: changeme
    volumes: [db_data:/var/lib/postgresql/data]
    restart: unless-stopped

  plausible_events_db:
    image: clickhouse/clickhouse-server:24-alpine
    volumes:
      - events_data:/var/lib/clickhouse
      - /home/user/plausible/clickhouse/logs.xml:/etc/clickhouse-server/config.d/logs.xml:ro,Z
    ulimits:
      nofile:
        soft: 262144
        hard: 262144
    restart: unless-stopped

  plausible:
    image: ghcr.io/plausible/community-edition:v2
    ports: ["127.0.0.1:8033:8000"]
    environment:
      BASE_URL: https://analytics.home.local
      SECRET_KEY_BASE: "run: openssl rand -hex 64"
      DATABASE_URL: postgres://plausible:changeme@plausible_db/plausible_db
      CLICKHOUSE_DATABASE_URL: http://plausible_events_db:8123/plausible_events_db
    depends_on: [plausible_db, plausible_events_db]
    restart: unless-stopped

volumes:
  db_data:
  events_data:
```

```bash
cd ~/plausible && podman-compose up -d
# Create admin account on first visit at https://analytics.home.local/register
```

**Caddy:**
```caddyfile
analytics.home.local { tls internal; reverse_proxy localhost:8033 }
```

**Embed tracking snippet** (add to your site's `<head>`):
```html
<script defer data-domain="mysite.home.local"
  src="https://analytics.home.local/js/script.js"></script>
```

---

### Umami (Minimal Cookie-Free Analytics)

**Purpose:** The simplest self-hosted analytics option — even lighter than Plausible. Single container (plus a Postgres or MySQL DB), sub-second dashboard loads, and a clean event tracking API for custom button/form events. No cookies, no GDPR consent required. Best for personal sites, blogs, and internal tools where Matomo is overkill.

```yaml
# ~/umami/compose.yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: umami
      POSTGRES_USER: umami
      POSTGRES_PASSWORD: changeme
    volumes: [db_data:/var/lib/postgresql/data]
    restart: unless-stopped

  umami:
    image: ghcr.io/umami-software/umami:postgresql-latest
    ports: ["127.0.0.1:3005:3000"]
    environment:
      DATABASE_URL: postgresql://umami:changeme@db:5432/umami
      APP_SECRET: "run: openssl rand -hex 32"
    depends_on: [db]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/umami && podman-compose up -d
# Default login: admin / umami — change immediately
```

**Caddy:**
```caddyfile
umami.home.local { tls internal; reverse_proxy localhost:3005 }
```

**Custom event tracking:**
```html
<!-- Track a button click -->
<button data-umami-event="signup-click">Sign Up</button>

<!-- Track with extra properties -->
<button data-umami-event="purchase" data-umami-event-plan="pro">Buy Pro</button>
```

---

## Internal Platforms

### Backstage (Internal Developer Portal)

For compose file and setup, see the [Developer Tools wiki → Backstage](https://docs.shani.dev/doc/servers/devtools#backstage-internal-developer-portal).

> Backstage is most valuable once you have 5+ services. Start small — register services with `catalog-info.yaml` files in their repos, then add plugins incrementally.

---

## Hardware & Embedded

## WLED (LED Controller)

**Purpose:** Open-source firmware and web server for addressable LED strips (WS2812B, SK6812, WS2811, and more) running on ESP8266/ESP32. Flash WLED onto a cheap ESP32 board, wire it to your LED strip, and get a full web UI, Home Assistant integration via MQTT and native API, effects library (100+ built-in animations), segments, palettes, and a JSON API. No cloud — WLED runs entirely on the microcontroller and your LAN.

WLED runs on the ESP32 microcontroller itself — not as a container on your server. Your server hosts the Home Assistant integration and optionally a WLED configuration backup.

**Flash WLED onto an ESP32 (from your server):**
```bash
# Install esptool
pip install esptool --break-system-packages

# Download latest WLED firmware
# Replace 0.15.0 with the latest version from https://github.com/Aircoookie/WLED/releases
curl -LO https://github.com/Aircoookie/WLED/releases/latest/download/WLED_0.15.0_ESP32.bin

# Flash (replace /dev/ttyUSB0 with your ESP32 port)
esptool.py --port /dev/ttyUSB0 write_flash 0x0 WLED_0.15.0_ESP32.bin  # update filename to match downloaded version
```

**Or use the browser-based installer at [install.wled.me](https://install.wled.me)** — plug the ESP32 into any computer and flash directly from the browser without installing tools.

**Wire the circuit:**
```
ESP32 GPIO2 (Data) ──► LED Strip Data In
ESP32 GND           ──► LED Strip GND   ──► Power Supply GND
5V Power Supply     ──► LED Strip VCC
                                         (do NOT power strip from ESP32 5V)
```

> For more than ~30 LEDs, always use an external 5V power supply. A 60-LED strip at full white draws ~3.6A — far more than USB can provide.

**Home Assistant integration:**

Once WLED is on your network, Home Assistant auto-discovers it via mDNS. Accept the integration and your LED strip appears as a light entity with brightness, colour, and effect controls.

**Manual WLED config backup (save to your server):**
```bash
# Export WLED config via its HTTP API
curl http://192.168.1.XXX/cfg.json -o /home/user/wled/backups/strip-1-cfg.json
curl http://192.168.1.XXX/presets.json -o /home/user/wled/backups/strip-1-presets.json
```

**Control via JSON API:**
```bash
# Set colour to warm white
curl -X POST http://192.168.1.XXX/json/state \
  -H "Content-Type: application/json" \
  -d '{"on":true,"bri":200,"seg":[{"col":[[255,200,100]]}]}'

# Set a built-in effect (effect ID 9 = "Colorloop")
curl -X POST http://192.168.1.XXX/json/state \
  -d '{"seg":[{"fx":9,"sx":128,"ix":200}]}'

# Turn off
curl -X POST http://192.168.1.XXX/json/state -d '{"on":false}'
```

**MQTT control (integrates with Mosquitto):**

In WLED web UI → Config → Sync → MQTT:
- Server: `192.168.1.X` (your Mosquitto host)
- Port: `1883`
- User/Password: your MQTT credentials
- Topic: `wled/strip1`

```bash
# Control via MQTT
podman exec mosquitto mosquitto_pub -u user -P password \
  -t "wled/strip1" -m "ON"

podman exec mosquitto mosquitto_pub -u user -P password \
  -t "wled/strip1/col" -m "#FF6400"
```

> WLED is one of the most popular DIY smart home projects. A single ESP32 (~$4) + WS2812B strip (~$8/m) gives you full-colour, effect-capable smart lighting at a fraction of the cost of Philips Hue or LIFX.

---

## IoT & SCADA Tools

## OpenDataBay / Grafana SCADA Dashboard

**Purpose:** Build SCADA-style dashboards in Grafana using the SCADA panel plugin — P&ID diagrams, process flow animations, valve states, and setpoint controls visualised with industrial symbols.

```bash
# Install the SCADA plugin in Grafana
podman exec grafana grafana-cli plugins install volkovlabs-form-panel
podman exec grafana grafana-cli plugins install marcusolsson-dynamictext-panel
podman exec grafana grafana-cli plugins install volkovlabs-echarts-panel

# Restart Grafana to load plugins
podman restart grafana
```

---

## Security CLI Tools

> Full setup, compose configs, and detailed usage for the tools below live in the [Security & Identity wiki](https://docs.shani.dev/doc/servers/security). This section covers the DevOps integration points — how these tools slot into CI/CD pipelines, GitOps workflows, and IaC automation.

## osquery (Host Intrusion Detection & Visibility)

→ Full install, useful queries, and continuous monitoring config: [Security wiki → osquery](https://docs.shani.dev/doc/servers/security#osquery-host-security-monitoring--query-language)

```bash
# Install osquery on the host via Nix (not containerised — needs host kernel access)
nix-env -iA nixpkgs.osquery

sudo systemctl enable --now osqueryd
```

---

## Nuclei (Fast CVE & Misconfiguration Scanner)

→ Full install, scan patterns, template reference, and CI gate: [Security wiki → Nuclei](https://docs.shani.dev/doc/servers/security#nuclei-fast-vulnerability--exposure-scanner)

**CI gate (fail pipeline on critical findings):**
```bash
nuclei -l targets.txt -s critical,high -silent -j -o nuclei-report.json
[ "$(jq '[.[] | select(.info.severity=="critical")] | length' nuclei-report.json)" -eq 0 ] \
  || { echo "Critical findings detected!"; exit 1; }
```

> Schedule a weekly Nuclei sweep across all exposed services with a systemd timer and pipe the JSON output to ntfy for critical/high findings. Keep a `targets.txt` with every Caddy subdomain you expose.

---

## SOPS (Secrets in Git)

→ Full setup, key management, and GitOps integration: [Security wiki → SOPS + age](https://docs.shani.dev/doc/servers/security#sops--age-secrets-encryption-for-git)

**Quick reference:**
```bash
# Install
nix-env -iA nixpkgs.sops nixpkgs.age

# Generate key
age-keygen -o ~/.config/sops/age/keys.txt
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"

# Encrypt / edit / decrypt
sops -e -i secrets.yaml          # encrypt in-place
sops secrets.yaml                 # edit (decrypt → $EDITOR → re-encrypt)
sops -d secrets.yaml | kubectl apply -f -   # decrypt to pipe
```

**Woodpecker CI — inject Age key from secret:**
```yaml
steps:
  deploy:
    image: alpine
    secrets: [SOPS_AGE_KEY]
    commands:
      - apk add sops age
      - echo "$SOPS_AGE_KEY" > /tmp/age.key
      - export SOPS_AGE_KEY_FILE=/tmp/age.key
      - sops -d .env.enc > .env
      - podman-compose up -d
      - rm -f .env /tmp/age.key
```

---

## Semgrep CE (Static Analysis / SAST)

→ Full ruleset reference, custom rule authoring, Defect Dojo SARIF integration, and comparison vs Checkov/tfsec: [Security wiki → Semgrep](https://docs.shani.dev/doc/servers/security#semgrep-sast--static-application-security-testing)

**CI gate (Woodpecker / Forgejo Actions):**
```yaml
- name: sast-semgrep
  image: returntocorp/semgrep:latest
  commands:
    - semgrep --config=p/security-audit --config=p/secrets
        --severity=ERROR --error
        --sarif --output=semgrep.sarif .
```

```bash
# Local scan
nix-env -iA nixpkgs.semgrep
semgrep --config=auto .                   # auto ruleset
semgrep --config=p/owasp-top-ten .        # OWASP top 10
semgrep --config=p/secrets .              # hardcoded credentials
```


## Education & Training Platforms

## Open edX (Tutor)

**Purpose:** The platform powering edX.org and hundreds of MOOCs. Full MOOC toolkit: video courses, peer-graded assignments, timed exams, discussion forums, certificates, and XBlocks for custom content types. **Tutor** is the recommended way to deploy it — a Docker-based wrapper that makes the famously complex edX deployment manageable.

```bash
# Install Tutor
pip install "tutor[full]" --break-system-packages

# Initialise (interactive — sets domain, admin account, etc.)
tutor config save --interactive

# Launch the full stack
tutor local launch

# Create a superuser
tutor local run lms manage.py createsuperuser

# Import a demo course
tutor local do importdemocourse
```

> Tutor manages all containers, volumes, and configuration. Run `tutor local status` to see all services.

**Caddy:**
```caddyfile
lms.example.com { reverse_proxy localhost:80 }
studio.example.com { reverse_proxy localhost:80 }
```

---


## Caddy Configuration

Services in this wiki that need Caddy proxying:

```caddyfile
# Code hosting (see Developer Tools wiki for full config)
git.home.local        { tls internal; reverse_proxy localhost:3000 }
gitlab.example.com    { reverse_proxy localhost:8929 }

# CI/CD
ci.home.local         { tls internal; reverse_proxy localhost:8000 }
jenkins.home.local    { tls internal; reverse_proxy localhost:8090 }
sonar.home.local      { tls internal; reverse_proxy localhost:9000 }

# Registries
registry.home.local   { tls internal; reverse_proxy localhost:5000 }
harbor.home.local     { tls internal; reverse_proxy localhost:8180 }
artifactory.home.local { tls internal; reverse_proxy localhost:8181 }
nexus.home.local      { tls internal; reverse_proxy localhost:8091 }

# Kubernetes & observability
argocd.home.local     { tls internal; reverse_proxy localhost:8180 { transport http { tls_insecure_skip_verify } } }
rancher.home.local    { tls internal; reverse_proxy localhost:8443 { transport http { tls_insecure_skip_verify } } }
grafana.home.local    { tls internal; reverse_proxy localhost:3000 }
longhorn.home.local   { tls internal; reverse_proxy localhost:8080 }

# Service discovery & orchestration
consul.home.local     { tls internal; reverse_proxy localhost:8500 }
nomad.home.local      { tls internal; reverse_proxy localhost:4646 }
awx.home.local        { tls internal; reverse_proxy localhost:8052 }

# Dev environments & tools (see Developer Tools wiki)
code.home.local       { tls internal; reverse_proxy localhost:8443 }
coder.home.local      { tls internal; reverse_proxy localhost:3001 }
windmill.home.local   { tls internal; reverse_proxy localhost:8300 }
analytics.home.local  { tls internal; reverse_proxy localhost:8033 }
umami.home.local      { tls internal; reverse_proxy localhost:3005 }
mail.home.local       { tls internal; reverse_proxy localhost:8025 }

# Internal platform
backstage.home.local  { tls internal; reverse_proxy localhost:7007 }
opencost.home.local   { tls internal; reverse_proxy localhost:9090 }
```

---

## Troubleshooting

> For troubleshooting Gitea, Woodpecker, Jenkins, SonarQube, Harbor, Forgejo Actions, Renovate, Windmill, code-server, Coder, and Matomo, see the [Developer Tools wiki → Troubleshooting](https://docs.shani.dev/doc/servers/devtools#troubleshooting).

| Issue | Solution |
|-------|----------|
| Private registry push rejected | Add `unqualified-search-registries` to `/etc/containers/registries.conf`; restart Podman |
| `kubectl: connection refused` | Check `k3s`/`k0s` systemd service: `sudo systemctl status k3s`; verify kubeconfig `server:` IP is correct |
| MicroK8s `permission denied` on kubectl | Run `sudo usermod -aG microk8s $USER` then log out and back in |
| MicroK8s cluster data lost after snap refresh | Data is in `/var/snap/microk8s/` — loss only happens on `snap remove`, not `snap refresh` |
| minikube start fails with Podman driver | Ensure Podman socket is active: `systemctl --user start podman.socket`; try `minikube delete` then re-create |
| Node shows `NotReady` | Check CNI pods in `kube-system`; verify `br_netfilter` is loaded |
| Pod stuck in `CrashLoopBackOff` | Run `kubectl logs <pod> --previous`; check env vars and volume mounts via `kubectl describe pod` |
| Pod stuck in `ImagePullBackOff` | Image name or tag wrong; registry unreachable; missing `imagePullSecret` |
| Longhorn volume stuck `Attaching` | Verify `iscsid` is running on all nodes: `sudo systemctl status iscsid` |
| ArgoCD app OutOfSync after apply | Add `ignoreDifferences` to the Application spec for server-side mutated fields |
| Helm upgrade fails mid-release | Run `helm rollback <release> -n <ns>`; if stuck in `pending-upgrade`, delete the stuck secret |
| k9s shows no resources | Check active namespace with `:ns`; switch context with `:ctx` |
| Velero backup failing | Check `velero backup logs <n>`; ensure MinIO bucket exists; verify pod has network access to MinIO |
| Sealed secret not decrypting | Do not delete the `sealed-secrets-key` secret in `kube-system`; back it up: `kubectl get secret -n kube-system sealed-secrets-key -o yaml` |
| Crossplane provider stuck `Unhealthy` | Check `kubectl describe provider <n>`; verify the provider credentials secret exists in the `crossplane-system` namespace |
| KEDA ScaledObject not scaling | Run `kubectl describe scaledobject <n>`; verify the trigger connection string is reachable from the KEDA operator pod; check `kubectl logs -n keda -l app=keda-operator` |
| KEDA not scaling to zero | Ensure `minReplicaCount: 0` is set; some scalers (e.g. HTTP) require the `keda-add-ons-http` addon for scale-to-zero |
| Cilium pods `CrashLoopBackOff` | Confirm k3s was started with `--flannel-backend=none --disable-kube-proxy`; run `cilium status` and `cilium connectivity test` |
| Hubble observe shows no flows | Run `cilium hubble port-forward` first; confirm Hubble is enabled with `cilium hubble enable` |
| Kyverno policy not enforcing | Check `validationFailureAction: Enforce` (not `Audit`); run `kubectl get policyreport -A` to see violations without enforcement |
| Falco not detecting events | Verify eBPF driver is loaded: `kubectl logs -n falco -l app=falco`; on some kernels try `driver.kind=module` instead of `ebpf` |
| Falco too many false positives | Tune rules by adding `and not container.image.repository in (known-image)` conditions; start with `priority: WARNING` before `ERROR` |
| OpenCost shows $0 for all workloads | Set custom pricing in the ConfigMap; verify Prometheus is scraping `node-exporter` and `kube-state-metrics` correctly |
| LitmusChaos experiment stuck in `Running` | Check `kubectl get chaosengine` and `kubectl describe chaosengine`; verify the `litmus-admin` ServiceAccount exists in the target namespace |
| LitmusChaos probe verdict `Fail` unexpectedly | Confirm the Prometheus endpoint is reachable from within the cluster; check the PromQL query returns data with `kubectl exec -n litmus` |
| tfsec scan exits non-zero in CI | Use `--severity HIGH` to only fail on high/critical; add inline `#tfsec:ignore:` annotations for accepted risks |
| Checkov `ModuleNotFoundError` on Helm charts | Install `checkov[all]` extras: `pip install 'checkov[all]' --break-system-packages` |
| cosign sign fails `UNAUTHORIZED` | Ensure the registry credentials are available: `podman login registry.home.local` before signing |
| Kyverno blocks all pods after adding verify policy | Switch `validationFailureAction` to `Audit` first; check `kubectl get policyreport -A` to review violations before enforcing |
| Terragrunt `Error: No parent terragrunt.hcl` | `find_in_parent_folders()` walks up the directory tree — ensure a root `terragrunt.hcl` exists above the current module directory |
| Terragrunt `run-all` applies in wrong order | Define `dependency` blocks in child `terragrunt.hcl` files; Terragrunt builds the DAG from these — missing dependencies mean unordered execution |
| `hcloud server create` returns auth error | Token may have read-only permissions; ensure the API token has read/write scope in Hetzner Cloud Console → Security → API Tokens |
| cloud-init write_files not appearing | Verify `path` starts with `/` and `permissions` is a quoted string (`'0644'` not `0644`); check `journalctl -u cloud-init` on the VM for parse errors |
| cloud-init `runcmd` not executing | `runcmd` runs as root; check `/var/log/cloud-init-output.log` on the VM; commands that exit non-zero abort subsequent commands unless wrapped in `|| true` |
| MicroK8s `permission denied` on kubectl | Run `sudo usermod -aG microk8s $USER` then log out and back in |
| MicroK8s cluster data lost after snap refresh | Data is in `/var/snap/microk8s/` — loss only happens on `snap remove`, not `snap refresh` |
| minikube start fails with Podman driver | Ensure Podman socket is active: `systemctl --user start podman.socket`; try `minikube delete` then re-create |
| Node shows `NotReady` | Check CNI pods in `kube-system`; verify `br_netfilter` is loaded |
| Pod stuck in `CrashLoopBackOff` | Run `kubectl logs <pod> --previous`; check env vars and volume mounts via `kubectl describe pod` |
| Pod stuck in `ImagePullBackOff` | Image name or tag wrong; registry unreachable; missing `imagePullSecret` |
| Longhorn volume stuck `Attaching` | Verify `iscsid` is running on all nodes: `sudo systemctl status iscsid` |
| ArgoCD app OutOfSync after apply | Add `ignoreDifferences` to the Application spec for server-side mutated fields |
| Helm upgrade fails mid-release | Run `helm rollback <release> -n <ns>`; if stuck in `pending-upgrade`, delete the stuck secret |
| k9s shows no resources | Check active namespace with `:ns`; switch context with `:ctx` |
| Velero backup failing | Check `velero backup logs <n>`; ensure MinIO bucket exists; verify pod has network access to MinIO |
| Sealed secret not decrypting | Do not delete the `sealed-secrets-key` secret in `kube-system`; back it up: `kubectl get secret -n kube-system sealed-secrets-key -o yaml` |
| Crossplane provider stuck `Unhealthy` | Check `kubectl describe provider <name>`; verify the provider credentials secret exists in the `crossplane-system` namespace |
| KEDA ScaledObject not scaling | Run `kubectl describe scaledobject <name>`; verify the trigger connection string is reachable from the KEDA operator pod; check `kubectl logs -n keda -l app=keda-operator` |
| KEDA not scaling to zero | Ensure `minReplicaCount: 0` is set; some scalers (e.g. HTTP) require the `keda-add-ons-http` addon for scale-to-zero |
| Cilium pods `CrashLoopBackOff` | Confirm k3s was started with `--flannel-backend=none --disable-kube-proxy`; run `cilium status` and `cilium connectivity test` |
| Hubble observe shows no flows | Run `cilium hubble port-forward` first; confirm Hubble is enabled with `cilium hubble enable` |
| Kyverno policy not enforcing | Check `validationFailureAction: Enforce` (not `Audit`); run `kubectl get policyreport -A` to see violations without enforcement |
| Falco not detecting events | Verify eBPF driver is loaded: `kubectl logs -n falco -l app=falco`; on some kernels try `driver.kind=module` instead of `ebpf` |
| Falco too many false positives | Tune rules by adding `and not container.image.repository in (known-image)` conditions; start with `priority: WARNING` before `ERROR` |
| OpenCost shows $0 for all workloads | Set custom pricing in the ConfigMap; verify Prometheus is scraping `node-exporter` and `kube-state-metrics` correctly |
| LitmusChaos experiment stuck in `Running` | Check `kubectl get chaosengine` and `kubectl describe chaosengine`; verify the `litmus-admin` ServiceAccount exists in the target namespace |
| LitmusChaos probe verdict `Fail` unexpectedly | Confirm the Prometheus endpoint is reachable from within the cluster; check the PromQL query returns data with `kubectl exec -n litmus` |
| tfsec scan exits non-zero in CI | Use `--severity HIGH` to only fail on high/critical; add inline `#tfsec:ignore:` annotations for accepted risks |
| Checkov `ModuleNotFoundError` on Helm charts | Install `checkov[all]` extras: `pip install 'checkov[all]' --break-system-packages` |
| cosign sign fails `UNAUTHORIZED` | Ensure the registry credentials are available: `podman login registry.home.local` before signing |
| Kyverno blocks all pods after adding verify policy | Switch `validationFailureAction` to `Audit` first; check `kubectl get policyreport -A` to review violations before enforcing |
| Terragrunt `Error: No parent terragrunt.hcl` | `find_in_parent_folders()` walks up the directory tree — ensure a root `terragrunt.hcl` exists above the current module directory |
| Terragrunt `run-all` applies in wrong order | Define `dependency` blocks in child `terragrunt.hcl` files; Terragrunt builds the DAG from these — missing dependencies mean unordered execution |
| `hcloud server create` returns auth error | Token may have read-only permissions; ensure the API token has read/write scope in Hetzner Cloud Console → Security → API Tokens |
| cloud-init write_files not appearing | Verify `path` starts with `/` and `permissions` is a quoted string (`'0644'` not `0644`); check `journalctl -u cloud-init` on the VM for parse errors |
| cloud-init `runcmd` not executing | `runcmd` runs as root; check `/var/log/cloud-init-output.log` on the VM; commands that exit non-zero abort subsequent commands unless wrapped in `|| true` |
