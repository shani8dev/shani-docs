---
title: rkhunter (Rootkit Hunter)
section: Security
updated: 2026-04-20
---

# rkhunter — Rootkit Hunter

rkhunter scans a system for known rootkits, backdoors, and local exploits. It checks system binaries against stored hashes, looks for suspicious file permissions, hidden files in sensitive directories, and known rootkit signatures. It is pre-installed on Shani OS.

rkhunter does not change anything — it only scans and reports.

> **Important workflow:** rkhunter must build a baseline of known-good file hashes **before** the system is potentially compromised — ideally immediately after installation, and again after every system update. Running it for the first time on an already-compromised system provides little value.

---

## Initial Setup

```bash
# 1. Update the rootkit signature database
sudo rkhunter --update

# 2. Build a baseline of current system file hashes
#    Run this immediately after a clean install and after every system update
sudo rkhunter --propupd
```

---

## Running a Scan

```bash
# Full system scan (interactive — press Enter to continue between sections)
sudo rkhunter --check

# Non-interactive scan (suitable for cron / scripting)
sudo rkhunter --check --skip-keypress

# Suppress OK messages — show only warnings
sudo rkhunter --check --skip-keypress --rwo

# Log output to a file
sudo rkhunter --check --skip-keypress --rwo 2>/dev/null | tee ~/rkhunter-$(date +%Y%m%d).txt
```

---

## Understanding the Output

```
[ Rootkit Hunter version 1.4.6 ]

Checking system commands...
  Performing 'strings' command checks
    Checking 'strings' command                               [ OK ]

  Performing file properties checks
    Checking for prerequisites                               [ OK ]
    /usr/bin/awk                                             [ OK ]
    /usr/bin/basename                                        [ WARNING ]

[09:15:32] Warning: The file properties have changed:
[09:15:32]          File: /usr/bin/basename
[09:15:32]          Current inode: 123456   Stored inode: 123400
```

A `WARNING` for a file that changed after a package update is **expected** — this is why you run `--propupd` after every update. An unexpected warning (file changed with no package update) warrants investigation.

---

## After a System Update

Every time you update system packages, file hashes legitimately change. Update the baseline immediately after upgrading:

```bash
sudo pacman -Syu
sudo rkhunter --propupd   # update baseline to reflect new package versions
```

If you scan before running `--propupd` after an update, you will see a flood of hash-change warnings for every updated binary — these are false positives.

---

## Scheduled Scans

```bash
sudo tee /etc/cron.weekly/rkhunter-scan << 'EOF'
#!/bin/sh
rkhunter --update --skip-keypress --quiet
rkhunter --check --skip-keypress --rwo \
  --logfile /var/log/rkhunter/scan-$(date +%Y%m%d).log 2>/dev/null
EOF
sudo chmod +x /etc/cron.weekly/rkhunter-scan
sudo mkdir -p /var/log/rkhunter
```

---

## Configuration

`/etc/rkhunter.conf` controls which checks run and what is whitelisted:

```ini
# Email warnings to root (requires a working MTA — see Exim page)
MAIL-ON-WARNING=root

# Whitelist a known-safe script that rkhunter flags as suspicious
SCRIPTWHITELIST=/usr/bin/egrep
SCRIPTWHITELIST=/usr/bin/fgrep

# Whitelist a hidden directory that rkhunter warns about
ALLOWHIDDENDIR=/dev/.udev
ALLOWHIDDENDIR=/dev/.static

# Disable a specific test (use test name from the log)
DISABLE_TESTS=suspscan
```

After editing:

```bash
sudo rkhunter --config-check   # verify config syntax
```

---

## Logs

```bash
# View the full log from the last scan
sudo cat /var/log/rkhunter.log

# See only warnings from the last scan
sudo grep -i "warning\|infected\|found" /var/log/rkhunter.log
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Many `WARNING` after a system update | Expected — run `sudo rkhunter --propupd` to update the baseline, then re-scan |
| `Unhappy about OS` / `Unknown OS` warning | Cosmetic on Arch-based systems; does not indicate a problem |
| False positive for a known-safe binary | Add it to `SCRIPTWHITELIST` in `/etc/rkhunter.conf` |
| `rkhunter --update` fails | Check network connectivity; the signature database is downloaded from the rkhunter project servers |
| Scan not finding anything suspicious | That's the expected result on a healthy system — the value of rkhunter is the delta between scans, not finding problems on every run |
