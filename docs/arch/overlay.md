---
title: Overlay Filesystem
section: Architecture
updated: 2026-04-01
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

## fstab Entry

```
overlay /etc overlay \
  rw,lowerdir=/etc,upperdir=/data/overlay/etc/upper,\
  workdir=/data/overlay/etc/work,\
  index=off,metacopy=off,\
  x-systemd.requires-mounts-for=/data \
  0 0
```

`index=off,metacopy=off` are required for compatibility with dracut's early-boot environment.

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
     /run/rootfsbase/etc/ssh/sshd_config
```

## Resetting a File to Default

```bash
# Remove the upper-layer copy — the lower (default) version re-appears
sudo rm /data/overlay/etc/upper/hostname

# Or reset the entire overlay (removes ALL your /etc customisations — use with care)
sudo rm -rf /data/overlay/etc/upper/*
sudo systemctl reboot
```

## Limitations

- OverlayFS does not support NFS as a lower layer.
- Certain syscalls (`rename` across layers, `mknod`) have edge-case behaviour — this rarely affects real configs.
- Very large numbers of files in `upper` can slow down directory reads slightly. Keep `upper` clean by removing files you no longer need to override.
