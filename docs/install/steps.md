---
title: Installation Steps
section: Installation
updated: 2026-08-20
---

# Installation Steps

Installation takes approximately 10–15 minutes.

## Step-by-Step

1. **Boot from USB** — Press F12, F2, or Del during startup. Select your USB drive from the boot menu.
2. **Select "Install Shanios"** — Choose the installation option from the boot menu.
3. **Keyboard Layout** — Always asked, on every edition.
4. **Language & Region** — Select language and timezone. On the **GNOME and Plasma editions this page is skipped** — locale and timezone are configured later by the first-boot Initial Setup wizard instead. On the **COSMIC edition this page (and a user-account page) is shown during install**, because COSMIC does not yet have an equivalent first-boot wizard to defer to.
5. **Disk Selection** — Choose target disk and partitioning scheme (automatic recommended).
6. **Encryption (Optional)** — Enable LUKS2 full-disk encryption (argon2id key derivation). You'll be asked to enter the passphrase twice to confirm. Recommended for laptops and portable systems.
7. **Install** — The installer creates Btrfs subvolumes, installs the base system, and configures the bootloader.
8. **Reboot** — Remove USB drive when prompted and reboot into Shanios.

## What the Installer Sets Up

All of the following is completed by the installer (`install.sh` + `configure.sh`) **before** first boot — nothing heavy runs in the background on your first session:

- All Btrfs subvolumes are created: `@root`, `@home`, `@data`, `@nix`, `@cache`, `@log`, `@flatpak`, `@snapd`, `@waydroid`, `@containers`, `@machines`, `@lxc`, `@lxd`, `@libvirt`, `@qemu`, `@swap`
- The system image is extracted into `shanios_base`, snapshotted to `@blue` (read-only), then snapshotted again to `@green`. The active slot is written to `/data/current-slot` (`blue`)
- The Flatpak store is extracted and snapshotted into `@flatpak`. If Snap seed was included on the ISO, it is extracted into `@snapd`
- The swapfile is created in `@swap` using `btrfs filesystem mkswapfile` sized to match RAM. If there isn't enough free disk space for a full-RAM swapfile, this step is skipped entirely and the system falls back to zram for swap
- Keyboard layout is always configured via `chroot`; locale, timezone, user account, and autologin are configured the same way, unless deferred to the first-boot wizard (see step 4 above)
- Secure Boot: the MOK signing key is normally already baked into the system image at build time — the installer just verifies the keypair and re-signs the bootloader/kernel with it. Keys are only generated fresh on the spot if they're missing or invalid, which is a fallback path, not the common case. Either way, both UKIs (`shanios-blue.efi`, `shanios-green.efi`) are built using `dracut --force --uefi` and signed with the MOK key, and MOK enrollment is staged automatically so you just confirm it in MokManager on first boot (see [First Boot](./first-boot))
- `/etc/crypttab` is generated with the LUKS UUID and `none` key field if encryption was chosen
- Firewall rules for KDE Connect and Waydroid are applied via `firewall-offline-cmd`

On first boot, `beesd-setup.service` configures the deduplication daemon for the Btrfs volume UUID. On GNOME and Plasma, the Initial Setup wizard then runs for user-facing personalisation; on COSMIC there is no such wizard since the account, language, and timezone were already collected during install.
