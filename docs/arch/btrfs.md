---
title: Btrfs Deep Dive
section: Architecture
updated: 2026-05-13
---

# Btrfs Deep Dive

Shanios leverages advanced Btrfs features for immutability, efficiency, and data integrity.

## Copy-on-Write (CoW)

Btrfs CoW minimises storage duplication:

- Shared data blocks between `@blue` and `@green` — only the delta is stored
- Typical dual-root overhead is ~18% over a single installation
- Efficient atomic updates: writing to the inactive slot never touches the live one
- Cheap snapshots: snapshot creation is nearly instantaneous regardless of subvolume size

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
| `@log`, `@cache` | `rw,noatime,compress=zstd,space_cache=v2,autodefrag,x-systemd.after=var.mount,x-systemd.requires=var.mount` | Requires `/var` to exist first |
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

> **Snapshots are not backups** if they live on the same disk — a disk failure loses both. Use `btrfs send` to an external drive, or `restic`/`rclone` for cloud storage. See [Backup & Recovery](../networking/backup) for a complete backup strategy.

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
sudo btrfs inspect-internal map-swapfile -r /@swap/swapfile
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
