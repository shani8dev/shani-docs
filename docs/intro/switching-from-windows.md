---
title: Switching from Windows & macOS
section: Introduction
updated: 2026-08-28
---

# Switching from Windows & macOS

This guide is for anyone leaving Windows or macOS for Shanios — whether you are migrating one laptop, setting up a family machine, or moving because your current OS no longer respects you. No Linux experience is assumed and none is required.

The single biggest difference: Shanios is immutable. The operating system is a verified, read-only image. Nothing you do day to day — installing apps, changing settings, clicking the wrong thing — can break it. Updates apply atomically and roll back with one command (`sudo shani-deploy -r`). If a truly fresh start is ever needed, `shani-reset` returns the system to factory state while leaving your personal files untouched.

Everything below applies to every edition — **GNOME** and **KDE Plasma** today, with the announced **COSMIC** edition to follow. Where an app differs by edition (the file manager, mainly), the difference is noted.

| Edition | File manager | Bundled apps | Pre-installed everywhere |
|---|---|---|---|
| GNOME | Files (Nautilus) | GNOME apps, Deja Dup | Vivaldi browser |
| KDE Plasma | Dolphin | KDE apps | OnlyOffice |
| COSMIC *(announced)* | COSMIC Files | COSMIC apps | Warehouse |

Pick an edition based on desktop taste — all include the same core: Vivaldi, OnlyOffice, Warehouse, Mission Center, IBus input, Nix, and the `shani-deploy` update system.

## Before You Leave Windows or macOS

Do these on your old machine first. Ten minutes here saves days later.

- **Copy your personal data** — Documents, Pictures, Videos, Desktop, Downloads — to a USB drive formatted as **exFAT or NTFS**. Both are fully readable and writable on Shanios. Cloud storage works equally well.
- **BitLocker (Windows):** turn it off or decrypt the drive before wiping. An encrypted old drive is unreadable afterwards without the recovery key, which most people have never saved.
- **FileVault (macOS):** disable it beforehand, or make certain you have the password. Time Machine backups cannot be restored directly on Linux either way — bring your *files*, not your backup container.
- **Export browser data:** sign in to browser sync (Firefox, Chrome, Vivaldi) so bookmarks, history, and passwords follow you automatically.
- **Note your email settings:** IMAP server, port, username, and password if they are stored only in your old mail client.
- **Deauthorise activations:** iTunes and Adobe products limit activations per licence. Deauthorize before wiping, not after.

## What Carries Over — and What Does Not

| Item | Carries over | How |
|---|---|---|
| Documents, media, photos | Yes | Any USB drive (exFAT/NTFS) or cloud sync |
| Installed programs | No | Reinstall the equivalents — nearly all are free |
| Browser profile | Yes | Browser sync (Vivaldi is pre-installed) |
| Fonts | Yes | Copy `.ttf`/`.otf` files into `~/.local/share/fonts` |
| Outlook PST archives | Yes | Importable into Thunderbird (Flathub) |
| Time Machine backups | Not directly | restic/borg cannot open them — copy the data out first |
| iPhone photos | Via iCloud or Mac | Download from iCloud.com, or copy to a drive on the Mac first |

The last two rows matter for macOS switchers in particular. Bring your *files*, not your backup formats: restic and borg are excellent backup tools on Shanios, but they cannot open Apple's Time Machine sparse bundles. Copy what you need onto an exFAT drive or cloud storage before you wipe the Mac.

Fonts are the small detail people forget: Windows and macOS ship different default fonts, so documents may look slightly different until you copy your font collection into `~/.local/share/fonts`. Nothing else is needed — fontconfig picks them up immediately.

## Habit Translation

Every daily habit has an equivalent. The names differ; the workflows do not.

### Everyday Tools

| Windows / macOS | Shanios |
|---|---|
| File Explorer / Finder | Files app — Nautilus (GNOME), Dolphin (KDE Plasma), COSMIC Files (COSMIC) |
| Microsoft Store / Mac App Store | Flathub via **Warehouse** (pre-installed) |
| Control Panel / System Settings | Settings app of your edition |
| Task Manager / Activity Monitor | Mission Center (pre-installed on the COSMIC edition), or `htop` in a terminal |
| cmd / PowerShell / Terminal.app | zsh with Starship prompt (pre-configured) |
| Action Centre / Notification Centre | Desktop notification centre; update prompts arrive via `shani-update` notifications |

### Applications

| Windows / macOS | Shanios |
|---|---|
| `.exe` installers / `.dmg` images | Flatpak first (Warehouse), then AppImage; Bottles runs Windows `.exe` apps |
| MS Office | OnlyOffice (pre-installed) or LibreOffice (Flathub) |
| Photoshop | GIMP or Krita (Flathub) |
| Illustrator | Inkscape (Flathub) |
| Time Machine | restic or borg (documented), Deja Dup (GNOME edition) |
| iCloud Drive | Nextcloud/self-hosted, or any cloud provider in the browser |
| Keychain | KeePassXC (Flathub); GNOME Keys with Seahorse/Secrets (GNOME edition) |

### Finding Software

Software discovery is the easiest part of switching. Open **Warehouse**, search, install — no download-and-run installers, no bundled toolbars, no "check this box to decline".

- Thunderbird, LibreOffice, GIMP, Inkscape, Krita, KeePassXC, Discord, Spotify, and thousands more are on Flathub, which is pre-configured out of the box.
- For CLI tools, Nix is pre-installed; Homebrew is supported for those arriving from macOS.
- Bottles handles Windows applications that have no Linux equivalent.
- Gaming has its own documented stack — see [Gaming](../software/gaming.md).

Office work needs no setup at all: **OnlyOffice and the Vivaldi browser ship on every edition**, so documents, spreadsheets, presentations, and web browsing work from first boot.

### Email, Photos, and Media

| Task | On Shanios |
|---|---|
| Email | Thunderbird (Flathub) — IMAP settings from your checklist go here |
| Importing Outlook PST | Thunderbird: Tools → Import |
| Photos from a camera or drive | Open with any image app; drives mount read/write (NTFS/exFAT included) |
| Music and video | Player of choice from Flathub |
| Cloud files | Any cloud provider works in Vivaldi; Nextcloud for self-hosted sync |

### Windows Applications

For the occasional Windows program with no Linux equivalent — a tax tool, a legacy utility — **Bottles** (Flathub) creates isolated Wine environments per application. Install it from Warehouse, create a bottle, run the `.exe` inside it. No Windows licence is required.

Applications that need a real Windows kernel (hardware drivers, kernel-level anti-cheat) are the exception; use a virtual machine for those, or keep them on a remaining Windows install.

## Installing

1. Download the ISO for your edition from [shani.dev](https://shani.dev).
2. Verify SHA256 checksum and GPG signature:

   ```bash
   sha256sum -c shanios-x86_64.iso.SHA256
   gpg --keyserver keys.openpgp.org --recv-keys 7B927BFFD4A9EAAA8B666B77DE217F3DA8014792
   gpg --verify shanios-x86_64.iso.sig shanios-x86_64.iso
   ```

3. Write to USB. On Linux/macOS use `dd`; on Windows use Rufus in **DD image mode**:

   ```bash
   sudo dd if=shanios-x86_64.iso of=/dev/sdX bs=4M status=progress oflag=sync
   ```

   > **Do not use Ventoy.** Its ISO mounting method conflicts with the Shanios bootloader.
4. Boot from the USB and follow the guided installer (`os-installer`). Partitioning is guided by default; full-disk **LUKS2 encryption** is offered as a checkbox — recommended, especially on laptops.
5. Reboot, remove the USB, done.

Full details including troubleshooting bad USB writes: [Install Steps](../install/steps.md).

### Post-Install Checklist

1. Run your first update: `sudo shani-deploy`, reboot when it finishes.
2. Sign in to browser sync in Vivaldi — bookmarks and passwords return.
3. Add your keyboard layouts, including any Indian languages (already configured via IBus).
4. Set up Thunderbird with your IMAP details; import your Outlook PST if you have one.
5. Install your usual apps from Warehouse.
6. Configure a backup: restic or borg for encrypted versioned backups, Deja Dup on GNOME.
7. If you enabled LUKS2, enrol TPM2 auto-unlock per [Getting Started](getting-started).

## Dual-Boot or Full Replacement

Both work. Choose based on honesty about how you will actually use it:

- **Dual-boot** keeps Windows around via the installer's manual partition step. Fine as a safety net — but be aware that major Windows updates have a habit of rewriting the boot order and putting themselves first. It is fixable, but annoying at 9am on a workday.
- **Full replacement** is cleaner and is what most people end up preferring once they realise everything they need exists on Shanios.

Secure Boot stays enabled either way — Shanio's bootloader is signed, so there is no BIOS fiddling before installation.

Whichever you choose, the exFAT/NTFS backup drive stays your safety net for the first month. Delete it only after a full week of real work on Shanios.

## First Week Adjustments

- **Expect different-but-equivalent.** The file manager opens files, the settings app changes settings, OnlyOffice opens your `.docx`. Muscle memory rebuilds in days, not weeks.
- **Find software in Warehouse**, not by searching the web for installers. If something is not on Flathub, check Nix, Homebrew, or Bottles for Windows apps.
- **Indian-language input is already configured.** IBus ships enabled with support for Devanagari, Bengali, Gujarati, Gurmukhi, Kannada, Malayalam, Oriya, Tamil, and Telugu scripts — add your keyboard layout in Settings and start typing. Switchers from multilingual setups do not need to hunt for input-method packages.
- **Backups work differently — better.** restic and borg give encrypted, versioned backups; Deja Dup offers a simple GUI on the GNOME edition. Set one up in week one.
- **When something breaks: it does not.** The OS cannot drift, half-update, or be corrupted by a bad install. If behaviour ever seems wrong, `shani-health` diagnoses the system, and `sudo shani-deploy -r` rolls back the last update in minutes.

## Getting Help

- [FAQ](../faq.md) — common questions from new users
- [Troubleshooting Guide](../troubleshooting.md) — systematic diagnosis when behaviour seems off
- [Getting Started](getting-started) — post-install walkthrough

Switcher-specific questions (dual-boot, data migration, app equivalents) are covered in the FAQ. For anything else, the troubleshooting guide is the fastest path to an answer.

## See Also

- [Getting Started](getting-started) — first steps after installation
- [What is Shanios?](what-is-shanios) — immutability, atomic updates, rollback
- [What's Included](whats-included) — the full pre-installed software stack
- [Migrating to Shani OS](https://blog.shani.dev/post/migrating-to-shani-os) — switching from another Linux distro instead
- [Shani OS Getting Started](https://blog.shani.dev/post/shani-os-getting-started)
- [Shani OS Software Ecosystem](https://blog.shani.dev/post/shani-os-software-ecosystem) — what to use when
