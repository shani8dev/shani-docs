---
title: What's Included
section: Introduction
updated: 2026-04-01
---

# What's Included

Shanios comes fully equipped with a comprehensive software stack, carefully curated for desktop computing, development, gaming, and professional workloads. Everything works out of the box—no configuration required.

## System Foundation

- **Base:** Arch Linux with rolling release updates, latest stable kernel with Intel and AMD microcode
- **Firmware:** Comprehensive collection split by vendor: AMD GPU, Atheros, Broadcom, Cirrus, Intel, MediaTek, NVIDIA, Radeon, Realtek, and others
- **Bootloader:** systemd-boot with UEFI and Secure Boot support
- **Boot Graphics:** Plymouth with BGRT theme (displays manufacturer logo during boot)
- **Initramfs:** dracut with full UKI (Unified Kernel Image) generation via `gen-efi`
- **Filesystem:** Btrfs with compression, CoW snapshots, automated maintenance and continuous background deduplication via bees
- **Encryption:** LUKS2 (cryptsetup), fscrypt, ecryptfs-utils, gocryptfs
- **Network Storage:** NFS client/server, Samba/CIFS, SSHFS
- **Updates:** Atomic deployment via **shani-deploy** with automatic rollback on failed boot

## Security

- **Mandatory Access Control:** AppArmor enabled by default with policies enforced at boot
- **Firewall:** firewalld active with pre-configured rules for KDE Connect and Waydroid
- **Intrusion Prevention:** fail2ban for automated log-based banning
- **TPM:** tpm2-tools and tpm2-tss for hardware security module interaction
- **Smart Card & Hardware Keys:** opensc, ccid, libfido2 (FIDO2/U2F security keys)
- **Remote Access:** OpenSSH 10.x, Tailscale mesh VPN, cloudflared zero-trust tunnels
- **VPN Protocols:** OpenVPN, WireGuard, L2TP, PPTP, strongSwan/IKEv2, Cisco AnyConnect, SSTP, Fortinet SSL, Cisco VPNC — all pre-installed

## Desktop & Applications

- **Desktop Environment:** GNOME or KDE Plasma (chosen at download), Wayland-first with full X11 compatibility
- **Pre-installed Apps (both editions):** Vivaldi browser, OnlyOffice, Gear Lever, Warehouse, Flatseal, Pods, BoxBuddy
- **KDE extras:** Kate, Okular, Gwenview, Elisa, Haruna, Kamoso, KolourPaint, and games
- **GNOME extras:** Papers, Loupe, Showtime, Decibels, GNOME Text Editor, Gnote, Meld, Boxes, and games
- **Package Formats:** Flatpak (primary, from Flathub, auto-updates every 12 hours), AppImage via Gear Lever, Nix package manager (pre-installed)
- **Containers:** Podman (rootless), podman-docker, buildah, skopeo, Distrobox, LXC, LXD, Apptainer, Snap

## Multimedia

- **Audio:** PipeWire 1.4.x with full ALSA, JACK, and PulseAudio compatibility; WirePlumber session manager
- **Audio Codecs:** FLAC, OPUS, Vorbis, MP3, AAC, AC3/DTS, ALAC, Speex, SBC, LDAC, aptX, LC3, WavPack
- **Video:** Complete GStreamer plugin suite; FFmpeg (full build); AV1, HEVC, VP8/VP9, H.264, H.265, AVIF, HEIF, JPEG XL, WebP
- **Image Processing:** ImageMagick, camera RAW via libraw; HDR via libplacebo and libdovi

## Graphics Drivers & APIs

- **OpenGL/GLES:** Mesa 3D 25.x for Intel, AMD, NVIDIA (nouveau), and software rendering
- **Vulkan:** Drivers for Intel, AMD, NVIDIA open, software, VMs, DirectX-on-Vulkan, Qualcomm, Apple Silicon
- **Hardware Video Acceleration:** Intel iHD driver, NVIDIA open kernel module, VDPAU, VA-API
- **Hybrid Graphics:** nvidia-prime (PRIME render offload), switcheroo-control

## Printing & Scanning

- **Print System:** CUPS 2.4 with filters, PDF printer, network browsing, ipp-usb for driverless printers
- **Printer Drivers:** HP, Epson, Brother, Canon, and generic PCL drivers
- **Scanning:** SANE with sane-airscan (driverless network scanning via IPP)

## Networking

- **Connection Management:** NetworkManager 1.54.x, ModemManager (3G/4G/5G), wpa_supplicant
- **Mesh VPN / Tunneling:** Tailscale, cloudflared
- **DNS & Discovery:** dnsmasq, openresolv, Avahi (mDNS/DNS-SD)
- **Web Server:** Caddy 2.10.x with automatic HTTPS via Let's Encrypt
- **Remote Desktop:** FreeRDP client; kRDP/kRFB (KDE); gnome-remote-desktop (GNOME)

## Gaming

- **Controllers:** 8BitDo, PlayStation DS3/DS4/DualSense, Xbox, Nintendo Switch Pro, Joy-Cons, and many more
- **Racing Wheels:** Logitech, Thrustmaster, Fanatec with full force feedback
- **RGB Peripherals:** OpenRGB udev rules for keyboards, mice, headsets, fans from all major manufacturers
- **GameMode:** Auto-applies CPU governor, I/O priority, and GPU performance mode when games are launched

## Shell Experience

- **Default Shell:** Zsh 5.9 with fish-style syntax highlighting, autosuggestions, and history substring search
- **Prompt:** Starship — fast cross-shell prompt with git integration
- **Smart History:** McFly — neural network command history search
- **Fuzzy Finder:** FZF — integrated into Zsh for Ctrl+R, Ctrl+T, and Alt+C
- **Alternatives:** Bash 5.3 and Fish 4.5 also installed

## Fonts & Accessibility

- **Fonts:** Noto fonts family (including CJK, emoji), TTF Hack; Indian language support (Devanagari, Tamil, Telugu, etc.) pre-configured
- **Input Methods:** IBus with typing booster, Chinese, Japanese, Korean, Vietnamese, and Indic scripts
- **Accessibility:** Orca screen reader, espeak-ng TTS, brltty (braille), speech-dispatcher
