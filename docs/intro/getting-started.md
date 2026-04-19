---
title: Getting Started
section: Introduction
updated: 2026-04-27
---

# Getting Started

A complete walkthrough: choose your edition, download and verify the ISO, install, and configure Shanios for daily use.

## Choosing Your Edition

**GNOME Edition** (~5.4 GB) is the right choice for most people — Windows and macOS switchers, office work, students, and OEM deployments. Clean, focused interface. All essential apps pre-installed including Vivaldi Browser and OnlyOffice.

**KDE Plasma Edition** (~7.6 GB) is the right choice for gamers and power users. The complete gaming stack (Steam, Proton, Heroic Games Launcher, Lutris, MangoHud) is pre-installed and configured. Fully customisable desktop. Full KDE productivity suite including Okular, Kate, and Gwenview. virt-manager for virtual machines.

If you are unsure, start with GNOME. You can always install KDE apps on GNOME or switch editions later.

## System Requirements

- UEFI firmware (not legacy/CSM — most PCs made after 2012)
- 64-bit x86 CPU (Intel or AMD)
- Virtualisation enabled in BIOS (Intel VT-x or AMD-V)
- 4 GB RAM minimum, 8 GB recommended
- 32 GB storage minimum, 64 GB recommended
- 8 GB USB drive for installation

## Pre-Installation BIOS/UEFI Setup

Access your BIOS/UEFI via F2, F10, Del, or Esc at startup, then:

1. Disable legacy/CSM mode — enable UEFI boot
2. Disable Fast Boot
3. Disable Secure Boot temporarily (re-enable after install)
4. Set SATA mode to AHCI
5. Enable Intel VT-x or AMD-V

## Download and Verify

Download from [shani.dev](https://shani.dev):

- **GNOME Edition**: `signed_shanios-gnome-2026.04.15-x86_64.iso`
- **KDE Plasma Edition**: `signed_shanios-plasma-2026.04.15-x86_64.iso`

Always verify before writing. Place the `.iso`, `.sha256`, and `.asc` files in the same directory, then:

```bash
# Verify checksum
sha256sum -c signed_shanios-gnome-2026.04.15-x86_64.iso.sha256

# Import signing key (once)
gpg --keyserver keys.openpgp.org --recv-keys 7B927BFFD4A9EAAA8B666B77DE217F3DA8014792

# Verify GPG signature
gpg --verify signed_shanios-gnome-2026.04.15-x86_64.iso.asc \
    signed_shanios-gnome-2026.04.15-x86_64.iso
```

Both should report OK / Good signature.

## Write to USB

**Recommended:** [Balena Etcher](https://etcher.balena.io) — select ISO, select USB, flash. Works on Windows, macOS, and Linux.

**Windows alternative:** [Rufus](https://rufus.ie) — select your USB, select the ISO, change the write mode to **DD Image** (not ISO), click Start.

**Linux with dd:**
```bash
lsblk   # find your USB device
sudo dd bs=4M if=signed_shanios-gnome-2026.04.15-x86_64.iso \
    of=/dev/sdX status=progress oflag=sync
```

> **Do not use Ventoy.** Ventoy's ISO mounting method conflicts with the Shanios bootloader.

## Installation

Boot from the USB (press F12, F2, or Del at startup and select the USB). Select **"Install Shanios"** from the boot menu.

The installer walks you through:

1. Language and keyboard layout
2. Timezone
3. Disk selection (use automatic partitioning unless you need a custom layout)
4. **Encryption** — enable LUKS2 if this is a laptop (strongly recommended)
5. User account creation

Installation takes 10–15 minutes. The installer creates all Btrfs subvolumes, extracts the system image, builds both Unified Kernel Images, and registers the UEFI boot entry automatically. Remove the USB drive when prompted and reboot.

## First Boot

The Plymouth boot screen appears. If you enabled encryption, you will be prompted for your passphrase (or, after enrolling TPM2, it unlocks silently). The Initial Setup wizard runs on first login.

Confirm your active slot:

```bash
cat /data/current-slot
# prints: blue
```

## Recommended First Steps

### 1. Add a Nix channel

Nix is pre-installed but needs a channel configured before installing packages:

```bash
nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs
nix-channel --update
```

After this, `nix-env -i <package>` works for any Nixpkgs package. Installed packages live in `@nix` and survive every OS update.

### 2. Enroll TPM2 for passwordless disk unlock (if LUKS2 is enabled)

```bash
sudo gen-efi enroll-tpm2
```

See [TPM2 Enrollment](../security/tpm2) for full details.

### 3. Update the system

```bash
sudo shani-deploy
```

This downloads the latest OS image to the inactive slot, verifies it, builds a new UKI, and sets it as the next-boot default. Reboot when ready. If anything goes wrong after the reboot:

```bash
sudo shani-deploy -r  # rollback to previous slot
sudo reboot
```

### 4. Install applications

Flatpak is the primary way to install GUI applications:

```bash
flatpak install flathub com.spotify.Client
flatpak install flathub com.visualstudio.code
flatpak install flathub org.gimp.GIMP
```

Apps install to `@flatpak` and auto-update every 12 hours. For apps not on Flathub, Snap is pre-configured as a fallback:

```bash
snap install some-tool --classic
```

### 5. Set up Waydroid for Android apps (optional)

```bash
sudo waydroid init
waydroid session start
waydroid show-full-ui
```

Firewall rules are pre-configured. Hardware acceleration works on Intel and AMD.

## Installing Developer Tools

**Distrobox** creates a full mutable Linux container with any distro's package manager:

```bash
distrobox create --name arch-dev --image archlinux:latest
distrobox enter arch-dev   # full pacman + AUR inside

distrobox create --name ubuntu-dev --image ubuntu:24.04
distrobox enter ubuntu-dev  # full apt inside
```

The container's home directory is your home directory. Binaries exported from the container appear in your host app launcher.

**Nix** covers CLI tools and language runtimes:

```bash
nix-env -i nodejs rustup python312 ripgrep fd bat htop
```

**Podman** for containerised services and databases:

```bash
podman run -d -p 5432:5432 -e POSTGRES_PASSWORD=secret postgres
```

**AppImages** run directly; Gear Lever (pre-installed) integrates them into your launcher.

## Common Questions

**Can I install packages with pacman?**
No — the immutable root means changes would be overwritten on the next update. The workflow alternatives are: Flatpak for GUI apps, Snap as fallback, Nix for CLI tools and runtimes, Distrobox for a full mutable Linux environment, Podman for containerised services, and AppImages for portable executables.

**What happens to my files if I roll back?**
Nothing. Your home directory is in `@home`, Flatpak apps are in `@flatpak`, Nix packages in `@nix`, Snap packages in `@snapd` — all completely independent of the OS slots. An OS rollback never touches any of them.

**Can I dual boot?**
Possible but not recommended — other OSes may overwrite the Shanios bootloader. A virtual machine via virt-manager or GNOME Boxes is the more reliable approach for running Windows alongside Shanios.

**How do I find apps?**
[Flathub.org](https://flathub.org) has the full Flatpak catalogue. GNOME Software and KDE Discover let you browse from the desktop. For CLI tools, [search.nixos.org](https://search.nixos.org/packages) covers the Nix package set.

## See Also

- [What is Shanios?](what-is-shanios) — core concepts
- [Migrating from Traditional Linux](migrating) — workflow mapping table
- [What's Included](whats-included) — full software stack
- [Atomic Updates](../concepts/atomic-updates) — how `shani-deploy` works
- [TPM2 Enrollment](../security/tpm2) — passwordless disk unlock
