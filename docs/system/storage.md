---
title: Storage
section: System
updated: 2026-04-28
---

# Storage

This page covers raw disk and block-device management on Shani OS: inspecting drives, partitioning, filesystem operations, SMART health monitoring, and the udisks2 layer used by desktop tools.

For encrypted volumes see [LUKS Management](../security/luks). For Btrfs-specific operations (snapshots, subvolumes, scrub) see [Btrfs Deep Dive](../arch/btrfs). For backup strategy see [Backup & Recovery](backup).

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

# Btrfs-specific: actual space used after compression and deduplication
compsize /home
sudo btrfs filesystem usage /
```

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

# Add a swap file
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent (add to /etc/fstab)
echo '/swapfile none swap defaults 0 0' | sudo tee -a /etc/fstab

# Disable a swap file
sudo swapoff /swapfile

# ZRAM swap (Shani OS default)
zramctl                          # show ZRAM devices and compression ratio
cat /proc/swaps                  # all active swap sources
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `umount: target is busy` | Find what's using it: `lsof +D /mountpoint` or `fuser -mv /mountpoint`; then kill or `umount -l` |
| Drive not appearing in `lsblk` | Check `dmesg | tail -30` for kernel errors; try a different port or cable |
| SMART not available | Some USB enclosures block SMART passthrough; try `smartctl -d sat /dev/sdb` |
| `e2fsck` finds errors but drive is mounted | Boot from the other slot and run `e2fsck` unmounted |
| Btrfs reports errors after scrub | Check `dmesg | grep btrfs`; if uncorrectable, restore from backup — the drive may be failing |
| `No space left` but `df` shows free space | Inode exhaustion: `df -i`; or Btrfs metadata full: `sudo btrfs balance start -m /` |
| UUID changed after mkfs | Update `/etc/fstab` with `blkid`; regenerate initramfs with `sudo dracut --force` |

---

## See Also

- [Btrfs Deep Dive](../arch/btrfs) — subvolumes, snapshots, send/receive, balance
- [LUKS Management](../security/luks) — encrypted volumes
- [Backup & Recovery](backup) — restic, rclone, snapshot strategy
- [Filesystem Structure](../arch/filesystem) — Shani OS subvolume layout
