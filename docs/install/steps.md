---
title: Installation Steps
section: Installation
updated: 2026-04-01
---

# Installation Steps

Installation takes approximately 10–15 minutes.

## Step-by-Step

1. **Boot from USB** — Press F12, F2, or Del during startup. Select your USB drive from the boot menu.
2. **Select "Install Shanios"** — Choose the installation option from the boot menu.
3. **Language & Region** — Select language, timezone, and keyboard layout.
4. **Disk Selection** — Choose target disk and partitioning scheme (automatic recommended).
5. **Encryption (Optional)** — Enable LUKS2 full-disk encryption. Recommended for laptops and portable systems.
6. **Install** — The installer creates Btrfs subvolumes, installs the base system, and configures the bootloader.
7. **Reboot** — Remove USB drive when prompted and reboot into Shanios.

## What the Installer Sets Up

All of the following is completed by the installer (`install.sh` + `configure.sh`) **before** first boot — nothing heavy runs in the background on your first session:

- All Btrfs subvolumes are created: `@root`, `@home`, `@data`, `@nix`, `@cache`, `@log`, `@flatpak`, `@snapd`, `@waydroid`, `@containers`, `@machines`, `@lxc`, `@lxd`, `@libvirt`, `@qemu`, `@swap`
- The system image is extracted into `shanios_base`, snapshotted to `@blue` (read-only), then snapshotted again to `@green`. The active slot is written to `/data/current-slot` (`blue`)
- The Flatpak store is extracted and snapshotted into `@flatpak`. If Snap seed was included on the ISO, it is extracted into `@snapd`
- The swapfile is created in `@swap` using `btrfs filesystem mkswapfile` sized to match RAM
- Locale, keyboard, timezone, hostname, user account, and autologin are configured via `chroot`
- MOK keys are generated, Secure Boot components installed, and both UKIs (`shanios-blue.efi`, `shanios-green.efi`) are built using `dracut --force --uefi` and signed with the MOK key
- `/etc/crypttab` is generated with the LUKS UUID and `none` key field if encryption was chosen
- Firewall rules for KDE Connect and Waydroid are applied via `firewall-offline-cmd`

On first boot, `beesd-setup.service` configures the deduplication daemon for the Btrfs volume UUID. The Initial Setup wizard then runs for user-facing personalisation.
