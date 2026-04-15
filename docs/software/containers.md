---
title: Containers
section: Software & Apps
updated: 2026-04-01
---

# Containers

Shanios is a first-class container platform. Podman (rootless), Buildah, Skopeo, LXC, LXD, and Apptainer are all pre-installed. Container storage is in the dedicated `@containers` subvolume and persists across all OS updates.

## Podman (Rootless)

Podman is the default container runtime. It runs without a daemon and without root.

```bash
# Pull and run a container
podman run -it --rm ubuntu:24.04 bash

# Run in background
podman run -d --name myapp -p 8080:80 nginx

# List running containers
podman ps

# List all containers (including stopped)
podman ps -a

# Stop and remove
podman stop myapp
podman rm myapp
```

## podman-compose

```bash
# Run a compose file
podman-compose up -d

# View logs
podman-compose logs -f

# Stop
podman-compose down
```

## Podman as systemd Service

```bash
# Generate a systemd unit from a running container
podman generate systemd --new --name myapp > ~/.config/systemd/user/myapp.service

# Enable and start
systemctl --user enable --now myapp.service
```

## Buildah — Build Container Images

```bash
# Build from Dockerfile/Containerfile
buildah bud -t myimage:latest .

# Build without a Dockerfile (script-driven)
ctr=$(buildah from ubuntu:24.04)
buildah run $ctr -- apt-get update
buildah run $ctr -- apt-get install -y curl
buildah commit $ctr myimage:latest
buildah rm $ctr
```

## Skopeo — Image Management

```bash
# Copy an image between registries (no daemon needed)
skopeo copy docker://docker.io/nginx:latest docker://registry.example.com/nginx:latest

# Inspect an image without pulling
skopeo inspect docker://docker.io/ubuntu:24.04

# Delete a remote image
skopeo delete docker://registry.example.com/old-image:tag
```

## LXC / LXD — System Containers

LXC containers behave like lightweight VMs — full OS, init system, persistent.

```bash
# LXD: initialise on first use
sudo lxd init

# Launch an Ubuntu container
lxc launch ubuntu:24.04 mycontainer

# Open a shell
lxc exec mycontainer -- bash

# List containers
lxc list

# Stop and delete
lxc stop mycontainer
lxc delete mycontainer
```

## Apptainer (formerly Singularity)

Apptainer is designed for HPC and scientific workloads — runs images without root.

```bash
# Pull and run a Docker image
apptainer run docker://ubuntu:24.04

# Build an Apptainer image
apptainer build myimage.sif ubuntu.def

# Run with GPU access
apptainer run --nv myimage.sif
```

## Container Storage

All Podman container data lives in `~/.local/share/containers/` (rootless) and `/var/lib/containers/` (`@containers` subvolume for root). LXC/LXD data is in `@lxc` and `@lxd` subvolumes. All persist across OS updates and rollbacks.

```bash
# Disk usage
podman system df
du -sh ~/.local/share/containers/

# Prune unused images and containers
podman system prune -a
```
