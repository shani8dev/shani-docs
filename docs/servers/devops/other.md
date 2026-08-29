---
title: DevOps — Infrastructure as Code, Containers & Utilities
section: Self-Hosting & Servers
updated: 2026-08-28
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

##### Example `main.tf` — manage a Podman container

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

#### Remote state in MinIO (self-hosted S3)
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

#### Terraform Module Structure (modularization best practice)
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

#### Remote state with state locking (prevents concurrent apply conflicts)
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

#### Drift detection (detect infrastructure changes made outside Terraform)
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

#### Policy guardrails with tflint + Checkov + tfsec
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

#### Integrate in CI (Woodpecker / Forgejo Actions)
```yaml
# .woodpecker.yml — add after the tofu plan step
- name: iac-security-scan
  image: bridgecrew/checkov
  commands:
    - checkov -d terraform/ -o cli -o json --output-file-path /dev/null,results.json
    - "[ $(jq '.summary.failed' results.json) -eq 0 ] || exit 1"
```

#### Tagging and naming policy (enforced via tflint rules)
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

#### Promote changes across Dev → UAT → Prod
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

#### Inventory (`~/ansible/inventory.ini`)
```ini
[webservers]
web1.home.local ansible_user=user
web2.home.local ansible_user=user

[databases]
db1.home.local ansible_user=user

[all:vars]
ansible_ssh_private_key_file=~/.ssh/id_ed25519
```

#### Common ad-hoc commands
```bash
ansible all -i inventory.ini -m ping
ansible webservers -i inventory.ini -m shell -a "uptime"
ansible all -i inventory.ini -m copy -a "src=./config.conf dest=/etc/myapp/config.conf"
ansible-playbook -i inventory.ini playbook.yaml --check --diff
```

##### Example playbook

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

#### AWX (Ansible Tower OSS — Web UI)

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

#### Recommended directory structure
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

#### Root `terragrunt.hcl` — define MinIO backend once
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

#### Child `terragrunt.hcl` — inherit root, declare dependency
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

#### Common commands
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

#### Hetzner Cloud CLI (`hcloud`) — primary
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

#### AWS CLI
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

#### GCP CLI (`gcloud`)
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

#### Azure CLI
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

##### Minimal user-data (Hetzner Ubuntu VM)

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

#### Provision a Hetzner VM with cloud-init
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

#### Provision a Proxmox VM with cloud-init (nocloud source)
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

#### WireGuard exit node via cloud-init (one-shot VPN provisioning)
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

#### Validate user-data before sending
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

##### Example job file

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

### Web Analytics (Plausible, Umami, Matomo)

For Plausible (privacy-first, cookie-free), Umami (minimal analytics), and Matomo (full session tracking), see the [Developer Tools wiki](https://docs.shani.dev/doc/servers/business-intelligence#matomo-web-analytics).

---
---

## Internal Platforms

### Backstage (Internal Developer Portal)

For compose file and setup, see the [Developer Tools wiki → Backstage](https://docs.shani.dev/doc/servers/devtools#backstage-internal-developer-portal).

> Backstage is most valuable once you have 5+ services. Start small — register services with `catalog-info.yaml` files in their repos, then add plugins incrementally.

---

## Security CLI Tools

> Security tooling (osquery, Nuclei, SOPS, Semgrep, Trivy) is covered in the [Security & Identity wiki](https://docs.shani.dev/doc/servers/security/policies). This section covers only the DevOps integration points where security tools gate CI pipelines.

---

> **Education platforms** (Open edX/Tutor) are documented in the [Developer Tools wiki](https://docs.shani.dev/doc/servers/education).


## Key Concepts

#### CI/CD Pipeline Stages
A production pipeline typically has these gates in order: (1) **Lint/Format** — `tflint`, `black`, `eslint`; (2) **Unit Tests** — fast, no external deps; (3) **Build** — compile or build container image; (4) **SAST** — Semgrep, Checkov; (5) **Integration Tests** — spin up dependencies; (6) **Container Scan** — Trivy; (7) **Push** — tag and push to registry; (8) **Deploy to Staging** — Argo Rollouts canary; (9) **Smoke Tests**; (10) **Promote to Prod** — manual gate or auto on metrics.

#### Idempotency in automation
An operation is idempotent if running it multiple times produces the same result as running it once. Ansible modules are idempotent — running `apt: name=nginx state=present` 100 times does not install nginx 100 times. Terraform is idempotent — re-applying the same config changes nothing if the state matches. Write all your automation with idempotency in mind: check before act, not act then check.

#### Immutable infrastructure
Rather than patching running servers (mutable), you build a new image with the change applied and replace the running instance. Container-based workloads are inherently immutable — you don't patch a running container, you rebuild the image and redeploy. Shani OS is an immutable OS for the same reason: updates replace the root filesystem atomically.

#### GitOps vs traditional CD
Traditional CD has the pipeline push changes to the cluster (`kubectl apply` from CI). GitOps inverts this — a reconciler inside the cluster (ArgoCD, Flux) watches a Git repo and *pulls* the desired state. Benefits: every change is a Git commit (full audit trail), the cluster can self-heal by re-syncing, and the pipeline never needs cluster credentials.

#### Trunk-based development vs feature branches
Trunk-based development has everyone committing directly to `main` (or short-lived branches that merge in hours, not weeks). Feature flags gate incomplete work rather than long-lived branches. This reduces merge conflicts and keeps CI fast. Most high-performing teams (per DORA research) practice trunk-based development.

#### Shift-left security
Moving security checks earlier in the development lifecycle — ideally before code is committed (pre-commit hooks, IDE plugins) rather than post-deployment. Semgrep in pre-commit is more shift-left than ZAP in staging. The earlier a finding, the cheaper it is to fix.

#### Ephemeral environments
On-demand environments provisioned for a specific PR or feature, then destroyed. Every PR gets its own isolated test environment with a URL like `pr-123.staging.example.com`. Enables parallel testing with no environment contention. Typically provisioned via Kubernetes namespaces + Argo Rollouts or Helm + preview URLs from Ingress.

#### Blue/Green vs Canary vs Rolling — when to use each
- **Rolling update** (Kubernetes default): replace pods one at a time. Zero downtime but brief period with mixed versions. Good for stateless workloads, low risk.
- **Blue/Green**: maintain two identical environments, flip traffic instantly. Expensive (2× resources) but instant rollback. Good for scheduled maintenance windows or database migrations.
- **Canary**: route 5–10% of traffic to new version, watch metrics, then promote. Best for high-traffic services where you want to catch regressions with real traffic before a full rollout.

#### Service mesh concepts (Istio/Linkerd)
A service mesh adds a sidecar proxy (Envoy for Istio, a lightweight proxy for Linkerd) to every pod. The sidecar intercepts all in/out traffic, enabling: mTLS between services without app code changes, traffic shifting (canary), circuit breaking, retries, and distributed tracing. The control plane (Istiod) pushes policy to all sidecars. This is separate from Cilium, which does similar things at the eBPF kernel level without sidecars.

#### On-call rotation essentials
DORA's Time to Restore (MTTR) metric is directly tied to how well on-call is set up. The key components are: (1) alerting with high signal-to-noise (no alert fatigue — every page must be actionable), (2) runbooks linked from alerts, (3) a defined escalation chain, (4) postmortems after every incident. Grafana OnCall handles scheduling and escalation; your Prometheus alerts are the input.

#### Rollback vs roll-forward
Rolling back means deploying the previous known-good version. Roll-forward means quickly patching the broken version and deploying again. For stateless services, rollback is easier — `kubectl argo rollouts undo` or `kubectl rollout undo`. For services with database migrations, rollback may be impossible if the migration isn't reversible — which is why forward-compatible migrations (add column, then backfill, then make non-null) are a standard practice.

#### Environment parity
Dev, staging, and prod should be as similar as possible in config, dependencies, and infrastructure shape. Differences cause "works on staging" bugs. Using the same Helm chart with different `values.yaml` per environment (or Kustomize overlays) is the standard approach to maintaining parity while allowing necessary differences (replica count, resource limits, domain names).

#### Terraform state — the source of truth for your infrastructure
Terraform's state file (`terraform.tfstate`) maps your configuration to real infrastructure resources. It tracks resource IDs, attributes, and dependencies. Without state, Terraform can't know what it has already created. Problems with local state: (1) it can't be shared across a team, (2) it's lost if the machine is lost. Remote state (S3/MinIO backend with DynamoDB/Redis locking) is mandatory for team use — it enables state locking (prevents concurrent applies), versioning (rollback if state is corrupted), and separation from the code. `terraform import` adds existing resources to state; `terraform state rm` removes resources from tracking without destroying them.

#### Ansible vs Terraform — what each is for
Terraform is declarative and idempotent for infrastructure provisioning — it manages the lifecycle of resources (create, update, destroy) by reconciling desired state with actual state. Ansible is procedural and idempotent for configuration management — it runs tasks in sequence on existing hosts (install packages, write config files, restart services). The canonical split: Terraform provisions the VM; Ansible configures what's running on it. Both can overlap (Terraform has file provisioners; Ansible has cloud modules) but the mental models are different. Mixing them without a clear boundary creates maintenance nightmares.

#### Policy-as-code — making compliance automatic
Policy-as-code tools (Checkov, tfsec, OPA/Rego, Kyverno) express infrastructure and Kubernetes policies as code that can be version-controlled, reviewed, and automatically enforced. Instead of a checklist that relies on humans, a Checkov rule blocks a Terraform plan that opens port 22 to 0.0.0.0/0. OPA Gatekeeper prevents a `kubectl apply` of a deployment with no resource limits. The shift: compliance moves from a post-deployment audit to a pre-deployment gate in the CI pipeline. Every IaC commit passes through policy checks before reaching production.

#### Terraform modules — reusable infrastructure components
A module is a directory of Terraform files with defined inputs (variables) and outputs. Instead of copy-pasting the same VPC/subnet/security-group configuration across 10 environments, you write it once as a module and call it with different variable values. The public Terraform Registry hosts community modules (AWS VPC, GKE cluster, etc.). Internal modules (stored in your Git repo) encode your organisation's standards — a module that provisions a PostgreSQL instance always includes backup configuration, monitoring, and correct security groups, because those are baked in. Modules are the IaC equivalent of application libraries.

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

---

## Skaffold (Local Kubernetes Dev Loop)

**Purpose:** Watches your source files, rebuilds container images on change, and redeploys to a local Kubernetes cluster (kind, minikube) automatically. Eliminates the manual `podman build → tag → push → kubectl apply` cycle during inner-loop development.

```bash
# Install via Nix
nix-env -iA nixpkgs.skaffold

# Initialise a skaffold.yaml in your project
skaffold init

# Start the dev loop (watches files, rebuilds, redeploys on save)
skaffold dev

# One-shot build and deploy
skaffold run

# Tear down everything skaffold deployed
skaffold delete
```

##### Minimal `skaffold.yaml`

```yaml
apiVersion: skaffold/v4beta6
kind: Config
build:
  artifacts:
    - image: registry.home.local/myapp
      docker:
        dockerfile: Containerfile
deploy:
  kubectl:
    manifests:
      - k8s/*.yaml
```

---

## Tilt (Fast Multi-Service Dev Workflow)

**Purpose:** Like Skaffold but with a richer UI and a Python-like DSL (`Tiltfile`). Manages multiple services simultaneously — each gets its own build status, log stream, and live-update rules. Best for teams developing microservices locally on Kubernetes.

```bash
# Install via Nix
nix-env -iA nixpkgs.tilt

# Start Tilt
tilt up

# Tear down
tilt down
```

##### Minimal `Tiltfile`

```python
docker_build('registry.home.local/api', './api')
docker_build('registry.home.local/worker', './worker')

k8s_yaml(['k8s/api.yaml', 'k8s/worker.yaml'])

k8s_resource('api', port_forwards='8080:8080')
k8s_resource('worker', port_forwards='9000:9000')
```

---

## Atlantis (Terraform Pull Request Automation)

**Purpose:** Runs `tofu plan` on every PR that touches Terraform files and posts the output as a PR comment. When you comment `atlantis apply`, it runs the apply. Replaces manual CI/CD for IaC — gives teams a reviewable plan before any infrastructure changes.

```yaml
# ~/atlantis/compose.yaml
services:
  atlantis:
    image: ghcr.io/runatlantis/atlantis:latest
    ports:
      - 127.0.0.1:4141:4141
    environment:
      ATLANTIS_REPO_ALLOWLIST: "git.home.local/myorg/*"
      ATLANTIS_GITEA_USER: atlantis-bot
      ATLANTIS_GITEA_TOKEN: <gitea-personal-access-token>
      ATLANTIS_GITEA_WEBHOOK_SECRET: changeme
      ATLANTIS_PORT: 4141
      ATLANTIS_ATLANTIS_URL: https://atlantis.home.local
    volumes:
      - /home/user/atlantis/repos:/atlantis:Z
    restart: unless-stopped
```

```bash
cd ~/atlantis && podman-compose up -d
```

**Caddy:**
```caddyfile
atlantis.home.local { tls internal; reverse_proxy localhost:4141 }
```

---

## Key Concepts: DevOps Interviews

#### The three ways of DevOps
From *The Phoenix Project*: (1) **Flow** — make work visible, limit WIP, reduce batch size, and eliminate waste in the delivery pipeline. (2) **Feedback** — amplify feedback loops so problems are caught early and close to their source. (3) **Continual Learning** — build a culture of experimentation, learning from failure, and knowledge sharing. These map directly to DORA metrics: Flow → Deployment Frequency and Lead Time; Feedback → Change Failure Rate and MTTR; Learning → Postmortems.

#### Container image layering and build performance
Each `RUN`, `COPY`, and `ADD` instruction creates a new image layer. Layers are cached by their content hash — if a layer changes, all subsequent layers are invalidated. Best practice: put rarely changing steps (OS packages, runtime install) near the top; frequently changing steps (application code) near the bottom. Multi-stage builds reduce the final image size by copying only build artefacts — the build tools (gcc, npm) are discarded.

#### GitOps vs push-based CD
Push-based CD has the pipeline call `kubectl apply` with cluster credentials. GitOps inverts this — ArgoCD or Flux watches the Git repo from inside the cluster and pulls changes. Benefits: Git is the single source of truth (every change is auditable), the cluster can self-heal by re-syncing, and the CI pipeline never needs direct cluster credentials (lower blast radius if CI is compromised).

---

## k6 / Grafana k6 (Load Testing)

**Purpose:** Open-source load testing tool with a JavaScript scripting API. Write realistic traffic simulations in JS, run them locally or in CI, and push metrics directly into your existing Prometheus stack via remote-write — then visualise results in Grafana with the official k6 dashboard. Native companion to the Prometheus + Grafana stack already documented here.

```bash
# Install k6 via Nix
nix-env -iA nixpkgs.k6

# Or via Snap
snap install k6
```

#### Basic load test script (`~/k6/smoke-test.js`)
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 20 },   // ramp up to 20 VUs
    { duration: '3m', target: 20 },   // hold for 3 min
    { duration: '1m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],           // <1% errors
    http_req_duration: ['p(95)<500'],         // 95th percentile < 500ms
  },
};

export default function () {
  const res = http.get('https://myapp.home.local/api/health');
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
```

##### Run locally

```bash
k6 run ~/k6/smoke-test.js

# Run with more VUs and a duration override
k6 run --vus 50 --duration 60s ~/k6/smoke-test.js
```

#### Push results to Prometheus (remote-write to VictoriaMetrics or Prometheus)
```bash
# Using the experimental Prometheus remote-write output
K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM=true \
  k6 run --out=experimental-prometheus-rw ~/k6/smoke-test.js
```

##### Run as a Podman container in CI (Woodpecker example)

```yaml
# .woodpecker.yml
steps:
  load-test:
    image: grafana/k6:latest
    environment:
      K6_PROMETHEUS_RW_SERVER_URL: http://prometheus.home.local:9090/api/v1/write
    commands:
      - k6 run --out=experimental-prometheus-rw /k6/smoke-test.js
    volumes:
      - /home/user/k6:/k6:ro
```

#### Import the k6 Grafana dashboard

In Grafana → Dashboards → Import → Dashboard ID **18030** (official k6 Prometheus dashboard). This gives you p50/p95/p99 latency, VU count, request rate, and error rate per test run, all correlated with your application metrics.

---

## Toxiproxy (Network Failure Simulation)

**Purpose:** A programmable TCP proxy that injects network failures — latency, packet loss, bandwidth throttling, connection resets, and timeouts — between your services. Use Toxiproxy to test how your monitored services behave when dependencies are degraded: does Alertmanager fire? Do your Prometheus alerts have the right thresholds? Does your application retry correctly? Essential for chaos engineering and validating monitoring alert fidelity.

```yaml
# ~/toxiproxy/compose.yaml
services:
  toxiproxy:
    image: ghcr.io/shopify/toxiproxy:latest
    ports:
      - "127.0.0.1:8474:8474"    # Toxiproxy REST API
      - "127.0.0.1:15432:15432"  # proxied postgres (example)
      - "127.0.0.1:16379:16379"  # proxied redis (example)
    restart: unless-stopped
```

```bash
cd ~/toxiproxy && podman-compose up -d

# Install the CLI
nix-env -iA nixpkgs.toxiproxy   # or: go install github.com/Shopify/toxiproxy/v2/cli/toxiproxy-cli@latest
```

##### Create proxies for your services

```bash
# Proxy for Postgres (real Postgres at localhost:5432, proxied at localhost:15432)
toxiproxy-cli create postgres --listen 0.0.0.0:15432 --upstream localhost:5432

# Proxy for Redis
toxiproxy-cli create redis --listen 0.0.0.0:16379 --upstream localhost:6379

# List all proxies
toxiproxy-cli list
```

#### Inject failures via REST API or CLI
```bash
# Add 200ms latency to all Postgres connections
toxiproxy-cli toxic add postgres --type latency --attribute latency=200 --attribute jitter=50

# Simulate 30% packet loss on Redis
toxiproxy-cli toxic add redis --type slicer --attribute average_size=1 --attribute delay_us=0

# Bandwidth throttle to 100 KB/s (simulates slow link)
toxiproxy-cli toxic add postgres --type bandwidth --attribute rate=100

# Timeout — close connections after 2s of inactivity
toxiproxy-cli toxic add postgres --type timeout --attribute timeout=2000

# Remove a toxic
toxiproxy-cli toxic remove postgres --toxicName latency_downstream

# Take a proxy completely offline (simulates full outage)
toxiproxy-cli toggle postgres
```

#### Use in integration tests (Python example)
```python
import requests

TOXIPROXY_API = "http://localhost:8474"

def add_latency(proxy_name, latency_ms):
    requests.post(f"{TOXIPROXY_API}/proxies/{proxy_name}/toxics", json={
        "type": "latency", "name": "db_slow",
        "attributes": {"latency": latency_ms, "jitter": 10}
    })

def remove_toxic(proxy_name, toxic_name):
    requests.delete(f"{TOXIPROXY_API}/proxies/{proxy_name}/toxics/{toxic_name}")

# In your test:
add_latency("postgres", 500)
# ... run test that should degrade gracefully ...
remove_toxic("postgres", "db_slow")
```

> Pair Toxiproxy with your Prometheus + Alertmanager stack: inject a fault, verify the correct alert fires within the expected `for:` duration, then check that it resolves when you remove the toxic. This validates your alert thresholds are calibrated to actual failure modes rather than theoretical ones.

---

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

#### Woodpecker CI push step
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

#### Buildah
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

#### Skopeo
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

For all Kubernetes distributions (k3s, k0s, MicroK8s, RKE2, Talos), cluster management, GitOps tooling, ingress, storage, and platform engineering tools, see the [Kubernetes & Container Orchestration wiki](https://docs.shani.dev/doc/servers/kubernetes/overview).

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

---

## Nginx & Apache HTTPD

**Purpose:** High-performance web servers and reverse proxies. Nginx excels at static content and proxying; Apache provides `.htaccess` support. Use these when you need full server-level config, not just a reverse proxy.

```yaml
# ~/nginx/compose.yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - 127.0.0.1:8081:80
    volumes:
      - /home/user/www:/usr/share/nginx/html:ro,Z
      - /home/user/nginx.conf:/etc/nginx/nginx.conf:ro,Z
    restart: unless-stopped
  apache:
    image: httpd:alpine
    ports:
      - 127.0.0.1:8082:80
    volumes:
      - /home/user/www:/usr/local/apache2/htdocs:ro,Z
    restart: unless-stopped
```

```bash
cd ~/nginx && podman-compose up -d
```

---
