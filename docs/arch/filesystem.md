---
title: Filesystem Structure
section: Architecture
updated: 2026-04-01
---

# Filesystem Structure

Shanios uses Btrfs with a sophisticated subvolume layout housed in a single Btrfs partition (plus a 1 GB FAT32 ESP).

## Subvolume Layout

| Subvolume | Mount Point | Purpose |
|-----------|------------|---------|
| `@blue` / `@green` | `/` | Root filesystems for blue-green deployment — alternates as active/standby |
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
│   ├── cups/
│   ├── tailscale/
│   ├── tpm2-tss/
│   └── ...
├── varspool/          ← bind-mount sources for /var/spool/*
│   ├── cron/
│   ├── at/
│   └── ...
├── current-slot       ← "blue" or "green"
├── boot-ok            ← written by mark-boot-success
└── boot_failure       ← written by check-boot-failure on bad boot
```

## Persistent Bind Mounts from @data

Because `/var` is volatile (tmpfs via `systemd.volatile=state`), critical service state is bind-mounted from `@data`:

| Category | Source (`@data`) | Target |
|---|---|---|
| System Core | `/data/varlib/dbus`, `/data/varlib/systemd` | `/var/lib/dbus`, `/var/lib/systemd` |
| Networking | `/data/varlib/NetworkManager`, `/data/varlib/bluetooth`, `/data/varlib/firewalld` | `/var/lib/NetworkManager`, `/var/lib/bluetooth`, `/var/lib/firewalld` |
| File Sharing | `/data/varlib/samba`, `/data/varlib/nfs` | `/var/lib/samba`, `/var/lib/nfs` |
| Remote Access | `/data/varlib/caddy`, `/data/varlib/tailscale`, `/data/varlib/cloudflared` | `/var/lib/caddy`, `/var/lib/tailscale`, `/var/lib/cloudflared` |
| Display Manager | `/data/varlib/gdm`, `/data/varlib/sddm`, `/data/varlib/colord` | `/var/lib/gdm`, `/var/lib/sddm`, `/var/lib/colord` |
| Audio & Peripherals | `/data/varlib/pipewire`, `/data/varlib/cups`, `/data/varlib/upower` | `/var/lib/pipewire`, `/var/lib/cups`, `/var/lib/upower` |
| Auth & Security | `/data/varlib/fprint`, `/data/varlib/AccountsService`, `/data/varlib/tpm2-tss` | `/var/lib/fprint`, `/var/lib/AccountsService`, `/var/lib/tpm2-tss` |
| Hardware | `/data/varlib/fwupd` | `/var/lib/fwupd` |
| Scheduling | `/data/varspool/cron`, `/data/varspool/at`, `/data/varspool/anacron` | `/var/spool/cron`, `/var/spool/at`, `/var/spool/anacron` |

## Mount Options Reference

- Root slots (`@blue`/`@green`) — **not in fstab** — mounted read-only by dracut/initramfs via kernel cmdline
- All other Btrfs subvolumes use `noatime,compress=zstd,space_cache=v2,autodefrag`
- VM disk subvolumes (`@libvirt`, `@qemu`) and `@swap` use `nodatacow,nospace_cache`
- Container and virtualisation subvolumes use `nofail`
- All bind mounts use `bind,nofail,x-systemd.after=var.mount,x-systemd.requires-mounts-for=/data`
