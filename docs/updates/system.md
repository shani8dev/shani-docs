---
title: System Updates
section: Updates & Config
updated: 2026-08-21
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

> **Auto-reboot applies here too.** Once `shani-deploy` finishes successfully — including when launched unattended by the timer — it arms its own 60-second automatic reboot regardless of who or what started it. See [Automatic Reboot After Deployment](#automatic-reboot-after-deployment) below if you need to cancel it.

```bash
# Check timer status
systemctl --user status shani-update.timer

# View update manager logs
cat ~/.cache/shani-update.log
journalctl -t shani-update -n 50

# Run an immediate interactive check
shani-update
```

### shani-update Flags

`shani-update` is mostly a GUI-driven wrapper, but it also accepts CLI flags that mirror (and, for install/deploy actions, pass through to) `shani-deploy`:

| Flag | Effect |
|------|--------|
| `--startup` | Run the login flow: fallback check → reboot-needed check → candidate check → update check |
| `-r`, `--rollback` | Roll back the inactive slot immediately |
| `-f`, `--force` | Force deploy even if the version matches or there's a slot mismatch |
| `-t`, `--channel <chan>` | Update channel for this run: `stable` or `latest` |
| `-v`, `--verbose` | Verbose output from `shani-deploy` |
| `-d`, `--dry-run` | Simulate the deployment without changes |
| `-c`, `--cleanup` | Passthrough: `shani-deploy --cleanup` |
| `-o`, `--optimize` | Passthrough: `shani-deploy --optimize` |
| `--download-only` | Passthrough: `shani-deploy --download-only` |
| `--set-channel <chan>` | Passthrough: `shani-deploy --set-channel` (persists to `/etc/shani-channel`) |
| `--skip-self-update` | Passthrough on install: `shani-deploy --skip-self-update` |
| `--update-genefi` | Passthrough on install: `shani-deploy --update-genefi` |
| `--health [ARGS...]` | Forwards remaining arguments to `shani-health` (e.g. `shani-update --health --security`) — must be last on the command line |
| `-h`, `--help` | Show usage |

Running `shani-update` with no flags does the interactive flow: fallback check → reboot-needed check → candidate-boot check → update check, showing a GUI dialog (yad/zenity/kdialog) at whichever step applies, falling back to a desktop notification or console prompt if no GUI toolkit is available.

## Manual Update

```bash
# Download, verify, and stage the update
sudo shani-deploy

# Simulate without making any changes (dry-run)
sudo shani-deploy -d

# Force redeploy even if already on the latest version, or if the
# candidate slot doesn't match what's expected (boot mismatch)
sudo shani-deploy -f

# Verbose output
sudo shani-deploy -v

# Override the update channel for a single run
sudo shani-deploy -t latest

# Fetch and verify the update image only — exits before deploying
sudo shani-deploy --download-only
```

### Full Flag Reference

| Flag | Effect |
|------|--------|
| `-h`, `--help` | Show usage |
| `-r`, `--rollback` | Roll back the non-booted slot (run from the slot you want to keep) |
| `-c`, `--cleanup` | Manual cleanup of old backups and cached downloads |
| `-o`, `--optimize` | Manual Btrfs deduplication (bees handles continuous dedup in the background) |
| `-t`, `--channel <chan>` | Update channel for this run only: `stable` or `latest` |
| `-f`, `--force` | Deploy even if the version matches or there's a boot mismatch |
| `--download-only` | Fetch and verify the update image, then exit without deploying |
| `-d`, `--dry-run` | Simulate without making changes |
| `-v`, `--verbose` | Verbose output |
| `--set-channel <chan>` | Permanently persist the channel to `/etc/shani-channel` |
| `--skip-self-update` | Skip `shani-deploy`'s own auto-update-and-re-exec step |
| `--update-genefi` | Download the latest `gen-efi` from upstream and use it inside the deploy chroot only (does not install it to the host) |

`--download-only` cannot be combined with `--rollback`, `--cleanup`, `--optimize`, or `--set-channel`.

## Automatic Reboot After Deployment

**After any successful deployment, `shani-deploy` automatically reboots the machine 60 seconds later** — whether the deploy was started manually, by `shani-update`, or by the timer running unattended in the background. This applies every time, not just to interactive runs.

```bash
# Cancel a pending automatic reboot (must run before the 60s elapse)
systemctl stop shanios-auto-reboot.timer

# Disable auto-reboot for a single run
sudo AUTO_REBOOT=no shani-deploy

# Change the delay for a single run (seconds)
sudo AUTO_REBOOT_DELAY=300 shani-deploy
```

Auto-reboot is skipped entirely in `--dry-run` mode. It is armed via a transient systemd timer unit (`shanios-auto-reboot.timer`) so it survives even if the terminal running `shani-deploy` is closed — cancel it with the command above if you need more time before rebooting.

## Update Process in Detail

1. **Self-update check** — downloads a newer version of `shani-deploy` itself if available and re-execs
2. **Slot detection** — determines the active and candidate slots
3. **Space check** — verifies at least 10 GB free on the Btrfs filesystem
4. **Fetch metadata** — downloads the latest release manifest from the CDN (R2 primary, SourceForge fallback)
5. **Download** — if a previous image is still cached locally and `zsync2` is installed, tries a differential fetch first (only the changed blocks); otherwise streams the full image with resume support via `aria2c`, `wget`, or `curl`. See [Differential Downloads](#differential-downloads-zsync2) below.
6. **SHA256 verify** — verifies checksum after download, regardless of which download path produced the file
7. **GPG verify** — verifies signature against the Shani OS GPG key (`7B927BFFD4A9EAAA8B666B77DE217F3DA8014792`)
8. **Snapshot** — takes a timestamped Btrfs snapshot of the inactive slot before writing
9. **Extract** — pipes the verified image into `btrfs receive`
10. **UKI generation** — runs `gen-efi configure <inactive-slot>` inside a chroot of the new slot
11. **Boot entry update** — new slot set as next-boot default with `+3-0` boot count tries
12. **Notify** — writes `/run/shanios/reboot-needed` so `shani-update` can surface a restart dialog on next login
13. **Auto-reboot** — arms a 60-second automatic reboot (see [Automatic Reboot After Deployment](#automatic-reboot-after-deployment) below); cancel it if you need more time

Nothing in your running OS is touched at any point.

## Differential Downloads (zsync2)

Each release image gets a `.zsync` control file alongside it, generated at build time. When `zsync2` is installed and a previous image is still cached in `/data/downloads/` (normally left there from your last update), `shani-deploy` tries a differential fetch first — pulling only the blocks that changed since that cached image — before falling back to a full download.

This is an optimization, not a trust boundary: `zsync2` is an actively developing, upstream-experimental tool, so any problem with it (not installed, no cached image to diff against, timeout, failure) silently falls through to the ordinary full download via `aria2c`/`wget`/`curl`. Whichever path produced the file, it still goes through the same SHA256 and GPG verification afterward — a differential download is never trusted on its own, only the verified result is.

There's nothing to configure: this only ever runs against R2 (where the control file's embedded URL always points), and only when a local seed image is actually available.

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

The system timer fires 15 minutes after boot and every 12 hours; the user timer fires 20 minutes after boot and every 12 hours, for per-user Flatpak remotes. Both automatically uninstall unused runtimes after updating.

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
