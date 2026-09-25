---
title: System Updates
section: Updates & Config
updated: 2026-08-28
---

# System Updates

Shanios updates are atomic — the running system is never modified. Updates are written to the inactive slot, verified, and activated on the next reboot. The previous slot is preserved as an instant rollback target.

## Updates and Notifications

Shani Cassini is the user-facing update manager. Its **Updates & Rollback** page calls `shani-deploy` to install updates, change channels, and roll back to the previous system.

The per-user `shani-cassini-agent.timer` starts with your desktop session. It runs the agent two minutes later, then every two hours with a small random delay. Each run executes `shani-cassini --agent` and reads `shani-deploy --status --check --json`. The agent sends a notification when:

- a boot failure was recorded;
- the current slot is the first boot of a newly deployed system;
- a staged update needs a restart; or
- a newer version is available on the selected channel.

Choose **Open** in a notification to start Shani Cassini on **Updates & Rollback**. The agent only checks and notifies. It does not install an update or run a rollback itself.

> **Auto-reboot is opt-in.** Once `shani-deploy` finishes successfully, the new slot is ready to boot into whenever convenient. It does not reboot on its own unless `AUTO_REBOOT=yes` was set. See [Automatic Reboot After Deployment](#automatic-reboot-after-deployment) below.

```bash
# Check the per-user timer
systemctl --user status shani-cassini-agent.timer

# View agent logs
journalctl --user -u shani-cassini-agent.service -n 50

# Open the page directly
shani-cassini --section=updates
```

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
| `-r`, `--rollback` | From the updated system: make the previous system the default again (nothing is deleted; reboot to use it). From the older system after a fallback: repair the other slot from its pre-update backup |
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

**The new slot is fully deployed and bootable as soon as `shani-deploy` finishes — rebooting promptly is not required.** By default, `shani-deploy` does **not** reboot automatically; reboot whenever it's convenient to switch into the new slot. This applies every time, not just to interactive runs.

```bash
# Opt into an automatic reboot 60 seconds after a successful deployment
sudo AUTO_REBOOT=yes shani-deploy

# Change the delay for a single run (seconds)
sudo AUTO_REBOOT=yes AUTO_REBOOT_DELAY=300 shani-deploy

# Cancel a pending automatic reboot (if AUTO_REBOOT=yes armed one)
systemctl stop shanios-auto-reboot.timer
```

When enabled, auto-reboot is still skipped entirely in `--dry-run` mode, and is armed via a transient systemd timer unit (`shanios-auto-reboot.timer`) so it survives even if the terminal running `shani-deploy` is closed — cancel it with the command above if you need more time before rebooting.

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
12. **Notify** — writes `/run/shanios/reboot-needed` so the Shani Cassini agent can surface a restart notification on its next run
13. **Auto-reboot** — opt-in only (`AUTO_REBOOT=yes`); the new slot is ready immediately and reboot is left to your convenience by default (see [Automatic Reboot After Deployment](#automatic-reboot-after-deployment) below)

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

### Channel Mechanics

The two channels differ in how builds reach them, not in what they contain:

- **`latest`** receives every build that passes automated checks, continuously — as soon as a build is published, it's available on this channel.
- **`stable`** is promoted from `latest`, never built separately. A build only reaches `stable` after soaking there through a QA window and passing validation.

Promotion is done via `build.sh promote-stable` upstream. Because the QA soak is qualitative rather than time-boxed, there's no fixed lag between `latest` and `stable` — expect days, not hours, but don't treat any specific number as an SLA.

Switching channels persists to `/etc/shani-channel` and applies to all future runs:

```bash
sudo shani-deploy --set-channel latest

# Check what each remote currently offers before switching
sudo shani-deploy --channel-status stable
sudo shani-deploy --channel-status latest
```

Recommendation: for personal machines, `latest` is fine — rollback exists either way. For fleets or mission-critical systems, stay on `stable` and stagger deployments across machines so one bad build can't hit everything at once.

## Boot Counting and Automatic Fallback

After an update, the new slot is registered in systemd-boot with `+3-0` boot count tries. If the new slot fails to boot three times, systemd-boot automatically falls back to the previous slot — no user action required.

Shanios uses two tiers of boot failure detection:

| Tier | Marker | Trigger | Action |
|------|--------|---------|--------|
| Hard failure | `/data/boot_hard_failure` | Root filesystem mount failed (dracut pre-mount hook) | Manual: `shani-deploy --rollback` |
| Soft failure | `/data/boot_failure` | System booted but never reached `multi-user.target` within 15 minutes | Automatic system recovery, with a Shani Cassini agent notification linking to **Updates & Rollback** |

After login, the Shani Cassini agent reads the boot state through `shani-deploy --status --check --json`. If a fallback or recovery failure is recorded, it sends a notification that opens **Updates & Rollback**, where you can manage the rollback.

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
> See [TPM2 Enrollment](../security/tpm2.md).

## See Also

- [System Health Checks](shani-health) — automated monitoring and diagnostics
- [System Config](config) — /etc overlay, locale, hostname, services
- [Shell & Environment](shell) — Zsh, Starship, Nix, CLI tools
- [User Provisioning](user-setup) — automatic group and shell setup
- [Shani Reset](shani-reset) — factory reset of persistent state
- [Blue-Green Deployment](../concepts/blue-green.md) — the two-slot architecture
- [Troubleshooting](../troubleshooting.md) — diagnosing update and boot issues
