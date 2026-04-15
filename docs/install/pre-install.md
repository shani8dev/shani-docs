---
title: Pre-Installation Setup
section: Installation
updated: 2026-04-01
---

# Pre-Installation Setup

## BIOS/UEFI Configuration

Configure your firmware before installation (typically accessed via F2, F10, Del, or Esc during startup):

1. **Enable UEFI Boot** — Disable legacy/CSM mode. Shanios requires UEFI.
2. **Disable Fast Boot** — Fast Boot can interfere with USB boot and Linux installation.
3. **Disable Secure Boot (Temporarily)** — Required for installation. Can be re-enabled after enrolling Shanios MOK keys.
4. **Set SATA Mode to AHCI** — Ensures optimal disk performance and compatibility.
5. **Enable Virtualization** — Enable Intel VT-x or AMD-V for container support.

## Downloading & Verifying the ISO

Download the Shanios ISO from [shani.dev](https://shani.dev) or directly from SourceForge:

- **GNOME Edition** (2026.04.01, ~5.4 GB):
  [ISO](https://sourceforge.net/projects/shanios/files/gnome/20260401/) ·
  SHA256 · GPG signature · Torrent
- **KDE Plasma Edition** (2026.04.01, ~7.6 GB):
  [ISO](https://sourceforge.net/projects/shanios/files/plasma/20260401/) ·
  SHA256 · GPG signature · Torrent

**Always verify before writing.** Every Shanios ISO is SHA256 checksummed and GPG signed. Verifying the checksum confirms the file downloaded completely and hasn't been tampered with. Place the `.iso`, `.sha256`, and `.asc` files in the same directory before running the commands below.

### Linux / macOS — Verify SHA256 + GPG

```bash
# GNOME edition — substitute the Plasma filename for the KDE edition

# 1. Verify checksum
sha256sum -c signed_shanios-gnome-2026.04.01-x86_64.iso.sha256

# 2. Import the Shanios signing key (once)
gpg --keyserver keys.openpgp.org --recv-keys 7B927BFFD4A9EAAA8B666B77DE217F3DA8014792

# 3. Verify GPG signature
gpg --verify signed_shanios-gnome-2026.04.01-x86_64.iso.asc signed_shanios-gnome-2026.04.01-x86_64.iso
```

SHA256 expected output: `signed_shanios-gnome-2026.04.01-x86_64.iso: OK`. GPG should report `Good signature from "Shani OS"`. Any other result means the download is corrupt or tampered — delete it and re-download.

### Windows (PowerShell) — Verify SHA256

```powershell
Get-FileHash signed_shanios-gnome-2026.04.01-x86_64.iso -Algorithm SHA256
```

Compare the output hash against the contents of the downloaded `.sha256` file — they must match exactly.

## Writing to USB

- **Recommended (all platforms):** [Balena Etcher](https://etcher.balena.io) — select ISO, select USB, flash.
- **Windows alternative:** [Rufus](https://rufus.ie) — use **DD image mode**, not ISO mode.
- **Linux with `dd`:**

```bash
# Find your USB device first — confirm the target before proceeding
lsblk

# Write (replace /dev/sdX with your actual USB device, e.g. /dev/sdb)
sudo dd bs=4M if=signed_shanios-gnome-2026.04.01-x86_64.iso of=/dev/sdX status=progress oflag=sync
```

> **Do not use Ventoy.** Ventoy's ISO mounting method conflicts with Shanios's bootloader and will cause installation failures. Use Balena Etcher or Rufus instead.
