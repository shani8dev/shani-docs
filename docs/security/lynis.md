---
title: Lynis (Security Auditing)
section: Security
updated: 2026-04-20
---

# Lynis — Security Auditing

Lynis is a security auditing tool that scans a running Linux system and produces a hardening report. It checks hundreds of items: file permissions, installed software, kernel parameters, authentication settings, network configuration, and more — and produces a prioritised list of findings with remediation suggestions. It is pre-installed on Shani OS.

Lynis does not change anything — it only reads and reports.

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

Run Lynis weekly and save timestamped reports:

```bash
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
| No password on GRUB | Set a GRUB superuser password (physical access only) |
| Core dumps not restricted | Add `* hard core 0` to `/etc/security/limits.conf` |
| USB storage not disabled | Add `install usb-storage /bin/false` to a modprobe drop-in if USB mass storage is not needed |
| Auditd not running | Enable `auditd` if compliance logging is required — see the [Audit page](https://docs.shani.dev/doc/security/audit) |

---

## Updating Lynis

```bash
# Check the installed version
lynis show version

# Update via pacman (Lynis is in the Arch repos)
sudo pacman -Su lynis
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Many `FILE_PERMISSIONS` warnings | Lynis compares against strict defaults; review each before changing — some are intentional on a desktop OS |
| Score seems low | A freshly installed system typically scores 60–70; a locked-down server might reach 85+; the score is relative, not a pass/fail threshold |
| `lynis: command not found` | Run as root or with `sudo` — Lynis may not be in the non-root `PATH` |
| Audit hangs on a test | A specific test may be probing a slow device or network; interrupt with Ctrl-C and re-run with `--skip-test TEST_ID` |
