---
title: Overview
section: Overview
updated: 2026-11-22
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
- **Defence-in-depth security:** Six Linux Security Modules run simultaneously (`lsm=landlock,lockdown,yama,integrity,apparmor,bpf`) in confidentiality lockdown mode (`lockdown=confidentiality`), LUKS2 argon2id encryption, TPM2 auto-unlock, Secure Boot, Intel ME kernel modules **not** blacklisted by default (`mei`/`mei_me` load unless you blacklist them) and every OS image SHA256+GPG verified before deployment.
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

## The Shani Desktop

**Shani Shell** is the ShaniOS desktop, built on [niri](https://github.com/YaLTeR/niri) and [Quickshell](https://quickshell.org). It ships its own apps — open any of them from the launcher or with `shani app <name>`. They tile and float like any other window, appear in Alt+Tab, and can be pinned to the dock.

### Built-in apps

Alongside everyday apps (Files, Text Editor, Calendar, Notes, Mail, Photos, Maps, Media Player and more), the shell includes:

- **Contacts** — an address book whose vCard files are the same ones Shani Link reads on your phone; sync them with whatever you already use (vdirsyncer, Nextcloud, iCloud, Dropbox).
- **Disks** — see every disk and its SMART health, and erase, format, encrypt, or write an install stick. Destructive actions ask twice and need administrator approval.
- **Models** — download AI models that run on your machine (Ollama, llama.cpp), see what fits in your RAM, and connect cloud providers (OpenAI, Anthropic, Google Gemini, Groq, OpenRouter; Mistral via OpenRouter) with keys kept in Passwords and Keys.
- **Studio** — describe an app and have Chronoa generate a QML app you can open, run, or delete.
- **Terminal** — an SSH connection manager: saved hosts, keys, tunnels, snippets, and connection testing.
- **Backup** — a timeline of snapshots to restore your home from, in whole or just the paths you pick.
- **Mail** — an IMAP mail reader with folders, a message list, reading, and composing.
- **Feeds** — an RSS/Atom reader with subscriptions, unread counts, and OPML import.
- **Firewall** (in Settings) — firewalld zones, services, and ports, with rich rules for the zone you are using.

### Things worth knowing you can do

- **Notes** have checklists, attachments (an image on the clipboard becomes a file beside the note), and locked notes sealed with gpg. They live in `Documents/Notes` and can be mirrored to a mounted cloud folder (Nextcloud, Dropbox, a network drive).
- **Calendar** has day and year views, time zones, invitations, and natural-language entry — type "lunch Friday at noon".
- **Text Editor** has multiple cursors, column selection, snippets (type a trigger, press Tab), and TextMate grammars for syntax colouring.
- **Document Viewer** annotates PDFs with seven tools — pen, highlight, line, arrow, box, blur, and text — and can merge, split, and export pages.
- **Clipboard** has one-click transforms (plain text, UPPERCASE, lowercase, Title Case, trim) and optional encrypted history.
- **Screenshots** can be pinned in a window above your work, captured as one tall scrolling image, and annotated natively.
- **Global menu** — the focused app's menu bar appears in the top bar, macOS-style, read over D-Bus and AT-SPI.
- **Windows** — hold the bar's maximize/zoom button for a layout palette, snap windows to screen edges, and see everything at once in the workspace map and ribbon. Hovering a dock tile or a file path shows a preview without opening it.
- **Setup** — first-run setup offers to turn Chronoa on or leave it off.
- **Privacy** — locked notes and clipboard history are encrypted at rest, and Passwords and Keys keeps passkey references (metadata, not the credentials themselves) alongside your GPG keys.

### Recent refinements

- **Text Editor** — undo/redo, bookmarks, regex search, go-to-line, session restore.
- **Notes** — trash and restore, version history, formatting toolbar, tags, `@due()` dates.
- **Calendar** — repeat rules, per-event alarms and time zones, a quick-add field, `.ics` import.
- **Contacts** — repeatable phone/email rows, call/mail/map actions, QR sharing.
- **Mail & Feeds** — Cc/Bcc, saved attachments, flags and message source; feed tags, search, saved articles and auto-discovery.
- **Viewer** — PDF bookmarks, clickable links, attachments and an annotations list.
- **Media & capture** — chapters, go-to-time and A→B loop; camera timer, shutter sound and format choice; recorder formats/export; trimmer segments; multiple saved weather locations.
- **System** — SSH `-R`/`-D` tunnels, disk SMART self-tests and benchmark, per-process details and renice, ODRS ratings in Software, grouped notifications and a tray overflow drawer.

See the [Shani Shell repository](https://github.com/shani8dev/shani-shell) for the full feature list.

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
