---
title: Overlay Filesystem
section: Architecture
updated: 2026-05-13
---

# Overlay Filesystem

Shanios uses Linux OverlayFS to present a fully writable `/etc` on top of a read-only root filesystem. This is what makes the immutable OS feel transparent — you can edit any config file as normal, and your changes persist across every update and rollback.

## How OverlayFS Works

OverlayFS stacks two or more directories into a single unified view:

```
/etc  (merged view — what processes see)
  ├── upper  →  /data/overlay/etc/upper/   (your changes — writable)
  ├── work   →  /data/overlay/etc/work/    (kernel internal — do not touch)
  └── lower  →  /etc from @blue or @green  (base OS config — read-only)
```

- **Reads:** If the file exists in `upper`, it is served from there. Otherwise it falls through to `lower`.
- **Writes:** On first write to any file, the kernel performs a "copy-up" — the original is copied from `lower` to `upper`, then the write is applied to the copy. The `lower` layer is never modified.
- **Deletes:** A whiteout file is created in `upper` to mask the `lower` entry.

## When the Overlay is Mounted

The `/etc` overlay is mounted by the `shanios-overlay-etc.sh` dracut hook at **pre-pivot priority 50** — before `pivot_root` hands control to systemd PID 1. This guarantees systemd reads the correct (user-modified) `/etc` from its very first unit file access.

If the overlay were applied via fstab instead (after `pivot_root`), systemd would have already cached paths from the read-only root and silently miss any overlay changes.

## fstab Entry (Informational)

The fstab overlay entry is present but **commented out** — the dracut hook handles this mount:

```
# /etc OverlayFS — MOVED TO DRACUT (99shanios/shanios-overlay-etc.sh, pre-pivot 50)
# Mounting /etc overlay here (after pivot_root) is too late.
#
# overlay /etc overlay rw,lowerdir=/etc,upperdir=/data/overlay/etc/upper, \
#   workdir=/data/overlay/etc/work,index=off,metacopy=off, \
#   x-systemd.requires-mounts-for=/data  0 0
```

The `index=off,metacopy=off` options are required for compatibility with dracut's early-boot environment. They also ensure consistent behaviour across kernel versions.

## What This Means in Practice

```bash
# This works exactly as on any Linux system:
sudo nano /etc/hostname
sudo systemctl edit --full sshd.service
sudo visudo

# Your change lands in upper, not in the read-only slot:
ls /data/overlay/etc/upper/
```

On the next OS update, the `lower` layer is replaced (new slot), but `upper` is in `@data` and is untouched. Your customisations are automatically re-layered on top of the new base.

## Inspecting Your Customisations

```bash
# See every file you've changed in /etc
find /data/overlay/etc/upper -not -type d | sort

# Diff a specific file against the slot's original
diff /data/overlay/etc/upper/ssh/sshd_config \
     /run/shanios-data-tmp/overlay/etc/upper/../../../blue/etc/ssh/sshd_config
# Or compare against the running read-only root:
sudo diff /data/overlay/etc/upper/ssh/sshd_config \
     /proc/1/root/etc/ssh/sshd_config 2>/dev/null
```

## Resetting a File to Default

```bash
# Remove the upper-layer copy — the lower (default) version re-appears
sudo rm /data/overlay/etc/upper/hostname

# Or reset the entire overlay (removes ALL your /etc customisations — use with care)
sudo rm -rf /data/overlay/etc/upper/*
sudo systemctl reboot
```

For a full factory reset that also clears service state, use [`shani-reset`](../updates/shani-reset) instead.

## Checking Overlay Health

```bash
# Confirm /etc is mounted as an overlay
findmnt /etc
# Expected: overlay overlay rw,...,upperdir=/data/overlay/etc/upper,...

# Count modified files
find /data/overlay/etc/upper -mindepth 1 | wc -l

# Use shani-health for a detailed report
shani-health --boot   # shows "Immutability → /etc: overlay active, N file(s) modified"
```

## Limitations

- OverlayFS does not support NFS as a lower layer.
- Certain syscalls (`rename` across layers, `mknod`) have edge-case behaviour — this rarely affects real configs.
- Very large numbers of files in `upper` can slow down directory reads slightly. Keep `upper` clean by removing files you no longer need to override.
- The `work` directory must be on the same filesystem as `upper` (both are on `@data`).

## See Also

- [Dracut Module](dracut-module) — how the overlay is mounted at early boot
- [System Config](../updates/config) — editing `/etc` files and managing the overlay
- [Factory Reset](../updates/shani-reset) — clearing the entire overlay
