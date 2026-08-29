---
title: Storage
section: System
updated: 2026-08-28
---

# Storage

This page covers raw disk and block-device management on Shani OS: inspecting drives, partitioning, filesystem operations, SMART health monitoring, and the udisks2 layer used by desktop tools.

For encrypted volumes see [LUKS Management](../security/luks.md). For Btrfs-specific operations (snapshots, subvolumes, scrub) see [Btrfs Deep Dive](../arch/btrfs.md). For backup strategy see [Backup & Recovery](backup).

---

## Inspecting Block Devices

```bash
# List all block devices with sizes and mount points
lsblk

# Detailed view including filesystem type and UUID
lsblk -f

# Show all disks with model, size, and type (rotational/SSD/NVMe)
lsblk -d -o NAME,SIZE,ROTA,TYPE,MODEL

# List partition table for a specific disk
sudo fdisk -l /dev/sda
sudo fdisk -l /dev/nvme0n1

# Show disk UUIDs and labels (useful for fstab)
blkid
sudo blkid /dev/sda1

# Detailed hardware info for a disk
sudo hdparm -I /dev/sda          # ATA drives
sudo nvme id-ctrl /dev/nvme0     # NVMe drives

# Show disk serial, firmware, and transport
sudo smartctl -i /dev/sda
```

---

## Partitioning

### fdisk — Interactive Partitioner (MBR & GPT)

```bash
sudo fdisk /dev/sda
```

Common fdisk commands inside the prompt:

| Key | Action |
|-----|--------|
| `p` | Print current partition table |
| `n` | New partition |
| `d` | Delete partition |
| `t` | Change partition type |
| `g` | Create new GPT table |
| `o` | Create new MBR table |
| `w` | Write and exit |
| `q` | Quit without saving |

### gdisk — GPT-only Partitioner

```bash
sudo gdisk /dev/sda
```

### parted — Scriptable Partitioner

```bash
# Print partition table
sudo parted /dev/sda print

# Create a new GPT table (destructive)
sudo parted /dev/sda mklabel gpt

# Create a partition (start and end in MiB/GiB/%)
sudo parted /dev/sda mkpart primary ext4 1MiB 100GiB

# Resize a partition (filesystem must be resized separately)
sudo parted /dev/sda resizepart 1 200GiB

# Non-interactive (scripted)
sudo parted -s /dev/sdb mklabel gpt mkpart primary 1MiB 100%
```

**GUI:** `partitionmanager` (pre-installed on KDE Plasma) wraps the same partitioning operations above in a graphical interface, including resizing filesystems in place.

---

## Filesystems

### Creating Filesystems

```bash
# ext4
sudo mkfs.ext4 /dev/sda1
sudo mkfs.ext4 -L "mydata" /dev/sda1    # with label

# Btrfs
sudo mkfs.btrfs /dev/sda1
sudo mkfs.btrfs -L "data" -d single /dev/sda1

# XFS
sudo mkfs.xfs /dev/sda1

# FAT32 (USB drives, EFI)
sudo mkfs.vfat -F32 /dev/sdb1

# exFAT
sudo mkfs.exfat /dev/sdb1

# F2FS (flash-optimized, good for SD cards/USB flash)
sudo mkfs.f2fs /dev/sdb1

# NTFS (for drives shared with Windows)
sudo mkfs.ntfs -f /dev/sdb1
```

Resizing a FAT partition specifically (rather than the generic `parted`/`gdisk` steps above) can be done with `fatresize`:

```bash
sudo fatresize -s 8G /dev/sdb1
```

### Mounting

```bash
# Mount a filesystem
sudo mount /dev/sda1 /mnt

# Mount with options
sudo mount -o noatime,compress=zstd /dev/sda1 /mnt    # Btrfs
sudo mount -o ro /dev/sda1 /mnt                        # Read-only

# Mount by UUID (preferred in scripts)
sudo mount UUID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx /mnt

# Mount an ISO image
sudo mount -o loop image.iso /mnt

# Unmount
sudo umount /mnt

# Lazy unmount (detaches when no longer busy)
sudo umount -l /mnt

# Show all currently mounted filesystems
mount | column -t
findmnt
findmnt --real    # physical mounts only
```

### Checking and Repairing

```bash
# ext4 — must be unmounted first
sudo e2fsck -f /dev/sda1

# Btrfs — can be run on a mounted filesystem (read-only check)
sudo btrfs check /dev/sda1
sudo btrfs scrub start /          # Online scrub (finds and fixes errors)
sudo btrfs scrub status /

# XFS — must be unmounted
sudo xfs_repair /dev/sda1

# FAT/exFAT
sudo fsck.vfat /dev/sdb1
```

### Resizing

```bash
# ext4 — grow (filesystem must be mounted or unmounted)
sudo resize2fs /dev/sda1           # fill the partition
sudo resize2fs /dev/sda1 50G       # specific size

# Btrfs — grow or shrink while mounted
sudo btrfs filesystem resize +20G /mountpoint
sudo btrfs filesystem resize max /mountpoint   # fill partition

# XFS — grow only, must be mounted
sudo xfs_growfs /mountpoint
```

---

## LVM — Logical Volume Management

`lvm2` is pre-installed, giving you a resizable-volume layer beneath any non-Btrfs filesystem (the Shanios OS itself uses Btrfs subvolumes instead of LVM — this is for additional drives or manual partitioning where you want LVM's flexibility).

```bash
# Create a physical volume on a partition
sudo pvcreate /dev/sdb1

# Create a volume group from one or more physical volumes
sudo vgcreate data-vg /dev/sdb1 /dev/sdc1

# Create a logical volume (10G) inside the volume group
sudo lvcreate -L 10G -n data-lv data-vg

# Format and mount it like any block device
sudo mkfs.ext4 /dev/data-vg/data-lv
sudo mount /dev/data-vg/data-lv /mnt/data

# Inspect PVs, VGs, and LVs
sudo pvs
sudo vgs
sudo lvs

# Grow a logical volume and its filesystem
sudo lvextend -L +5G /dev/data-vg/data-lv
sudo resize2fs /dev/data-vg/data-lv   # ext4; use xfs_growfs for XFS

# LVM snapshots (point-in-time copy-on-write)
sudo lvcreate -L 2G -s -n data-lv-snap /dev/data-vg/data-lv
```

`udisks2-lvm2` (also pre-installed) exposes basic LVM management through the desktop's disk utility GUI (GNOME Disks, KDE Partition Manager) for simple cases.

---

## mdadm — Software RAID

`mdadm` is pre-installed for Linux software RAID (`md` devices) — an alternative to LVM or hardware RAID for combining multiple drives.

```bash
# Create a RAID 1 (mirror) array from two drives
sudo mdadm --create /dev/md0 --level=1 --raid-devices=2 /dev/sdb1 /dev/sdc1

# Check array status
cat /proc/mdstat
sudo mdadm --detail /dev/md0

# Save the array configuration so it reassembles automatically on boot
sudo mdadm --detail --scan | sudo tee -a /etc/mdadm.conf

# Assemble an existing array (e.g. after moving drives to a new machine)
sudo mdadm --assemble --scan

# Replace a failed drive
sudo mdadm /dev/md0 --fail /dev/sdb1 --remove /dev/sdb1
sudo mdadm /dev/md0 --add /dev/sdd1

# Stop an array
sudo mdadm --stop /dev/md0
```

> As with LVM, this is for additional drives you manage yourself — Shanios's own OS storage uses Btrfs subvolumes, not `md` RAID.

---

## Automatic Btrfs Maintenance (Shani OS Defaults)

Shani OS's root and data volumes are Btrfs, laid out as `@blue`/`@green` root subvolumes for atomic updates (see [Btrfs Deep Dive](../arch/btrfs.md)). Routine maintenance already runs on its own — you rarely need to invoke `btrfs scrub`, `btrfs balance`, or `fstrim` manually:

- **Balance, defrag, scrub, and trim** run via `btrfs-balance.timer`, `btrfs-defrag.timer`, `btrfs-scrub.timer`, and `btrfs-trim.timer` (from `btrfsmaintenance`), enabled by default and scheduled weekly at idle I/O priority. Check them with `systemctl list-timers 'btrfs-*'`.
- **bees** runs continuously in the background (`beesd@<uuid>.service`), deduplicating extents across the `@blue`/`@green` root subvolumes and their backup snapshots as they diverge — this is what keeps two nearly-identical OS slots from doubling disk usage.
- **`sudo shani-deploy --optimize`** runs a deeper, one-shot `duperemove` pass across `@blue`, `@green`, and any `*_backup_*` subvolumes. Use it to reclaim space beyond what continuous bees dedup catches; it's skipped automatically if a deployment is pending.

Running `btrfs scrub start /` or `btrfs balance start /` manually (as shown below) is still useful for an on-demand check, but is not required for routine upkeep.

---

## /etc/fstab — Persistent Mounts

Entries in `/etc/fstab` are captured by the `/etc` overlay and persist across OS updates.

```
# <device>                                <mountpoint>  <type>   <options>                    <dump> <pass>
UUID=aaaa-bbbb-cccc                       /data         btrfs    defaults,noatime,compress=zstd  0      0
UUID=dddd-eeee-ffff                       /mnt/backup   ext4     defaults,noatime                0      2
UUID=1234-5678                            /boot/efi     vfat     umask=0077                      0      1
```

```bash
# Test all fstab entries without rebooting
sudo mount -a

# Verify a specific entry
sudo mount /mnt/backup
```

> 💡 Always use UUID (`blkid`) rather than device names like `/dev/sda1` — device names shift when you add or remove drives.

Some Shani OS paths are made persistent via bind mounts instead of fstab entries — e.g. `/var/lib/samba/usershare` is bind-mounted from `/data/varlib/samba` (on the `@data` subvolume), so Samba usershare state survives blue/green slot switches without a manual fstab line.

---

## Disk Usage

```bash
# Free space on all mounted filesystems
df -h

# Disk usage of a directory (human-readable, summarized)
du -sh /home

# Top 20 largest directories under /var
du -h /var | sort -rh | head -20

# Interactive disk usage explorer (pre-installed)
ncdu /
```

**GUI:** `filelight` (pre-installed on KDE Plasma) shows disk usage as an interactive radial map — a graphical alternative to `ncdu`/`du`.

```bash
# Btrfs-specific: actual space used after compression and deduplication
compsize /home
sudo btrfs filesystem usage /
```

---

## Finding Files — plocate

`plocate` (pre-installed) indexes the filesystem for near-instant filename search — much faster than `find` for a full-system search, at the cost of only being as current as the last index update.

```bash
# Search for files by name (case-sensitive substring match)
plocate myfile.txt

# Case-insensitive search
plocate -i myfile.txt

# Manually refresh the index (updates automatically via a daily systemd timer)
sudo updatedb
```

`locate` is a symlink to `plocate` — either command works the same way.

---

## SMART — Disk Health Monitoring

SMART (Self-Monitoring, Analysis and Reporting Technology) provides drive health data. `smartmontools` is pre-installed.

```bash
# Quick health summary
sudo smartctl -H /dev/sda

# Full SMART info and attributes
sudo smartctl -a /dev/sda

# NVMe health
sudo smartctl -a /dev/nvme0

# Run a short self-test (takes ~2 minutes)
sudo smartctl -t short /dev/sda

# Run a long self-test (takes hours — run overnight)
sudo smartctl -t long /dev/sda

# Check test results
sudo smartctl -l selftest /dev/sda

# Enable SMART if disabled
sudo smartctl -s on /dev/sda
```

### Automated SMART Monitoring (smartd)

```bash
# Enable the smartd daemon to monitor all drives and alert on errors
sudo systemctl enable --now smartd

# Check smartd status
systemctl status smartd

# View smartd alerts
journalctl -u smartd -n 50
```

The default `/etc/smartd.conf` monitors all drives and writes to the journal. For email alerts, add `-m your@email.com` to the `DEVICESCAN` line.

**GUI:** `gsmartcontrol` (pre-installed on GNOME) provides a graphical front-end to the same SMART data and self-tests above, if you'd rather not use the terminal.

---

## NVMe Tools

```bash
# List NVMe drives
sudo nvme list

# Health and SMART data
sudo nvme smart-log /dev/nvme0

# Firmware version
sudo nvme id-ctrl /dev/nvme0 | grep -i fw

# Format a namespace (DESTRUCTIVE — erases drive)
sudo nvme format /dev/nvme0 --ses=1

# NVMe error log
sudo nvme error-log /dev/nvme0
```

---

## udisks2 — Desktop Storage Layer

udisks2 is the D-Bus service that GNOME Disks, KDE's Removable Media, and file managers use to mount/unmount drives without root.

```bash
# List all drives and block devices
udisksctl status

# Mount a drive as your user (no sudo needed)
udisksctl mount -b /dev/sdb1

# Unmount
udisksctl unmount -b /dev/sdb1

# Power off (safely spin down) a USB drive
udisksctl power-off -b /dev/sdb

# Unlock a LUKS volume
udisksctl unlock -b /dev/sdb1

# Show detailed info for a device
udisksctl info -b /dev/sda
```

---

## Loop Devices

Loop devices let you mount image files as block devices.

```bash
# Attach an image to a loop device
sudo losetup -fP disk.img        # -f = find free, -P = scan partitions

# List active loop devices
losetup -l

# Mount the loop device (or a partition within it)
sudo mount /dev/loop0p1 /mnt

# Detach
sudo losetup -d /dev/loop0

# Create a blank image file (e.g. 2 GiB)
dd if=/dev/zero of=disk.img bs=1M count=2048
# or (sparse, instant):
truncate -s 2G disk.img
```

---

## Swap

```bash
# Show current swap usage
swapon --show
free -h

# ZRAM swap (Shani OS default)
zramctl                          # show ZRAM devices and compression ratio
cat /proc/swaps                  # all active swap sources
```

Shanios sets up swap at install time: ZRAM plus a swapfile created in the dedicated `@swap` Btrfs subvolume, sized to RAM (skipped automatically if disk space is tight — the system then falls back to zram alone). The root filesystem is read-only, so a `/swapfile` on `/` via `fallocate` is not possible — any extra swapfile must live under `/swap`, which is mounted from `@swap` with `nodatacow` (NOCOW semantics are required for swapfiles on Btrfs).

To add another swapfile under `/swap`:

```bash
# Create an 8 GiB swapfile in the @swap subvolume (handles NOCOW for you)
sudo btrfs filesystem mkswapfile --size 8g /swap/swapfile

# If your btrfs-progs lacks mkswapfile, fall back to dd + chattr +C under /swap:
sudo dd if=/dev/zero of=/swap/swapfile bs=1M count=8192 status=progress
sudo chmod 600 /swap/swapfile
sudo chattr +C /swap/swapfile    # disable CoW (must be set before data is written)

sudo mkswap /swap/swapfile
sudo swapon /swap/swapfile

# Make permanent
echo '/swap/swapfile none swap defaults 0 0' | sudo tee -a /etc/fstab

# Disable a swap file
sudo swapoff /swap/swapfile
```

> Hibernation (`resume=`) setup is baked into the image's UKI kernel command line at build/deploy time — there is no manual dracut/resume configuration to apply.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `umount: target is busy` | Find what's using it: `lsof +D /mountpoint` or `fuser -mv /mountpoint`; then kill or `umount -l` |
| Drive not appearing in `lsblk` | Check `dmesg | tail -30` for kernel errors; try a different port or cable |
| SMART not available | Some USB enclosures block SMART passthrough; try `smartctl -d sat /dev/sdb` |
| `e2fsck` finds errors but drive is mounted | Boot from the other slot and run `e2fsck` unmounted |
| Btrfs reports errors after scrub | Check `dmesg | grep btrfs`; if uncorrectable, restore from backup — the drive may be failing |
| `No space left` but `df` shows free space | Inode exhaustion: `df -i`; or Btrfs metadata full: `sudo btrfs balance start -m /` (balance also runs automatically via `btrfs-balance.timer`, weekly) |
| UUID changed after mkfs | Update `/etc/fstab` with `blkid`; UKIs are rebuilt and re-signed by `gen-efi` on the next `sudo shani-deploy` (or run `sudo gen-efi configure <slot>`) |

---

## See Also

- [Btrfs Deep Dive](../arch/btrfs.md) — subvolumes, snapshots, send/receive, balance
- [LUKS Management](../security/luks.md) — encrypted volumes
- [Backup & Recovery](backup) — restic, rclone, snapshot strategy
- [Filesystem Structure](../arch/filesystem.md) — Shani OS subvolume layout
