---
title: Migrating from Traditional Linux
section: Introduction
updated: 2026-04-01
---

# Migrating from Traditional Linux

If you're coming from Ubuntu, Fedora, Arch, or any mutable Linux distro, the main adjustment is how you install software and make system-level changes. Everything else — your dotfiles, shell, `/etc` configs, and all files under `/home` — works exactly as you'd expect.

## The Mental Model Shift

Stop thinking about "installing software into the system." Think instead in terms of these four layers:

- **Flatpak** is your new `apt install` / `pacman -S` for GUI applications. Flathub is pre-configured and ready to use from day one.
- **Distrobox** is your escape hatch. It creates a full mutable Linux container (Ubuntu, Fedora, Arch — your choice) with seamless desktop integration. Use it for development tools, build environments, anything that needs `apt` or `pacman`, and apps that export to your launcher.
- **Nix** (pre-installed, on the dedicated `@nix` subvolume) covers CLI tools and language runtimes with pinned versions and zero conflicts. Think of it as a supercharged user-space package manager. The `@nix` subvolume is shared across both slots so installed Nix packages survive updates and rollbacks. Add a channel with `nix-channel --add` before installing packages for the first time.
- **The `/etc` overlay** still works exactly like a normal `/etc`. Edit any config file with `sudo nano`, `sudo vim`, etc. — changes persist across all updates.

## What Cannot Be Done (and the Workaround)

| Traditional approach | Shanios equivalent |
|---|---|
| `sudo pacman -S foo` / `sudo apt install foo` | `flatpak install flathub foo`, or Distrobox |
| `sudo pip install` globally | `pip install --user`, or `nix-env -iA nixpkgs.python3Packages.foo`, or Distrobox |
| `sudo npm install -g` | `nix-env -iA nixpkgs.nodejs`, or `npm install -g` inside Distrobox |
| `make install` to system paths | Build and install inside Distrobox; export binaries to host with `distrobox-export --bin` |
| Modify `/usr`, `/opt`, `/bin` directly | For config files: use the `/etc` overlay. For binaries: Distrobox or Nix. |

**Dotfiles work normally.** Everything in `/home` is fully writable. Your `~/.zshrc`, `~/.config/`, `~/.local/` — unchanged. The immutability applies only to the OS itself, not your user space.
