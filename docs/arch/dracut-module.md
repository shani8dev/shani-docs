---
title: Dracut Initramfs Module
section: Architecture
updated: 2026-05-13
---

# Dracut Initramfs Module

Shanios ships a custom dracut module (`99shanios`) that adds three hooks to the initramfs. These hooks implement the two features that require early-boot access before the root filesystem is available to userspace: **boot failure detection** and **`/etc` OverlayFS mounting**.

---

## Module Location

```
/usr/lib/dracut/modules.d/99shanios/
├── module-setup.sh              ← declares hooks and binaries
├── shanios-boot-failure-hook.sh ← pre-mount (priority 90)
├── shanios-overlay-etc.sh       ← pre-pivot (priority 50)
└── shanios-boot-success-clear.sh ← pre-pivot (priority 90)
```

The module is always included in Shanios initramfs builds (`check()` returns 0 unconditionally). It is rebuilt automatically by `gen-efi configure <slot>` on every deploy.

---

## Hook: shanios-boot-failure-hook.sh (pre-mount 90)

**Runs:** After LUKS unlock and device discovery, **before** the root Btrfs subvolume is mounted.

**Purpose:** Write a `boot_hard_failure` marker so that if root mount fails, the failure is recorded persistently and `shani-update` can detect it on the next boot.

**Why dracut and not a systemd service:** dracut has no "on mount failure" hook. The only reliable pattern is write-before-mount, clear-on-success. If root never mounts, the marker persists. If root mounts successfully, the `shanios-boot-success-clear.sh` hook at pre-pivot removes it.

**What it does:**

1. Locates the Btrfs device by filesystem label (`shani_root`)
2. Mounts `@data` read-write to a temporary mountpoint (`/run/shanios-data-tmp`)
3. Reads the attempted slot from `rootflags=subvol=@<slot>` in the kernel cmdline
4. Writes the slot name to `/data/boot_hard_failure`
5. Unmounts `@data` immediately

**Failure handling:** If the `@data` subvolume cannot be mounted (e.g. disk not found), the hook exits silently with a warning in the boot log rather than halting the boot.

---

## Hook: shanios-overlay-etc.sh (pre-pivot 50)

**Runs:** After root is successfully mounted, **before** `pivot_root` hands control to systemd.

**Purpose:** Mount the `/etc` OverlayFS so systemd PID 1 reads the correct (user-modified) `/etc` from its very first unit file access.

**Why in dracut and not fstab:** If the overlay is applied via fstab after `pivot_root`, systemd has already cached paths from the read-only root's `/etc`. The overlay must be in place before the switch to the new root.

**What it does:**

1. Locates the Btrfs device by filesystem label
2. Mounts `@data` read-write at `/run/shanios-data-tmp`
3. Creates `/data/overlay/etc/upper` and `work` directories if missing
4. Mounts OverlayFS onto `${NEWROOT}/etc` with options `index=off,metacopy=off`
5. **Does not unmount `@data`** — the overlay upper/work directories are on this mount; unmounting would break the overlay

The `@data` mount at `/run/shanios-data-tmp` is carried into the new root by `switch_root` (which moves all `/run` mounts automatically). It is visible in the booted system at `/run/shanios-data-tmp` until the fstab `@data` mount at `/data` takes over.

**Mount options:**

| Option | Reason |
|--------|--------|
| `index=off` | Avoids inode index checks that break across subvolume mounts |
| `metacopy=off` | Disables metadata-only copy-up; keeps behaviour simple and compatible with older kernels |

---

## Hook: shanios-boot-success-clear.sh (pre-pivot 90)

**Runs:** After root is successfully mounted and after the overlay hook (priority 50), before `pivot_root`.

**Purpose:** Clear the `boot_hard_failure` marker written by the pre-mount hook, confirming that root mount succeeded.

**What it does:**

1. Uses the already-mounted `@data` from the overlay hook (or re-mounts it if the overlay hook failed)
2. Removes `/data/boot_hard_failure` if present
3. **Does not unmount `@data`** — same reason as the overlay hook

**Ordering:** Running at priority 90 (after the overlay hook at 50) ensures the overlay is already live when success is declared.

---

## Interaction with Boot Health Services

The dracut hooks work together with userspace systemd services to provide complete boot failure detection:

```
Boot attempt
  │
  ├─ [pre-mount 90] shanios-boot-failure-hook.sh
  │    └─ writes /data/boot_hard_failure
  │
  ├─ Root mount attempted
  │    ├─ FAIL → pre-pivot never runs → boot_hard_failure persists → reboot
  │    └─ SUCCESS ↓
  │
  ├─ [pre-pivot 50] shanios-overlay-etc.sh
  │    └─ mounts /etc overlay
  │
  ├─ [pre-pivot 90] shanios-boot-success-clear.sh
  │    └─ removes /data/boot_hard_failure
  │
  └─ pivot_root → systemd PID 1
       │
       ├─ mark-boot-in-progress.service
       │    └─ writes /data/boot_in_progress, clears boot-ok
       │
       ├─ mark-boot-success.service (at multi-user.target)
       │    └─ writes /data/boot-ok, clears boot_in_progress
       │
       ├─ bless-boot.service (after mark-boot-success)
       │    └─ bootctl set-good (stops boot counter)
       │
       └─ check-boot-failure.timer (OnBootSec=15m)
            └─ if boot_in_progress && ! boot-ok → writes /data/boot_failure
```

---

## Rebuilding the Module

The module is rebuilt automatically by every `shani-deploy` run and every `gen-efi configure` call. To rebuild manually:

```bash
# Rebuild initramfs (and re-sign UKI) for the currently booted slot
sudo gen-efi configure blue

# Or rebuild just the initramfs without re-signing
sudo dracut --force --kver "$(uname -r)"
```

> **Note:** A raw `dracut --force` without `--uefi` produces a separate initrd file, not a UKI. Always use `gen-efi configure` to ensure the result is signed and installed correctly.

---

## Verifying the Module is Installed

```bash
# Check module files are present
ls /usr/lib/dracut/modules.d/99shanios/

# Check the module is included in the running initramfs
# (decompress the UKI and inspect its cpio archive)
sudo /usr/lib/systemd/systemd-stub /boot/efi/EFI/shanios/shanios-blue.efi --dump 2>/dev/null \
  | cpio -t 2>/dev/null | grep shanios

# Or use shani-health
shani-health --boot   # shows "Dracut mod: OK 99shanios module installed (N hooks)"
```

---

## See Also

- [Boot Process](boot) — how the full boot chain works
- [Overlay Filesystem](overlay) — how the `/etc` overlay works at runtime
- [gen-efi Reference](../security/gen-efi) — building and signing UKIs
