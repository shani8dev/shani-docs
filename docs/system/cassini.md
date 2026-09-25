---
title: Shani Cassini (System Manager)
section: System
updated: 2026-09-25
---

# Shani Cassini

Shani Cassini is the Shanios system manager — named after the spacecraft that
orbited and watched over Saturn. It is part of the GNOME, KDE Plasma and COSMIC
editions from the images built after 25 September 2026; open it from the app grid (**Shani Cassini**) or run
`shani-cassini`. It shows what the system tools report and nothing else:
every page is backed by `shani-deploy`, `shani-health`, `gen-efi` or systemd
itself, so what you see is what the command line would tell you.

Open a page directly with `shani-cassini --section=<name>` (for example
`--section=updates`), where the name is one of `overview`, `health`,
`system`, `drivers`, `secureboot`, `encryption`, `updates`, `services`,
`backup`, `maintenance`, `chronoa`, `fleet`.

## Pages

| Page | What it does | Under the hood |
|------|--------------|----------------|
| **Overview** | Version, edition, slot, whether an update is waiting | `shani-deploy --status --check --json` |
| **Health** | Runs the integrity check and the security audit on request; lists this boot's error messages and recent crashes | `shani-health --verify --json`, `--security --json`, `journalctl -b -p err`, `coredumpctl` |
| **System Info** | Model, firmware, OS, clock sync, boot time, hardware, kernel | `hostnamectl`, `timedatectl`, `systemd-analyze` |
| **Drivers** | PCI devices and their kernel drivers | `lspci`, loaded modules |
| **Secure Boot** | Secure Boot state and MOK keys | `mokutil`, `gen-efi enroll-mok` |
| **Encryption** | Whether the disk is encrypted; set up or turn off TPM2 automatic unlock (optionally with a PIN) | `gen-efi tpm2-status`, `enroll-tpm2`, `remove-tpm2` |
| **Updates & Rollback** | Update channel (Stable/Latest), install an update, go back to the previous system | `shani-deploy`, `--set-channel`, `--rollback` |
| **Services** | Switch system services on or off, start/stop/restart, read a service's log | `systemctl`, `journalctl -u` |
| **Backup** | Backup location and tools; opens Shani Backup | `org.shani.backup` settings |
| **Maintenance** | Disk space, clean up old downloads, deduplicate, create a diagnostic report, reset the computer | `shani-deploy --cleanup/--optimize`, `shani-health --export-logs`, `shani-reset` |
| **Chronoa** | The assistant's engines and main switches; opens Chronoa | `org.shani.chronoa` settings |
| **Fleet** | Enrollment status of a managed device (only when the fleet agent is installed) | `shani-fleet-agent status` |

## Passwords

Reading the system state needs no password. Anything that changes the system
(an update, a rollback, a channel change, a health check, TPM or Secure Boot
changes, a reset) asks for an administrator password first, through the
desktop's normal polkit dialog. Updates and rollbacks keep the computer from
sleeping until they finish.

## Updating and going back

**Updates & Rollback** shows the version you run and the newest one on your
channel. **Update** installs it into the other system slot; restart when
asked. **Roll Back…** switches to the previous system (after a restart) — your
files and settings are not affected. See [Blue-Green Deployment](blue-green)
and [Update Channels](channels).

## Reset

**Maintenance → Reset this computer** runs [`shani-reset`](shani-reset): it
erases settings, user accounts and service data, keeps both system slots and
(unless you choose otherwise) everything in `/home`, then restarts. You type
`reset` to confirm — and `wipe home` as well if you chose to erase files.

## See Also

- [shani-health](shani-health)
- [TPM2 Auto-Unlock](tpm2)
- [Backup](backup)
