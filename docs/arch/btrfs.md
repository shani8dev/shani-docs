---
title: Btrfs Deep Dive
section: Architecture
updated: 2026-08-28
---

# Btrfs Deep Dive

Shanios leverages advanced Btrfs features for immutability, efficiency, and data integrity.

## Copy-on-Write (CoW)

Btrfs CoW minimises storage duplication:

- Shared data blocks between `@blue` and `@green` — only the delta is stored
- Typical dual-root overhead is ~18% over a single installation
- Efficient atomic updates: writing to the inactive slot never touches the live one
- Cheap snapshots: snapshot creation is nearly instantaneous regardless of subvolume size

At install time, `@blue` and `@green` are not created independently — the installer extracts the OS image into a subvolume, snapshots it read-only as `@blue`, then snapshots `@blue` again as `@green`. Both slots therefore start out as CoW clones of the exact same data. Every subsequent `shani-deploy` update repeats the pattern against whichever slot is currently inactive: snapshot the old candidate as a `@<slot>_backup_<timestamp>` safety copy, `btrfs receive` the new image, then snapshot it into place as the new `@<slot>` — so the CoW delta between slots only ever reflects one update's worth of changed blocks.

## Transparent Compression

Default mount options for all data subvolumes:

```
compress=zstd,space_cache=v2,autodefrag
```

- Reduces disk usage by 30–50% for typical workloads
- Minimal CPU overhead with zstd
- Improves SSD lifespan by reducing write amplification
- `autodefrag` periodically defragments small random-write files in the background

## Subvolumes with nodatacow

Specific subvolumes disable CoW for performance:

- **`@swap`:** CoW must be disabled for swap files — Btrfs requires it, and compression is also disabled
- **`@libvirt`:** VM disk images benefit from direct writes (no snapshot overhead)
- **`@qemu`:** Bare QEMU VM disk images

These subvolumes use `nodatacow,nospace_cache` and do not participate in bees deduplication.

## Mount Options by Subvolume

| Subvolume(s) | Mount Options | Notes |
|---|---|---|
| `@blue` / `@green` | `ro,noatime,compress=zstd,space_cache=v2,autodefrag` | Mounted by dracut via kernel cmdline — **not in fstab** |
| `@root`, `@home`, `@data` | `rw,noatime,compress=zstd,space_cache=v2,autodefrag` | Core persistent data — always mounted |
| `@nix` | `nofail,noatime,compress=zstd,space_cache=v2,autodefrag` | CoW kept for bees deduplication |
| `@log`, `@cache` | `nofail,noatime,compress=zstd,space_cache=v2,autodefrag,x-systemd.after=var.mount,x-systemd.requires=var.mount` | `nofail` plus requires `/var` to exist first |
| `@flatpak`, `@snapd`, `@waydroid`, `@containers`, `@machines`, `@lxc`, `@lxd` | `nofail,noatime,compress=zstd,space_cache=v2,autodefrag,x-systemd.after=var.mount,x-systemd.requires=var.mount` | `nofail` — boots cleanly even if not yet created |
| `@libvirt`, `@qemu` | `nofail,noatime,nodatacow,nospace_cache,x-systemd.after=var.mount,x-systemd.requires=var.mount` | nodatacow required for VM disk performance |
| `@swap` | `nofail,noatime,nodatacow,nospace_cache` | Mandatory for swapfile correctness on Btrfs |

## Why noatime?

All subvolumes use `noatime`:

- Prevents writing to disk every time a file is read
- Significantly reduces SSD wear
- Improves battery life on laptops
- No impact on most applications (relatime/noatime is a Debian/Ubuntu default too)

## Manual Snapshots

```bash
# Create a read-only snapshot of /home (best practice for backups)
sudo btrfs subvolume snapshot -r /home /data/snapshots/home-$(date +%Y%m%d)

# Create a writable snapshot
sudo btrfs subvolume snapshot /home /data/snapshots/home-writable

# List all subvolumes and snapshots
sudo btrfs subvolume list /

# Show details of a specific snapshot
sudo btrfs subvolume show /data/snapshots/home-20260427

# Delete an old snapshot to free space
sudo btrfs subvolume delete /data/snapshots/home-20240601

# Send snapshot to another drive (full backup)
sudo btrfs send /data/snapshots/home-20250101 | sudo btrfs receive /mnt/backup/

# Incremental send (only sends the diff)
sudo btrfs send -p /data/snapshots/home-20250101 /data/snapshots/home-20250201 \
  | sudo btrfs receive /mnt/backup/
```

> **Snapshots are not backups** if they live on the same disk — a disk failure loses both. Use `btrfs send` to an external drive, or `restic`/`rclone` for cloud storage. See [Backup & Recovery](../system/backup.md) for a complete backup strategy.

## Btrfs Manual Maintenance

```bash
# Disk usage (more accurate than df for Btrfs)
sudo btrfs filesystem usage /
sudo btrfs filesystem df /
sudo btrfs filesystem du -s --human-readable /data

# Scrub — verify checksums, repair if possible
sudo btrfs scrub start /
sudo btrfs scrub status /
sudo btrfs scrub cancel /

# Balance — redistribute data across devices / fix metadata
sudo btrfs balance start /
sudo btrfs balance start -dusage=50 -musage=50 /   # safer partial balance
sudo btrfs balance status /

# Device statistics — read/write errors per device
sudo btrfs device stats /

# Fix ENOSPC ("no space left" even though df shows free space)
# Remove old snapshots first, then:
sudo btrfs balance start -musage=0 /

# Quotas (track space per subvolume)
sudo btrfs quota enable /
sudo btrfs qgroup show --sync /

# Inspect swapfile offset (needed for hibernation resume=)
# This is exactly what gen-efi runs to compute resume_offset= for the UKI cmdline.
sudo btrfs inspect-internal map-swapfile -r /swap/swapfile
```

## Checking Deduplication Status

Shanios uses `bees` (Block-level Extent Enumeration and Sharing) for continuous background deduplication. `bees` is a block-level deduplicator — it finds identical 128 KB blocks across all subvolumes and shares them via Btrfs extent references.

```bash
# Check bees daemon status (UUID is your Btrfs filesystem UUID)
sudo systemctl status "beesd@*"

# View recent dedup activity
sudo journalctl -u "beesd@*" --since today | grep -E "dedup|hash|block|crawl"

# Check compression ratio per subvolume
sudo compsize /
sudo compsize /home
sudo compsize /nix
sudo compsize /var/lib/flatpak

# Full storage usage report
shani-health --storage-info
```

`bees` is configured by `beesd-setup` which writes `/etc/bees/<uuid>.conf` and enables the `beesd@<uuid>.service` unit. The hash table size is automatically tuned to 256 MB per TB of filesystem size (capped at 1 GB for 4+ TB filesystems).

## Manual Deduplication (`shani-deploy --optimize`)

`bees` runs continuously in the background across every subvolume, but `shani-deploy` also ships a heavier, on-demand pass using [`duperemove`](https://github.com/markfasheh/duperemove) — a block-hashing deduplicator rather than a live crawler. Run it manually with:

```bash
sudo shani-deploy --optimize
```

This is a different tool with a narrower scope than `bees`:

- **Targets only `@blue`, `@green`, and any leftover `@<slot>_backup_<timestamp>` snapshots** — not the whole filesystem
- Runs `duperemove -dhr --skip-zeroes --dedupe-options=same,partial -b 128K --batchsize=256 --io-threads=$(nproc) --cpu-threads=$(nproc)`, optionally with `--hashfile=/data/.dedupe.db` as a persistent cache (skipped if `@data` is missing)
- Requires `duperemove` to be installed; refuses to run if a deployment is currently pending (`$DEPLOY_PENDING`), or if `@blue`/`@green` don't both exist
- Reports before/after usage via `compsize` (or `btrfs filesystem du` as a fallback) and a final `btrfs filesystem df`

Use `--optimize` after a deploy or two if you want to reclaim the CoW delta between root slots immediately rather than waiting for `bees`' background crawl to catch up — it's a maintenance convenience, not a replacement for the continuous `beesd` daemon.

## Automated Maintenance

Shanios runs Btrfs maintenance automatically via systemd timers — no manual intervention required:

| Timer | Action |
|-------|--------|
| `btrfs-scrub.timer` | Monthly scrubbing to detect and repair data corruption |
| `btrfs-balance.timer` | Periodic filesystem balancing for optimal performance |
| `btrfs-defrag.timer` | Automatic defragmentation on fragmented files |
| `btrfs-trim.timer` | Regular TRIM operations for SSD optimisation |
| `beesd` daemon | Continuous background block-level deduplication across all Btrfs subvolumes |

```bash
# Check timer status and next run times
systemctl status btrfs-scrub.timer btrfs-balance.timer btrfs-defrag.timer
systemctl list-timers btrfs-*
```

## See Also

- [Filesystem Structure](filesystem)
- [Snapshots & Backup guide](https://blog.shani.dev/post/shani-os-btrfs-snapshots-and-backup)
- [Storage Management](../system/storage.md)
