---
title: System Updates
section: Updates & Config
updated: 2026-05-13
---

# System Updates

Shanios updates are atomic — the running system is never modified. Updates are written to the inactive slot, verified, and activated on the next reboot. The previous slot is preserved as an instant rollback target.

## Automatic Updates

`shani-update` is the user-facing update manager. It runs automatically via a desktop autostart entry at login (after a 15-second delay) and via a systemd user timer that fires 15 minutes after boot and then every 2 hours.

On each run, `shani-update` works through a fixed priority sequence:

1. **Hard failure detection** — if a dracut pre-mount hook recorded a `boot_hard_failure` marker (root filesystem failed to mount), offers immediate rollback. This is distinct from a soft fallback-boot and requires manual action.
2. **Fallback boot detection** — if the last boot failed and the system fell back to the standby slot, offers to roll back the broken slot.
3. **Reboot-needed check** — if a staged update is waiting, shows a restart dialog.
4. **Candidate boot check** — if you're running a freshly deployed slot, offers a rollback window.
5. **Update check** — fetches release metadata and, if a newer version is available, shows an install dialog.

When the user confirms an update, `shani-update` detects the available terminal emulator and launches `shani-deploy` inside it.

```bash
# Check timer status
systemctl --user status shani-update.timer

# View update manager logs
cat ~/.cache/shani-update.log
journalctl -t shani-update -n 50

# Run an immediate interactive check
shani-update
```

## Manual Update

```bash
# Download, verify, and stage the update
sudo shani-deploy

# Simulate without making any changes (dry-run)
sudo shani-deploy -d

# Force redeploy even if already on the latest version
sudo shani-deploy -f

# Verbose output
sudo shani-deploy -v

# Override the update channel for a single run
sudo shani-deploy -t latest
```

## Update Process in Detail

1. **Self-update check** — downloads a newer version of `shani-deploy` itself if available and re-execs
2. **Slot detection** — determines the active and candidate slots
3. **Space check** — verifies at least 10 GB free on the Btrfs filesystem
4. **Fetch metadata** — downloads the latest release manifest from the CDN (R2 primary, SourceForge fallback)
5. **Download** — streams the image with resume support via `aria2c`, `wget`, or `curl`
6. **SHA256 verify** — verifies checksum after download
7. **GPG verify** — verifies signature against the Shani OS GPG key (`7B927BFFD4A9EAAA8B666B77DE217F3DA8014792`)
8. **Snapshot** — takes a timestamped Btrfs snapshot of the inactive slot before writing
9. **Extract** — pipes the verified image into `btrfs receive`
10. **UKI generation** — runs `gen-efi configure <inactive-slot>` inside a chroot of the new slot
11. **Boot entry update** — new slot set as next-boot default with `+3-0` boot count tries
12. **Notify** — writes `/run/shanios/reboot-needed`; your session continues until you choose to reboot

Nothing in your running OS is touched at any point.

## Rolling Back

```bash
# Roll back from the currently booted slot (restores the inactive slot from its last snapshot)
sudo shani-deploy -r
sudo reboot
```

Or select the **(Candidate)** entry from the systemd-boot menu at startup (press Space to show the menu).

**Important:** Run rollback from the OS copy you want to keep. If you are on `@blue` and want to revert `@green`, run rollback from `@blue`.

## Update Channels

```bash
# Check current channel
cat /etc/shani-channel

# Switch default channel permanently
sudo shani-deploy --set-channel stable   # monthly validated builds (default)
sudo shani-deploy --set-channel latest   # more frequent, pre-QA releases

# Use a channel for one run only
sudo shani-deploy -t latest
```

## Boot Counting and Automatic Fallback

After an update, the new slot is registered in systemd-boot with `+3-0` boot count tries. If the new slot fails to boot three times, systemd-boot automatically falls back to the previous slot — no user action required.

Shanios uses two tiers of boot failure detection:

| Tier | Marker | Trigger | Action |
|------|--------|---------|--------|
| Hard failure | `/data/boot_hard_failure` | Root filesystem mount failed (dracut pre-mount hook) | Manual: `shani-deploy --rollback` |
| Soft failure | `/data/boot_failure` | System booted but never reached `multi-user.target` within 15 minutes | Automated rollback offered by `shani-update` |

On first login after a fallback, `shani-update` detects the mismatch and shows a dialog offering to roll back the failed slot.

## Storage Management

```bash
# Remove old backup snapshots and cached downloads
sudo shani-deploy -c

# Run on-demand block deduplication (complements background bees deduplication)
sudo shani-deploy -o

# Check storage health and subvolume sizes
shani-health --storage-info

# Check individual subvolume sizes directly
sudo btrfs filesystem du -s --human-readable /
sudo btrfs filesystem du -s --human-readable /home
sudo btrfs filesystem du -s --human-readable /var/lib/flatpak
```

## Flatpak Auto-Updates

Flatpak apps update separately from the OS. Two timers handle this — one system-wide, one per-user:

```bash
# Manual Flatpak update
flatpak update

# View installed Flatpaks
flatpak list --app

# Check Flatpak update timers
systemctl status flatpak-update-system.timer
systemctl --user status flatpak-update-user.timer
```

The system timer fires 15 minutes after boot and every 12 hours. The user timer does the same for per-user Flatpak remotes. Both automatically uninstall unused runtimes after updating.

## Firmware Updates (fwupd)

```bash
sudo fwupdmgr refresh
sudo fwupdmgr get-updates
sudo fwupdmgr update
```

> After a firmware update, PCR 0 changes. Re-enroll TPM2 if you are using automatic LUKS unlock:
> ```bash
> sudo gen-efi cleanup-tpm2
> sudo gen-efi enroll-tpm2
> ```
> See [TPM2 Enrollment](../security/tpm2).
