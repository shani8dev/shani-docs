---
title: Lynis (Security Auditing)
section: Security
updated: 2026-08-28
---

# Lynis — Security Auditing

Lynis is a security auditing tool that scans a running Linux system and produces a hardening report. It checks hundreds of items: file permissions, installed software, kernel parameters, authentication settings, network configuration, and more — and produces a prioritised list of findings with remediation suggestions. It is pre-installed on Shani OS as a direct dependency of the `shani-core` package.

Lynis does not change anything — it only reads and reports. Several of the sysctl, modprobe, and audit hardening decisions documented on the [Security Features](features) page exist specifically to address findings this tool reports (e.g. Lynis IDs `KRNL-6000`, `ACCT-9630`, `STRG-1846`, `NETW-3200`).

**Lynis audits itself on a schedule by default** — `shani-core`'s post-install hook runs `systemctl enable lynis.timer`, so a fresh Shani OS install is already running periodic audits without you setting anything up. Check it with:

```bash
systemctl status lynis.timer
systemctl list-timers lynis.timer   # shows the exact next run time
```

The "Scheduled Audits" section further down is for changing that schedule or adding your own wrapper — most users don't need it.

---

## Running an Audit

```bash
# Full system audit (run as root for maximum coverage)
sudo lynis audit system

# Audit without colours (for piping to a file or CI)
sudo lynis audit system --no-colors 2>/dev/null | tee ~/lynis-report.txt

# Quick audit of a specific category only
sudo lynis audit system --tests-from-group authentication
sudo lynis audit system --tests-from-group networking
sudo lynis audit system --tests-from-group firewalls
sudo lynis audit system --tests-from-group file_permissions
```

The audit takes 1–3 minutes. At the end, Lynis prints a **Hardening Index** score (0–100) and a list of suggestions grouped by severity.

---

## Understanding the Report

```
[+] Boot and services
------------------------------------
  - Checking UEFI boot                                    [ ENABLED ]
  - Checking presence of GRUB2                            [ FOUND ]

[!] Authentication
------------------------------------
  - Default umask in /etc/profile                         [ SUGGESTION ]
    * Consider a more restrictive umask value (027 or 077)
    * Details  : umask 022
    * Solution : Edit /etc/profile and change the umask

[WARNING]
  - SSH PermitRootLogin is set to 'yes'                   [ WARNING ]
```

Severity levels:

| Level | Meaning |
|-------|---------|
| `OK` / `FOUND` | Item is configured correctly |
| `SUGGESTION` | Low-risk improvement; worth considering |
| `WARNING` | Higher-risk finding; should be addressed |
| `CRITICAL` | Serious issue; address promptly |

---

## Report Files

Lynis writes detailed machine-readable output to:

```bash
# Human-readable log (full detail)
/var/log/lynis.log

# Machine-readable report (key=value pairs for scripting)
/var/log/lynis-report.dat

# Parse specific findings from the report
grep "^suggestion\|^warning" /var/log/lynis-report.dat

# Count total warnings
grep -c "^warning" /var/log/lynis-report.dat
```

---

## Scheduled Audits

The default `lynis.timer` (enabled automatically, see above) already runs `lynis audit system` on a schedule and writes to the standard `/var/log/lynis.log` / `/var/log/lynis-report.dat` paths described above — most people never need to touch this section.

If you want a different cadence or your own timestamped reports instead of relying on the timer, disable it and roll your own cron job:

```bash
sudo systemctl disable --now lynis.timer

sudo tee /etc/cron.weekly/lynis-audit << 'EOF'
#!/bin/sh
lynis audit system --no-colors --quiet 2>/dev/null \
  > /var/log/lynis/audit-$(date +%Y%m%d).txt
EOF
sudo chmod +x /etc/cron.weekly/lynis-audit
sudo mkdir -p /var/log/lynis
```

---

## Common Findings on Shani OS

| Finding | Typical Suggestion |
|---------|--------------------|
| `umask` too permissive | Set `umask 027` in `/etc/profile` |
| SSH root login enabled | Set `PermitRootLogin no` in `/etc/ssh/sshd_config` |
| Bootloader editor not password-protected / UKI cmdline mutable | Not applicable on Shanios — the bootloader editor is disabled and the kernel command line is baked into the signed UKI at build time, so the boot chain cannot be altered from the boot menu (see [Security Features](features)) |
| Core dumps not restricted | Add `* hard core 0` to `/etc/security/limits.conf` |
| USB storage not disabled | Add `install usb-storage /bin/false` to a modprobe drop-in if USB mass storage is not needed |
| Auditd not running | Enable `auditd` if compliance logging is required — see the [Audit](audit) page |

---

## Updating Lynis

```bash
# Check the installed version
lynis show version
```

Lynis is part of the signed OS image — system binaries update only via slot deployment (`sudo shani-deploy`), not via a package manager. Each deployed OS version ships the current Lynis release; there is nothing to update separately on the host.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Many `FILE_PERMISSIONS` warnings | Lynis compares against strict defaults; review each before changing — some are intentional on a desktop OS |
| Score seems low | A freshly installed system typically scores 60–70; a locked-down server might reach 85+; the score is relative, not a pass/fail threshold |
| `lynis: command not found` | Run as root or with `sudo` — Lynis may not be in the non-root `PATH` |
| Audit hangs on a test | A specific test may be probing a slow device or network; interrupt with Ctrl-C and re-run with `--skip-test TEST_ID` |

---

## See Also

- [Security Features](features) — kernel/module hardening decisions made in direct response to Lynis findings
- [rkhunter](rkhunter) — complementary rootkit scanner; unlike Lynis, not scheduled by default
- [shani-health Reference](../updates/shani-health.md) — `shani-health --security` reports the `lynis.timer` status, last-scan age, hardening index, and warning count
