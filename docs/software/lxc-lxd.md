---
title: LXC and LXD
section: Software & Apps
updated: 2026-05-07
---

# LXC and LXD

LXC and LXD provide full Linux system containers — a complete operating system (init system, services, network stack) inside an isolated environment that shares the host kernel. This sits between application containers (Podman) and full virtual machines (QEMU/KVM) in terms of isolation and overhead.

On Shanios, LXC and LXD are pre-installed with dedicated Btrfs subvolumes (`@lxc` and `@lxd`). `lxd.socket` is socket-activated. `lxcfs.service` is enabled — it virtualises `/proc/cpuinfo`, `/proc/meminfo`, and similar files so containers report per-container values rather than host totals. Containers survive every OS update and rollback untouched.

## When to Use LXD

| | Distrobox | Podman | systemd-nspawn | LXD | QEMU/KVM |
|---|---|---|---|---|---|
| Purpose | Dev/app containers | OCI app containers | Lightweight system containers | Full system containers | Full VMs |
| Shares home dir | Yes | No | No | No | No |
| Full init system | No | No | Yes | Yes | Yes |
| Startup time | ~1s | ~0.1s | ~1s | ~3s | ~30s |
| Daemon required | No | No | No | Yes (socket) | Yes |
| Isolation | Low–medium | Medium | High | High | Full |

**Use LXD when:**
- You need a complete isolated server environment (web server, database, multiple services with init)
- You want strong isolation without the overhead of a full VM
- You need LXD's image catalog, built-in port forwarding devices, or remote container management
- You want Btrfs-backed container snapshots managed via `lxc snapshot`

**Use systemd-nspawn** when you want the same full-system isolation with less setup — no init wizard, no daemon, no image format. See [systemd-nspawn](systemd-nspawn.md).

## Setup

`lxd.socket` is socket-activated on Shanios. Your user is automatically added to the `lxd` group during installation. Initialize LXD on first use:

```bash
# Interactive wizard (choose btrfs as storage backend)
sudo lxd init

# Or use defaults
sudo lxd init --auto

# Verify group membership
groups | grep lxd

# If missing:
sudo usermod -aG lxd $USER
# Log out and back in
```

When the wizard asks about the storage backend, choose **btrfs** — it integrates with the host Btrfs filesystem and maps into the `@lxd` subvolume.

## Creating and Managing Containers

```bash
# List available images
lxc image list images: | grep -i ubuntu
lxc image list images: | grep -i alpine
lxc image list images: | grep -i debian

# Launch a container (downloads image if needed)
lxc launch ubuntu:24.04 myubuntu
lxc launch debian:bookworm mydebian
lxc launch alpine:3.19 myalpine
lxc launch archlinux:current myarch

# List containers
lxc list

# Open a shell
lxc exec myubuntu -- bash

# Run a specific command
lxc exec myubuntu -- apt update
lxc exec myubuntu -- systemctl status nginx

# Stop, start, restart
lxc stop myubuntu
lxc start myubuntu
lxc restart myubuntu

# Delete
lxc delete myubuntu
lxc delete myubuntu --force    # force-delete a running container
```

## Networking

LXD creates a `lxdbr0` bridge by default and gives each container a private IP with NAT to the internet.

```bash
# Get a container's IP
lxc list

# Access a service inside the container from the host
lxc exec myubuntu -- ip addr show eth0   # e.g. 10.0.0.123
curl http://10.0.0.123:8080

# Forward a host port to a container port
lxc config device add myubuntu webport proxy \
  listen=tcp:0.0.0.0:8080 \
  connect=tcp:127.0.0.1:8080
# http://localhost:8080 on host now reaches port 8080 in the container
```

## Persistent Storage

```bash
# Mount a host directory into a container
lxc config device add myubuntu mydata disk \
  source=/home/$USER/projects \
  path=/home/ubuntu/projects

# Share a directory at a simpler path
lxc config device add myubuntu sharedfolder disk \
  source=/home/$USER/shared \
  path=/shared
```

## Snapshots

LXD supports fast Btrfs-backed snapshots:

```bash
# Create a snapshot
lxc snapshot myubuntu snap0
lxc snapshot myubuntu before-update

# List snapshots
lxc info myubuntu | grep -A 10 Snapshots

# Restore
lxc restore myubuntu snap0

# Delete a snapshot
lxc delete myubuntu/snap0
```

## LXD VMs

LXD can also launch full VMs (not just containers) using its `--vm` flag:

```bash
# Launch a VM (hardware-level isolation, own kernel)
lxc launch ubuntu:24.04 myvm --vm

# Manage identically to a container
lxc exec myvm -- bash
lxc stop myvm
```

## Practical Patterns

### Running a Web Server in Isolation

```bash
lxc launch ubuntu:24.04 webserver
lxc exec webserver -- apt update
lxc exec webserver -- apt install -y nginx
lxc exec webserver -- systemctl enable --now nginx

# Forward port 80 to host port 8080
lxc config device add webserver http proxy \
  listen=tcp:0.0.0.0:8080 \
  connect=tcp:127.0.0.1:80

curl http://localhost:8080
```

### Testing an Arch Configuration

```bash
lxc launch archlinux:current testarch
lxc exec testarch -- bash
# Inside: full Arch Linux with pacman
pacman -Syu && pacman -S some-package
exit
lxc delete testarch --force
```

### Running Multiple Database Versions Side by Side

```bash
lxc launch ubuntu:22.04 pg14
lxc exec pg14 -- apt install -y postgresql-14

lxc launch ubuntu:24.04 pg16
lxc exec pg16 -- apt install -y postgresql-16

# Both run simultaneously, fully isolated
```

## Storage

| Location | Subvolume |
|---|---|
| `/var/lib/lxc/` | `@lxc` |
| `/var/lib/lxd/` | `@lxd` |

Both subvolumes are independent of the OS slots and survive all updates and rollbacks.
