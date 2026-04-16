---
title: Containers
section: Software & Apps
updated: 2026-04-01
---

# Containers on Shanios

Shanios is a first-class container platform. **Podman** (rootless), **Buildah**, **Skopeo**, **LXC/LXD**, **Apptainer**, and **systemd-nspawn** are all pre-installed. Container storage is located in dedicated Btrfs subvolumes (e.g., `@containers`, `@machines`) ensuring your data persists across all OS updates and atomic rollbacks.

## 📦 Podman (Default Runtime)

Podman is the default daemonless, rootless container runtime.

### Basic Commands
```bash
# Pull and run an interactive container
podman run -it --rm ubuntu:24.04 bash

# Run a web server in the background
podman run -d --name myapp -p 8080:80 nginx

# List containers
podman ps           # Running
podman ps -a        # All (including stopped)

# Stop and remove
podman stop myapp
podman rm myapp
```

### Podman Compose
```bash
# Run a docker-compose.yml
podman-compose up -d

# View logs
podman-compose logs -f

# Teardown
podman-compose down
```

### Run Containers as Systemd Services
```bash
# Generate a user systemd unit from a running container
podman generate systemd --new --name myapp > ~/.config/systemd/user/myapp.service

# Enable auto-start for the container
systemctl --user enable --now myapp.service
```

## 🛠 Buildah & Skopeo

**Buildah**: Build OCI images without a daemon.
```bash
# Build from Containerfile/Dockerfile
buildah bud -t myimage:latest .

# Build without Dockerfile (scripted)
ctr=$(buildah from ubuntu:24.04)
buildah run $ctr -- apt-get update
buildah run $ctr -- apt-get install -y curl
buildah commit $ctr myimage:latest
buildah rm $ctr
```

**Skopeo**: Manage images directly in registries.
```bash
# Copy image between registries (no pull needed)
skopeo copy docker://docker.io/nginx:latest docker://registry.example.com/nginx:latest

# Inspect image metadata
skopeo inspect docker://docker.io/ubuntu:24.04

# Delete remote tag
skopeo delete docker://registry.example.com/old-image:tag
```

## 🐧 LXC / LXD (System Containers)

LXC containers provide a full OS environment with its own init system.

```bash
# Initialize LXD (create pools/networks)
sudo lxd init

# Launch a container
lxc launch ubuntu:24.04 my-vm

# Access shell
lxc exec my-vm -- bash

# Snapshotting (Instant with Btrfs)
lxc snapshot my-vm backup-01

# Restore
lxc restore my-vm backup-01
```

## 🐧 systemd-nspawn (Lightweight OS Containers)

`systemd-nspawn` is ideal for lightweight build environments or testing other distributions without the overhead of full virtualization.

### Create & Boot
```bash
# Create a directory for the OS (must be empty)
sudo mkdir -p /var/lib/machines/fedora-dev

# Bootstrap Fedora (requires debootstrap or dnf)
sudo dnf -y install dnf
sudo dnf --releasever=39 --installroot=/var/lib/machines/fedora-dev -y group install "Core"

# Boot the container
sudo systemd-nspawn -bD /var/lib/machines/fedora-dev
```

### Management with `machinectl`
```bash
# List active machines
machinectl list

# Open shell in a running machine
machinectl shell fedora-dev

# Enable persistent boot (creates unit file)
machinectl enable fedora-dev

# Start/Stop/Restart
sudo machinectl start fedora-dev
sudo machinectl poweroff fedora-dev
```

### Configuration (`.nspawn` files)
Place settings in `/etc/systemd/nspawn/machine.nspawn` to customize:
```ini
[Exec]
Boot=yes
User=developer

[Network]
VirtualEthernet=yes
Bridge=br0
```

## 🧪 Apptainer (HPC / Science)

Apptainer runs containers securely without root, often used in HPC clusters.

```bash
# Pull Docker image to SIF format
apptainer pull ubuntu.sif docker://ubuntu:24.04

# Run the SIF
apptainer run ubuntu.sif

# Run with GPU support
apptainer run --nv ubuntu.sif
```

## 📂 Container Storage

Shanios stores container data in dedicated Btrfs subvolumes that are **excluded from system updates**:

| Tool | Storage Location | Btrfs Subvolume |
|------|------------------|-----------------|
| **Podman (User)** | `~/.local/share/containers/` | (User Home) |
| **Podman (Root)** | `/var/lib/containers/storage/` | `@containers` |
| **LXD** | `/var/lib/lxd/` | `@lxd` |
| **nspawn** | `/var/lib/machines/` | `@machines` |

### Maintenance
```bash
# Check disk usage
podman system df

# Prune unused images/containers
podman system prune -a
```
