---
title: Containers
section: Software & Apps
updated: 2026-05-07
---

# Containers on Shanios

Shanios is a first-class container platform. The following runtimes are pre-installed and ready to use:

| Runtime | Best for | Wiki |
|---|---|---|
| **Podman** | OCI containers, services, databases, Docker-compatible workflows | This page |
| **Distrobox** | Mutable Linux envs (apt/pacman/yay) with home dir sharing | [distrobox](distrobox.md) |
| **LXC / LXD** | Full system containers with init, services, network stack | [lxc-lxd](lxc-lxd.md) |
| **systemd-nspawn** | Lightweight full-system containers, no daemon | [systemd-nspawn](systemd-nspawn.md) |
| **Apptainer** | HPC/cluster portable containers (SIF format) | [apptainer](apptainer.md) |
| **GPU containers** | CUDA / ROCm / oneAPI compute via Distrobox or Podman | [gpu-containers](gpu-containers.md) |

Container storage lives in dedicated Btrfs subvolumes, completely independent of the OS slots:

| Tool | Storage Location | Btrfs Subvolume |
|------|-----------------|-----------------|
| **Podman (user)** | `~/.local/share/containers/` | (in `@home`) |
| **Podman (root)** | `/var/lib/containers/storage/` | `@containers` |
| **Distrobox** | `/var/lib/containers/` | `@containers` |
| **LXD** | `/var/lib/lxd/` | `@lxd` |
| **LXC** | `/var/lib/lxc/` | `@lxc` |
| **nspawn** | `/var/lib/machines/` | `@machines` |

All subvolumes survive every OS update and atomic rollback untouched.

---

## Podman (Default Runtime)

Podman is the default daemonless, rootless container runtime. Its CLI is identical to Docker's. `podman.socket` is socket-activated at boot. The `podman-docker` drop-in is pre-installed — existing `docker` commands work without modification.

**Pods** (pre-installed on both editions) provides a graphical interface for managing containers, images, volumes, and networks.

### Basic Commands

```bash
# Pull and run an interactive container
podman run -it --rm ubuntu:24.04 bash

# Run a web server in the background
podman run -d --name myapp -p 8080:80 nginx

# List containers
podman ps           # running
podman ps -a        # all (including stopped)

# Logs
podman logs myapp
podman logs -f myapp

# Stop, remove
podman stop myapp
podman rm myapp

# Execute in a running container
podman exec -it myapp bash

# List images
podman images
```

### Common Services

```bash
# PostgreSQL
podman volume create postgres-data
podman run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=mydb \
  -v postgres-data:/var/lib/postgresql/data \
  -p 127.0.0.1:5432:5432 \
  postgres:16

# Redis
podman run -d \
  --name redis \
  -p 127.0.0.1:6379:6379 \
  redis:7-alpine redis-server --appendonly yes
```

### Podman Compose

```bash
# Run a docker-compose.yml
podman-compose up -d
podman-compose logs -f
podman-compose down

# Or via the docker drop-in
docker compose up -d
```

### Auto-Start Containers at Login

```bash
# Generate a systemd user unit from a running container
podman generate systemd --new --name myapp > ~/.config/systemd/user/myapp.service

# Enable
systemctl --user enable --now myapp.service
systemctl --user status myapp.service
```

### Docker Compatibility

The `podman-docker` package provides `/usr/bin/docker` as a wrapper. For tools that use the Docker API socket:

```bash
# Enable the Podman socket for Docker API compatibility
systemctl --user start podman.socket
export DOCKER_HOST=unix:///run/user/$UID/podman/podman.sock
```

---

## Buildah & Skopeo

**Buildah** builds OCI images without a daemon:

```bash
# Build from a Dockerfile/Containerfile
buildah bud -t myimage:latest .

# Scripted build without a Dockerfile
ctr=$(buildah from ubuntu:24.04)
buildah run $ctr -- apt-get update
buildah run $ctr -- apt-get install -y curl
buildah commit $ctr myimage:latest
buildah rm $ctr
```

**Skopeo** inspects and copies images between registries without pulling them:

```bash
# Copy between registries
skopeo copy docker://docker.io/nginx:latest docker://registry.example.com/nginx:latest

# Inspect image metadata without pulling
skopeo inspect docker://docker.io/ubuntu:24.04

# Delete a remote tag
skopeo delete docker://registry.example.com/old-image:tag
```

---

## Storage Efficiency

Container images use content-addressed storage — layers shared between images are stored once. Btrfs zstd compression and the `bees` deduplication daemon apply at the block level on top of Podman's own layer sharing.

```bash
# Podman's view of disk usage
podman system df

# Btrfs compressed view
sudo compsize /var/lib/containers

# Prune unused images, containers, volumes
podman system prune -af --volumes
```
