---
title: Migrating from Traditional Linux
section: Introduction
updated: 2026-08-28
---

# Migrating from Traditional Linux

If you're coming from Ubuntu, Fedora, Arch, or any mutable Linux distro, the main adjustment is how you install software and make system-level changes. Everything else — your dotfiles, shell, `/etc` configs, and all files under `/home` — works exactly as you'd expect.

## The Mental Model Shift

On a traditional Linux distribution, software installation means writing files into the OS root. The package manager is the single source of truth for what is installed.

On Shanios, the OS root is frozen — a verified, signed image. You do not write into it because doing so would undermine the reliability guarantee: if you can add arbitrary packages to the OS, the OS is no longer the reproducible artefact that the update pipeline verified.

Instead, persistent layers sit alongside the OS, each in its own Btrfs subvolume:

- **`@flatpak`** — GUI desktop applications (browsers, office, media, etc.) — your new `apt install` / `pacman -S` for GUI apps. Flathub is pre-configured from day one.
- **`@snapd`** — Snap packages, pre-configured as a fallback for apps not on Flathub.
- **`@nix`** — CLI tools, development runtimes, and language toolchains with pinned versions and zero conflicts. Shared across both OS slots — installed Nix packages survive updates and rollbacks.
- **`@containers`** — Distrobox and Podman OCI containers. Distrobox is your escape hatch: a full mutable Linux container (Ubuntu, Fedora, Arch — your choice) with seamless desktop integration.
- **`@machines`** — systemd-nspawn system containers.
- **`@lxc`** / **`@lxd`** — LXC/LXD full system containers.
- **`@libvirt`** / **`@qemu`** — Virtual machine disk images.
- **`@waydroid`** — Android environment.

All of these survive every OS update and rollback. They are never touched by `shani-deploy`. They have their own update paths and do not conflict with each other.

**Dotfiles work normally.** Everything in `/home` is fully writable. Your `~/.zshrc`, `~/.config/`, `~/.local/` — untouched by the OS, ever. The immutability applies only to the OS itself, not your user space.

## Workflow Translation Table

### GUI Applications

| Traditional | Shanios |
|---|---|
| `sudo apt install firefox` | `flatpak install flathub org.mozilla.firefox` |
| `sudo dnf install gimp` | `flatpak install flathub org.gimp.GIMP` |
| `sudo pacman -S vlc` | `flatpak install flathub org.videolan.VLC` |
| `yay -S spotify` | `flatpak install flathub com.spotify.Client` |
| `sudo apt install code` | `flatpak install flathub com.visualstudio.code` |

Search for the Flatpak app ID at [flathub.org](https://flathub.org) or via `flatpak search <name>`. If an app is only available on the Snap Store, `snap install <name>` works as a fallback.

### CLI Tools and Development Runtimes

| Traditional | Shanios |
|---|---|
| `sudo apt install nodejs` | `nix-env -iA nixpkgs.nodejs` |
| `sudo pacman -S python` | `nix-env -iA nixpkgs.python312` |
| `sudo dnf install rustup` | `nix-env -iA nixpkgs.rustup` |
| `sudo apt install ripgrep` | `nix-env -iA nixpkgs.ripgrep` |
| `sudo pacman -S kubectl` | `nix-env -iA nixpkgs.kubectl` |
| `brew install bat` | `nix-env -iA nixpkgs.bat` |
| `sudo apt install golang` | `nix-env -iA nixpkgs.go` |
| `sudo pacman -S neovim` | `nix-env -iA nixpkgs.neovim` |
| `sudo pip install` globally | `pip install --user`, or `nix-env -iA nixpkgs.python3Packages.foo`, or Distrobox |
| `sudo npm install -g` | `nix-env -iA nixpkgs.nodejs`, or `npm install -g` inside Distrobox |
| `make install` to system paths | Build and install inside Distrobox; export with `distrobox-export --bin` |

Add a Nix channel before installing packages (one-time setup):

```bash
nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs
nix-channel --update
```

Then install anything from the 100,000+ packages at [search.nixos.org](https://search.nixos.org/packages):

```bash
nix-env -iA nixpkgs.package-name
```

### Windows Applications

Windows `.exe` software runs through Wine — no Windows licence required, no VM overhead for most apps.

| Traditional | Shanios |
|---|---|
| Run a Windows `.exe` installer | Open with Bottles — creates an isolated Wine environment |
| Install a Windows productivity tool | Bottles → Create bottle → Run Executable |
| Run legacy Windows software | Bottles with the Caffe or GE-Proton runner |
| `apt install wine` / `pacman -S wine` | Bottles (pre-installed on KDE Plasma; Flatpak on GNOME and COSMIC) |
| Windows game (non-Steam) | Bottles with GE-Proton, or Heroic Games Launcher |

**Bottles** (`com.usebottles.bottles`) is pre-installed on KDE Plasma and available on Flathub for the GNOME and COSMIC editions. For applications requiring a real Windows kernel (hardware drivers, anti-cheat, enterprise software with kernel-level components), use a Windows VM via virt-manager (pre-installed on KDE Plasma) or GNOME Boxes.

For portable AppImage tools: download the `.AppImage`, make it executable, and run — or open with **Gear Lever** (pre-installed) to add it permanently to your launcher with automatic update checking.

### System Updates

| Traditional | Shanios |
|---|---|
| `sudo apt upgrade` | `sudo shani-deploy` |
| `sudo pacman -Syu` | `sudo shani-deploy` |
| `sudo dnf upgrade` | `sudo shani-deploy` |
| Reboot to apply kernel | Reboot after `shani-deploy` |
| Roll back to previous packages | `sudo shani-deploy -r` (entire OS, instant) |

`shani-deploy` replaces the entire OS image — there is no partial update state. If the new image causes problems, rollback returns you to the previous complete OS state instantly.

### Containers and VMs

| Traditional | Shanios |
|---|---|
| `docker run` | `podman run` (rootless, drop-in compatible) |
| System-level service with `apt install` | `podman run` for containerised services; Distrobox for binaries |
| VM with VirtualBox / VMware | virt-manager + KVM (pre-installed on KDE); GNOME Boxes on GNOME |
| AUR helpers (`yay`, `paru`) | Distrobox with an Arch container — full AUR access inside |

### System-Level Software (Not Available on Host)

| Traditional | Shanios Alternative |
|---|---|
| `sudo pacman -S foo` to the live root | Flatpak, Nix, Distrobox, Snap |
| Modify `/usr`, `/bin`, `/lib` at runtime | `/etc` overlay for config; Distrobox for binaries |
| `sudo pacman -S nvidia` | Drivers are part of the OS image; already configured at install |
| Kernel modules via DKMS | Custom modules are not supported; use upstream drivers |
| `sudo apt install docker` | Use Podman (pre-installed, Docker-compatible) |
| `sudo pip install` globally | Would be overwritten on next update — use `pip install --user` or `nix-env` |
| `make install` to system directories | Read-only at runtime — build and export from Distrobox |
| Install software requiring out-of-tree kernel modules | Module must be in the shipped image — open a request; use DKMS in a container in the interim |
| Third-party APT repos / PPAs | Use inside a Distrobox Ubuntu container |

## What Is Exactly the Same

- Editing `/etc/hostname`, `/etc/hosts`, `/etc/fstab`, `/etc/ssh/sshd_config`, etc. — all normal; changes persist via OverlayFS
- `sudo systemctl enable/disable/start/stop` — works as expected, changes persist
- `~/.bashrc`, `~/.zshrc`, `~/.config/` — untouched by the OS, ever
- Cron jobs, user timers — stored in `@data`, survive updates
- `/home` in all its detail — completely independent of the OS slots
- Printer setup, Bluetooth pairing, NetworkManager connections — all persisted in `@data/varlib/`
- SSH, GPG keys, and credential management (stored in `~/.ssh` and `~/.gnupg`)
- Docker Compose workflows — use `podman compose` or `podman-docker` drop-in
- Git repositories and configuration
- Python virtual environments in `~/.venv` or project directories
- Node projects in `~/projects` with `node_modules`
- Dotfiles managed by `stow`, `chezmoi`, or a bare git repo

## Filesystem Layout

| Directory | Behaviour |
|---|---|
| `/home` | Fully writable, stored in `@home` — unchanged from any Linux distro |
| `/etc` | Writable via OverlayFS — your changes persist |
| `/tmp` | Writable tmpfs — cleared on reboot as usual |
| `/usr` | **Read-only** — OS files live here, you cannot modify them |
| `/bin`, `/lib`, `/sbin` | Symlinks into `/usr` — effectively read-only |
| `/var` | tmpfs — cleared on reboot; persistent state bind-mounted from `@data` |
| `/nix` | Writable by Nix — your Nix packages live here (`@nix`) |
| `/var/lib/flatpak` | Flatpak apps — writable via `@flatpak` |
| `/var/lib/snapd` | Snap packages — writable via `@snapd` |
| `/var/lib/containers` | Distrobox and Podman containers — writable via `@containers` |
| `/var/lib/machines` | systemd-nspawn system containers — writable via `@machines` |
| `/var/lib/lxd` | LXD containers — writable via `@lxd` |
| `/var/lib/libvirt` | VM disk images — writable via `@libvirt` |
| `/var/lib/waydroid` | Android environment — writable via `@waydroid` |

The read-only nature of `/usr` is the main thing to internalise. Anything that tries to write to `/usr/local/bin` or install files into `/usr/share` will fail. Use Nix, Flatpak, Snap, or Distrobox instead.

To see what you have customised (what differs from the OS defaults):

```bash
ls /data/overlay/etc/upper/
```

To revert a specific `/etc` file to the OS default:

```bash
sudo rm /data/overlay/etc/upper/path/to/file
# The OS default (lower OverlayFS layer) becomes active again
```

## Installing a Development Environment

A typical developer setup on Shanios:

```bash
# CLI tools via Nix — no root, no conflicts, pinned versions
nix-env -i git nodejs rustup python312 ripgrep fd bat

# Create an Arch Distrobox for AUR and pacman access
distrobox create --name arch-dev --image archlinux:latest
distrobox enter arch-dev
# Inside: full pacman + yay + AUR, home dir shared with host

# Export a binary from the container to the host launcher
distrobox-export --bin /usr/bin/some-tool

# Containerised database via Podman
podman run -d -p 5432:5432 -e POSTGRES_PASSWORD=secret postgres:16

# IDE as Flatpak
flatpak install flathub com.visualstudio.code
```

BoxBuddy (pre-installed) gives you a graphical interface for creating and entering Distrobox containers.

## Development Workflows

### Multiple Versions of the Same Tool

Nix installs multiple versions of the same tool simultaneously without conflict:

```bash
# Install both versions simultaneously — no conflict
nix-env -iA nixpkgs.nodejs_18
nix-env -iA nixpkgs.nodejs_22

# Per-project shell with a specific version (does not install globally)
nix-shell -p nodejs_18  # enters a shell with Node 18 on PATH
nix-shell -p nodejs_22  # separate shell with Node 22

# Reproducible project environment via shell.nix
# Place in project root — everyone running nix-shell gets identical tools
```

### Full System Containers (LXC/LXD and systemd-nspawn)

For workflows that need a complete isolated Linux system — with its own init, services, and network stack — two options are pre-installed:

**LXC/LXD** offers a built-in image catalog, port forwarding, and snapshot management. Container storage lives in `@lxc`/`@lxd`:

```bash
lxc launch ubuntu:24.04 myserver
lxc exec myserver -- bash
```

**systemd-nspawn** is the lightest option — no daemon, just point it at a Linux root directory and it boots. Container filesystems live in `@machines`:

```bash
sudo machinectl pull-tar --verify=no \
  https://geo.mirror.pkgbuild.com/images/latest/Arch-Linux-x86_64-basic.tar.zst archlinux
sudo machinectl start archlinux
sudo machinectl login archlinux
```

### Android Apps (Waydroid)

Waydroid runs a full hardware-accelerated Android stack in a container. The `@waydroid` subvolume persists across every OS update:

```bash
sudo waydroid init    # one-time setup
waydroid session start
waydroid show-full-ui
waydroid app install myapp.apk    # test your APK
```

## Shell and Terminal

The shell environment is configured out of the box:

```bash
echo $SHELL         # /usr/bin/zsh
which starship      # prompt
which fzf           # fuzzy finder
which eza           # modern ls replacement
# McFly for smart command history (Ctrl+R replacement) — already integrated
```

## Backup and Data Management

```bash
# restic is pre-installed — encrypted, versioned backups
restic -r s3:s3.amazonaws.com/mybucket init
restic -r s3:s3.amazonaws.com/mybucket backup ~/Documents ~/Projects ~/Pictures

# rclone is pre-installed — sync to cloud storage
rclone config  # set up Google Drive, S3, Backblaze, etc.
rclone sync ~/Documents gdrive:Backup/Documents
```

Both `restic` and `rclone` configurations persist in `/data/varlib/` and survive OS updates.

## See Also

- [Immutability](../concepts/immutability.md) — what you can and cannot do and why
- [Persistence Strategy](../concepts/persistence.md) — what survives updates and rollbacks
- [Getting Started](getting-started) — full setup walkthrough
- [docs.shani.dev — Nix](https://docs.shani.dev/doc/software/nix)
- [docs.shani.dev — Flatpak](https://docs.shani.dev/doc/software/flatpak)
- [docs.shani.dev — Distrobox](https://docs.shani.dev/doc/software/distrobox)
- [docs.shani.dev — Containers](https://docs.shani.dev/doc/software/containers)
- [docs.shani.dev — Android (Waydroid)](https://docs.shani.dev/doc/software/waydroid)
- [docs.shani.dev — AppImage](https://docs.shani.dev/doc/software/appimage)
- [docs.shani.dev — Snaps](https://docs.shani.dev/doc/software/snaps)
