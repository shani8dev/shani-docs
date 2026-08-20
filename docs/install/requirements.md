---
title: System Requirements
section: Installation
updated: 2026-08-20
---

# System Requirements

## Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Processor | x86_64 dual-core with VT-x/AMD-V | x86_64 quad-core or better |
| Memory | 4 GB RAM | 8 GB RAM or more |
| Storage | 32 GB (dual-image architecture) | 64 GB or more |
| Firmware | UEFI (required) | UEFI with TPM 2.0 |
| Installation Media | 8 GB USB drive | 16 GB USB 3.0 drive |

> **Why 32GB minimum?** Shanios maintains two complete system images (`@blue` and `@green`) for atomic updates. However, Btrfs Copy-on-Write shares unchanged data between them, resulting in only ~18% overhead compared to traditional systems. In practice the installer itself only refuses disks smaller than 28 GB — the lower enforced floor accounts for the real usable capacity of media nominally sold as "32 GB" (partition tables, wear-leveling, etc.), but 32 GB+ is still what we recommend for comfortable headroom.

## Disk Partition Layout

Shanios uses a simple two-partition layout — there are no separate `/home`, `/var`, or swap partitions. All subvolumes live within the single Btrfs partition.

| Partition | Filesystem | Size | Purpose |
|-----------|-----------|------|---------|
| EFI System Partition (ESP) | FAT32 | 1 GB | Bootloader, UKI images — mounted at `/boot/efi` |
| Root partition | Btrfs (or LUKS2 → Btrfs) | Remainder of disk | All system subvolumes (`@blue`, `@green`, `@home`, `@data`, etc.) |

When full-disk encryption is chosen, the Btrfs partition is wrapped in a LUKS2 container (`/dev/mapper/shani_root`), formatted with the argon2id key-derivation function. The ESP is never encrypted — only the root partition is.

## Firmware Requirements

- **UEFI required** — legacy BIOS is not supported
- **Secure Boot** — optional but recommended; Shanios signs its bootloader and kernel with a MOK (Machine Owner Key) that is baked into the system image at build time — every machine installed from the same signed ISO shares the same key
- **TPM 2.0** — optional; required for automatic LUKS2 unlock without passphrase

## Not Supported

- Legacy BIOS / CSM mode
- 32-bit (x86) CPUs
- Dual-boot configurations (not recommended — other OSes may break the bootloader)
