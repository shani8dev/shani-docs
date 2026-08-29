---
title: Overview
section: Overview
updated: 2026-08-28
---

# Shanios Technical Documentation

Comprehensive guide to the immutable Linux OS with atomic updates.

Welcome to the Shanios technical documentation. This wiki provides comprehensive information about Shanios's architecture, installation, configuration, and daily use.

Shanios is an **immutable Linux desktop** built on Arch Linux. The OS core is permanently read-only — nothing running on your machine can modify it, not even root. It always keeps two complete, bootable copies of the OS on disk. You run on one; updates are prepared on the other. When you're ready, reboot into the new one. If anything goes wrong, reboot back. It ships in three desktop editions today — **GNOME**, **KDE Plasma**, and **COSMIC** — plus a **Kiosk** profile for single-purpose deployments and a headless **Server** profile. It works out of the box with no post-install tweaking required.

At the time of writing, the current stable release is **2026.05.18**: GNOME edition ~5.4 GB · KDE Plasma edition ~7.6 GB · COSMIC edition ~5.2 GB · Kiosk edition ~4.8 GB · Server edition ~3.5 GB · all SHA256 + GPG signed

## Five Core Ideas

- **Immutability:** The root filesystem is read-only at runtime. Neither accidental commands nor malware can corrupt the OS — it always boots to a known-good state. Even a process running as root cannot modify core system files during a live session.
- **Atomic updates via blue-green deployment:** Two complete system images (`@blue` and `@green`) are maintained at all times. Updates are written to the inactive image; you boot into it only when it's ready. The previous image remains as an instant rollback target. If the new copy can't boot at all, systemd-boot detects the failure and reverts automatically.
- **Selective persistence:** Your data, configuration, Flatpak apps, containers, and service credentials all live in separate Btrfs subvolumes that survive every update and rollback untouched.
- **Defence-in-depth security:** Six Linux Security Modules run simultaneously (`lsm=landlock,lockdown,yama,integrity,apparmor,bpf`), LUKS2 argon2id encryption, TPM2 auto-unlock, Secure Boot, Intel ME kernel modules blacklisted by default, and every OS image SHA256+GPG verified before deployment.
- **Zero telemetry:** No usage data, crash reports, analytics, or tracking of any kind — ever.

Built in India 🇮🇳 by [Shrinivas Vishnu Kumbhar](https://github.com/Shrinivasvkumbhar). Indian-language support (Devanagari, Tamil, Telugu, and more) is a first-class feature.

**New to Shanios?** Visit [shani.dev](https://shani.dev) for a general introduction, download links, and feature overview. This wiki focuses on technical implementation and usage details.

## Editions

| Edition | Size | Best For |
|---------|------|----------|
| **GNOME** | ~5.4 GB | Most users — Windows/macOS switchers, office work, students, OEM deployments |
| **KDE Plasma** | ~7.6 GB | Gamers and power users — full gaming stack pre-installed, virt-manager, full KDE suite |
| **COSMIC** | ~5.2 GB | Modern desktop — tiling, keyboard-driven, System76's Cosmic DE |
| **Kiosk** | ~4.8 GB | Single-purpose deployments — digital signage, kiosks, locked-down environments |
| **Server** | ~3.5 GB | Headless servers — minimal footprint, no desktop environment |

## Quick Links

- [What is Shanios?](intro/what-is-shanios) — core concepts explained
- [Getting Started](intro/getting-started) — download, verify, install, first boot
- [Migrating from Traditional Linux](intro/migrating) — workflow mapping
- [What's Included](intro/whats-included) — full software stack
- [System Updates](updates/system) — update and rollback
- [Security Features](security/features) — full security model
- [Troubleshooting](troubleshooting) — common issues and solutions
- [FAQ](faq) — frequently asked questions

## Current Release

**Stable:** 2026.05.18 · **Channels:** latest, stable

All images are SHA256 checksummed and GPG-signed. Verify downloads using the signatures at [downloads.shani.dev](https://downloads.shani.dev).

## Project Repositories

| Repo | Purpose |
|------|---------|
| [shani-platform](https://github.com/shani8dev/shani-platform) | Fleet management server (FastAPI) |
| [shani-fleet](https://github.com/shani8dev/shani-fleet) | Fleet agent (heartbeat, commands) |
| [shani-insights](https://github.com/shani8dev/shani-insights) | Workforce analytics server |
| [shani-deploy](https://github.com/shani8dev/shani-deploy) | Transactional deployment scripts |
| [shani-builder](https://github.com/shani8dev/shani-builder) | Build environment + package publisher |
| [shani-install-media](https://github.com/shani8dev/shani-install-media) | ISO/image build pipeline |
| [shani-pkgbuilds](https://github.com/shani8dev/shani-pkgbuilds) | Package build scripts |
| [shani-keyring](https://github.com/shani8dev/shani-keyring) | Pacman trust root |
| [shani-repo](https://github.com/shani8dev/shani-repo) | Published package repository |
| [shani-settings](https://github.com/shani8dev/shani-settings) | Filesystem overlay |
| [os-installer-config](https://github.com/shani8dev/os-installer-config) | Installer scripts |
| [shani-website](https://github.com/shani8dev/shani-website) | Marketing site |
| [shani-docs](https://github.com/shani8dev/shani-docs) | Documentation (this site) |
| [shani-wiki](https://github.com/shani8dev/shani-wiki) | Technical wiki |
| [shani-blog](https://github.com/shani8dev/shani-blog) | Engineering blog |

## How to Use This Wiki

| Section | What you'll find |
|---------|------------------|
| **[Introduction](intro/what-is-shanios)** | What Shanios is, how it works, and getting started |
| **[Concepts](concepts/immutability)** | Architecture deep-dives: immutability, blue-green, persistence, atomic updates |
| **[Installation](install/steps)** | Requirements, pre-install checklist, installation steps, first boot |
| **[Software & Apps](software/flatpak)** | App stores (Flatpak, Nix, Snap, Homebrew), containers, gaming, VMs |
| **[Networking](networking/bluetooth)** | Bluetooth, SSH, VPN, DNS, firewall, and every networking daemon |
| **[Security](security/features)** | Polkit tiers, LUKS, TPM, AppArmor, Secure Boot, audit, hardening |
| **[System](system/audio)** | Audio, display, storage, backup, kernel modules, users & groups |
| **[Updates](updates/system)** | How updates work, rollback, configuration management, health checks |
| **[Architecture](arch/boot)** | Boot process, Btrfs layout, dracut, build pipeline, fleet deployment |
| **[Troubleshooting](troubleshooting)** | Diagnosing and fixing common issues |

## See Also

- [shani.dev](https://shani.dev) — public-facing site with download links and feature overview
- [GitHub](https://github.com/shani8dev/shani-platform) — source code, issue tracker, releases
- [`shani-settings` repo](https://github.com/shani8dev/shani-settings) — Polkit rules, system overlays, configuration
