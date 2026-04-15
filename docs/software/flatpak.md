---
title: Flatpak
section: Software & Apps
updated: 2026-04-01
---

# Flatpak

Flatpak is the primary method for installing GUI applications on Shanios. Flathub is pre-configured and ready to use from first boot — no setup required.

## Installing Apps

```bash
# Install from Flathub
flatpak install flathub org.videolan.VLC
flatpak install flathub com.spotify.Client
flatpak install flathub org.gimp.GIMP

# Search for an app
flatpak search gimp

# Install from GUI
# Open GNOME Software or KDE Discover — Flathub apps appear automatically
```

## Managing Installed Apps

```bash
# List installed apps
flatpak list --app

# Update all apps
flatpak update

# Remove an app
flatpak uninstall org.videolan.VLC

# Remove an app and its data
flatpak uninstall --delete-data org.videolan.VLC

# Remove unused runtimes (free space)
flatpak uninstall --unused
```

## Auto-Updates

Flatpak apps update automatically via two systemd timers — one for system-wide installs, one for per-user:

```bash
# Check timer status
systemctl status flatpak-update-system.timer
systemctl --user status flatpak-update-user.timer

# Disable auto-updates (not recommended)
sudo systemctl disable flatpak-update-system.timer
```

## Permissions & Sandboxing

Flatpak apps run in a sandbox. Use **Flatseal** (pre-installed) to manage permissions via GUI, or the CLI:

```bash
# View permissions for an app
flatpak info --show-permissions org.gimp.GIMP

# Grant filesystem access
flatpak override --user --filesystem=home org.gimp.GIMP

# Reset permissions to defaults
flatpak override --user --reset org.gimp.GIMP
```

## App Data Location

| Type | Path |
|------|------|
| App data | `~/.var/app/<app-id>/` |
| System runtime | `/var/lib/flatpak/` (`@flatpak` subvolume) |
| User runtime | `~/.local/share/flatpak/` |

The `@flatpak` subvolume is shared by both `@blue` and `@green` slots, so installed apps are available regardless of which slot you booted.

## Running Apps from Terminal

```bash
# Run a Flatpak app
flatpak run org.videolan.VLC

# Run with extra permissions (temporary)
flatpak run --filesystem=home org.videolan.VLC

# Open a shell inside the Flatpak sandbox
flatpak run --command=sh org.videolan.VLC
```

## Adding Other Remotes

```bash
# Add a remote (e.g., GNOME nightly)
flatpak remote-add --if-not-exists gnome-nightly \
  https://nightly.gnome.org/gnome-nightly.flatpakrepo

# List remotes
flatpak remotes

# Remove a remote
flatpak remote-delete gnome-nightly
```
