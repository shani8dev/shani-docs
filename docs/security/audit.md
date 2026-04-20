---
title: Audit (auditd)
section: Security
updated: 2026-04-20
---

# Audit — auditd

`auditd` is the Linux kernel audit framework daemon. It captures security-relevant kernel events — file access, system calls, authentication, privilege escalation, network connections — and writes them to a tamper-evident log at `/var/log/audit/audit.log`.

The kernel audit subsystem is always active on Shani OS (it feeds AppArmor and IMA). `auditd` is the userspace daemon that writes those events to persistent storage. It is pre-installed but not enabled by default — enable it when compliance logging or forensic audit trails are required.

---

## Enabling auditd

```bash
sudo systemctl enable --now auditd

# Confirm it is running
sudo systemctl status auditd
sudo auditctl -s   # shows kernel audit status
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

Create a file in `/etc/audit/rules.d/`:

```bash
sudo tee /etc/audit/rules.d/shani-custom.rules << 'EOF'
# Watch critical files
-w /etc/passwd -p wa -k passwd-changes
-w /etc/shadow -p wa -k shadow-changes
-w /etc/sudoers -p wa -k sudoers-changes
-w /etc/ssh/sshd_config -p wa -k sshd-config

# Log privilege escalation
-a always,exit -F arch=b64 -S setuid -k setuid
-a always,exit -F arch=b64 -S setgid -k setgid

# Log all sudo use
-w /usr/bin/sudo -p x -k sudo-exec
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
