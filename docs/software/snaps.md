---
title: Snaps
section: Software & Apps
updated: 2026-04-01
---

# Snaps

Snap packages are sandboxed, self-contained applications published to the **Snap Store** by Canonical and third-party developers. Shanios ships with **snapd pre-installed and enabled** — `snapd.socket` is socket-activated (the daemon starts on-demand when first accessed, not at every boot) and `snapd.apparmor.service` is active at boot. All Snap data lives in the dedicated `@snapd` Btrfs subvolume mounted at `/var/lib/snapd`, surviving all system updates and rollbacks.

## How Snaps Work on Shanios

Snaps come in two confinement modes:

- **Strict:** Fully sandboxed via AppArmor and seccomp. The snap can only access what its permissions (plugs/slots) explicitly allow. Most GUI and CLI apps use this mode.
- **Classic:** Unrestricted access to the host filesystem — behaves like a traditionally installed app. Requires `--classic` flag when installing. Used by developer tools (e.g. code editors, compilers) that need broad access.

Snaps auto-update silently in the background by default. Each snap revision is kept on disk so rollback is instant if an update breaks something.

## Installing Apps

```bash
# Search for a snap
snap find keyword

# Install a snap (strict confinement)
snap install app-name

# Install a snap with classic confinement (for dev tools)
snap install app-name --classic

# Run a snap
snap run app-name
```

## Managing Installed Snaps

```bash
# List installed snaps
snap list

# Check available updates
snap refresh --list

# Update all snaps
snap refresh

# Update a specific snap
snap refresh app-name

# Roll back a snap to the previous revision
snap revert app-name

# Remove a snap
snap remove app-name
```

## Permissions & Interfaces

Snaps declare the system resources they need as *interfaces*. Some connect automatically; others require manual approval.

```bash
# List all interfaces for a snap
snap connections app-name

# Connect an interface manually
snap connect app-name:camera

# Disconnect an interface
snap disconnect app-name:camera

# List all available interfaces on the system
snap interface
```

## Managing the Snap Daemon

```bash
# Check snapd status
sudo systemctl status snapd

# View snapd logs
journalctl -u snapd -f

# Check AppArmor confinement status
sudo apparmor_status | grep snap
```

## Popular Snaps

```bash
# Developer tools
snap install code --classic          # VS Code
snap install sublime-text --classic  # Sublime Text
snap install android-studio --classic

# Communication
snap install slack --classic
snap install discord

# Utilities
snap install bitwarden
snap install multipass               # Ubuntu VM manager
```

## Snap Data Location

| Type | Path |
|------|------|
| Snap subvolume | `/var/lib/snapd/` (`@snapd` subvolume) |
| Snap revisions | `/var/lib/snapd/snaps/` |
| Snap writable data | `/var/lib/snapd/hostfs/home/` |
| AppArmor profiles | Loaded by `snapd.apparmor.service` at boot |

The `@snapd` subvolume is shared by both `@blue` and `@green` slots, so installed snaps are available regardless of which slot you booted. They persist through every system update and rollback.

## Auto-Updates

Snaps auto-update silently in the background via snapd's built-in refresh mechanism. You can check or control this:

```bash
# Check when the last refresh happened
snap refresh --time

# Hold updates for a specific snap (defer for up to 90 days)
snap refresh --hold=48h app-name

# Resume auto-updates for a snap
snap refresh --unhold app-name
```
