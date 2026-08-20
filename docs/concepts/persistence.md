---
title: Persistence Strategy
section: Concepts
updated: 2026-08-20
---

# Persistence Strategy

Shanios selectively persists data across immutable system updates through bind mounts and dedicated Btrfs subvolumes.

## Three Categories

### ❌ Replaced on Update

The active slot (`@blue` or `@green`) is overwritten:

- `/` (root — `@blue` or `@green`)
- `/usr /bin /sbin /lib`
- `/opt /srv` (pre-installed)
- `/boot/efi` (ESP — UKI updated)

### ✅ Persistent (Survives All Updates)

Dedicated Btrfs subvolumes that are never touched by updates:

| Location | Subvolume |
|----------|-----------|
| `/home` | `@home` |
| `/root` | `@root` |
| `/data` | `@data` — overlay + service state |
| `/var/log` | `@log` |
| `/var/cache` | `@cache` |
| `/var/lib/flatpak` | `@flatpak` |
| `/var/lib/containers` | `@containers` |
| `/nix` | `@nix` — Nix package store |
| `/var/lib/libvirt` | `@libvirt` (nodatacow) |
| `/var/lib/waydroid` | `@waydroid` |
| `/var/lib/snapd` | `@snapd` |

All of the subvolumes above are mounted at the Btrfs top level, independent of which slot (`@blue` or `@green`) is active — so every one of them, not just `@nix` and `@flatpak`, is equally visible to both slots and untouched by a slot switch or rollback.

### 🔄 Volatile (Cleared on Reboot)

`systemd.volatile=state` kernel parameter mounts a tmpfs over `/var`:

- `/var` (tmpfs)
- `/tmp` (tmpfs — fstab entry)
- `/run` (tmpfs)
- `/dev /proc /sys` (virtual filesystems)

Critical service state is **bind-mounted back** from `@data` on every boot.

## The /etc Overlay

`/etc` is an OverlayFS — a three-layer combination:

- **Lower layer (read-only):** `/etc` from the active slot (`@blue` or `@green`)
- **Upper layer (writable):** `/data/overlay/etc/upper/` — only your changes live here
- **Work dir:** `/data/overlay/etc/work/` — required by the kernel for atomic copy-up

```
/etc appears fully writable to all processes.
Upper overrides lower — your changes take precedence.
Unchanged files are served from the read-only lower layer.
Changes in upper (@data) survive OS updates — only the lower is replaced.
```

This overlay is **not** an fstab entry — it's mounted by a dracut hook (`shanios-overlay-etc.sh`, part of the `99shanios` dracut module) *before* `pivot_root` hands control to systemd. That ordering matters: systemd PID 1 reads `/etc` the moment it starts, and if the overlay were applied later via fstab, systemd would have already cached the plain read-only `/etc` and miss anything in `/data/overlay/etc/upper`. So the sequence at boot is:

1. Dracut mounts the `@data` subvolume read-write onto a temporary path in the initramfs.
2. It mounts the OverlayFS directly onto the new root's `/etc`, with the booted slot's own `/etc` as the lower layer.
3. Only then does dracut `pivot_root` / `switch_root` into the new root — `/etc` is already the merged view on the very first read.

`@data` is deliberately left mounted through this process (its upper/work directories must stay live for the overlay), and `switch_root` carries that mount along into the booted system's `/run`.

View overlay modifications:
```bash
ls -la /data/overlay/etc/upper
```

The same `99shanios` dracut module also carries the two hooks that make boot-failure detection possible before systemd ever starts — a pre-mount hook writes `/data/boot_hard_failure` before the root Btrfs subvolume is mounted, and a pre-pivot hook clears it once mount succeeds. See [Atomic Updates](./atomic-updates#automatic-rollback) for how that feeds into rollback.

## Bind-Mounted Service State

Because `/var` is volatile, all service state that must survive reboots is stored in `@data` and bind-mounted back at boot.

Key bind mounts from `@data/varlib/` → `/var/lib/`:

| Category | Examples |
|----------|---------|
| System Core | `dbus`, `systemd`, `fontconfig` |
| Networking | `NetworkManager`, `bluetooth`, `firewalld` |
| File Sharing | `samba`, `nfs` |
| Remote Access & VPN | `caddy`, `tailscale`, `cloudflared`, `geoclue` |
| Display Manager | `gdm`, `sddm`, `colord` |
| Audio & Peripherals | `pipewire`, `cups`, `sane`, `upower` |
| Auth & Security | `fprint`, `AccountsService`, `boltd`, `sshd`, `tpm2-tss` |
| Spool | `cron`, `at`, `cups` print queue, `postfix` |

All bind mounts use:
```
bind,nofail,x-systemd.after=var.mount,x-systemd.requires-mounts-for=/data
```
