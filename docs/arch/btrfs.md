---
title: Btrfs Deep Dive
section: Architecture
updated: 2026-04-01
---

# Btrfs Deep Dive

Shanios leverages advanced Btrfs features for immutability, efficiency, and data integrity.

## Copy-on-Write (CoW)

Btrfs CoW minimizes storage duplication:

- Shared data blocks between `@blue` and `@green`
- Only ~18% overhead despite dual root system
- Modified blocks consume additional space
- Efficient updates even with two complete systems

## Transparent Compression

Default mount options:
```
compress=zstd,space_cache=v2,autodefrag
```

- Reduces disk usage by 30–50%
- Minimal CPU overhead
- Improves SSD lifespan

## Subvolumes with nodatacow

Specific subvolumes disable CoW for performance:

- **`@swap`:** CoW disabled for swap files (required by Btrfs; compression also disabled)
- **`@libvirt`:** VM disk images benefit from direct writes
- **`@qemu`:** Bare QEMU VM disk images

## Mount Options by Subvolume

| Subvolume(s) | Mount Options | Notes |
|---|---|---|
| `@blue` / `@green` | `ro,noatime,compress=zstd,space_cache=v2,autodefrag` | Mounted by dracut via kernel cmdline — not in fstab |
| `@root`, `@home`, `@data` | `rw,noatime,compress=zstd,space_cache=v2,autodefrag` | Core persistent data — always mounted |
| `@nix` | `nofail,noatime,compress=zstd,space_cache=v2,autodefrag` | CoW kept for bees deduplication |
| `@flatpak`, `@snapd`, `@waydroid`, `@containers`, `@machines`, `@lxc`, `@lxd` | `nofail,noatime,compress=zstd,space_cache=v2,autodefrag` | `nofail` — boots cleanly even if not yet created |
| `@libvirt`, `@qemu` | `nofail,noatime,nodatacow,nospace_cache` | nodatacow required for VM disk performance |
| `@swap` | `nofail,noatime,nodatacow,nospace_cache` | Mandatory for swapfile correctness on Btrfs |

## Why noatime?

All subvolumes use `noatime`:

- Prevents writing to disk every time a file is read
- Significantly reduces SSD wear
- Improves battery life on laptops
- No impact on most applications

## Manual Snapshots

```bash
# Create a read-only snapshot of /home (best practice for backups)
sudo btrfs subvolume snapshot -r /home /data/snapshots/home-$(date +%Y%m%d)

# Create a writable snapshot
sudo btrfs subvolume snapshot /home /data/snapshots/home-writable

# List all subvolumes and snapshots
sudo btrfs subvolume list /

# Delete an old snapshot to free space
sudo btrfs subvolume delete /data/snapshots/home-20240601

# Send snapshot to another drive (incremental backup)
sudo btrfs send /data/snapshots/home-20250101 | sudo btrfs receive /mnt/backup/
# Incremental send (only sends the diff)
sudo btrfs send -p /data/snapshots/home-20250101 /data/snapshots/home-20250201 \
  | sudo btrfs receive /mnt/backup/
```

> **Snapshots are not backups** if they live on the same disk — a disk failure loses both. Use `btrfs send` to an external drive, or `restic`/`rclone` for cloud storage.

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

```bash
# Check bees daemon status
sudo systemctl status "beesd@*"

# View recent dedup activity
sudo journalctl -u "beesd@*" --since today | grep -E "dedup|hash|block|crawl"

# Check compression ratio per subvolume
sudo compsize /
sudo compsize /home
sudo compsize /nix
sudo compsize /var/lib/flatpak

# Full storage usage report
sudo shani-deploy --storage-info
```
