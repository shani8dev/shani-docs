---
title: First Boot
section: Installation
updated: 2026-08-28
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

## After the Wizard — Recommended First Steps

- **Flathub is pre-configured.** No `flatpak remote-add` needed — open GNOME Software or KDE Discover and browse apps immediately.
- **Nix channel:** Nix is pre-installed and running. Add a channel before installing packages:
  ```bash
  nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs
  nix-channel --update
  ```
- **TPM2 enrollment (if you enabled encryption):** Run `sudo gen-efi enroll-tpm2` to enroll your LUKS key into TPM2 so the disk unlocks automatically at boot — no passphrase prompt. See the [TPM2 Enrollment](../security/tpm2.md) section.
- **Waydroid (Android apps):** Run `sudo waydroid-helper init` for automatic setup. Firewall rules are already configured. See the [Android section](../software/waydroid.md).
- **Secure Boot:** MOK enrollment is staged automatically during install, whether or not Secure Boot was enabled at the time. On this first boot, firmware/shim detects the pending request and launches **MokManager** for you — select **Enroll MOK**, confirm with the password when prompted, and reboot. If Secure Boot wasn't already on in firmware, enable it now that the key is enrolled. See the [Secure Boot section](../security/secure-boot.md).
- **Check current slot:** Run `cat /data/current-slot` to confirm whether you booted into `@blue` or `@green`.

## OEM & Fleet Deployment

Shanios is designed for OEM and fleet use. Every machine imaging from the same signed ISO will boot into an identical, verified state. The Initial Setup wizard runs on first user login per machine, so user-specific personalisation is captured without requiring per-device pre-configuration.

- Rollback never requires reimaging — the previous OS slot is always in the boot menu
- The boot-counting pipeline detects boot failures and automatically reverts the slot before the user sees an error
- All user-facing changes (`/etc` customisations, systemd units, SSH keys, service configs) are in the `@data` OverlayFS and survive every update and rollback without reimaging
- The Secure Boot MOK key is baked into the base image at build time, not generated per machine — every device imaged from the same signed ISO shares the same key fingerprint, so fleet enrollment (e.g. via firmware policy) can target one known key rather than a different one per device
- `passim` (local content sharing daemon) broadcasts available fwupd firmware payloads via mDNS — machines on the same LAN avoid downloading the same firmware repeatedly

## Verifying First Boot

After the Initial Setup wizard completes, run these checks:

```bash
# Confirm user exists and has correct groups
id $(whoami)
# Should show groups: wheel (and others)

# Confirm slot
cat /data/current-slot
# @blue (first install)

# Confirm Flatpak is working
flatpak remote-list
# Should show: flathub

# Confirm Nix is installed
nix --version

# Confirm Secure Boot status (if applicable)
mokutil --sb-state
# SecureBoot enabled (or "Setup Mode" if not yet enrolled)
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Initial Setup wizard doesn't appear | User account was created during install; wizard skips existing users | Re-run: `gnome-initial-setup` (GNOME) or System Settings → Welcome (KDE) |
| TPM2 enrollment fails (`gen-efi enroll-tpm2`) | TPM2 not enabled in BIOS, or TPM ownership not taken | Enable TPM 2.0 in BIOS; ensure `tpm2-tcti-service` is running |
| MokManager doesn't appear on first boot | Secure Boot was already enrolled during install | This is normal — MOK only prompts once; verify with `mokutil --sb-state` |
| Plymouth stuck on boot splash | Kernel panic or dracut failure hidden by splash | Remove `splash` from kernel cmdline in boot menu, or check `journalctl -b -1` |
| "No network" after first boot | Wi-Fi firmware not loaded; wired works | Install Wi-Fi firmware via Nix or Flatpak on wired connection, or use USB tethering temporarily |
| Waydroid init fails | Android container image download failed | Check internet; re-run `sudo waydroid-helper init` — firewall rules are pre-configured |
| Flatpak apps won't launch | Flatpak runtime not installed yet | Open GNOME Software / KDE Discover — first launch installs needed runtimes |
| Can't log in as admin | Initial Setup created a non-wheel user | Log in to the user, open terminal, run `sudo usermod -aG wheel $USER` |

## See Also

- [Installation Steps](./steps.md) — what the installer did before first boot
- [System Requirements](./requirements.md) — hardware prerequisites
- [Secure Boot](../security/secure-boot.md) — MOK enrollment details
- [TPM2 Auto-Unlock](../security/tpm2.md) — automatic LUKS unlock
- [Getting Started](../intro/getting-started.md) — full walkthrough
