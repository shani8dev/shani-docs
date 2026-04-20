---
title: User Provisioning (shani-user-setup)
section: Updates & Config
updated: 2026-05-13
---

# User Provisioning

`shani-user-setup` automatically provisions every regular user (UID 1000–59999) with the correct groups, default shell, Flatpak remotes, Nix channels, and rootless container namespaces. It runs as root via a systemd path unit that watches `/data/user-setup-needed`, triggered by `shani-deploy` after every OS update and by the first-run wizard when a new user account is created.

---

## What It Does

For each interactive user account on the system, `shani-user-setup`:

1. **Groups** — adds the user to all groups listed in `/etc/shani-extra-groups`, skipping any that don't exist
2. **Default shell** — sets the shell to Zsh (falling back to Bash if Zsh isn't installed), only if the current shell differs
3. **Flatpak remote** — adds the `flathub` remote for the user if not already present
4. **Nix channel** — adds the `nixpkgs-unstable` channel if no channel named `nixpkgs` exists (never overwrites an existing nixpkgs channel)
5. **subuid/subgid ranges** — allocates 65,536 sub-UIDs and sub-GIDs for rootless Podman/LXC/LXD if not already assigned
6. **Podman storage migration** — runs `podman system migrate` to upgrade the storage graph if `/var/lib/containers` is mounted

A stamp file at `~/.cache/shani/user-setup.stamp` records the script mtime and extra-groups list. If the stamp matches, the expensive steps are skipped on subsequent runs. Set `FORCE_SETUP=1` to bypass.

---

## Extra Groups

The list of groups added to every user is read from a single file:

```
/etc/shani-extra-groups
```

Format: one comma-separated line, no spaces.

```
wheel,video,input,audio,kvm,storage,network,realtime,scanner,lp,cups,libvirt,lxd
```

### Group Reference

| Group | Purpose |
|-------|---------|
| `wheel` | Sudo privileges for system administration |
| `input` | Direct input device access (keyboards, mice, controllers) |
| `realtime` | Real-time scheduling, HPET/RTC access for audio production and low-latency gaming |
| `video` | GPU and video hardware access |
| `sys` | Hardware monitoring and sensor access |
| `cups`, `lp` | Printer management and job submission |
| `scanner` | Scanner device access |
| `nixbld` | Nix build users group — required for the Nix package manager daemon |
| `lxc`, `lxd` | LXC/LXD container management without root |
| `kvm` | Virtual machine management (KVM hardware access) |
| `libvirt` | libvirt VM management via `virsh` and virt-manager |

This file is the **single source of truth** shared between `shani-user-setup` and the `adduser`/`useradd` wrappers. Editing it ensures that all future users (and any re-provisioning runs) get the same groups.

If the file is absent, `shani-user-setup` falls back to the built-in default group list.

```bash
# View current extra groups
cat /etc/shani-extra-groups

# Add a group (via /etc overlay — persists across updates)
sudo nano /etc/shani-extra-groups

# Force re-provisioning all users with the new group list
sudo FORCE_SETUP=1 shani-user-setup
```

---

## Triggering

`shani-user-setup` runs when `/data/user-setup-needed` is created or modified:

```bash
# systemd path unit watches for this file
systemctl status shani-user-setup.path

# Trigger manually (e.g. after adding a new user)
sudo touch /data/user-setup-needed
```

`shani-deploy` writes this marker after every slot switch so new group assignments from the updated OS are applied on the next login.

---

## Running Manually

```bash
# Provision all users (normal run)
sudo shani-user-setup

# Dry run — log what would change without making changes
sudo DRY_RUN=1 shani-user-setup

# Force full re-provisioning (ignore stamp file)
sudo FORCE_SETUP=1 shani-user-setup
```

---

## Checking Status

```bash
# View provisioning logs
journalctl -t shani-user-setup -n 50

# Check path unit status
systemctl status shani-user-setup.path
systemctl status shani-user-setup.service

# Check if a user is in the required groups
id myuser

# Check subuid/subgid assignment
grep myuser /etc/subuid /etc/subgid
```

---

## After a Factory Reset

After `shani-reset`, user accounts are gone (the `/etc` overlay is wiped). On the next boot:

1. The first-run wizard creates a new user account
2. `shani-user-setup.path` detects the new account and triggers provisioning
3. The new user gets all groups, correct shell, and Flatpak/Nix setup automatically

Files in `/home/<username>` survive the reset (the `@home` subvolume is not wiped). Once the account is re-created with the same username, all personal files are immediately accessible.

---

## Rootless Container Support

`shani-user-setup` allocates subUID/subGID ranges automatically, which are required for rootless Podman, Distrobox, LXC, and LXD.

The allocation algorithm finds the highest existing range end in `/etc/subuid` and allocates the next 65,536 IDs to avoid collisions. For example, with one existing user allocated at `100000–165535`, a second user gets `165536–231071`.

```bash
# Verify your subuid/subgid assignment
cat /etc/subuid
cat /etc/subgid

# Verify Podman rootless works
podman run --rm alpine echo hello
```

---

## See Also

- [Shell & Environment](shell) — Zsh configuration and shell tools
- [Factory Reset](shani-reset) — re-provisioning after a reset
- [System Config](config) — editing `/etc/shani-extra-groups` via the overlay
