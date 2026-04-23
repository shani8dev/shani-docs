---
title: DevOps & Developer Infrastructure
section: Self-Hosting & Servers
updated: 2026-04-22
---

# DevOps & Developer Infrastructure

CI/CD, code hosting, container orchestration, HA clusters, IaC, artifact management, and developer tooling — all self-hosted on Shani OS.

> **Install convention on Shani OS:** CLI tools and dev runtimes install via **Nix** (primary) or **Snap** (fallback). GUI apps go via **Flatpak**. Services and servers run as rootless **Podman** containers. The OS root is read-only — never use `sudo apt install` or `sudo dnf install` for user-space tooling. See the [Software Ecosystem guide](https://blog.shani.dev/post/shani-os-software-ecosystem) for the full decision tree.

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

---

## Code Hosting

### Gitea / Forgejo

**Purpose:** Lightweight self-hosted Git with web UI, issues, wikis, pull requests, and Actions-compatible CI. Forgejo is the community-driven fork with identical CLI/API.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#gitea--forgejo)

**Common CLI operations:**
```bash
# Create an admin user
podman exec -it gitea gitea admin user create \
  --username admin --password changeme --email admin@example.com --admin

# Reset a user password
podman exec gitea gitea admin user change-password \
  --username myuser --password newpassword

# List all users
podman exec gitea gitea admin user list

# Run database migrations
podman exec gitea gitea migrate

# Regenerate git hooks after upgrade
podman exec gitea gitea admin regenerate hooks

# Generate an admin access token
podman exec gitea gitea admin user generate-access-token \
  --username admin --token-name mytoken
```

Configure SSH clients to use `Port 2222` for `git.home.local`.

---

### GitLab CE

**Purpose:** Full DevSecOps platform — Git, CI/CD pipelines, container registry, merge requests, issue tracking, package registry, Kubernetes integration, and secrets management. Heavier (~4–8 GB RAM) but includes everything in one container.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#gitlab-ce)

**First-start and operations:**
```bash
# First-start init takes 3–5 min
podman exec gitlab cat /etc/gitlab/initial_root_password

# Register a GitLab Runner — see compose in Developer Tools wiki
```

---

## CI/CD

### Woodpecker CI

**Purpose:** Simple, Gitea/Forgejo-native CI/CD. YAML pipelines live in `.woodpecker.yml` in the repo. Lightweight, fast, Drone-compatible.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#woodpecker-ci)

---

### Forgejo Actions Runner

**Purpose:** Native CI runner for Forgejo using the built-in Actions system. GitHub Actions-compatible YAML syntax. First runner to reach for if you're already on Forgejo.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#forgejo-actions-runner)

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

**Purpose:** Most widely deployed open-source CI/CD server with thousands of plugins. Reach for Jenkins when integrating with an existing enterprise pipeline or when a job description specifically requires it. For greenfield projects, prefer Woodpecker or Forgejo Actions.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#jenkins-enterprise-cicd)

**Operations after first start:**
```bash
podman exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword

# Install plugins via CLI
podman exec jenkins java -jar /var/jenkins_home/war/WEB-INF/jenkins-cli.jar \
  -s http://localhost:8080 install-plugin git workflow-aggregator blueocean

# Safe restart
podman exec jenkins java -jar /var/jenkins_home/war/WEB-INF/jenkins-cli.jar \
  -s http://localhost:8080 safe-restart
```

---

### Tekton (Kubernetes-Native CI/CD)

**Purpose:** CNCF-graduated Kubernetes-native CI/CD. Pipelines, tasks, and triggers are Kubernetes CRDs — everything runs as Pods. Common in Platform Engineer roles and OpenShift environments.

```bash
# Install on your k3s/k0s cluster
kubectl apply -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml
kubectl apply -f https://storage.googleapis.com/tekton-releases/dashboard/latest/release.yaml
kubectl apply -f https://storage.googleapis.com/tekton-releases/triggers/latest/release.yaml

# Install Tekton CLI — Nix (primary)
nix-env -iA nixpkgs.tekton-client

# Port-forward dashboard
kubectl -n tekton-pipelines port-forward svc/tekton-dashboard 9097:9097
```

**Example Task + Pipeline:**
```yaml
# ~/k8s/tekton-hello.yaml
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
kubectl apply -f ~/k8s/tekton-hello.yaml
tkn pipelinerun logs -f --last
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

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#renovate-bot)

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

**Purpose:** Static analysis for code quality and security — bugs, code smells, and OWASP/CWE vulnerabilities across 30+ languages. Integrates with Gitea, Forgejo, and GitLab CI as a PR quality gate.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#sonarqube-code-quality--security)

> Requires `vm.max_map_count=524288` and `fs.file-max=131072` on the host. Set persistently:
> ```bash
> echo 'vm.max_map_count=524288' | sudo tee -a /etc/sysctl.d/sonar.conf
> sudo sysctl -p /etc/sysctl.d/sonar.conf
> ```

---

## Container & Image Tools

### Private Container Registry

**Purpose:** Store and serve your own OCI images for CI/CD pipelines.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#private-container-registry)

```bash
# Tag and push
podman tag myimage localhost:5000/myimage:latest
podman push localhost:5000/myimage:latest
```

Add `unqualified-search-registries = ["localhost:5000"]` to `/etc/containers/registries.conf` to allow unverified pushes in development.

---

### Harbor (Enterprise Container Registry)

**Purpose:** Cloud-native registry with RBAC, Trivy vulnerability scanning, image signing, replication, and a web UI.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#harbor-enterprise-container-registry)

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

**Purpose:** SMTP catch-all for development. All outgoing emails from your apps land in Mailpit's web UI — nothing is actually delivered.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#mailpit-email-testing)

---

## Kubernetes & Orchestration

> **Prerequisites:** `vm.max_map_count=524288`, sufficient RAM (2 GB min per node, 4 GB+ recommended). Some distributions need `br_netfilter` and IP forwarding enabled. CLI tools install via **Nix** (primary) or **Snap** as a fallback.
>
> For full cluster install instructions, YAML manifests, and distribution-specific details, see the [Kubernetes wiki](https://docs.shani.dev/doc/servers/kubernetes).

### Choosing a Distribution

| Distribution | Best For | RAM (min) | Install via | Notes |
|---|---|---|---|---|
| **k3s** | Single-node homelabs, edge | 512 MB | curl installer | Batteries-included, easiest to start |
| **k0s** | Minimal, air-gapped | 1 GB | curl installer | Single binary, no external deps |
| **MicroK8s** | Quick local cluster, addons | 2 GB | **Snap** | Canonical-maintained; DNS, ingress, registry as addons |
| **minikube** | Local dev, driver choice | 2 GB | Nix or **Snap** | Runs via Podman driver on Shani OS |
| **kind** | Lightweight dev/CI | 2 GB | Nix | Runs K8s inside Podman containers |
| **RKE2** | Hardened, production | 4 GB | curl installer | CIS-benchmarked, STIG-ready |
| **Talos** | Immutable infra, GitOps | 2 GB | talosctl | API-only, no SSH, extremely secure |

### CLI Tools

**Install all CLI tools — Nix (primary):**
```bash
nix-env -iA nixpkgs.kubectl nixpkgs.kubernetes-helm nixpkgs.k9s \
  nixpkgs.argocd nixpkgs.fluxcd nixpkgs.velero \
  nixpkgs.kubeseal nixpkgs.kind nixpkgs.minikube
```

**Snap alternatives** (auto-update, classic confinement):
```bash
snap install kubectl --classic
snap install helm --classic
```

> `k9s` is unmaintained on the Snap Store — use Nix. `argocd`, `flux`, `velero`, and `kubeseal` CLIs are not on Snap Store — Nix only.

### k9s (Terminal Cluster Manager)

```bash
# Install via Nix (preferred — Snap version is unmaintained)
nix-env -iA nixpkgs.k9s

k9s                            # uses current kubeconfig context
k9s -n argocd                  # target a namespace
k9s --context k3s-homelab      # target a context
```

| Key | Action |
|-----|--------|
| `:pod` | Switch to pods view |
| `:deploy` | Switch to deployments |
| `l` | View logs |
| `s` | Shell into pod |
| `d` | Describe resource |
| `ctrl-d` | Delete resource |
| `?` | Help |

### Lens / OpenLens — Desktop Cluster IDE

```bash
# Install via Flatpak (preferred on Shani OS)
flatpak install flathub dev.k8slens.OpenLens
```

After install, Lens auto-detects all contexts in `~/.kube/config`.

### Kubernetes Daily Commands

```bash
# Context management
kubectl config get-contexts
kubectl config use-context k3s-homelab
kubectl config set-context --current --namespace=myapp

# Resource inspection
kubectl get all -n myapp
kubectl describe pod <pod> -n myapp
kubectl logs <pod> -n myapp --previous
kubectl logs <pod> -n myapp -f --tail=100

# Apply and diff
kubectl diff -f ~/k8s/deployment.yaml
kubectl apply -f ~/k8s/deployment.yaml

# Scale
kubectl scale deployment myapp --replicas=3 -n myapp

# Exec and copy
kubectl exec -it <pod> -n myapp -- /bin/sh
kubectl cp myapp/<pod>:/app/logs ./logs/

# Port-forward
kubectl port-forward svc/myapp 8080:80 -n myapp

# Rollout management
kubectl rollout status deployment/myapp -n myapp
kubectl rollout undo deployment/myapp -n myapp

# Drain/uncordon for maintenance
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data
kubectl uncordon <node>
```

### Kubernetes Backup

```bash
# k3s etcd snapshot
sudo k3s etcd-snapshot save --name homelab-$(date +%Y%m%d)
# Snapshots saved to /var/lib/rancher/k3s/server/db/snapshots/

# kubeconfig and Helm values
restic backup ~/.kube /home/user/k8s
```

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

**Purpose:** Declarative cloud and on-premise infrastructure provisioning. OpenTofu is the open-source, BSL-free fork of Terraform and is drop-in compatible. The most-requested IaC tool in DevOps job descriptions.

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
  host = "unix:///run/user/1000/podman/podman.sock"
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

---

### Ansible (Configuration Management)

**Purpose:** Agentless configuration management and automation over SSH. Define desired server state in YAML playbooks. No agent on remote hosts — just SSH and Python. Second most-requested CM tool in DevOps job descriptions.

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

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#ansible-configuration-management--automation)

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

---

## Artifact & Dependency Management

### JFrog Artifactory OSS

**Purpose:** Universal artifact repository — Maven, npm, PyPI, Docker, Helm, Go, Gradle, and generic binaries. The self-hosted alternative to GitHub Packages.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#jfrog-artifactory-oss-universal-artifact-repository)

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

**Purpose:** Self-hosted artifact repository for Maven, npm, PyPI, Docker, Helm, NuGet, and RubyGems. Primarily used as a **proxy/cache** — pull from Maven Central or npm Registry through Nexus, reducing external bandwidth. Most common in Java-heavy enterprise shops.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#nexus-repository-oss-maven-npm-pypi-docker-proxy)

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

**Purpose:** Service discovery, health checking, key-value store, and service mesh. Used in HashiCorp stack shops (Consul + Nomad + OpenBao).

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#consul-service-discovery--service-mesh)

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

**Purpose:** HashiCorp's flexible orchestrator — runs containers (Podman/Docker), VMs, Java JARs, raw binaries, and batch jobs. Simpler than Kubernetes for shops using the full HashiCorp stack.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#nomad-workload-orchestrator)

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

**Purpose:** VS Code running in the browser with full terminal, extensions, and language support. Accessible from any device on your tailnet.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#code-server)

---

### Coder (Cloud Development Environments)

**Purpose:** Self-hosted cloud development environments. Each developer gets an isolated, pre-configured container workspace reproducible from a Git repo.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#gitpod--coder-cloud-development-environments)

---

### Windmill (Workflow & Script Automation)

**Purpose:** Self-hosted alternative to n8n and Retool for code-heavy automations. Write scripts in Python, TypeScript, Bash, or Go; compose them into DAG workflows; build internal apps.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#windmill-workflow--script-automation)

---

### Matomo (Web Analytics)

**Purpose:** Self-hosted Google Analytics replacement. Tracks pageviews, sessions, funnels, heatmaps, and e-commerce. GDPR-compliant by default.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#matomo-web-analytics)

---

## Internal Platforms

### Backstage (Internal Developer Portal)

**Purpose:** Spotify's open-source Internal Developer Platform. A single portal for discovering services, APIs, documentation, pipelines, and runbooks. Common in Platform Engineer and DevEx job descriptions. Integrates with Gitea/Forgejo, Kubernetes, ArgoCD, Grafana, and hundreds of plugins.

→ Compose setup: [Developer Tools wiki](https://docs.shani.dev/doc/servers/devtools#backstage-internal-developer-portal)

> Backstage is most valuable once you have 5+ services. Start small — register services with `catalog-info.yaml` files in their repos, then add plugins incrementally.

---


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

---


---

## Security CLI Tools

## osquery (Host Intrusion Detection & Visibility)

**Purpose:** Exposes your operating system as a relational database — you query running processes, network connections, installed packages, file integrity, users, cron jobs, kernel modules, and hardware as SQL tables. Use it for host-based intrusion detection, compliance checking, and forensics. Integrates with Wazuh, Kolide Fleet, and Grafana for continuous monitoring.

```bash
# Install osquery on the host (not containerised — needs host kernel access)
sudo dnf install osquery

sudo systemctl enable --now osqueryd
```

**Useful osquery queries:**
```sql
-- All processes listening on network ports
SELECT pid, name, port, protocol FROM listening_ports
JOIN processes USING (pid);

-- Unusual cron jobs (not from system paths)
SELECT command, path FROM crontab
WHERE path NOT LIKE '/etc/%';

-- SUID binaries (privilege escalation risk)
SELECT path, permissions FROM file
WHERE path LIKE '/usr/%' AND permissions LIKE '%s%';

-- Recently modified files in /etc
SELECT path, mtime FROM file
WHERE path LIKE '/etc/%'
AND mtime > (SELECT strftime('%s','now','-1 day'));

-- Active network connections to non-LAN IPs
SELECT pid, name, remote_address, remote_port
FROM process_open_sockets
JOIN processes USING (pid)
WHERE remote_address NOT LIKE '192.168.%'
AND remote_address NOT LIKE '127.%'
AND remote_address != '';
```

**Configure continuous monitoring via `osquery.conf`:**
```json
{
  "schedule": {
    "listening_ports": {
      "query": "SELECT pid, name, port FROM listening_ports JOIN processes USING (pid);",
      "interval": 60
    },
    "new_suid_binaries": {
      "query": "SELECT path FROM file WHERE path LIKE '/usr/%' AND permissions LIKE '%s%';",
      "interval": 3600
    }
  },
  "file_paths": {
    "system_binaries": ["/usr/bin/%%", "/usr/sbin/%%"],
    "config_files": ["/etc/%%"]
  }
}
```

> Results from scheduled queries are written to `/var/log/osquery/osqueryd.results.log`. Feed this to Loki (via Grafana Alloy) or Wazuh for centralised alerting.

---


---

## Nuclei (Fast CVE & Misconfiguration Scanner)

**Purpose:** Template-based vulnerability scanner from ProjectDiscovery. Fires targeted HTTP/TCP/DNS probes from a large community library of templates covering known CVEs, exposed admin panels, default credentials, misconfigured headers, and OWASP Top 10 findings. Faster and broader than ZAP for sweeping many services — complement ZAP (deep single-app analysis) with Nuclei (wide multi-service sweeping).

```bash
# Update templates and scan a target
podman run --rm \
  -v /home/user/nuclei/templates:/root/nuclei-templates:Z \
  -v /home/user/nuclei/output:/output:Z \
  projectdiscovery/nuclei:latest \
  -u https://app.home.local \
  -severity critical,high,medium \
  -o /output/scan.json -json \
  -update-templates

# Scan all your services from a target list
podman run --rm \
  -v /home/user/nuclei/templates:/root/nuclei-templates:Z \
  -v /home/user/nuclei/output:/output:Z \
  -v /home/user/nuclei/targets.txt:/targets.txt:ro \
  projectdiscovery/nuclei:latest \
  -l /targets.txt \
  -t /root/nuclei-templates/http/ \
  -o /output/results.json -json
```

**Useful template categories:**
```bash
-t /root/nuclei-templates/http/cves/              # Known CVEs by number
-t /root/nuclei-templates/http/exposures/         # Exposed files and admin panels
-t /root/nuclei-templates/http/misconfiguration/  # Security misconfigurations
-t /root/nuclei-templates/http/default-logins/    # Default credentials
-t /root/nuclei-templates/http/technologies/      # Technology fingerprinting
```

> Schedule a weekly Nuclei sweep across all exposed services with a systemd timer and pipe the JSON output to ntfy for critical/high findings. Keep a `targets.txt` file with every Caddy subdomain you expose.

---

---


---

## SOPS (Secrets in Git)

**Purpose:** Encrypt secrets stored in YAML, JSON, ENV, and INI files so they can be safely committed to Git. Works with Age keys (recommended for self-hosting) or GPG. The practical complement to Infisical for GitOps workflows — your compose `.env` files and Kubernetes manifests stay in version control but remain encrypted at rest. Only the authorised key can decrypt them.

**Install SOPS and Age:**
```bash
# Install SOPS
sudo wget -O /usr/local/bin/sops \
  https://github.com/getsops/sops/releases/latest/download/sops-v3.9.5.linux.amd64
sudo chmod +x /usr/local/bin/sops

# Install Age
sudo pacman -S age    # Arch / Shani OS
# or: sudo apt install age
```

**Generate an Age key pair:**
```bash
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
# Outputs: public key  age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Configure SOPS to use your Age key (project-level `.sops.yaml`):**
```yaml
# .sops.yaml — commit this file to your repo root
creation_rules:
  - path_regex: .*\.enc\.yaml$
    age: age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  - path_regex: .*\.env\.enc$
    age: age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Encrypt and decrypt secrets:**
```bash
# Encrypt a .env file
sops --encrypt .env > .env.enc
# .env.enc is safe to commit; .env stays in .gitignore

# Edit encrypted file in-place (decrypts, opens $EDITOR, re-encrypts on save)
sops .env.enc

# Decrypt to stdout for use in scripts
sops --decrypt .env.enc

# Decrypt to a file (e.g. before podman-compose)
sops --decrypt .env.enc > .env && podman-compose up -d && rm .env
```

**Encrypt only specific keys in a YAML file:**
```yaml
# secrets.yaml (before encryption)
db_password: mysecretpassword
db_host: localhost          # not secret — encrypt selectively
```
```bash
# Encrypt only db_password, leave db_host in plaintext
sops --encrypt --encrypted-regex '^db_password$' secrets.yaml > secrets.enc.yaml
```

**Use in CI/CD (Woodpecker / Forgejo Actions):**
```yaml
# .woodpecker.yml
steps:
  deploy:
    image: alpine
    secrets: [SOPS_AGE_KEY]   # inject Age private key as CI secret
    commands:
      - apk add sops age
      - export SOPS_AGE_KEY_FILE=/dev/stdin <<< "$SOPS_AGE_KEY"
      - sops --decrypt .env.enc > .env
      - podman-compose up -d
```

> ⚠️ **Key backup:** Your Age private key (`~/.config/sops/age/keys.txt`) is the only way to decrypt your secrets. Back it up to an offline location (password manager, encrypted USB). If you lose it, all SOPS-encrypted files are permanently unrecoverable.

---


---

## Semgrep CE (Static Analysis / SAST)

**Purpose:** Open-source static application security testing (SAST) tool. Scans source code for security bugs, vulnerable patterns, and misconfigurations using a large library of community rules. Runs in CI pipelines alongside Trivy (container scanning) and ZAP (dynamic scanning) to catch issues at the code level before they ship. Supports 30+ languages — Python, JavaScript, Go, Java, Ruby, PHP, and more.

```bash
# Run as a one-shot scanner — no persistent container needed
podman run --rm \
  -v /home/user/myproject:/src:ro,Z \
  returntocorp/semgrep:latest \
  semgrep scan \
    --config=auto \
    --sarif \
    --output /src/semgrep-results.sarif \
    /src
```

**Run in Woodpecker / Forgejo Actions CI:**
```yaml
# .forgejo/workflows/security.yml
steps:
  - name: semgrep
    image: returntocorp/semgrep:latest
    commands:
      - semgrep scan --config=auto --error .
```

**Scan with a specific ruleset:**
```bash
# OWASP top-10 rules
podman run --rm -v $(pwd):/src:ro,Z returntocorp/semgrep:latest \
  semgrep scan --config=p/owasp-top-ten /src

# Secrets detection
podman run --rm -v $(pwd):/src:ro,Z returntocorp/semgrep:latest \
  semgrep scan --config=p/secrets /src
```

> Semgrep CE is the open-source core. The cloud Semgrep platform adds cross-file analysis and a UI, but the CLI tool produces actionable results entirely offline. Feed SARIF output into Defect Dojo (below) to triage findings centrally.

---


---


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

```caddyfile
# Code hosting
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

# Dev environments & tools
code.home.local       { tls internal; reverse_proxy localhost:8443 }
coder.home.local      { tls internal; reverse_proxy localhost:3001 }
windmill.home.local   { tls internal; reverse_proxy localhost:8300 }
analytics.home.local  { tls internal; reverse_proxy localhost:8500 }
mail.home.local       { tls internal; reverse_proxy localhost:8025 }

# Internal platform
backstage.home.local  { tls internal; reverse_proxy localhost:7007 }
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Gitea SSH push fails | Confirm client uses `Port 2222` in `~/.ssh/config`; check `gitea` user has write access to the data volume |
| Woodpecker agent not picking up jobs | Verify `WOODPECKER_AGENT_SECRET` matches on server and agent; confirm Podman socket is mounted |
| GitLab 502 on first load | Wait 3–5 min for init; check `podman logs gitlab`; ensure `shm_size: 256m` is set |
| GitLab Runner not picking up jobs | Verify runner token matches; check runner tags align with the job's `tags:` in `.gitlab-ci.yml` |
| code-server blank after login | Verify `PASSWORD` env var is set; check port is not in use |
| Coder workspace fails to start | Confirm Podman socket is mounted; check `CODER_ACCESS_URL` matches the URL you access it from |
| Private registry push rejected | Add `unqualified-search-registries` to `/etc/containers/registries.conf`; restart Podman |
| Matomo setup wizard loops | Ensure MariaDB is fully started before Matomo; check `MATOMO_DATABASE_HOST` is `db` not `localhost` |
| SonarQube exits immediately | Set `vm.max_map_count=524288` with `sudo sysctl -w vm.max_map_count=524288`; persist in `/etc/sysctl.d/` |
| Forgejo Actions runner not picking up jobs | Verify registration token from **Site Administration → Actions → Runners**; confirm Podman socket is mounted |
| Renovate PR not created | Ensure token has write access to repos; check `RENOVATE_PLATFORM=gitea` is set; check `podman logs renovate` |
| Windmill worker not executing jobs | Check `DATABASE_URL` is identical on server and worker; verify `MODE=worker` on the worker container |
| Nexus OOM | Set `-Xms2703m -Xmx2703m` via `INSTALL4J_ADD_VM_PARAMS`; Nexus needs 4 GB RAM minimum |
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
