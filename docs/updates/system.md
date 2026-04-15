---
title: System Updates
section: Updates & Config
updated: 2026-04-01
---

# System Updates

Shanios updates are atomic — the running system is never modified. Updates are written to the inactive slot, verified, and activated on the next reboot. The previous slot is preserved as an instant rollback target.

## Automatic Updates

The `shani-update.timer` unit checks for new releases periodically. When a new version is found, a GUI dialog (yad, zenity, or kdialog depending on your desktop) prompts for approval before downloading.

```bash
# Check timer status
systemctl status shani-update.timer

# View update check logs
journalctl -u shani-update.service --since today
```

## Manual Update

```bash
# Check if an update is available
shani-deploy --check

# Download and apply the update (prompts for confirmation)
shani-deploy --update

# Non-interactive update (for scripting)
shani-deploy --update --yes
```

## Update Process in Detail

1. **Check** — compares current slot version against latest release manifest
2. **Download** — fetches the compressed image from R2 CDN (SourceForge as fallback); aria2c provides resume support
3. **Verify** — SHA256 checksum and GPG signature checked; refuses to proceed on failure
4. **Snapshot** — Btrfs read-only snapshot taken of the current inactive slot (extra rollback point)
5. **Extract** — new image written into the inactive slot
6. **Sign** — `gen-efi` rebuilds and signs the new slot's UKI
7. **Boot entry** — new slot set as next default with `+3-0` tries; current slot relabelled as Candidate
8. **Notify** — reboot prompt shown; your session continues until you choose to reboot

## Rolling Back

```bash
# Rollback to the previous slot
pkexec shani-deploy --rollback
```

Or select the **(Candidate)** entry from the systemd-boot menu at startup (press Space or any key to show the menu).

## Storage Management

```bash
# View disk usage breakdown (Btrfs-aware)
shani-deploy --storage-info

# Run bees deduplication pass
shani-deploy --optimize

# Check individual subvolume sizes
sudo btrfs filesystem du -s --human-readable /
sudo btrfs filesystem du -s --human-readable /home
sudo btrfs filesystem du -s --human-readable /var/lib/flatpak
```

## Flatpak Auto-Updates

Flatpak apps update separately from the OS, on their own timer:

```bash
# Check Flatpak update timers
systemctl status flatpak-update-system.timer
systemctl status flatpak-update-user.timer

# Manual Flatpak update
flatpak update

# View installed Flatpaks
flatpak list --app
```

## Firmware Updates (fwupd)

Hardware firmware updates are handled by fwupd and the GNOME/KDE update integrations:

```bash
# Check for firmware updates
sudo fwupdmgr refresh
sudo fwupdmgr get-updates

# Apply firmware updates
sudo fwupdmgr update
```

> After a firmware update, re-enroll TPM2 if you are using automatic LUKS unlock. See [TPM2 Enrollment](../security/tpm2).
