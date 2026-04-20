---
title: AppArmor (Mandatory Access Control)
section: Security
updated: 2026-04-20
---

# AppArmor — Mandatory Access Control

AppArmor is a Linux Security Module that confines programs to a defined set of resources using per-application profiles. A profile specifies which files, capabilities, network operations, and system calls a program is allowed — anything not explicitly permitted is denied. This limits the damage a compromised or misbehaving process can cause, even if it runs as root.

AppArmor is pre-installed and active by default on Shani OS. Profiles ship with applications and are loaded at boot.

---

## Status

```bash
# Check AppArmor is active in the kernel
sudo aa-status

# Shows:
#   - Number of loaded profiles
#   - Number of profiles in enforce vs complain mode
#   - List of confined processes
```

AppArmor profiles operate in two modes:

| Mode | Effect |
|------|--------|
| `enforce` | Policy violations are **blocked** and logged |
| `complain` | Policy violations are **logged only** — nothing is blocked. Used for testing new profiles. |

---

## Managing Profiles

```bash
# List all loaded profiles and their mode
sudo aa-status | grep -E "enforce|complain"

# Put a profile into complain mode (for testing/debugging)
sudo aa-complain /usr/bin/firefox

# Put a profile back into enforce mode
sudo aa-enforce /usr/bin/firefox

# Reload all profiles (after editing a profile file)
sudo systemctl reload apparmor

# Reload a single profile
sudo apparmor_parser -r /etc/apparmor.d/usr.bin.firefox

# Disable a specific profile entirely
sudo aa-disable /usr/bin/firefox

# Re-enable a disabled profile
sudo aa-enable /usr/bin/firefox
```

---

## Profile Files

Profiles are stored in `/etc/apparmor.d/`. Each file corresponds to a confined binary.

### Viewing a Profile

```bash
# View the Firefox profile
cat /etc/apparmor.d/usr.bin.firefox

# Example of what a profile looks like:
# /usr/bin/firefox {
#   #include <abstractions/base>
#   /home/*/.mozilla/ rw,         # read/write mozilla profile dir
#   /tmp/** rw,                   # read/write temp files
#   network inet stream,          # outbound TCP
#   deny /etc/shadow r,           # explicitly deny reading shadow file
# }
```

### Writing a Profile for a New Application

Use `aa-genprof` to generate a profile interactively — it runs the application in complain mode, watches what it does, and offers to build rules from observed behaviour:

```bash
# Start profile generation
sudo aa-genprof /path/to/application

# In another terminal, use the application normally
# Back in aa-genprof, press S to scan events and F to finish
```

Use `aa-logprof` to update an existing profile based on new denials in the log:

```bash
sudo aa-logprof
```

---

## Checking Denials

AppArmor logs denied operations to the audit log and journal:

```bash
# View AppArmor denials via journald
sudo journalctl -k | grep -i "apparmor.*denied"

# Or via audit log (if auditd is running)
sudo grep "apparmor.*DENIED" /var/log/audit/audit.log

# Recent denials only
sudo journalctl -k --since "1 hour ago" | grep "apparmor.*denied"
```

A typical denial looks like:

```
apparmor="DENIED" operation="open" profile="/usr/bin/myapp"
name="/etc/passwd" pid=1234 comm="myapp" requested_mask="r" denied_mask="r"
```

This tells you: `myapp` tried to read `/etc/passwd` and was denied. To allow it, add `/etc/passwd r,` to the profile.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Application crashes or behaves oddly | Check for AppArmor denials: `journalctl -k | grep "apparmor.*denied"`; put the profile in complain mode temporarily: `sudo aa-complain /path/to/binary` |
| Profile reload fails | Check syntax: `sudo apparmor_parser -p /etc/apparmor.d/profile-name`; fix errors and reload |
| `aa-status` shows no profiles | AppArmor is loaded but no profiles are installed — install application packages that ship profiles, or write your own |
| Denial for a path that should be allowed | Edit the profile to add the required rule, then reload: `sudo apparmor_parser -r /etc/apparmor.d/profile` |
| Want to test a profile change safely | Switch to complain mode first (`aa-complain`), test, check logs, then enforce (`aa-enforce`) once the profile is working correctly |
