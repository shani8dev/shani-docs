---
title: First Boot
section: Installation
updated: 2026-08-20
---

# First Boot Configuration

## Plymouth BGRT Boot Theme

Shanios uses the **Plymouth BGRT** boot theme. Plymouth provides a smooth graphical boot experience, suppressing kernel and systemd messages from the screen. The BGRT (Boot Graphics Resource Table) theme reads the manufacturer's logo directly from the UEFI firmware and displays it during boot — providing a seamless transition from firmware to OS.

If LUKS2 full-disk encryption is enabled, Plymouth presents the passphrase prompt over the boot animation. With TPM2 auto-unlock enrolled, even this prompt is skipped and the disk unlocks silently.

## Initial Setup Wizard

After first deployment completes, the Initial Setup wizard guides you through:

- Creating your user account and setting a password
- Configuring network connections (Wi-Fi, wired)
- Setting language, locale, and keyboard layout
- Setting privacy preferences
- Enabling location services (optional)
- Customising appearance settings

The wizard runs automatically. If you skip it, re-run with `gnome-initial-setup` (GNOME) or from System Settings → Welcome (KDE).

**COSMIC edition:** there is no first-boot wizard. Your user account, language, and timezone were already collected by the installer itself, since COSMIC doesn't yet have an equivalent post-install setup app.

## After the Wizard — Recommended First Steps

- **Flathub is pre-configured.** No `flatpak remote-add` needed — open GNOME Software or KDE Discover and browse apps immediately.
- **Nix channel:** Nix is pre-installed and running. Add a channel before installing packages:
  ```bash
  nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs
  nix-channel --update
  ```
- **TPM2 enrollment (if you enabled encryption):** Run `sudo gen-efi enroll-tpm2` to enroll your LUKS key into TPM2 so the disk unlocks automatically at boot — no passphrase prompt. See the [TPM2 Enrollment](../security/tpm2) section.
- **Waydroid (Android apps):** Run `sudo waydroid-helper init` for automatic setup. Firewall rules are already configured. See the [Android section](../software/waydroid).
- **Secure Boot:** MOK enrollment is staged automatically during install, whether or not Secure Boot was enabled at the time. On this first boot, firmware/shim detects the pending request and launches **MokManager** for you — select **Enroll MOK**, confirm with the password when prompted, and reboot. If Secure Boot wasn't already on in firmware, enable it now that the key is enrolled. See the [Secure Boot section](../security/secure-boot).
- **Check current slot:** Run `cat /data/current-slot` to confirm whether you booted into `@blue` or `@green`.

## OEM & Fleet Deployment

Shanios is designed for OEM and fleet use. Every machine imaging from the same signed ISO will boot into an identical, verified state. The Initial Setup wizard runs on first user login per machine, so user-specific personalisation is captured without requiring per-device pre-configuration.

- Rollback never requires reimaging — the previous OS slot is always in the boot menu
- The boot-counting pipeline detects boot failures and automatically reverts the slot before the user sees an error
- All user-facing changes (`/etc` customisations, systemd units, SSH keys, service configs) are in the `@data` OverlayFS and survive every update and rollback without reimaging
- The Secure Boot MOK key is baked into the base image at build time, not generated per machine — every device imaged from the same signed ISO shares the same key fingerprint, so fleet enrollment (e.g. via firmware policy) can target one known key rather than a different one per device
- `passim` (local content sharing daemon) broadcasts available fwupd firmware payloads via mDNS — machines on the same LAN avoid downloading the same firmware repeatedly
