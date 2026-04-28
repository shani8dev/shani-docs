---
title: Logging
section: System
updated: 2026-04-28
---

# Logging

Shani OS uses **systemd-journald** as its primary logging system. All kernel messages, service output, and system events flow into a single structured binary journal. There are no scattered `/var/log/*.log` text files to hunt through — `journalctl` is the single interface for everything.

This page covers journald configuration, log retention, forwarding to syslog, and persistent log storage across reboots.

For `journalctl` usage within service debugging, see [Systemd](systemd).

---

## How Journald Works

journald collects log entries from:
- **Kernel** — dmesg / kernel ring buffer
- **Systemd services** — stdout/stderr of every unit
- **syslog socket** — `/run/systemd/journal/syslog` (for legacy syslog-aware apps)
- **kmsg** — kernel messages during early boot
- **audit** — kernel audit subsystem
- **Native journald API** — `sd_journal_send()`, `systemd-cat`

By default on Shani OS, logs are stored in `/run/journal/` (volatile, in RAM) and are lost on reboot. Persistent storage can be enabled — see below.

---

## Enabling Persistent Logs

```bash
# Create the persistent journal directory
sudo mkdir -p /var/log/journal
sudo systemd-tmpfiles --create --prefix /var/log/journal

# Restart journald to pick up the new directory
sudo systemctl restart systemd-journald

# Verify logs are now persisting
journalctl --disk-usage
ls /var/log/journal/
```

Once `/var/log/journal/` exists, journald automatically writes there instead of `/run/journal/`. Logs survive reboots and you can query previous boots with `journalctl -b -1`, `-b -2`, etc.

> 💡 On Shani OS, `/var/log/journal/` persists across OS updates because `/var` is a separate data partition. You do not need to re-enable persistent logging after an update.

---

## journald Configuration

The main config file is `/etc/systemd/journald.conf`. Changes here are captured by the `/etc` overlay.

```bash
sudo nano /etc/systemd/journald.conf
```

Key settings:

```ini
[Journal]
# Where to store logs: auto (persistent if /var/log/journal exists), persistent, volatile, none
Storage=auto

# Maximum disk space the journal may use
SystemMaxUse=500M

# Keep at least this much space free on the filesystem
SystemKeepFree=1G

# Maximum size of a single journal file
SystemMaxFileSize=50M

# How long to keep journal files (regardless of size)
MaxRetentionSec=3months

# Compress journal entries (default: yes)
Compress=yes

# Rate limiting — drop entries if a service logs too fast
RateLimitIntervalSec=30s
RateLimitBurst=10000

# Forward to syslog socket (for rsyslog/syslog-ng)
ForwardToSyslog=no

# Forward to /dev/kmsg (useful for embedded/debug)
ForwardToKMsg=no

# Forward to the system console
ForwardToConsole=no

# Forward to wall (broadcast to all logged-in users)
ForwardToWall=yes

# Maximum log level to forward to console/wall (0=emerg … 7=debug)
MaxLevelConsole=emerg
MaxLevelWall=emerg
```

```bash
# Apply config changes
sudo systemctl restart systemd-journald
```

---

## Retention and Vacuuming

```bash
# Show how much disk space the journal is using
journalctl --disk-usage

# Remove old journal files to stay under a size limit
sudo journalctl --vacuum-size=500M

# Remove journal files older than a time period
sudo journalctl --vacuum-time=2weeks
sudo journalctl --vacuum-time=3months

# Keep only the last N journal files per machine-ID
sudo journalctl --vacuum-files=5

# Rotate journal files (close current, open new)
sudo journalctl --rotate

# Verify journal file integrity
sudo journalctl --verify
```

> 💡 Combine `--rotate` and `--vacuum-*` to immediately free space: rotate first (seals the active file), then vacuum the sealed files.

---

## Querying Logs

```bash
# All logs from current boot
journalctl -b

# All logs from previous boot
journalctl -b -1

# List available boots
journalctl --list-boots

# Follow logs in real time (like tail -f)
journalctl -f

# Logs for a specific service
journalctl -u caddy
journalctl -u caddy -f           # follow
journalctl -u caddy -n 100       # last 100 lines
journalctl -u caddy -b           # current boot only
journalctl -u caddy --since today

# Kernel messages only
journalctl -k
journalctl -k -b -1              # kernel messages from previous boot

# Filter by priority (emerg, alert, crit, err, warning, notice, info, debug)
journalctl -p err                # errors and above
journalctl -p warning -b         # warnings and above, current boot

# Filter by time range
journalctl --since "2026-04-01" --until "2026-04-02"
journalctl --since -1h           # last hour

# Filter by syslog identifier (tag set by the application)
journalctl -t shani-update
journalctl -t kernel

# Filter by UID or GID
journalctl _UID=1000
journalctl _GID=1000

# Filter by executable path
journalctl _EXE=/usr/bin/sshd

# Full verbose output (all journal fields)
journalctl -o verbose

# JSON output (for scripting or log shipping)
journalctl -u caddy -n 50 -o json
journalctl -u caddy -n 50 -o json-pretty

# Export for archiving or transfer
journalctl -b -o export > /tmp/boot-logs.export
```

---

## Writing to the Journal

```bash
# Write a message directly to the journal from a script
systemd-cat echo "Backup completed successfully"

# With priority and identifier
echo "deploy finished" | systemd-cat -t myapp -p info
echo "deploy failed"   | systemd-cat -t myapp -p err

# Pipe a command's output to the journal
my-script.sh 2>&1 | systemd-cat -t my-script -p info
```

In systemd service units, `StandardOutput=journal` and `StandardError=journal` (the default) automatically route all stdout/stderr to the journal with the unit name as the identifier.

---

## Forwarding to a Syslog Daemon

If you need traditional text-file logging (e.g. for log shippers like Filebeat, or for compatibility with tools that parse `/var/log/`), you can forward from journald to a syslog daemon.

### rsyslog

```bash
# Install rsyslog (not pre-installed)
# It is available but not part of the default image — install via the system overlay
sudo pacman -S rsyslog

sudo systemctl enable --now rsyslog
```

Enable forwarding in journald:

```ini
# /etc/systemd/journald.conf
[Journal]
ForwardToSyslog=yes
```

Then configure rsyslog normally in `/etc/rsyslog.conf`.

### Remote log forwarding (journald native)

journald can forward to a remote journal instance over a secure TLS connection using `systemd-journal-remote` and `systemd-journal-upload` — useful for centralising logs from multiple Shani OS machines.

```bash
# On the log server
sudo systemctl enable --now systemd-journal-remote.socket

# On each client
sudo systemctl enable --now systemd-journal-upload

# Configure the upload URL
# /etc/systemd/journal-upload.conf
[Upload]
URL=https://log-server:19532
```

---

## Per-Service Log Limits

You can cap how fast or how much a specific service can log by adding a drop-in:

```ini
# /etc/systemd/system/myapp.service.d/logging.conf
[Service]
LogRateLimitIntervalSec=10s
LogRateLimitBurst=500
```

Or redirect a service's logs entirely:

```ini
[Service]
StandardOutput=append:/var/log/myapp/output.log
StandardError=append:/var/log/myapp/error.log
```

---

## Boot and Early Boot Logs

```bash
# Show the kernel ring buffer (dmesg equivalent)
journalctl -k

# Early boot messages (before journal socket was ready)
journalctl -b -o short-monotonic | head -100

# Boot timing — how long each service took
systemd-analyze blame

# Critical chain — what determined total boot time
systemd-analyze critical-chain
```

---

## Log Levels Reference

| Priority | Value | Meaning |
|----------|-------|---------|
| `emerg` | 0 | System is unusable |
| `alert` | 1 | Immediate action required |
| `crit` | 2 | Critical condition |
| `err` | 3 | Error condition |
| `warning` | 4 | Warning condition |
| `notice` | 5 | Normal but significant |
| `info` | 6 | Informational |
| `debug` | 7 | Debug-level messages |

```bash
# Show only warnings and above
journalctl -p 4

# Show only errors and above across all boots
journalctl -p err --no-pager
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Logs lost after reboot | Enable persistent storage: `sudo mkdir -p /var/log/journal && sudo systemctl restart systemd-journald` |
| Journal growing too large | Set `SystemMaxUse=` in `journald.conf`; run `sudo journalctl --vacuum-size=500M` |
| `journalctl` shows nothing for a service | Check `systemctl status <service>` — if the service never started, there are no logs; verify `StandardOutput=journal` in the unit |
| Log entries missing (rate limited) | Increase `RateLimitBurst=` in `journald.conf` for noisy services |
| Can't read journal as a regular user | Add user to the `systemd-journal` group: `sudo usermod -aG systemd-journal $USER` |
| `--verify` reports errors | Journal file may be corrupt — delete the corrupt file from `/var/log/journal/<machine-id>/` and restart journald |
| Need logs in text format | Use `journalctl -o short > /tmp/log.txt` or forward to rsyslog with `ForwardToSyslog=yes` |

---

## See Also

- [Systemd](systemd) — service logs, `journalctl -u`, unit file logging options
- [Process Management](process-management) — OOM killer events, `journalctl -k | grep oom`
- [shani-health Reference](../updates/shani-health) — automated journal error reporting
- [Backup & Recovery](backup) — backing up `/var/log/journal/` if persistent logs are enabled
