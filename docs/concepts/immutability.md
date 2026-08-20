---
title: Immutability
section: Concepts
updated: 2026-08-20
---

# Understanding Immutability

Shanios's immutability fundamentally changes how you interact with the system. Understanding this concept is key to using Shanios effectively.

## What "Immutable" Actually Means Here

The root filesystem lives in one of two Btrfs subvolumes, `@blue` or `@green`, and whichever one is active is mounted read-only (`rootflags=...,ro,...` on the kernel cmdline). Both are complete, bootable copies of the OS — there is no single shared `/` that mutates in place. `/usr`, `/bin`, `/lib`, and the rest of the base system are read-only for the entire life of that slot; the only way they change is a full slot replacement by [`shani-deploy`](./atomic-updates), never an in-place write. See [Blue-Green Deployment](./blue-green) for how the two slots relate, and [Persistence Strategy](./persistence) for exactly what's writable and where it lives.

## What You CAN Do

- ✅ Install applications via Flatpak
- ✅ Edit configuration files in `/etc`
- ✅ Create and modify files in `/home`
- ✅ Run containers (Podman, Distrobox, LXC)
- ✅ Update the entire system atomically
- ✅ Store data in `/data` and persistent subvolumes

## What You CANNOT Do

- ❌ Use pacman to install traditional packages (*use Flatpak, Nix, or Distrobox*)
- ❌ Modify files in `/` (root filesystem) (*read-only by design*)
- ❌ Edit files in `/usr`, `/bin`, `/lib` directly (*use `/etc` overlay for configs, Distrobox for binaries*)
- ❌ Install software that requires system-level changes (*use containers or AppImages instead*)
- ❌ Run `sudo pip install` globally (*use `pip install --user`, Nix, or Distrobox*)
- ❌ Run `sudo npm install -g` to system paths (*use Nix or install inside Distrobox*)
- ❌ Use `make install` to install built software into system directories (*build and export from Distrobox*)
- ❌ Modify files in `/opt` or `/usr/share` directly (*/etc overlay for config; Distrobox for everything else*)

## Why This Design?

### Security
Malware cannot modify system files or persist across reboots.

### Reliability
Updates are atomic — they either work completely or fail safely.

### Rollback
Instant recovery from failed updates or system issues.

### Consistency
System state is always predictable and reproducible. The same image that was deployed is the same image that runs — indefinitely, regardless of what software is installed or run on top.
