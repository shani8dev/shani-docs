---
title: OpenStack & Private Cloud
section: Self-Hosting & Servers
updated: 2026-04-25
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.

# OpenStack & Private Cloud

Deploy a full OpenStack cloud on this system — from a minimal all-in-one development setup to a multi-node private cloud with compute, networking, storage, and identity services. All compose files use rootless Podman with `:Z` volume labels on bind mounts. Named volumes omit `:Z` — Podman manages their labels automatically.

> **Install convention:** CLI tools and dev runtimes install via **Nix** (primary) or **Snap** (fallback). GUI apps go via **Flatpak**. Services run as rootless **Podman** containers. On immutable OS distributions the root filesystem is read-only — use Nix, Snap, or Distrobox for user-space tooling.

> ⚠️ **Resource requirements:** OpenStack is a full private cloud stack. Even an all-in-one Devstack node needs at least 8 GB RAM and 50 GB disk. A production multi-node setup needs 16 GB+ per controller node and 8 GB+ per compute node. For lightweight single-node use, [MicroStack](#microstack-snap--all-in-one) is the fastest path.

---

## Key Concepts

**OpenStack vs Kubernetes — what's the difference?:** OpenStack manages *virtual machines and infrastructure* (compute, networking, storage, identity). Kubernetes manages *containerised workloads*. They're complementary: many production environments run Kubernetes on top of OpenStack VMs (Magnum does this automatically). In cloud provider terms, OpenStack = the IaaS layer (like AWS EC2/VPC/EBS); Kubernetes = the PaaS layer (like EKS/GKE).

#### Nova vs Neutron vs Cinder — the three most commonly asked
- **Nova** (compute): manages VM lifecycle — boot, stop, resize, migrate, snapshot. The core of OpenStack.
- **Neutron** (network): provides virtual networks, subnets, routers, security groups, floating IPs, and load balancers. More complex than Nova because networking is inherently stateful.
- **Cinder** (block storage): persistent volumes for VMs, like EBS. Backends include LVM, Ceph RBD, NFS. A volume can be attached to one VM at a time (ReadWriteOnce).

#### Keystone's token model
Keystone is the identity service. Every other OpenStack API requires a Keystone token in the `X-Auth-Token` header. Tokens are short-lived (default 1 hour) and contain the user's project, roles, and service endpoints. The service catalog (which endpoint to call for which service) is embedded in the token response — this is how clients discover Nova, Neutron, etc. without hard-coding URLs.

#### Tenant/project isolation
OpenStack uses *projects* (formerly tenants) as the isolation boundary — quotas, networks, and volumes belong to a project. A user belongs to one or more projects with roles. `admin` role gives full control; `member` role is standard user access; `reader` role is read-only. This maps directly to AWS accounts or Kubernetes namespaces.

#### VM migration types
- **Live migration**: move a running VM to another compute node with minimal downtime (seconds). Requires shared storage (Ceph RBD) or block-device live migration.
- **Cold migration**: stop the VM, move the disk, restart on the new node. More reliable, more downtime.
- **Evacuation**: force-migrate all VMs from a failed compute node (used when a node dies). Used in HA cluster maintenance.

#### Floating IP vs fixed IP
A fixed IP is the VM's internal address on the tenant network (e.g., `10.0.0.5`). A floating IP is a public IP that can be associated with a VM's port and provides external access. Floating IPs are drawn from an external network pool. This is analogous to AWS Elastic IPs. NAT is used to map floating IP → fixed IP on the router.

#### Heat templates vs Terraform
Heat is OpenStack's native orchestration — HOT (Heat Orchestration Template) format, YAML, declarative. Terraform/OpenTofu can also provision OpenStack resources via the OpenStack provider — and is more portable across clouds. For a pure OpenStack shop, Heat has the advantage of deep integration (auto-scaling groups, wait conditions, resource signals). For multi-cloud, Terraform is better.

#### Ceph as the OpenStack storage backbone
Ceph RBD (RADOS Block Device) is the preferred backend for Cinder volumes, Glance images, and Nova ephemeral disks in production OpenStack. All three services share the same Ceph cluster with separate pools. Benefits: thin provisioning, snapshots, cloning (fast VM spawning from images), no shared storage requirement for live migration (each VM's disk is a Ceph RBD image stored in the cluster, not on the compute node).

#### OpenStack deployment model — services are just APIs
Every OpenStack service is a REST API backed by a message queue (RabbitMQ). Nova receives a boot request → puts a message on the queue → nova-compute picks it up → calls the hypervisor. This async model is why OpenStack scales: you can have hundreds of compute nodes all consuming the same queue. The downside: debugging requires following a message through multiple service logs. `openstack server create` returning immediately doesn't mean the VM is running — poll `openstack server show` for status.

#### Quotas and capacity planning
OpenStack enforces quotas per project: max VCPUs, RAM, floating IPs, volumes, and security groups. Quotas prevent one team from consuming all resources. For platform teams, quota management is a significant operational task — projects request increases, you verify capacity, you adjust. Nova's `nova-scheduler` places VMs based on actual resource availability filtered against quotas. Over-commitment ratios (defaulting to 16:1 for VCPUs, 1.5:1 for RAM) determine how many VMs fit on a compute node.

#### Security groups vs network ACLs
Security groups in OpenStack (Neutron) are stateful firewalls attached to VM ports — allow a rule for inbound port 443, and return traffic is automatically allowed. They're applied at the virtual switch level, not at the VM. Rules are additive: multiple security groups on one port merge their rules. This is identical to AWS security groups. Network ACLs (if configured) apply at the subnet level and are stateless (you must explicitly allow return traffic).

#### Glance images and image formats
Glance stores VM images (qcow2, raw, vmdk). qcow2 is the standard format — thin-provisioned, supports snapshots, compresses well. raw is faster at runtime (no format overhead) but larger. When an image is used to boot a VM, Nova (with Ceph backend) clones the Glance image in Ceph as a copy-on-write RBD volume — VM boots in seconds regardless of image size. Always upload images in qcow2 format; the backend handles conversion.

#### Ceph integration — the backbone of production OpenStack storage
Most production OpenStack deployments use Ceph as the unified storage backend: Cinder (block storage) uses RBD (RADOS Block Device), Glance (image service) stores images in Ceph object storage, and Nova (compute) boots instances directly from Ceph-backed volumes via copy-on-write clones — a VM boots in seconds regardless of image size because only modified blocks are written. The Ceph cluster is separate from OpenStack compute nodes; they communicate via the Ceph client library embedded in libvirt/QEMU. This architecture makes live migration trivial (no data to move — the new host just attaches to the same Ceph volume) and enables snapshotting at the storage layer.

#### Keystone token types and service discovery
Keystone issues tokens (currently Fernet format — signed, non-persistent) that services use to authenticate API calls. The service catalog embedded in the token lists the endpoint URLs for every OpenStack service — compute, storage, networking, identity. When `nova list` runs, it first contacts Keystone to get a token and the catalog, then calls the Nova endpoint from the catalog. Every OpenStack service validates tokens against Keystone on every API call. This central identity model means a Keystone outage takes down the entire cloud's API layer — HA Keystone deployment is non-negotiable in production.

#### Neutron ML2 plugin architecture — why OpenStack networking is complex
Neutron's Modular Layer 2 (ML2) plugin separates the type driver (what kind of network: VLAN, VXLAN, flat) from the mechanism driver (how it's implemented: OVS, OVN, SR-IOV). OVN (Open Virtual Network) is the current recommended mechanism driver — it replaces the older OVS agent model with a centralised database (OVSDB) that distributes flow rules to all compute nodes without requiring a Neutron agent on each. The complexity comes from the abstraction layers: Neutron networks → Neutron subnets → Neutron ports → OVN logical switches → OVS flow rules on the hypervisor. When debugging, work down the stack: check the Neutron API first, then OVN database (`ovn-nbctl show`), then OVS flows (`ovs-ofctl dump-flows`).

---

---

## Table of Contents

- [Choosing Your OpenStack Path](#choosing-your-openstack-path)
- [MicroStack (All-in-One)](#microstack-snap--all-in-one)
- [DevStack (Development)](#devstack-development)
- [Kolla-Ansible (Production)](#kolla-ansible-production)
- [OpenStack CLI Tools](#openstack-cli-tools)
- [Core Services Reference](#core-services-reference)
- [Containerised Supporting Services](#containerised-supporting-services)
- [Integrating with Kubernetes](#integrating-with-kubernetes)
- [Caddy Configuration](#caddy-configuration)
- [Troubleshooting](#troubleshooting)

---

## Choosing Your OpenStack Path

| Option | Best For | RAM (min) | Complexity | Notes |
|--------|----------|-----------|------------|-------|
| **MicroStack** | Local dev, learning, homelabs | 8 GB | Low | Snap-based, all-in-one, Canonical-maintained |
| **DevStack** | Development, contributing upstream | 8 GB | Medium | Git-based, single-node, not production-ready |
| **Kolla-Ansible** | Production, multi-node | 16 GB | High | Container-based, production-grade, full control |
| **OpenStack-Helm** | K8s-native OpenStack | 16 GB | Very High | Runs OpenStack services as Helm charts on Kubernetes |
| **TripleO / Director** | Bare-metal, telco | 32 GB | Very High | Red Hat/CentOS heritage, being phased out upstream |

For a Shani OS homelab, **MicroStack** (learn/experiment) or **Kolla-Ansible** (build something real) are the two practical paths.

---

## MicroStack (Snap — All-in-One)

**Purpose:** Canonical's single-Snap OpenStack distribution. Installs Nova (compute), Neutron (networking), Cinder (block storage), Glance (images), Keystone (identity), and Horizon (dashboard) in minutes. The fastest way to get a working OpenStack on this system for learning, development, and homelab use.

```bash
# Install MicroStack — Snap only, no Nix equivalent
sudo snap install microstack --channel=2024/stable --classic

# Initialise the all-in-one node
# This configures all services, sets up the database, and provisions the default network
sudo microstack init --auto --control

# Verify all services are running
sudo microstack.openstack service list
sudo microstack.openstack catalog list

# Check the control plane
sudo microstack status
```

#### Access Horizon (web dashboard)
```bash
# Get the Horizon URL and admin credentials
sudo microstack.openstack user password set admin   # change default password
# Horizon is at http://<your-ip>/
```

#### Launch your first instance
```bash
# Download and upload a cloud image (CirrOS — tiny test image)
curl -O https://download.cirros-cloud.net/0.6.2/cirros-0.6.2-x86_64-disk.img
sudo microstack.openstack image create \
  --file cirros-0.6.2-x86_64-disk.img \
  --disk-format qcow2 --container-format bare \
  --public cirros-0.6.2

# List available flavors
sudo microstack.openstack flavor list

# Create an SSH key pair
sudo microstack.openstack keypair create --public-key ~/.ssh/id_ed25519.pub mykey

# Create a security group rule for SSH
sudo microstack.openstack security group rule create default \
  --protocol tcp --dst-port 22 --remote-ip 0.0.0.0/0

# Boot an instance
sudo microstack.openstack server create \
  --image cirros-0.6.2 \
  --flavor m1.tiny \
  --network test \
  --key-name mykey \
  myvm

# Watch it boot
sudo microstack.openstack server show myvm

# Assign a floating IP
sudo microstack.openstack floating ip create external
sudo microstack.openstack server add floating ip myvm <floating-ip>

# SSH into the instance
ssh -i ~/.ssh/id_ed25519 cirros@<floating-ip>
```

#### Common MicroStack operations
```bash
# List all instances
sudo microstack.openstack server list

# Stop / start an instance
sudo microstack.openstack server stop myvm
sudo microstack.openstack server start myvm

# Delete an instance
sudo microstack.openstack server delete myvm

# List images, flavors, networks
sudo microstack.openstack image list
sudo microstack.openstack flavor list
sudo microstack.openstack network list

# Create a custom flavor (2 vCPU, 4 GB RAM, 20 GB disk)
sudo microstack.openstack flavor create --vcpus 2 --ram 4096 --disk 20 m1.medium

# View instance console log
sudo microstack.openstack console log show myvm

# Get a VNC console URL
sudo microstack.openstack console url show --novnc myvm
```

#### Upload Ubuntu or Debian images
```bash
# Ubuntu 24.04 LTS cloud image
curl -L -O https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img
sudo microstack.openstack image create \
  --file noble-server-cloudimg-amd64.img \
  --disk-format qcow2 --container-format bare \
  --public ubuntu-24.04

# Debian 12
curl -L -O https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2
sudo microstack.openstack image create \
  --file debian-12-genericcloud-amd64.qcow2 \
  --disk-format qcow2 --container-format bare \
  --public debian-12
```

> 💡 MicroStack stores all cluster state inside `/var/snap/microstack/` which lives in `@snapd` and persists across Shani OS updates and rollbacks. It does not use the OS root.

---

## DevStack (Development)

**Purpose:** The reference OpenStack development environment. Installs directly from Git, making it easy to test patches, contribute upstream, or explore bleeding-edge features. **Not for production** — DevStack is a single-node setup designed to be torn down and rebuilt. Run it inside a Distrobox container to keep the host clean.

##### Run DevStack inside a Distrobox Ubuntu container

```bash
# Create an Ubuntu 24.04 Distrobox container for DevStack
distrobox create --name devstack --image ubuntu:24.04
distrobox enter devstack

# Inside the container — install prerequisites
sudo apt update && sudo apt install -y git python3-pip python3-venv

# Clone DevStack
git clone https://opendev.org/openstack/devstack
cd devstack

# Create a minimal local.conf
cat > local.conf << 'EOF'
[[local|localrc]]
ADMIN_PASSWORD=changeme
DATABASE_PASSWORD=changeme
RABBIT_PASSWORD=changeme
SERVICE_PASSWORD=changeme

# Disable services you don't need (speeds up install dramatically)
disable_service tempest
disable_service horizon     # Enable if you want the dashboard

# Use a specific OpenStack release (remove to track main)
# OPENSTACK_RELEASES=2024.2
EOF

# Run the installer (takes 20–40 minutes)
./stack.sh
```

#### After installation
```bash
# Source credentials
source ~/devstack/openrc admin admin

# Verify
openstack service list
openstack catalog list

# Re-stack after a reboot (keeps existing data)
cd ~/devstack && ./rejoin-stack.sh

# Full teardown and rebuild
./unstack.sh && ./clean.sh && ./stack.sh
```

#### Common DevStack workflows
```bash
# Source user credentials
source openrc demo demo     # non-admin user
source openrc admin admin   # admin

# Run a specific set of services only
# In local.conf:
# ENABLED_SERVICES=key,rabbit,mysql,n-api,n-cpu,n-cond,n-sch,g-api,g-reg,c-api,c-vol,c-sch,q-svc,q-dhcp,q-l3,q-meta

# Watch service logs (screen session)
screen -x stack

# View individual service log
sudo journalctl -u devstack@n-api -f    # Nova API
sudo journalctl -u devstack@q-svc -f   # Neutron
```

---

## Kolla-Ansible (Production)

**Purpose:** Deploy OpenStack using containerised services managed by Ansible. Kolla packages every OpenStack service as an OCI image; Kolla-Ansible orchestrates deployment, configuration, and upgrades. This is the recommended path for a production-grade multi-node private cloud on this system.

> **Architecture:** A typical small deployment has 1–3 controller nodes (Keystone, Nova-API, Neutron-Server, Glance, Cinder, Horizon, RabbitMQ, MariaDB, HAProxy) and 1–N compute nodes (Nova-Compute, Neutron-Agent). All-in-one deployments run everything on a single node.

### Prerequisites

```bash
# Install Python and Ansible via Nix
nix-env -iA nixpkgs.python312 nixpkgs.python312Packages.pip nixpkgs.ansible

# Install kolla-ansible in a virtual environment
python3 -m venv ~/kolla-venv
source ~/kolla-venv/bin/activate
pip install kolla-ansible

# Install Ansible Galaxy requirements
kolla-ansible install-deps
```

### All-in-One Setup

```bash
# Create the kolla config directory
sudo mkdir -p /etc/kolla
sudo chown $USER:$USER /etc/kolla

# Copy default configuration
cp ~/kolla-venv/share/kolla-ansible/etc_examples/kolla/* /etc/kolla/

# Generate random passwords for all services
kolla-genpwd

# Copy the all-in-one inventory
cp ~/kolla-venv/share/kolla-ansible/ansible/inventory/all-in-one ~/inventory-aio
```

#### Edit `/etc/kolla/globals.yml`
```yaml
# Minimal all-in-one globals.yml
kolla_base_distro: "ubuntu"
kolla_install_type: "binary"
openstack_release: "2024.2"

# Network interfaces — adjust to match your system
network_interface: "eth0"          # Management / API network
neutron_external_interface: "eth1" # Flat provider network (no IP needed)
kolla_internal_vip_address: "192.168.1.100"  # VIP for HA — use host IP for AIO

# Enable services
enable_cinder: "yes"
enable_glance: "yes"
enable_heat: "yes"
enable_horizon: "yes"
enable_neutron: "yes"
enable_nova: "yes"
enable_placement: "yes"

# Cinder volume group — create with 'sudo vgcreate cinder-volumes /dev/sdX'
enable_cinder_backend_lvm: "yes"
cinder_volume_group: "cinder-volumes"

# Optional: object storage
enable_swift: "no"

# Optional: Kubernetes integration via Magnum
enable_magnum: "no"
```

##### Bootstrap and deploy

```bash
source ~/kolla-venv/bin/activate

# Bootstrap servers (installs Docker/Podman, dependencies)
kolla-ansible -i ~/inventory-aio bootstrap-servers

# Pre-deployment checks
kolla-ansible -i ~/inventory-aio prechecks

# Deploy (this takes 20–60 minutes)
kolla-ansible -i ~/inventory-aio deploy

# Generate the OpenStack credentials file
kolla-ansible -i ~/inventory-aio post-deploy

# Source credentials
source /etc/kolla/admin-openrc.sh
openstack service list
```

### Multi-Node Setup

#### `~/inventory-multinode`
```ini
[control]
controller01 ansible_host=192.168.1.10 ansible_user=user
controller02 ansible_host=192.168.1.11 ansible_user=user
controller03 ansible_host=192.168.1.12 ansible_user=user

[network]
controller01
controller02
controller03

[compute]
compute01 ansible_host=192.168.1.20 ansible_user=user
compute02 ansible_host=192.168.1.21 ansible_user=user

[storage]
storage01 ansible_host=192.168.1.30 ansible_user=user

[monitoring]
controller01

[deployment]
localhost ansible_connection=local
```

```bash
kolla-ansible -i ~/inventory-multinode bootstrap-servers
kolla-ansible -i ~/inventory-multinode prechecks
kolla-ansible -i ~/inventory-multinode deploy
kolla-ansible -i ~/inventory-multinode post-deploy
```

### Upgrades and Maintenance

```bash
# Upgrade OpenStack to a new release
# 1. Update openstack_release in globals.yml
# 2. Pull new images
kolla-ansible -i ~/inventory-aio pull

# 3. Run upgrade
kolla-ansible -i ~/inventory-aio upgrade

# Reconfigure (apply globals.yml changes without full redeploy)
kolla-ansible -i ~/inventory-aio reconfigure

# Check service health
kolla-ansible -i ~/inventory-aio check

# Destroy and clean up (warning: deletes all data)
kolla-ansible -i ~/inventory-aio destroy --yes-i-really-really-mean-it
```

---

## OpenStack CLI Tools

##### Install via Nix (primary)

```bash
# OpenStackClient — unified CLI for all services
nix-env -iA nixpkgs.python312Packages.openstackclient

# Or install in a virtual environment (gets latest version)
python3 -m venv ~/os-venv
source ~/os-venv/bin/activate
pip install python-openstackclient \
            python-cinderclient \
            python-glanceclient \
            python-heatclient \
            python-magnumclient \
            python-neutronclient \
            python-novaclient \
            python-swiftclient
```

#### Authentication — `clouds.yaml`
```yaml
# ~/.config/openstack/clouds.yaml
clouds:
  homelab:
    auth:
      auth_url: https://keystone.home.local:5000
      username: admin
      password: changeme
      project_name: admin
      user_domain_name: Default
      project_domain_name: Default
    region_name: RegionOne
    interface: public
    identity_api_version: 3

  homelab-demo:
    auth:
      auth_url: https://keystone.home.local:5000
      username: demo
      password: demopass
      project_name: demo
      user_domain_name: Default
      project_domain_name: Default
    region_name: RegionOne
    interface: public
    identity_api_version: 3
```

```bash
# Use a specific cloud profile
export OS_CLOUD=homelab

# Or source the openrc file
source /etc/kolla/admin-openrc.sh
```

#### Essential daily commands
```bash
# Identity (Keystone)
openstack user list
openstack project list
openstack role list
openstack user create --password changeme --project demo myuser
openstack role add --user myuser --project demo member
openstack token issue

# Compute (Nova)
openstack server list
openstack server list --all-projects   # admin
openstack server create \
  --image ubuntu-24.04 \
  --flavor m1.small \
  --network internal \
  --key-name mykey \
  --security-group default \
  myserver
openstack server start myserver
openstack server stop myserver
openstack server reboot myserver
openstack server delete myserver
openstack server migrate myserver --host compute02  # live migration
openstack hypervisor list
openstack hypervisor stats show

# Images (Glance)
openstack image list
openstack image create \
  --file ubuntu-24.04-server-cloudimg-amd64.img \
  --disk-format qcow2 --container-format bare \
  --public ubuntu-24.04
openstack image show ubuntu-24.04
openstack image delete ubuntu-24.04

# Networking (Neutron)
openstack network list
openstack network create --provider-network-type flat \
  --provider-physical-network physnet1 \
  --external external-net
openstack subnet create \
  --network external-net \
  --subnet-range 192.168.100.0/24 \
  --gateway 192.168.100.1 \
  --allocation-pool start=192.168.100.200,end=192.168.100.250 \
  --no-dhcp external-subnet
openstack network create internal
openstack subnet create \
  --network internal \
  --subnet-range 10.0.0.0/24 \
  internal-subnet
openstack router create myrouter
openstack router set --external-gateway external-net myrouter
openstack router add subnet myrouter internal-subnet
openstack floating ip create external-net
openstack server add floating ip myserver <floating-ip>
openstack security group rule create default \
  --protocol tcp --dst-port 22 --remote-ip 0.0.0.0/0
openstack security group rule create default \
  --protocol icmp --remote-ip 0.0.0.0/0

# Block Storage (Cinder)
openstack volume list
openstack volume create --size 20 mydisk
openstack server add volume myserver mydisk
openstack volume snapshot create --volume mydisk mysnap
openstack volume backup create --name mybackup mydisk

# Object Storage (Swift)
openstack container create mybucket
openstack object create mybucket myfile.txt
openstack object list mybucket
openstack object save mybucket myfile.txt

# Orchestration (Heat)
openstack stack list
openstack stack create -t ~/heat/mystack.yaml mystack
openstack stack update -t ~/heat/mystack.yaml mystack
openstack stack delete mystack

# Key pairs
openstack keypair create --public-key ~/.ssh/id_ed25519.pub mykey
openstack keypair list

# Flavors
openstack flavor list
openstack flavor create --vcpus 4 --ram 8192 --disk 50 m1.large
openstack flavor delete m1.large
```

---

## Core Services Reference

OpenStack is composed of many loosely coupled services. These are the ones you'll encounter most in a homelab or small private cloud.

| Service | Code Name | Purpose | Port |
|---------|-----------|---------|------|
| Identity | Keystone | Auth, tokens, service catalog | 5000 |
| Image | Glance | VM image storage and retrieval | 9292 |
| Compute | Nova | VM lifecycle management | 8774 |
| Placement | Placement | Resource inventory tracking | 8778 |
| Network | Neutron | Virtual networks, routers, FIPs | 9696 |
| Block Storage | Cinder | Persistent volumes for VMs | 8776 |
| Object Storage | Swift | S3-like object store | 8080 |
| Dashboard | Horizon | Web UI for all services | 80/443 |
| Orchestration | Heat | Stack templates (like Terraform) | 8004 |
| Telemetry | Ceilometer | Usage metering and events | 8041 |
| Bare Metal | Ironic | Provision physical servers | 6385 |
| Container Infra | Magnum | Kubernetes clusters via API | 9511 |
| DNS | Designate | DNS as a service | 9001 |
| Load Balancer | Octavia | LBaaS with Amphorae | 9876 |
| Key Manager | Barbican | Secret and certificate storage | 9311 |
| Shared File System | Manila | NFS/CIFS shares for VMs | 8786 |

---

## Containerised Supporting Services

Several OpenStack services have popular self-hosted equivalents that integrate directly via standard APIs. Use these on this system alongside or instead of full OpenStack deployments.

### MinIO (OpenStack Swift-compatible Object Storage)

**Purpose:** S3 and Swift-compatible object storage. Use MinIO as a drop-in Swift replacement for image storage (Glance), volume backups (Cinder), or Heat templates. Lighter than running full Swift.

```yaml
# ~/minio/compose.yaml
services:
  minio:
    image: quay.io/minio/minio:latest
    ports:
      - 127.0.0.1:9000:9000
      - 127.0.0.1:9001:9001
    volumes:
      - /home/user/minio/data:/data:Z
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: changeme
      MINIO_VOLUMES: /data
    command: server /data --console-address ":9001"
    restart: unless-stopped
```

```bash
cd ~/minio && podman-compose up -d

# Install the MinIO client (mc) via Nix
nix-env -iA nixpkgs.minio-client

# Configure mc
mc alias set homelab http://localhost:9000 minioadmin changeme

# Create buckets (equivalent to Swift containers)
mc mb homelab/glance-images
mc mb homelab/cinder-backups
mc mb homelab/heat-templates

# Set Glance to use MinIO as the backend
# In /etc/kolla/config/glance/glance-api.conf (Kolla) or DevStack local.conf:
# [glance_store]
# stores = http,swift
# default_store = swift
# swift_store_auth_address = http://localhost:9000
# swift_store_user = minioadmin:changeme
# swift_store_key = changeme
```

**Caddy:**
```caddyfile
minio.home.local        { tls internal; reverse_proxy localhost:9000 }
minio-console.home.local { tls internal; reverse_proxy localhost:9001 }
```

---

### Ceph (Distributed Storage for OpenStack)

**Purpose:** Ceph is the reference storage backend for production OpenStack deployments — it powers Cinder (RBD volumes), Glance (image storage), and Nova (ephemeral disks). A 3-node Ceph cluster provides redundancy and near-unlimited scale.

```yaml
# ~/ceph/compose.yaml — minimal Ceph cluster using ceph/daemon images
services:
  mon:
    image: quay.io/ceph/ceph:v18
    hostname: mon
    environment:
      CEPH_DAEMON: MON
      MON_IP: 192.168.1.10
      CEPH_PUBLIC_NETWORK: 192.168.1.0/24
      CLUSTER: ceph
    volumes:
      - /home/user/ceph/etc:/etc/ceph:Z
      - /home/user/ceph/lib:/var/lib/ceph:Z
    ports:
      - 127.0.0.1:6789:6789
    restart: unless-stopped

  osd1:
    image: quay.io/ceph/ceph:v18
    hostname: osd1
    privileged: true
    environment:
      CEPH_DAEMON: OSD_DIRECTORY
      CLUSTER: ceph
    volumes:
      - /home/user/ceph/etc:/etc/ceph:Z
      - /home/user/ceph/osd1:/var/lib/ceph/osd:Z
    depends_on: [mon]
    restart: unless-stopped

volumes:
  {}
```

```bash
cd ~/ceph && podman-compose up -d

# Check cluster health
podman exec ceph-mon-1 ceph status
podman exec ceph-mon-1 ceph health detail

# Create pools for OpenStack
podman exec ceph-mon-1 ceph osd pool create volumes 128     # Cinder
podman exec ceph-mon-1 ceph osd pool create images 128      # Glance
podman exec ceph-mon-1 ceph osd pool create vms 128         # Nova ephemeral

# Enable RBD application on each pool
podman exec ceph-mon-1 ceph osd pool application enable volumes rbd
podman exec ceph-mon-1 ceph osd pool application enable images rbd
podman exec ceph-mon-1 ceph osd pool application enable vms rbd

# Create keyring for OpenStack services
podman exec ceph-mon-1 ceph auth get-or-create \
  client.cinder mon 'allow r' osd 'allow class-read object_prefix rbd_children, allow rwx pool=volumes, allow rx pool=images'
```

> For a full production Ceph deployment on this system, use **Ceph's own `cephadm` orchestrator** or the [Rook operator](https://rook.io) inside your k3s/RKE2 cluster.

---

### Vault / OpenBao (Keystone Credential Backend)

**Purpose:** Use OpenBao (the open-source HashiCorp Vault fork) as Keystone's credential and secret backend — replacing the default Fernet keys stored on disk. Also useful as a Barbican backend.

```yaml
# ~/openbao/compose.yaml
services:
  openbao:
    image: quay.io/openbao/openbao:latest
    ports:
      - 127.0.0.1:8200:8200
    volumes:
      - /home/user/openbao/data:/openbao/data:Z
      - /home/user/openbao/config:/openbao/config:Z
    cap_add:
      - IPC_LOCK
    command: server
    environment:
      BAO_ADDR: http://0.0.0.0:8200
    restart: unless-stopped
```

```bash
cd ~/openbao && podman-compose up -d

# Install the bao CLI via Nix
nix-env -iA nixpkgs.openbao

export BAO_ADDR=http://localhost:8200

# Initialise
bao operator init -key-shares=5 -key-threshold=3

# Unseal (run 3 times with 3 different unseal keys)
bao operator unseal <key1>
bao operator unseal <key2>
bao operator unseal <key3>

# Login with the root token
bao login <root-token>

# Enable KV store for OpenStack secrets
bao secrets enable -path=openstack kv-v2

# Store a Keystone secret
bao kv put openstack/keystone fernet_key_0=<base64-key>
```

---

### RabbitMQ (OpenStack Message Queue)

OpenStack services communicate via AMQP. In Kolla deployments RabbitMQ is managed automatically. For custom or hybrid deployments:

```yaml
# ~/rabbitmq/compose.yaml
services:
  rabbitmq:
    image: rabbitmq:3-management-alpine
    hostname: rabbitmq
    ports:
      - 127.0.0.1:5672:5672
      - 127.0.0.1:15672:15672
    environment:
      RABBITMQ_DEFAULT_USER: openstack
      RABBITMQ_DEFAULT_PASS: changeme
      RABBITMQ_DEFAULT_VHOST: /
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    restart: unless-stopped

volumes:
  rabbitmq_data:
```

```bash
cd ~/rabbitmq && podman-compose up -d

# Verify
podman exec rabbitmq-rabbitmq-1 rabbitmqctl status
```

---

### MariaDB + Galera (OpenStack Database)

OpenStack services share a MySQL-compatible database. For a production HA setup use Galera:

```yaml
# ~/mariadb-galera/compose.yaml
services:
  db1:
    image: mariadb:11
    hostname: db1
    ports:
      - 127.0.0.1:3306:3306
    environment:
      MARIADB_ROOT_PASSWORD: changeme
      MARIADB_GALERA_CLUSTER_NAME: openstack
      MARIADB_GALERA_CLUSTER_ADDRESS: gcomm://db1,db2,db3
      MARIADB_GALERA_MARIABACKUP_USER: backupuser
      MARIADB_GALERA_MARIABACKUP_PASSWORD: changeme
    volumes:
      - db1_data:/var/lib/mysql
    restart: unless-stopped

  db2:
    image: mariadb:11
    hostname: db2
    environment:
      MARIADB_ROOT_PASSWORD: changeme
      MARIADB_GALERA_CLUSTER_NAME: openstack
      MARIADB_GALERA_CLUSTER_ADDRESS: gcomm://db1,db2,db3
      MARIADB_GALERA_MARIABACKUP_USER: backupuser
      MARIADB_GALERA_MARIABACKUP_PASSWORD: changeme
    volumes:
      - db2_data:/var/lib/mysql
    depends_on: [db1]
    restart: unless-stopped

  db3:
    image: mariadb:11
    hostname: db3
    environment:
      MARIADB_ROOT_PASSWORD: changeme
      MARIADB_GALERA_CLUSTER_NAME: openstack
      MARIADB_GALERA_CLUSTER_ADDRESS: gcomm://db1,db2,db3
      MARIADB_GALERA_MARIABACKUP_USER: backupuser
      MARIADB_GALERA_MARIABACKUP_PASSWORD: changeme
    volumes:
      - db3_data:/var/lib/mysql
    depends_on: [db1]
    restart: unless-stopped

volumes:
  db1_data:
  db2_data:
  db3_data:
```

```bash
cd ~/mariadb-galera && podman-compose up -d

# Create OpenStack service databases (run once)
podman exec mariadb-galera-db1-1 mysql -u root -pchangeme -e "
  CREATE DATABASE keystone;
  CREATE DATABASE nova;
  CREATE DATABASE nova_api;
  CREATE DATABASE nova_cell0;
  CREATE DATABASE neutron;
  CREATE DATABASE glance;
  CREATE DATABASE cinder;
  CREATE DATABASE heat;
  GRANT ALL PRIVILEGES ON keystone.* TO 'keystone'@'%' IDENTIFIED BY 'changeme';
  GRANT ALL PRIVILEGES ON nova.* TO 'nova'@'%' IDENTIFIED BY 'changeme';
  GRANT ALL PRIVILEGES ON nova_api.* TO 'nova'@'%' IDENTIFIED BY 'changeme';
  GRANT ALL PRIVILEGES ON nova_cell0.* TO 'nova'@'%' IDENTIFIED BY 'changeme';
  GRANT ALL PRIVILEGES ON neutron.* TO 'neutron'@'%' IDENTIFIED BY 'changeme';
  GRANT ALL PRIVILEGES ON glance.* TO 'glance'@'%' IDENTIFIED BY 'changeme';
  GRANT ALL PRIVILEGES ON cinder.* TO 'cinder'@'%' IDENTIFIED BY 'changeme';
  GRANT ALL PRIVILEGES ON heat.* TO 'heat'@'%' IDENTIFIED BY 'changeme';
  FLUSH PRIVILEGES;
"
```

---

### Memcached (Token Cache)

Keystone uses Memcached to cache tokens and reduce database load:

```yaml
# ~/memcached/compose.yaml
services:
  memcached:
    image: memcached:alpine
    ports:
      - 127.0.0.1:11211:11211
    command: memcached -m 512 -c 1024
    restart: unless-stopped
```

```bash
cd ~/memcached && podman-compose up -d
```

---

## Integrating with Kubernetes

### Magnum (Kubernetes-as-a-Service)

Magnum is the OpenStack service that provisions Kubernetes clusters on demand — you call the OpenStack API and get a working k8s cluster running on Nova VMs. Requires a working OpenStack environment with at least Nova, Neutron, Glance, and Cinder.

```bash
# Enable Magnum in Kolla globals.yml
# enable_magnum: "yes"
# kolla-ansible -i ~/inventory-aio reconfigure

# Install the Magnum client
pip install python-magnumclient

# Upload a COE (Container Orchestration Engine) image
# Download the Fedora CoreOS image built for Magnum
curl -L -O https://builds.coreos.fedoraproject.org/prod/streams/stable/builds/latest/x86_64/fedora-coreos-*-openstack.x86_64.qcow2

openstack image create \
  --file fedora-coreos-*-openstack.x86_64.qcow2 \
  --disk-format qcow2 --container-format bare \
  --public \
  --property os_distro=fedora-coreos \
  fedora-coreos

# Create a cluster template
openstack coe cluster template create k8s-template \
  --image fedora-coreos \
  --keypair mykey \
  --external-network external-net \
  --dns-nameserver 1.1.1.1 \
  --flavor m1.small \
  --master-flavor m1.medium \
  --coe kubernetes \
  --docker-storage-driver overlay2 \
  --network-driver flannel

# Provision a Kubernetes cluster
openstack coe cluster create mycluster \
  --cluster-template k8s-template \
  --master-count 1 \
  --node-count 2

# Watch provisioning status
openstack coe cluster show mycluster

# Get kubeconfig
mkdir -p ~/mycluster-config
$(openstack coe cluster config mycluster --dir ~/mycluster-config --force)
export KUBECONFIG=~/mycluster-config/config

# Verify
kubectl get nodes
```

---

### OpenStack Helm (Kubernetes-Native OpenStack)

Run OpenStack services themselves as Helm charts on your k3s/RKE2 cluster. This is the most cloud-native OpenStack deployment model.

```bash
# Prerequisites: k3s or RKE2 running, Helm installed
# OpenStack-Helm repository
helm repo add osh https://tarballs.opendev.org/openstack/openstack-helm
helm repo add osh-infra https://tarballs.opendev.org/openstack/openstack-helm-infra
helm repo update

# Install infrastructure components first
helm upgrade --install ingress-openstack osh-infra/ingress \
  --namespace openstack --create-namespace

helm upgrade --install mariadb osh-infra/mariadb \
  --namespace openstack \
  --set volume.size=50Gi

helm upgrade --install rabbitmq osh-infra/rabbitmq \
  --namespace openstack

helm upgrade --install memcached osh-infra/memcached \
  --namespace openstack

# Install core OpenStack services
helm upgrade --install keystone osh/keystone \
  --namespace openstack

helm upgrade --install glance osh/glance \
  --namespace openstack

helm upgrade --install nova osh/nova \
  --namespace openstack

helm upgrade --install neutron osh/neutron \
  --namespace openstack
```

---

## Heat Templates (Infrastructure as Code)

Heat is OpenStack's native orchestration service — equivalent to Terraform or CloudFormation but for your private cloud. Templates are written in YAML (HOT format).

#### Example: Launch a web server stack
```yaml
# ~/heat/webserver.yaml
heat_template_version: '2021-04-06'

description: Single web server instance with floating IP

parameters:
  image:
    type: string
    default: ubuntu-24.04
  flavor:
    type: string
    default: m1.small
  key_name:
    type: string
    default: mykey
  network:
    type: string
    default: internal
  external_network:
    type: string
    default: external-net

resources:
  security_group:
    type: OS::Neutron::SecurityGroup
    properties:
      rules:
        - protocol: tcp
          port_range_min: 22
          port_range_max: 22
        - protocol: tcp
          port_range_min: 80
          port_range_max: 80
        - protocol: icmp

  server:
    type: OS::Nova::Server
    properties:
      image: { get_param: image }
      flavor: { get_param: flavor }
      key_name: { get_param: key_name }
      networks:
        - network: { get_param: network }
      security_groups:
        - { get_resource: security_group }
      user_data: |
        #!/bin/bash
        apt update && apt install -y nginx
        systemctl enable --now nginx

  floating_ip:
    type: OS::Neutron::FloatingIP
    properties:
      floating_network: { get_param: external_network }

  floating_ip_assoc:
    type: OS::Neutron::FloatingIPAssociation
    properties:
      floatingip_id: { get_resource: floating_ip }
      port_id: { get_attr: [server, addresses, internal, 0, port] }

outputs:
  server_ip:
    description: Floating IP of the web server
    value: { get_attr: [floating_ip, floating_ip_address] }
```

```bash
# Deploy the stack
openstack stack create -t ~/heat/webserver.yaml webserver-stack

# Watch progress
openstack stack event list webserver-stack --follow

# Get outputs
openstack stack output show webserver-stack server_ip

# Update the stack
openstack stack update -t ~/heat/webserver.yaml webserver-stack

# Delete the stack (removes all resources)
openstack stack delete webserver-stack
```

## Caddy Configuration

```caddyfile
# OpenStack Horizon dashboard
horizon.home.local       { tls internal; reverse_proxy localhost:80 }

# OpenStack API endpoints (proxy from Caddy to Kolla/MicroStack services)
keystone.home.local      { tls internal; reverse_proxy localhost:5000 }
glance.home.local        { tls internal; reverse_proxy localhost:9292 }
nova.home.local          { tls internal; reverse_proxy localhost:8774 }
neutron.home.local       { tls internal; reverse_proxy localhost:9696 }
cinder.home.local        { tls internal; reverse_proxy localhost:8776 }
heat.home.local          { tls internal; reverse_proxy localhost:8004 }
swift.home.local         { tls internal; reverse_proxy localhost:8080 }
placement.home.local     { tls internal; reverse_proxy localhost:8778 }

# Supporting services
minio.home.local         { tls internal; reverse_proxy localhost:9000 }
minio-console.home.local { tls internal; reverse_proxy localhost:9001 }
openbao.home.local       { tls internal; reverse_proxy localhost:8200 }
rabbitmq.home.local      { tls internal; reverse_proxy localhost:15672 }
```

---

## Useful Daily Commands

```bash
# Quota management
openstack quota show --project demo
openstack quota set --instances 20 --cores 40 --ram 102400 demo

# Aggregates and availability zones
openstack aggregate create --zone az1 az1
openstack aggregate add host az1 compute01
openstack server create ... --availability-zone az1

# Host operations
openstack host list
openstack compute service list
openstack compute service set --disable compute01 nova-compute  # drain
openstack compute service set --enable compute01 nova-compute   # restore

# Tenant network creation (typical Neutron setup)
openstack network create --internal tenant-net
openstack subnet create \
  --network tenant-net \
  --subnet-range 10.10.0.0/24 \
  --dns-nameserver 1.1.1.1 \
  tenant-subnet
openstack router create tenant-router
openstack router set --external-gateway external-net tenant-router
openstack router add subnet tenant-router tenant-subnet

# Resize a server
openstack server resize --flavor m1.large myserver
openstack server resize confirm myserver

# Create and use a volume snapshot
openstack volume snapshot create --volume mydisk snap1
openstack volume create --snapshot snap1 --size 20 newdisk

# Backup and restore
openstack volume backup create --name backup1 --force mydisk
openstack volume backup restore backup1 mydisk

# Instance console access
openstack console log show myserver
openstack console url show --novnc myserver

# Floating IP management
openstack floating ip list
openstack floating ip create external-net
openstack floating ip delete <id>
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| MicroStack `microstack status` shows services down | Run `sudo snap restart microstack`; check `sudo snap logs microstack` for errors |
| MicroStack `openstack` CLI returns `Connection refused` | Ensure you're using `sudo microstack.openstack` not bare `openstack`; or source `/var/snap/microstack/common/etc/microstack.rc` |
| DevStack `stack.sh` fails mid-way | Check `~/devstack/logs/` for the failing service; common causes: insufficient RAM, missing `local.conf` parameters, network connectivity |
| DevStack services down after reboot | Run `cd ~/devstack && ./rejoin-stack.sh` — `./stack.sh` starts from scratch; `rejoin-stack.sh` re-attaches to existing services |
| Kolla `prechecks` fails on `docker_sdk` | Kolla needs Docker SDK on the control node: `pip install docker` inside the kolla-venv; Kolla uses the Docker API even with Podman |
| Kolla deploy fails with `UNREACHABLE` | Verify SSH key access from the deploy node to all inventory hosts; test with `ansible -i inventory-aio all -m ping` |
| Horizon `CSRF verification failed` | Set `ALLOWED_HOSTS` in `/etc/kolla/config/horizon/local_settings` to match your domain |
| Nova instances stuck in `SPAWNING` | Check `nova-compute` logs on the compute node: `sudo journalctl -u kolla-nova-compute`; common cause: missing Glance image or insufficient compute resources |
| Nova live migration fails | Verify compute nodes can reach each other on ports 16509 (libvirt) and 49152+ (QEMU migration); check `nova.conf` migration settings |
| Neutron DHCP not assigning IPs to instances | Check `neutron-dhcp-agent` is running; verify the network's `enable_dhcp` is `true`; check `neutron-metadata-agent` status |
| Floating IP not reachable | Verify the external network gateway is correctly configured; check security group rules allow ICMP; confirm the router's external gateway matches the floating IP pool |
| Keystone `401 Unauthorized` | Token may have expired — run `openstack token issue` again; check `OS_AUTH_URL` points to port 5000, not 35357 (deprecated admin port) |
| Glance image stuck `queued` | Check Glance API logs; if using Swift/MinIO backend, verify the backend credentials and connectivity; for local backend check disk space |
| Cinder volume stuck `creating` | Check `cinder-volume` service logs; if using LVM, verify the `cinder-volumes` VG exists and has free space: `sudo vgs` |
| Ceph pool `HEALTH_WARN: too few PGs` | Increase PG count: `ceph osd pool set <pool> pg_num 256`; wait for rebalancing before increasing further |
| Magnum cluster stuck `CREATE_IN_PROGRESS` | Check Heat stack events for the cluster: `openstack stack event list <cluster-stack-name> --follow`; common cause: Glance image wrong `os_distro` property |
| OpenStack-Helm pod `CrashLoopBackOff` | Check `kubectl logs -n openstack <pod>`; most common cause is database not ready — check MariaDB pod status first |
| `openstack` CLI `SSL: CERTIFICATE_VERIFY_FAILED` | Add `--insecure` flag or set `OS_CACERT=/path/to/ca.crt`; for Kolla, the CA is at `/etc/kolla/certificates/ca/root.crt` |
| RabbitMQ queues accumulating | A service is not consuming messages — check the dead service's logs; use `rabbitmqctl list_queues` to identify the backlog |
| MariaDB Galera cluster split-brain | Identify the most up-to-date node with `mysql -e "SHOW STATUS LIKE 'wsrep_last_committed'"`; bootstrap from that node |
