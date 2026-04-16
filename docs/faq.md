---
title: FAQ
section: FAQ
updated: 2026-05-13
---

# Frequently Asked Questions

Answers to the most common questions about Shani OS — software installation, updates, hardware, encryption, and the immutable architecture.

---

## Software & Packages

### Can I use `pacman -S` to install packages?
**No.** The OS root is read-only. More importantly, packages installed to `/usr` would be overwritten during the next OS update.
Use the correct layer for your software:
- **GUI Apps** → `flatpak install flathub <app>`
- **CLI / Dev Tools** → `nix-env -iA nixpkgs.<tool>`
- **Full Mutable Env** → `distrobox create --name <name> --image <distro>`

### How do I install a `.deb` or `.rpm`?
Use a Distrobox container matching the target distribution:
```bash
distrobox create --name ubuntu-dev --image ubuntu:24.04
distrobox enter ubuntu-dev
sudo dpkg -i package.deb
distrobox-export --app app-name
```

### I need a tool that only exists in the AUR.
Create an Arch-based Distrobox:
```bash
distrobox create --name arch-aur --image archlinux:latest
distrobox enter arch-aur
# Install yay (AUR helper) inside the box
git clone https://aur.archlinux.org/yay.git && cd yay && makepkg -si
yay -S <package-name>
distrobox-export --bin /usr/bin/<binary-name>
```

### Does Flatpak work exactly like on other distros?
Yes. Flathub is pre-configured. GNOME Software and KDE Discover use it by default. `flatpak install`, `update`, and `remove` work identically.

### Can I install development tools (Node, Python, Rust)?
Yes, via Nix:
```bash
nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs
nix-channel --update
nix-env -iA nixpkgs.nodejs_22
```
Nix packages survive every OS update and rollback.

### Can I run Windows applications?
Yes. Use **Bottles** (pre-installed on KDE, available on Flathub for GNOME) which provides a Wine-based compatibility layer. Steam's Proton is also pre-installed on KDE.

### What about Android apps?
**Waydroid** runs a full hardware-accelerated Android 11 stack.
- Setup: `sudo waydroid-helper init`
- Google Play: Requires a one-time GApps installation script included in the helper.

---

## Updates & Rollback

### How does updating work?
```bash
sudo shani-deploy update
```
This downloads a new OS image, verifies SHA256 + GPG signature, and writes it to the inactive slot. Your running system is never touched. Reboot to switch.

### How do I roll back?
```bash
sudo shani-deploy --rollback
sudo reboot
```
This restores the previous slot from its backup snapshot and sets it as the boot target.

### What happens to my files during an update?
**Nothing.**
- User data is in `@home`.
- Flatpak apps are in `@flatpak`.
- Nix store is in `@nix`.
- Containers are in `@containers`.
An update touches only `@blue` or `@green`.

### What if the new OS can't boot?
systemd-boot detects repeated boot failures and automatically falls back to the previous slot (Boot Counting).

### Will my `/etc` configuration survive an update?
Yes. Your `/etc` changes are stored in the OverlayFS upper layer (`@data`). They persist across updates and rollbacks.

---

## Hardware & Gaming

### Does NVIDIA work?
Yes. The `nvidia-open` driver is pre-installed (KDE) or available during install (GNOME). Secure Boot is supported via MOK-signed modules.

### Do gaming controllers work?
Yes. `game-devices-udev` rules are pre-installed (PlayStation, Xbox, Switch Pro, 8BitDo, etc.). Steam Input handles configuration.

### Does VR work?
HTC Vive, Valve Index, and PSVR are supported via SteamVR.

### Does my fingerprint sensor work?
Supported sensors work via `fprintd` at first boot. Enroll via Settings → Users.

---

## Storage & Encryption

### Should I enable LUKS2 encryption?
**Yes**, especially for laptops. Enable it in the installer, then run:
```bash
sudo gen-efi enroll-tpm2
```
This enables TPM2 auto-unlock, eliminating the passphrase prompt on your specific hardware.

### What happens if I update the BIOS?
The TPM PCR values change, and the TPM will refuse to release the LUKS key. You will be prompted for your passphrase. After booting, run:
```bash
sudo gen-efi cleanup-tpm2
sudo gen-efi enroll-tpm2
```

### Does hibernation work with encryption?
Yes. The swapfile is sized to RAM, and parameters are embedded in the UKI. TPM2 handles decryption at resume.

---

## Privacy & Telemetry

### Does Shani OS collect any data?
**No.** Zero telemetry. No usage data, no hardware reports, no analytics. `shani-deploy` connects only to download images via standard HTTP.

### How can I verify this?
The entire codebase is public at [github.com/shani8dev](https://github.com/shani8dev). You can audit every script, systemd unit, and service.
