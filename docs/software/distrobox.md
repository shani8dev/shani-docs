---
title: Distrobox
section: Software & Apps
updated: 2026-04-01
---

# Distrobox

Distrobox is the recommended way to run software that requires traditional package managers on Shanios. It creates a full mutable Linux container (Ubuntu, Fedora, Arch, etc.) with seamless desktop integration — your home directory, display, audio, GPU, and USB devices are all available inside.

## Creating a Container

```bash
# Ubuntu 24.04 (recommended for broad compatibility)
distrobox create --name ubuntu --image ubuntu:24.04

# Fedora 41
distrobox create --name fedora --image fedora:41

# Arch Linux (close to Shanios base — good for AUR access)
distrobox create --name arch --image archlinux:latest

# List available images
distrobox create --help | grep -A20 "image"
```

## Entering and Using a Container

```bash
# Enter a container
distrobox enter ubuntu

# Run a command directly (no interactive shell)
distrobox enter ubuntu -- bash -c "apt list --installed 2>/dev/null | head -20"

# Inside the container — full apt/dnf/pacman access
sudo apt update && sudo apt install build-essential
sudo apt install python3-dev libssl-dev

# Your home directory is the same inside and outside
ls ~/   # same files
```

## Exporting Apps to Your Host

Export a GUI application or CLI binary to your host launcher/PATH:

```bash
# Export a GUI app (creates a .desktop entry in your launcher)
distrobox-export --app code                 # VS Code installed inside the container
distrobox-export --app gimp

# Export a CLI binary to ~/.local/bin/ (available in host PATH)
distrobox-export --bin /usr/bin/gcc
distrobox-export --bin /usr/local/bin/my-tool

# Remove an exported app
distrobox-export --app code --delete
```

After exporting a GUI app, it appears in GNOME Activities or KDE Application Menu and launches inside the container transparently.

## Managing Containers

```bash
# List all containers
distrobox list

# Stop a running container
distrobox stop ubuntu

# Remove a container (data in home is unaffected)
distrobox rm ubuntu

# Remove and recreate (upgrade the distro)
distrobox rm ubuntu
distrobox create --name ubuntu --image ubuntu:24.04
distrobox enter ubuntu
```

## Development Workflows

```bash
# Python dev environment in Ubuntu
distrobox create --name pydev --image ubuntu:24.04
distrobox enter pydev
sudo apt install python3.12 python3.12-venv python3-pip
python3 -m venv ~/venvs/myproject
source ~/venvs/myproject/bin/activate
pip install django numpy pandas

# Node.js via nvm inside Fedora
distrobox enter fedora
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 22
node --version
```

## Host Integration

Inside a Distrobox container:
- `~` is the same as on the host — files are shared
- `DISPLAY`, `WAYLAND_DISPLAY`, `DBUS_SESSION_BUS_ADDRESS` are forwarded — GUI apps work
- PipeWire/PulseAudio socket is shared — audio works
- GPU is available — hardware acceleration works
- `host-spawn <command>` runs a command on the host from inside the container

```bash
# From inside a container — run something on the host
host-spawn flatpak run org.gimp.GIMP
host-spawn systemctl --user restart pipewire
```

## Tips
- Install heavy build dependencies in Distrobox rather than Nix to keep the Nix store clean
- For AUR packages, use the `arch` container — `yay` and `paru` work inside it
- Container data (installed packages) lives in Podman storage (`@containers`), not your home directory — reinstalling a container resets its installed packages, but not your home files
