---
title: Audit (auditd)
section: Security
updated: 2026-08-20
---

# Audit — auditd

`auditd` is the Linux kernel audit framework daemon. It captures security-relevant kernel events — file access, system calls, authentication, privilege escalation, network connections — and writes them to a tamper-evident log at `/var/log/audit/audit.log`.

The kernel audit subsystem is always active on Shani OS (it feeds AppArmor and IMA). `auditd` is the userspace daemon that writes those events to persistent storage, and Shani OS **enables it by default** — the `shani-core` package's post-install hook runs `systemctl enable auditd.service` alongside `apparmor`, `lynis.timer`, and `fwupd`. It ships pre-loaded with a base ruleset (below), so there is nothing to configure to get useful logging from a fresh install.

---

## Confirming auditd Is Running

```bash
sudo systemctl status auditd
sudo auditctl -s   # shows kernel audit status

# If it was somehow disabled, re-enable it:
sudo systemctl enable --now auditd
```

---

## Viewing Logs

```bash
# Raw log (all events)
sudo cat /var/log/audit/audit.log | tail -50

# Human-readable summary with ausearch
sudo ausearch -m LOGIN --start today
sudo ausearch -m USER_AUTH --start today

# Filter by user
sudo ausearch -ua 1000 --start today

# Filter by file path
sudo ausearch -f /etc/passwd

# Generate a report
sudo aureport --summary
sudo aureport --auth        # authentication events
sudo aureport --failed      # failed events only
sudo aureport --anomaly     # anomalous events
```

---

## Audit Rules

Rules tell the kernel what to log. They are set with `auditctl` at runtime, or written to `/etc/audit/rules.d/` for persistence.

### Shipped Base Ruleset

Shani OS ships a base ruleset at `/etc/audit/rules.d/10-shani-base.rules` (from `shani-settings`), loaded automatically on every boot — it addresses Lynis's `ACCT-9630` finding (an empty audit ruleset). It covers:

```
# Buffer & failure mode
-b 8192
-f 1                                            # log and continue on failure (not panic)

# Identity & authentication changes
-w /etc/passwd -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/group -p wa -k identity
-w /etc/gshadow -p wa -k identity
-w /etc/sudoers -p wa -k identity
-w /etc/sudoers.d/ -p wa -k identity
-w /etc/security/opasswd -p wa -k identity

# Login & session tracking
-w /var/log/faillog -p wa -k logins
-w /var/log/lastlog -p wa -k logins
-w /var/run/faillock/ -p wa -k logins

# Privilege escalation
-w /bin/su -p x -k privileged
-w /usr/bin/sudo -p x -k privileged
-w /usr/bin/newgrp -p x -k privileged
-a always,exit -F arch=b64 -S setuid -S setgid -S setreuid -S setregid -k privilege_escalation
-a always,exit -F arch=b64 -S execve -F euid=0 -F auid>=1000 -F auid!=4294967295 -k privilege_escalation

# Filesystem mounts, and deletions by real (non-system) users
-a always,exit -F arch=b64 -S mount -k mounts
-a always,exit -F arch=b64 -S unlink -S unlinkat -S rename -S renameat -F auid>=1000 -F auid!=4294967295 -k delete

# Kernel module loading/unloading
-w /sbin/insmod -p x -k modules
-w /sbin/rmmod -p x -k modules
-w /sbin/modprobe -p x -k modules
-a always,exit -F arch=b64 -S init_module -S finit_module -S delete_module -k modules

# System time and network/hostname changes
-a always,exit -F arch=b64 -S adjtimex -S settimeofday -k time-change
-w /etc/localtime -p wa -k time-change
-a always,exit -F arch=b64 -S sethostname -S setdomainname -k system-locale
-w /etc/hosts -p wa -k system-locale
-w /etc/hostname -p wa -k system-locale
```

(32-bit syscall variants are also registered for `mount` and `delete`, omitted above for brevity.) The file's own `-e 2` line (which would make the ruleset immutable until reboot) is left commented out deliberately, so rules can still be tuned without a reboot.

Filter events by these keys with `ausearch -k <key>`, e.g. `sudo ausearch -k privilege_escalation --start today`.

### Adding Your Own Rules

The shipped ruleset covers identity, privilege escalation, and module loading — add further rules alongside it as a separate file rather than editing `10-shani-base.rules` directly, so your customizations survive a `shani-settings` package update.

### Runtime Rules (lost on reboot)

```bash
# Watch a file for all access
sudo auditctl -w /etc/passwd -p rwxa -k passwd-watch

# Watch a directory
sudo auditctl -w /etc/sudoers.d/ -p wa -k sudoers-changes

# Log all executions by a specific user (UID 1000)
sudo auditctl -a always,exit -F arch=b64 -F uid=1000 -S execve -k user-exec

# List active rules
sudo auditctl -l

# Delete all runtime rules
sudo auditctl -D
```

### Persistent Rules

Create a separate file in `/etc/audit/rules.d/` — use a numeric prefix after `10-` (e.g. `20-`) so it loads after, and doesn't collide with, the shipped `10-shani-base.rules`:

Identity files, sudoers, and privilege escalation are already watched by `10-shani-base.rules` (above) — add rules for things it doesn't cover, such as SSH config or a specific user's activity:

```bash
sudo tee /etc/audit/rules.d/20-shani-custom.rules << 'EOF'
# Watch sshd config — not covered by the base ruleset
-w /etc/ssh/sshd_config -p wa -k sshd-config

# Log all executions by a specific user (UID 1000)
-a always,exit -F arch=b64 -F auid=1000 -S execve -k user-exec
EOF

# Load the new rules
sudo augenrules --load
```

---

## Log Rotation

```bash
# /etc/audit/auditd.conf — key settings
num_logs = 5          # number of rotated log files to keep
max_log_file = 50     # MB per log file before rotation
max_log_file_action = ROTATE
```

After changing `auditd.conf`:

```bash
sudo systemctl restart auditd
```

---

## Integration with AppArmor

AppArmor denials appear in the audit log when `auditd` is running:

```bash
sudo ausearch -m AVC --start today | grep apparmor
# or
sudo grep "apparmor.*DENIED" /var/log/audit/audit.log
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `/var/log/audit/audit.log` does not exist | `auditd` is not running: `sudo systemctl enable --now auditd` |
| Log fills disk quickly | Reduce `max_log_file`, increase `num_logs`, or add targeted rules instead of broad ones |
| `ausearch` returns nothing | Specify a time range: `--start today` or `--start recent` |
| Rules not surviving reboot | Write to `/etc/audit/rules.d/` and run `sudo augenrules --load` |

---

## See Also

- [AppArmor](apparmor) — LSM whose denials appear in the audit log
- [Security Features](features) — IMA/EVM also uses kernel audit infrastructure
- [shani-health Reference](../updates/shani-health) — `shani-health --security` reports whether auditd is running and how many rule files are loaded
