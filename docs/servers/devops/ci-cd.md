---
title: DevOps — Code Hosting & CI/CD
section: Self-Hosting & Servers
updated: 2026-08-28
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

##### Example workflow

(`.forgejo/workflows/ci.yml`):
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

##### Example `flags.json`

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

##### Use from Python

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

##### Example `score.yaml`

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

##### Example `main.py`

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

#### Workflow structure and triggers
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

#### Complete CI workflow (build, test, push image)
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

#### Reusable workflows (DRY — define once, call from many repos)
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

#### Branching strategy — GitHub Flow (standard for CD teams)
```
main ──────────────────────────────── (always deployable, protected)
  ├── feature/add-login ─────────► PR ─► merge ─► auto-deploy staging
  ├── fix/null-pointer ──────────► PR ─► merge ─► auto-deploy staging
  └── release/v1.2 ─────────────► PR ─► merge ─► manual approve prod
```

#### Branch protection rules (configure in GitHub Settings → Branches)
```yaml
# Typical main branch protection:
# - Require PR before merging (no direct push)
# - Require status checks: ci/test, ci/lint, security/scan
# - Require at least 1 approving review
# - Dismiss stale reviews when new commits pushed
# - Require branches to be up to date before merging
# - Restrict who can push to matching branches: team:platform-engineers
```

#### Terraform plan/apply with GitHub Actions (Infrastructure PR workflow)
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

#### Secrets management in GitHub Actions
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

#### Matrix builds (test across multiple versions)
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

#### Self-hosted runner on this system (route CI jobs to your own machine)
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
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
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

#### Schedule with a systemd timer
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

##### Minimal `renovate.json`

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

