---
title: Virtual Machines
section: Software & Apps
updated: 2026-04-01
---

# Virtual Machines

Shanios ships a full virtualisation stack pre-installed and ready to use. VM disk images live in dedicated Btrfs subvolumes (`@libvirt` and `@qemu`) with `nodatacow` enabled for optimal disk I/O performance. These subvolumes persist across all system updates and rollbacks.

## Pre-installed Stack

- **libvirt** — VM management daemon (`libvirtd`), accessible via `virsh` and virt-manager
- **QEMU/KVM** — hardware-accelerated virtualisation
- **systemd-nspawn** — lightweight OS containers managed as systemd units (stored in `@machines`)
- **LXC/LXD** — full system containers with near-VM isolation (stored in `@lxc` / `@lxd`, `lxd.socket` enabled at boot)
- **GNOME Boxes** — simple VM manager (pre-installed on GNOME edition via Flatpak)
- **Virt-manager** — available via Flatpak for full libvirt GUI management

## GNOME Boxes

The simplest way to run VMs on Shanios. Pre-installed on the GNOME edition.

```bash
# Open from the app launcher, or:
flatpak run org.gnome.Boxes
```

Boxes handles downloading ISOs, creating VMs, and managing snapshots — no manual QEMU or libvirt configuration needed.

## Virt-Manager (Full libvirt GUI)

```bash
# Install virt-manager via Flatpak
flatpak install flathub org.virt_manager.virt-manager

# Or use virsh from the terminal
virsh list --all
virsh start myvm
virsh shutdown myvm
virsh snapshot-create-as myvm snap1
```

## QEMU/KVM — Command Line

```bash
# Check KVM is available
ls /dev/kvm
kvm-ok   # or: grep -c vmx /proc/cpuinfo  (Intel) / grep -c svm /proc/cpuinfo  (AMD)

# Quick VM from an ISO (2 CPU cores, 2 GB RAM)
qemu-system-x86_64 \
  -enable-kvm \
  -cpu host \
  -m 2G \
  -smp 2 \
  -cdrom ~/Downloads/ubuntu.iso \
  -drive file=~/vms/ubuntu.qcow2,format=qcow2 \
  -boot d

# Create a disk image
qemu-img create -f qcow2 ~/vms/myvm.qcow2 40G

# Check image info
qemu-img info ~/vms/myvm.qcow2
```

## systemd-nspawn (Lightweight OS Containers)

```bash
# Pull an Arch Linux base and boot it as a container
sudo machinectl pull-tar https://dl-cdn.alpinelinux.org/alpine/latest-stable/releases/x86_64/alpine-minirootfs-3.20.0-x86_64.tar.gz alpine

# List machines
machinectl list
machinectl list-images

# Start / stop a machine
sudo machinectl start alpine
sudo machinectl stop alpine

# Login to a running machine
sudo machinectl login alpine

# Enable a machine to start at boot
sudo machinectl enable alpine
```

## LXC / LXD

`lxd.socket` is enabled at boot. Your user is automatically added to the `lxc` and `lxd` groups during installation.

```bash
# Initialize LXD (first-time setup)
sudo lxd init --auto

# Launch a container
lxc launch ubuntu:24.04 mycontainer

# List running containers
lxc list

# Execute a command
lxc exec mycontainer -- bash

# Stop / delete
lxc stop mycontainer
lxc delete mycontainer

# Create a snapshot
lxc snapshot mycontainer snap1

# Launch a VM (not a container) with LXD
lxc launch ubuntu:24.04 myvm --vm
```

## Storage Layout

| Subvolume | Mount Point | Notes |
|---|---|---|
| `@libvirt` | `/var/lib/libvirt` | libvirt VM disk images — `nodatacow` |
| `@qemu` | `/var/lib/qemu` | Bare QEMU disk images — `nodatacow` |
| `@machines` | `/var/lib/machines` | systemd-nspawn containers |
| `@lxc` | `/var/lib/lxc` | LXC containers |
| `@lxd` | `/var/lib/lxd` | LXD container and VM storage |

`nodatacow` is set on `@libvirt` and `@qemu` because Copy-on-Write causes fragmentation and performance degradation for large, frequently-written VM disk files.

## VM Guest Tools (Running Shanios as a Guest)

If Shanios is running inside a VM (VMware, VirtualBox, QEMU/SPICE), guest tools are pre-installed:

- `spice-vdagent` — clipboard sharing, dynamic resolution for SPICE/QEMU
- `qemu-guest-agent` — host–guest coordination for QEMU
- `virtualbox-guest-utils` — VirtualBox additions
- `open-vm-tools` — VMware tools

These are grouped under `shani-video-guest.target` and activate automatically when the relevant package detects the VM environment.

## Tips

- Keep VM disk images in `/home` or the dedicated `@libvirt`/`@qemu` subvolumes — not in `/var` (volatile tmpfs)
- For Windows VMs, use VirtIO drivers for best disk and network performance
- For development environments that need a full OS, prefer **Distrobox** (lighter, shares your home directory) over a full VM
- LXD VMs offer a middle ground — hardware-level isolation with faster boot than QEMU
