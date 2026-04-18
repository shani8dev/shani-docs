---
title: systemd-nspawn
section: Software & Apps
updated: 2026-05-07
---

# systemd-nspawn

`systemd-nspawn` is a lightweight container mechanism built directly into systemd. It runs a full Linux distribution — complete with an init system and its own namespace — without any daemon, image format, or external tooling. You point it at a directory containing a Linux root filesystem and it boots it.

On Shanios, `systemd-nspawn` is pre-installed with no configuration needed. Container root filesystems live in the `@machines` Btrfs subvolume at `/var/lib/machines`, completely independent of the OS slots. They survive every OS update and rollback untouched.

`machinectl` is the management tool — it handles pulling images, starting and stopping containers, logging in, and lifecycle management.

## When to Use nspawn

| | systemd-nspawn | LXD | Distrobox | Podman | QEMU/KVM |
|---|---|---|---|---|---|
| Purpose | Lightweight system containers | Full system containers | Dev/app containers | OCI app containers | Full VMs |
| Daemon required | No | Yes (lxd.socket) | No | No (socket-activated) | Yes |
| Full init system | Yes | Yes | No | No | Yes |
| Startup time | ~1s | ~3s | ~1s | ~0.1s | ~30s |
| Isolation | High | High | Low–medium | Medium | Full |

**Use systemd-nspawn when** you want a full Linux system container with zero setup — no daemon, no image format, no wizard. Pull a tarball, boot it. Best for isolated builds, service sandboxing, and quick system environment tests. For a richer operational layer (image catalog, port forwarding devices, resource limits), use [LXC/LXD](lxc-lxd.md).

## Quick Start: Arch Linux Container

```bash
# Pull an Arch Linux base image
sudo machinectl pull-tar --verify=no \
  https://geo.mirror.pkgbuild.com/images/latest/Arch-Linux-x86_64-basic.tar.zst \
  archlinux

# Start the container
sudo machinectl start archlinux

# Log in
sudo machinectl login archlinux

# List running containers
machinectl list

# Stop the container
sudo machinectl stop archlinux
```

The container root lives at `/var/lib/machines/archlinux` — a plain directory in the `@machines` subvolume.

## Pulling and Creating Container Images

`machinectl` can pull tar archives and raw disk images:

```bash
# Pull a tar archive (most common)
sudo machinectl pull-tar --verify=no \
  https://geo.mirror.pkgbuild.com/images/latest/Arch-Linux-x86_64-basic.tar.zst \
  archlinux

# List downloaded images
machinectl list-images

# Show image details
machinectl image-status archlinux
```

You can also bootstrap manually:

```bash
# Debian container via debootstrap
sudo debootstrap stable /var/lib/machines/debian-stable
sudo systemd-nspawn -D /var/lib/machines/debian-stable

# Arch container via pacstrap (on Shanios, pacman is available)
sudo mkdir /var/lib/machines/arch-custom
sudo pacstrap -c /var/lib/machines/arch-custom base
```

## Managing Containers

```bash
# Start a container (runs as a background systemd service)
sudo machinectl start archlinux

# Log in interactively
sudo machinectl login archlinux

# Run a single command without logging in
sudo machinectl shell archlinux /bin/bash -c "pacman -Syu --noconfirm"

# One-off shell via nspawn directly
sudo systemd-nspawn -D /var/lib/machines/archlinux

# Status and control
machinectl list
machinectl status archlinux
sudo machinectl stop archlinux
sudo machinectl reboot archlinux
sudo machinectl kill archlinux
```

## Auto-Start at Boot

```bash
# Enable auto-start
sudo machinectl enable archlinux

# Disable auto-start
sudo machinectl disable archlinux

# Manage the underlying unit directly
sudo systemctl status systemd-nspawn@archlinux.service
journalctl -u systemd-nspawn@archlinux.service
```

## Networking

By default, nspawn containers share the host network namespace — the container uses the host IP and can access the internet directly. This is the simplest setup for builds and tests.

For isolated networking with its own IP:

```bash
# Start with private networking (one-off)
sudo systemd-nspawn --network-veth -D /var/lib/machines/archlinux

# Persist via .nspawn config file
sudo mkdir -p /etc/systemd/nspawn
cat << 'EOF' | sudo tee /etc/systemd/nspawn/archlinux.nspawn
[Network]
Private=yes
VirtualEthernet=yes
EOF
sudo machinectl start archlinux
```

## Bind Mounts

```bash
# Bind a host directory at startup (one-off)
sudo systemd-nspawn \
  --bind=/home/$USER/projects:/projects \
  -D /var/lib/machines/archlinux

# Persist via .nspawn config
cat << 'EOF' | sudo tee /etc/systemd/nspawn/archlinux.nspawn
[Files]
Bind=/home/username/projects:/projects
Bind=/home/username/data:/data
EOF
```

## Btrfs Snapshots

Container roots live in `@machines` and participate in Btrfs snapshotting:

```bash
# Snapshot before making changes
sudo btrfs subvolume snapshot \
  /var/lib/machines/archlinux \
  /var/lib/machines/archlinux-snap-$(date +%Y%m%d)

# Restore: stop, delete current, rename snapshot
sudo machinectl stop archlinux
sudo btrfs subvolume delete /var/lib/machines/archlinux
sudo mv /var/lib/machines/archlinux-snap-20260501 /var/lib/machines/archlinux
sudo machinectl start archlinux

# Clone a container (built-in)
sudo machinectl clone archlinux archlinux-test

# Remove a container image
sudo machinectl remove archlinux-test
```

## Practical Patterns

### Isolated Build Environment

```bash
sudo machinectl start archlinux
sudo machinectl shell archlinux /bin/bash -c "
  pacman -Sy --noconfirm base-devel git
  useradd -m builder
"
sudo systemd-nspawn \
  --bind=/home/$USER/myproject:/build \
  -D /var/lib/machines/archlinux \
  su - builder -c "cd /build && makepkg -s"
```

### Testing a System Service

```bash
sudo machinectl start archlinux
sudo machinectl shell archlinux /bin/bash -c "
  pacman -Sy --noconfirm nginx
  systemctl enable --now nginx
"
# nginx runs under systemd inside the container, isolated from host
```

### Disposable Test Container

```bash
sudo machinectl clone archlinux arch-test
sudo machinectl start arch-test
sudo machinectl shell arch-test /bin/bash
# ... test things ...
sudo machinectl stop arch-test
sudo machinectl remove arch-test
```

## Storage

| Location | Subvolume |
|---|---|
| `/var/lib/machines/` | `@machines` |

The `@machines` subvolume is independent of both OS slots and survives all updates and rollbacks.
