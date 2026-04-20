---
title: cronie (Cron Scheduler)
section: System
updated: 2026-04-20
---

# cronie — Cron Job Scheduler

cronie is the standard cron daemon — it runs commands on a schedule defined in crontab files. It is pre-installed and active by default on Shani OS.

For most recurring tasks, **systemd timers** are the recommended alternative: they integrate with `journalctl` for logging, support calendar expressions and monotonic intervals, and handle missed runs via `Persistent=true`. Use cron when you need the simplicity of a single-line schedule, compatibility with scripts that assume cron, or per-user jobs without root.

---

## Crontab Syntax

```
# ┌── minute (0–59)
# │ ┌── hour (0–23)
# │ │ ┌── day of month (1–31)
# │ │ │ ┌── month (1–12)
# │ │ │ │ ┌── day of week (0–7, 0 and 7 = Sunday)
# │ │ │ │ │
# * * * * *  command to run
```

Common schedule examples:

| Schedule | Meaning |
|----------|---------|
| `* * * * *` | Every minute |
| `0 * * * *` | Every hour (on the hour) |
| `0 3 * * *` | Daily at 03:00 |
| `0 3 * * 0` | Every Sunday at 03:00 |
| `0 3 1 * *` | First of every month at 03:00 |
| `*/15 * * * *` | Every 15 minutes |
| `0 9-17 * * 1-5` | Every hour from 9 to 17, Mon–Fri |

---

## User Crontabs

```bash
# Edit your own crontab
crontab -e

# List your crontab
crontab -l

# Remove your crontab entirely
crontab -r

# Edit another user's crontab (root only)
sudo crontab -e -u youruser

# List another user's crontab
sudo crontab -l -u youruser
```

### Example User Crontab

```crontab
# Send output to a log file instead of local mail
MAILTO=""

# Run a backup script daily at 3 AM
0 3 * * * /home/user/scripts/backup.sh >> /home/user/logs/backup.log 2>&1

# Sync documents to cloud every 30 minutes
*/30 * * * * rclone sync ~/Documents gdrive:Documents --quiet

# Clear temp files every Sunday at midnight
0 0 * * 0 find /tmp -user $USER -mtime +7 -delete
```

> **Tip:** Redirect both stdout and stderr to a log file with `>> /path/to/log 2>&1`. Without redirection, cron mails output to the local user — set `MAILTO=""` to suppress mail silently.

---

## System Crontabs

System-wide cron jobs are placed directly in `/etc/crontab` or as files in these directories (no crontab editing required — just drop a script in the right directory):

| Directory | Frequency |
|-----------|-----------|
| `/etc/cron.hourly/` | Every hour |
| `/etc/cron.daily/` | Once daily |
| `/etc/cron.weekly/` | Once weekly |
| `/etc/cron.monthly/` | Once monthly |

Scripts placed in these directories must be executable and must not have a file extension:

```bash
sudo cp myscript.sh /etc/cron.daily/myscript
sudo chmod +x /etc/cron.daily/myscript
```

For custom schedules, add a line to `/etc/crontab`:

```crontab
# /etc/crontab — note the extra 'username' field before the command
0 4 * * * root /usr/local/bin/maintenance.sh
```

---

## Service Management

```bash
# cronie is enabled by default — check its status
systemctl status cronie

# Restart if jobs stop running after a config change
sudo systemctl restart cronie

# View cron execution logs
journalctl -u cronie -f

# See recent cron activity (last 50 lines)
journalctl -u cronie -n 50
```

---

## Cron vs Systemd Timers

Prefer systemd timers when:
- You need the output captured in `journalctl` automatically
- The job must run at boot if a scheduled run was missed (`Persistent=true`)
- The job is already a systemd service
- You want precise control over the environment (working directory, user, resource limits)

Prefer cron when:
- You need a quick per-user scheduled task without root
- The schedule is simple and the one-liner format is sufficient
- You are adapting an existing cron-based script

See the [Backup & Recovery page](https://docs.shani.dev/doc/networking/backup) for an example of a systemd user timer running a restic backup.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Job not running | Check `journalctl -u cronie` for errors; verify the script is executable (`chmod +x`); test the command manually as the cron user |
| Job runs but does nothing | Cron has a minimal `PATH` — use full paths to binaries (e.g., `/usr/bin/rsync` not `rsync`), or set `PATH=` at the top of the crontab |
| Output being mailed to root | Add `MAILTO=""` to suppress, or `MAILTO=youruser` to redirect; ensure Exim is running if you want mail delivery |
| Missed jobs after suspend/hibernate | cron does not catch up missed jobs after sleep — use a systemd timer with `Persistent=true` instead |
| Editing crontab opens wrong editor | Set `VISUAL` or `EDITOR` env variable: `export EDITOR=nano` |
