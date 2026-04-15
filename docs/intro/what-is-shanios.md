---
title: What is Shanios?
section: Introduction
updated: 2026-04-01
---

# What is Shanios?

Shanios is an immutable Linux distribution that brings enterprise DevOps practices to desktop computing. Built on Arch Linux with Btrfs filesystem, it provides atomic updates, instant rollback, and system integrity by design. It ships as two editions — **GNOME** and **KDE Plasma** — and works out of the box with no post-install tweaking required.

## Core Pillars

- **Immutability:** The root filesystem (`/`) is mounted read-only. System binaries and libraries cannot be changed at runtime — by you, by software, or by malware. The only way to modify the OS is through the controlled `shani-deploy` update pipeline.
- **Blue-Green Deployment:** Two complete system images (`@blue` and `@green`) are maintained. While one is active, updates are written to the other. On reboot you switch to the updated image. The previous one is kept as a one-command rollback target.
- **Atomic Updates:** Updates are all-or-nothing. The running system is never touched during an update. If something goes wrong, boot failure is detected automatically and the system rolls back — your work is never interrupted.
- **Selective Persistence:** User data, configuration changes (`/etc` overlay), Flatpak apps, containers, VMs, and service credentials all live in dedicated Btrfs subvolumes that survive every update and rollback, always.
- **Defence-in-Depth Security:** Six Linux Security Modules run simultaneously (`lsm=landlock,lockdown,yama,integrity,apparmor,bpf`), LUKS2 argon2id full-disk encryption, TPM2 auto-unlock, Secure Boot with MOK, Intel ME disabled by default, and every OS image is SHA256+GPG verified before deployment.
- **Zero Telemetry:** No usage data, crash reports, analytics, or tracking of any kind — ever. The entire codebase is public on GitHub; every claim is independently verifiable.

## Traditional vs Immutable OS

| Layer | Traditional Linux | Shanios (Immutable) |
|-------|------------------|---------------------|
| `/boot/efi` (ESP — FAT32) | ✏️ Writable — accidental overwrites possible | 🔒 Mounted only during updates — UKIs Secure Boot signed per slot |
| `/usr /bin /lib /sbin` | ✏️ Writable — any process can corrupt system binaries | 🔒 Read-only root — kernel-enforced, no writes possible |
| `/etc /opt` | ✏️ Writable — config drift accumulates silently | ⚙️ Writable overlay — changes persist, base untouched |
| `/var` (logs, state, spool) | ✏️ Mixed — grows unbounded, hard to audit | 🔄 Volatile base + selectively persisted service state |
| `/home` (user data) | ✏️ Writable — no snapshot isolation by default | ✅ Persistent — Btrfs snapshots available on demand |

### Traditional Consequences

- ❌ A bad update can leave system unbootable
- ❌ Dependency conflicts corrupt shared libraries
- ❌ Rollback requires manual snapshot discipline
- ❌ System state drifts from original install
- ❌ Any exploited process can modify `/usr /bin`
- ❌ No cryptographic verification of boot chain

### Shanios Guarantees

- ✅ Atomic updates — all or nothing, never half-applied
- ✅ Instant rollback — previous slot always on disk
- ✅ Verified boot chain — SHA256 + GPG + Secure Boot
- ✅ No system drift — root replaced wholesale each update
- ✅ IMA/EVM runtime integrity measurement active
- ✅ Six LSMs active simultaneously (AppArmor, Landlock…)
