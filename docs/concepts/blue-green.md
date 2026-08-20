---
title: Blue-Green Deployment
section: Concepts
updated: 2026-08-20
---

# Blue-Green Deployment

Shanios implements blue-green deployment using Btrfs subvolumes — a strategy adapted from DevOps for desktop Linux.

## How It Works

1. System maintains `@blue` and `@green` subvolumes, both created as read-only Btrfs snapshots of the same base image at install time
2. One subvolume is active (mounted read-only as `/`, tracked in `/data/current-slot`), the other inactive
3. `shani-deploy` writes updates to the inactive subvolume only — the active one is never touched
4. The bootloader (systemd-boot) is updated to point to the updated subvolume
5. Reboot switches to the updated system
6. Previous version remains available for instant rollback

The active slot is identified at runtime by parsing `subvol=@blue` or `subvol=@green` out of `rootflags=` on `/proc/cmdline` (falling back to `btrfs subvolume get-default`) — the same detection logic is shared by `shani-deploy`, `shani-update`, and `check-boot-failure` so all three always agree on which slot is running. See [Atomic Updates](./atomic-updates) for the full deploy pipeline and [Persistence Strategy](./persistence) for what survives a slot swap.

## Slot Layout

| Slot | State | Description |
|------|-------|-------------|
| `@blue` | Active or Standby | One complete, bootable root filesystem |
| `@green` | Active or Standby | The other complete, bootable root filesystem |

Only one slot is active at a time. `shani-deploy` writes updates to the inactive slot, then switches the bootloader default. On the next reboot, the updated slot becomes active. The previous slot stays intact as an instant rollback target.

## Shared Subvolumes

These subvolumes are shared between both slots and persist across all updates and rollbacks:

- `@home` — user data
- `@root` — root user home
- `@data` — `/etc` overlay + service state
- `@flatpak` — Flatpak apps and runtimes
- `@containers` — Podman container storage
- `@nix` — Nix package store
- `@log` — system logs
- `@libvirt`, `@lxc`, etc. — virtualisation data

Switching slots or rolling back **never** touches these subvolumes.

## The Cycle

```
@blue active
↓ update @green
reboot → @green active
↓ update @blue
reboot → @blue active…
```

## Advantages

- **Atomic Updates:** All-or-nothing — the running system is never in a partially-updated state
- **Zero Downtime:** The active system is never modified during an update
- **Instant Rollback:** Boot into the previous version at any time from the boot menu
- **Safe Testing:** The old system validates while the new one is prepared

## Boot Menu Labels

- **shanios-blue (Active):** Currently running system
- **shanios-green (Candidate):** Standby system, will be booted after next update

After each deployment, `shani-deploy` rewrites both boot entries. The newly updated slot is labelled **(Active)** with `+3-0` boot-count tries and set as the `loader.conf` default; the currently running slot is relabelled **(Candidate)** as the stable fallback.

Note the two rollback mechanisms operate at different levels: systemd-boot's boot counting only decides *which slot boots next* — it never touches subvolume contents. Actually restoring a failed candidate slot's data (from the pre-deploy safety snapshot) is a separate step performed by `shani-deploy --rollback`, which `shani-update` offers automatically the next time you log in after a fallback boot. See [Atomic Updates](./atomic-updates#automatic-rollback) for the full sequence.
