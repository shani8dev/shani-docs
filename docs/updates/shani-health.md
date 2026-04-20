---
title: shani-health Reference
section: Updates & Config
updated: 2026-05-13
---

# shani-health Reference

`shani-health` is the system health and diagnostics CLI for Shanios. It provides a comprehensive single-command view of your system's state: boot chain, security posture, storage, hardware, networking, packages, containers, and more. It is the primary tool for diagnosing issues and checking system integrity.

---

## Basic Usage

```bash
# Full system status report (default)
shani-health

# Focused reports
shani-health --boot           # Boot chain, slots, UKI, deployment state
shani-health --security       # Secure Boot, LUKS, TPM2, users, LSMs
shani-health --hardware       # CPU, GPU, disk, SMART, battery, firmware
shani-health --network        # NetworkManager, DNS, VPN, firewall, servers
shani-health --packages       # Flatpak, snap, Nix, containers, virtualisation

# Storage analysis
shani-health --storage-info   # Btrfs subvolume sizes, compression, snapshots

# Log tools
shani-health --journal                  # Critical journal messages
shani-health --journal err              # Errors and above
shani-health --journal warning --since -1h   # Warnings in the last hour
shani-health --clean-logs               # Remove logs older than 30 days
shani-health --clean-logs 7             # Remove logs older than 7 days
shani-health --export-logs ~/           # Bundle diagnostics for bug reports

# Maintenance
shani-health --history 100              # Last 100 deploy/rollback events
shani-health --verify                   # Deep integrity check (runs Btrfs scrub)
shani-health --clear-boot-failure       # Clear a stale boot failure marker

# Output options
shani-health -v                         # Verbose/debug output
```

---

## What shani-health Checks

### Full Report (default / `--info`)

The default run covers every component in one pass. Sections include:

- **OS & Slots** — version, profile, channel, uptime, hostname, locale, timezone, machine-id, and the current/expected/candidate slot state
- **Boot Health** — boot chain services, dracut 99shanios module, failure markers, cmdline slot consistency
- **Boot Entries** — ESP space, EFI files (shim + mmx64 + sd-boot), UKI presence and signature validity, keymap, boot default
- **Deployment** — reboot-needed, deployment_pending, installed version, cmdline files, rollback backups
- **Update Tools** — gen-efi, GPG signing key, download cache, partial downloads, download tools
- **Data State** — `/data` mount, tmpfiles, shani-user-setup.path, varlib/varspool directories, overlay dirs
- **Immutability** — root read-only, `/var` tmpfs, `/etc` overlay, critical subvolumes
- **Secure Boot** — SB state, MOK key enrollment, MOK keypair validity, UKI signatures, UKI build tools
- **Kernel Security** — LSM stack (landlock/lockdown/yama/integrity/apparmor/bpf), kernel lockdown, module blacklist, protocol blacklist
- **Encryption** — LUKS state, KDF (argon2id recommended), key slots, crypttab, dracut crypt config
- **TPM2** — hardware presence, enrollment status, PCR policy vs current Secure Boot state
- **Security Services** — AppArmor, firewall, polkit, fail2ban, FIDO2/libfido2, pcscd, fprintd
- **Security Tools** — lynis hardening index, rkhunter scan history
- **Users & Access** — login users, passwords, wheel group, UID-0 accounts, NOPASSWD sudo, home permissions, SSH key permissions, GnuPG permissions
- **Groups** — system groups (kvm, video, input, realtime…), group membership from `/etc/shani-extra-groups`
- **Hardware** — CPU model/flags/microcode, RAM, GPU, virtualization, IOMMU, temperatures, Bluetooth, peripherals
- **Disk** — device model, SMART health, SSD wear, disk temperature, partition table, swap/hibernate
- **Battery** — charge level, health, cycle count (laptop/UPS systems only)
- **Storage** — Btrfs free space, scrub status, maintenance timers, bees deduplication, device errors
- **Firmware** — CPU microcode, fwupd, pending firmware updates
- **Performance** — power-profiles-daemon, irqbalance, ananicy-cpp, gamemode, THP
- **Network** — NetworkManager, DNS, DHCP, Wi-Fi backend, VPN, internet, resolv.conf, servers (SSH, Samba, NFS, web…)
- **Audio & Display** — PipeWire, WirePlumber, rtkit, display manager, XDG portals, Plymouth
- **Printing & Scanning** — CUPS, cups-browsed, ipp-usb, SANE
- **Package Managers** — Flatpak, Snap, Nix, AppImage, shani-update timer
- **Backup Tools** — rclone, restic
- **Containers** — Podman, Distrobox, LXD, Docker, Waydroid, nspawn
- **Virtualization** — KVM, libvirt daemons, VM inventory, default network, storage pools
- **Monitoring** — smartd, logrotate, cronie, tmpfiles, timesyncd, auditd, sysstat
- **Runtime Health** — CPU load, memory, ZRAM, OOM kills, kernel oops, MCE hardware errors, entropy, zombies, dirty memory, journal errors, `@log` size
- **Units** — failed systemd units (system and user)
- **Core Dumps** — systemd-coredump handler, recorded dumps
- **System Health** — D-Bus, logind, nsswitch, failed logins, boot time, kernel version, home usage

### Boot Report (`--boot`)

A focused view of the boot chain and deployment state. Covers OS/Slots, Boot Health, Boot Entries, Deployment, Update Tools, Data State, and Secure Boot. Use this after an update or when debugging boot issues.

### Security Report (`--security`)

Covers Secure Boot, Kernel Security, Encryption, TPM2, Security Services, Security Tools, Users & Access, and Groups. Useful for security audits and hardening checks.

### Hardware Report (`--hardware`)

Covers Hardware, Disk, Battery, Storage, and Firmware. Use when checking for disk health, temperatures, or firmware updates.

### Network Report (`--network`)

Covers Network and Servers. Use when debugging connectivity, DNS, or server configuration issues.

### Package Report (`--packages`)

Covers Package Managers, Backup Tools, Containers, Virtualisation, and Monitoring.

---

## Reading the Output

Each row uses a colour-coded status prefix:

| Prefix | Symbol | Meaning |
|--------|--------|---------|
| `OK` | ✓ green | Healthy |
| `!` | ⚠ yellow | Warning — degraded but functional |
| `!!` | ✗ red | Error — action required |
| `--` | — dim | Informational |
| `~~` | ○ cyan | Not enabled (optional feature) |
| `>>` | ◉ green/dim | Enabled, idle (socket-activated) |
| `->` | ↻ cyan | In progress |

Recommendations are collected and printed as a numbered list at the bottom of the report.

---

## Storage Analysis (`--storage-info`)

```bash
shani-health --storage-info
```

Mounts the Btrfs root at `subvolid=5` and reports:

- Filesystem free space and block group profiles
- Per-subvolume sizes with compression ratios (uses `compsize` if installed)
- Backup snapshot ages (warns if >30 days old)
- Application storage: Flatpak, Snap, Nix, Podman, LXD, Waydroid, home directories
- Snapshot summary with creation dates
- Reclaim hints: duperemove, bees status, stale snapshots

This is more detailed than `sudo shani-deploy --storage-info`, which only reports compressed OS slot sizes.

---

## Log Management (`--clean-logs`)

```bash
# Remove logs older than 30 days (default)
shani-health --clean-logs

# Remove logs older than 7 days
shani-health --clean-logs 7
```

Cleans:
- Stale journal directories from old machine-IDs
- Vacuums the current journal to its configured `SystemMaxUse` cap
- Rotated log archives (`.gz`, `.bz2`, `.xz`, `.zst`, numbered copies)
- Oversized CUPS, btmp/wtmp, rkhunter/lynis logs
- sysstat daily files beyond the retention window
- Leaves current active log files untouched

---

## Integrity Verification (`--verify`)

```bash
shani-health --verify
```

Performs a deep integrity check that includes:
1. UKI signature verification against the local MOK certificate
2. Btrfs scrub on both `@blue` and `@green` subvolumes
3. Slot marker consistency (`/data/current-slot`)
4. Boot entry consistency (`loader.conf` default vs slot)
5. Immutability checks (root read-only, `/var` tmpfs, `/etc` overlay)
6. Critical subvolume mount verification

> **Note:** Btrfs scrub reads and checksums every block. On large volumes this can take minutes to hours. The command waits for completion.

Returns exit code `1` if any integrity issues are found.

---

## Journal Viewer (`--journal`)

```bash
shani-health --journal                    # Critical messages (default)
shani-health --journal err                # Errors and above
shani-health --journal warning            # Warnings and above
shani-health --journal err --since -2h    # Errors in the last 2 hours
```

Shows categorised journal messages grouped by priority level, AppArmor denials with top offending profiles, OOM kill events, and currently failed units.

---

## Bug Report Bundle (`--export-logs`)

```bash
shani-health --export-logs ~/
```

Creates a compressed bundle at `~/shanios-report-<timestamp>.tar.gz` containing:
- `shanios-deploy.log` and `.old`
- Last 500 journal entries (filtered to remove passwords, tokens, secrets)
- `system-state.txt` — kernel cmdline, uname, versions, boot markers, Btrfs subvolumes, fstab, failed units
- `loader.conf`, `loader-entries.txt`, `efi-binaries.txt` from the ESP

Safe to attach to bug reports — no private keys or passwords are included.

---

## Scripting with shani-health

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | No issues found |
| `1` | Issues found (warnings or errors) |

### Fleet Health Monitoring

```bash
# Remote check via SSH or Tailscale
ssh admin@machine-name.tailnet.ts.net 'shani-health --boot'

# Automate with a systemd timer
# /etc/systemd/system/shani-health-report.service
[Service]
Type=oneshot
ExecStart=/bin/bash -c 'shani-health > /var/log/shani-health-$(date +%%Y%%m%%d).txt 2>&1'

# /etc/systemd/system/shani-health-report.timer
[Timer]
OnCalendar=daily
Persistent=true
[Install]
WantedBy=timers.target
```

For Nagios/Zabbix-style monitoring, the non-zero exit code on any issue makes `shani-health` usable directly as a check script. For Prometheus/Grafana, wrap the output in a custom exporter that parses the coloured rows.

---

## Relationship to Other Tools

| Command | Focus |
|---------|-------|
| `shani-health` | Live system health — all components |
| `shani-health --storage-info` | Deep Btrfs storage analysis |
| `sudo shani-deploy --storage-info` | Compressed sizes of OS slots only |
| `shani-health --verify` | Deep integrity check with scrub |
| `sudo shani-deploy -r` | Roll back inactive slot |

---

## See Also

- [System Updates](system) — how `shani-deploy` works
- [Boot Process](../arch/boot) — boot chain and health services
- [gen-efi Reference](../security/gen-efi) — UKI generation and signing
