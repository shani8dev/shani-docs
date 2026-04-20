---
title: Filesystem Structure
section: Architecture
updated: 2026-05-13
---

# Filesystem Structure

Shanios uses Btrfs with a sophisticated subvolume layout housed in a single Btrfs partition (plus a 1 GB FAT32 ESP). The design separates the immutable OS from all persistent state, so updates and rollbacks are atomic and data survives every slot switch.

## Subvolume Layout

| Subvolume | Mount Point | Purpose |
|-----------|------------|---------|
| `@blue` / `@green` | `/` | Root filesystems for blue-green deployment — alternates as active/standby. Mounted **read-only** by dracut; never in fstab. |
| `@root` | `/root` | Root user home — persists across slot switches |
| `@home` | `/home` | User data and personal configurations |
| `@data` | `/data` | Overlay storage and persistent service data (bind-mount source tree) |
| `@nix` | `/nix` | Nix package manager store — shared across both slots |
| `@log` | `/var/log` | System logs across reboots |
| `@cache` | `/var/cache` | Package manager cache |
| `@flatpak` | `/var/lib/flatpak` | Flatpak applications and runtimes |
| `@snapd` | `/var/lib/snapd` | Snap package storage, revisions, and writable snap data |
| `@waydroid` | `/var/lib/waydroid` | Android system images and data |
| `@containers` | `/var/lib/containers` | Podman/Docker container storage |
| `@machines` | `/var/lib/machines` | systemd-nspawn containers |
| `@lxc` | `/var/lib/lxc` | LXC containers |
| `@lxd` | `/var/lib/lxd` | LXD container and VM storage |
| `@libvirt` | `/var/lib/libvirt` | Virtual machine disk images (nodatacow) |
| `@qemu` | `/var/lib/qemu` | Bare QEMU VM disk images (nodatacow) |
| `@swap` | `/swap` | Swap file container (nodatacow) |

## The @data Subvolume

`@data` is the heart of Shanios persistence. Its internal structure:

```
/data/
├── overlay/
│   └── etc/
│       ├── upper/     ← your /etc changes are stored here
│       └── work/      ← kernel OverlayFS work directory
├── varlib/            ← bind-mount sources for /var/lib/*
│   ├── NetworkManager/
│   ├── bluetooth/
│   ├── caddy/
│   ├── cloudflared/
│   ├── cups/
│   ├── dbus/
│   ├── firewalld/
│   ├── fontconfig/
│   ├── gdm/ / sddm/
│   ├── pipewire/
│   ├── polkit-1/
│   ├── samba/ / nfs/
│   ├── sshd/
│   ├── systemd/
│   ├── tailscale/
│   ├── tpm2-tss/
│   ├── upower/
│   ├── fwupd/
│   ├── fprint/
│   ├── AccountsService/
│   ├── boltd/
│   ├── sudo/
│   ├── appimage/
│   ├── fail2ban/
│   ├── restic/ / rclone/
│   └── ...
├── varspool/          ← bind-mount sources for /var/spool/*
│   ├── cron/
│   ├── at/
│   ├── anacron/
│   ├── cups/
│   ├── samba/
│   └── postfix/
├── downloads/         ← cached OS images (used by shani-deploy)
├── current-slot       ← "blue" or "green"
├── previous-slot      ← the slot before the last deploy/rollback
├── boot-ok            ← written by mark-boot-success
├── boot_in_progress   ← written by mark-boot-in-progress, cleared on success
├── boot_failure       ← written by check-boot-failure on soft boot failure
├── boot_failure.acked ← written when user acknowledges failure dialog
└── boot_hard_failure  ← written by dracut hook if root mount fails
```

## Persistent Bind Mounts from @data

Because `/var` is volatile (tmpfs via `systemd.volatile=state`), critical service state is bind-mounted from `@data`. Every bind mount uses `nofail,x-systemd.after=var.mount,x-systemd.requires-mounts-for=/data` so the system boots cleanly even if individual services are not installed.

### System Core

| Source (`@data`) | Target |
|---|---|
| `/data/varlib/dbus` | `/var/lib/dbus` |
| `/data/varlib/systemd` | `/var/lib/systemd` |
| `/data/varlib/fontconfig` | `/var/lib/fontconfig` |

### Networking

| Source | Target |
|---|---|
| `/data/varlib/NetworkManager` | `/var/lib/NetworkManager` |
| `/data/varlib/bluetooth` | `/var/lib/bluetooth` |
| `/data/varlib/firewalld` | `/var/lib/firewalld` |
| `/data/varlib/samba` | `/var/lib/samba` |
| `/data/varlib/nfs` | `/var/lib/nfs` |

### Remote Access & VPN

| Source | Target |
|---|---|
| `/data/varlib/caddy` | `/var/lib/caddy` |
| `/data/varlib/tailscale` | `/var/lib/tailscale` |
| `/data/varlib/cloudflared` | `/var/lib/cloudflared` |
| `/data/varlib/geoclue` | `/var/lib/geoclue` |

### Display, Audio & Peripherals

| Source | Target |
|---|---|
| `/data/varlib/gdm` | `/var/lib/gdm` |
| `/data/varlib/sddm` | `/var/lib/sddm` |
| `/data/varlib/colord` | `/var/lib/colord` |
| `/data/varlib/pipewire` | `/var/lib/pipewire` |
| `/data/varlib/rtkit` | `/var/lib/rtkit` |
| `/data/varlib/cups` | `/var/lib/cups` |
| `/data/varlib/sane` | `/var/lib/sane` |
| `/data/varlib/upower` | `/var/lib/upower` |

### Auth & Security

| Source | Target |
|---|---|
| `/data/varlib/fprint` | `/var/lib/fprint` |
| `/data/varlib/AccountsService` | `/var/lib/AccountsService` |
| `/data/varlib/boltd` | `/var/lib/boltd` |
| `/data/varlib/sudo` | `/var/lib/sudo` |
| `/data/varlib/sshd` | `/var/lib/sshd` |
| `/data/varlib/polkit-1` | `/var/lib/polkit-1` |
| `/data/varlib/tpm2-tss` | `/var/lib/tpm2-tss` |

### Hardware & Data Protection

| Source | Target |
|---|---|
| `/data/varlib/fwupd` | `/var/lib/fwupd` |
| `/data/varlib/fail2ban` | `/var/lib/fail2ban` |
| `/data/varlib/restic` | `/var/lib/restic` |
| `/data/varlib/rclone` | `/var/lib/rclone` |
| `/data/varlib/appimage` | `/var/lib/appimage` |

### Scheduling & Spools

| Source | Target |
|---|---|
| `/data/varspool/anacron` | `/var/spool/anacron` |
| `/data/varspool/cron` | `/var/spool/cron` |
| `/data/varspool/at` | `/var/spool/at` |
| `/data/varspool/cups` | `/var/spool/cups` |
| `/data/varspool/samba` | `/var/spool/samba` |
| `/data/varspool/postfix` | `/var/spool/postfix` |

## Mount Options Reference

- **Root slots** (`@blue`/`@green`) — **not in fstab** — mounted read-only by dracut via kernel cmdline
- **Container/virtualisation subvolumes** — use `nofail` so the system boots cleanly even if not yet created
- **VM disk subvolumes** (`@libvirt`, `@qemu`) and `@swap` — use `nodatacow,nospace_cache` (required for correctness and performance)
- **All other Btrfs subvolumes** — use `noatime,compress=zstd,space_cache=v2,autodefrag`
- **All bind mounts** — use `bind,nofail,x-systemd.after=var.mount,x-systemd.requires-mounts-for=/data`

### Why noatime?

Writing an access timestamp on every file read would generate massive write traffic on a busy system. All subvolumes use `noatime` to prevent this — reducing SSD wear, improving battery life, and eliminating pointless write amplification.

### Why systemd.volatile=state?

`/var` is a tmpfs cleared on every reboot. This keeps the OS truly stateless — log files, caches, and runtime state cannot accumulate across reboots and affect behaviour. The bind mounts from `@data` selectively restore only the service state that should persist.

## Adding a New Persistent Service

If you self-host a service that needs state to survive reboots:

```bash
# 1. Create the backing directory in @data
sudo mkdir -p /data/varlib/myservice

# 2. Add a fstab bind mount
sudo nano /etc/fstab
# /data/varlib/myservice  /var/lib/myservice  none  bind,nofail,x-systemd.after=var.mount,x-systemd.requires-mounts-for=/data  0 0

# 3. Reload and mount
sudo systemctl daemon-reload
sudo mount /var/lib/myservice
```

Changes to `/etc/fstab` are captured by the OverlayFS overlay and survive every OS update.
