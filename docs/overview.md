---
title: Overview
section: Overview
updated: 2026-04-01
---

# Shanios Technical Documentation

Comprehensive guide to the immutable Linux OS with atomic updates.

Welcome to the Shanios technical documentation. This wiki provides comprehensive information about Shanios's architecture, installation, configuration, and daily use.

Shanios is an **immutable Linux desktop** built on Arch Linux. The OS core is permanently read-only — nothing running on your machine can modify it, not even root. It always keeps two complete, bootable copies of the OS on disk. You run on one; updates are prepared on the other. When you're ready, reboot into the new one. If anything goes wrong, reboot back. It ships in two editions — **GNOME** and **KDE Plasma** — and works out of the box with no post-install tweaking required.

Current stable release: **2026.04.01** · GNOME edition ~5.4 GB · KDE Plasma edition ~7.6 GB · Both SHA256 + GPG signed.

## Five Core Ideas

- **Immutability:** The root filesystem is read-only at runtime. Neither accidental commands nor malware can corrupt the OS — it always boots to a known-good state. Even a process running as root cannot modify core system files during a live session.
- **Atomic updates via blue-green deployment:** Two complete system images (`@blue` and `@green`) are maintained at all times. Updates are written to the inactive image; you boot into it only when it's ready. The previous image remains as an instant rollback target. If the new copy can't boot at all, systemd-boot detects the failure and reverts automatically.
- **Selective persistence:** Your data, configuration, Flatpak apps, containers, and service credentials all live in separate Btrfs subvolumes that survive every update and rollback untouched.
- **Defence-in-depth security:** Six Linux Security Modules run simultaneously (`lsm=landlock,lockdown,yama,integrity,apparmor,bpf`), LUKS2 argon2id encryption, TPM2 auto-unlock, Secure Boot, Intel ME kernel modules blacklisted by default, and every OS image SHA256+GPG verified before deployment.
- **Zero telemetry:** No usage data, crash reports, analytics, or tracking of any kind — ever.

Built in India 🇮🇳 by [Shrinivas Vishnu Kumbhar](https://github.com/Shrinivasvkumbhar). Indian-language support (Devanagari, Tamil, Telugu, and more) is a first-class feature.

**New to Shanios?** Visit [shani.dev](https://shani.dev) for a general introduction, download links, and feature overview. This wiki focuses on technical implementation and usage details.
