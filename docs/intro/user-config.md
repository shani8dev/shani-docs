---
title: User Configuration
section: Introduction
updated: 2026-04-01
---

# User Configuration

The primary user is automatically configured with appropriate permissions during installation. Shanios also watches for newly created users: the `shani-user-setup.path` unit monitors `/etc/passwd` for changes and triggers `shani-user-setup.service` whenever a new regular user (UID 1000–59999) is detected. That service automatically adds the user to all required groups and sets their default shell to `/bin/zsh`.

This means any user created post-installation via the GUI or `useradd`/`adduser` gets the same setup automatically.

## User Groups

| Group | Purpose |
|-------|---------|
| `wheel` | Sudo privileges for system administration |
| `input` | Direct input device access (keyboards, mice, controllers) |
| `realtime` | Real-time scheduling, HPET/RTC access for audio production and low-latency gaming |
| `video` | GPU and video hardware access |
| `sys` | Hardware monitoring and sensor access |
| `cups`, `lp` | Printer management and job submission |
| `scanner` | Scanner device access |
| `nixbld` | Nix build users group — required for the Nix package manager daemon |
| `lxc`, `lxd` | LXC/LXD container management without root |
| `kvm` | Virtual machine management (KVM hardware access) |
| `libvirt` | libvirt VM management via `virsh` and virt-manager |

## Firewall Rules

Pre-configured rules are applied at installation time:

- **KDE Connect/GSConnect:** Ports opened in public zone for device pairing, file transfer, notifications, remote control
- **Waydroid:** DNS (53/udp, 67/udp), packet forwarding enabled, waydroid0 in trusted zone
