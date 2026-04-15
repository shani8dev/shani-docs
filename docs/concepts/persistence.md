---
title: Persistence Strategy
section: Concepts
updated: 2026-04-01
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

`@nix` and `@flatpak` are shared by both slots.

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

fstab entry:
```
overlay /etc overlay rw,lowerdir=/etc,upperdir=/data/overlay/etc/upper,workdir=/data/overlay/etc/work,index=off,metacopy=off,x-systemd.requires-mounts-for=/data 0 0
```

View overlay modifications:
```bash
ls -la /data/overlay/etc/upper
```

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
