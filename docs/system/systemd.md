---
title: Systemd
section: System
updated: 2026-04-25
---

# Systemd

Systemd is the init system and service manager on Shani OS. It starts every process at boot, manages all daemons, handles logging via the journal, and runs scheduled tasks via timers. Unit files placed in `/etc/systemd/system/` are captured by the `/etc` overlay and persist across all OS updates and rollbacks.

---

## Service Management

```bash
# Start / stop / restart
sudo systemctl start caddy
sudo systemctl stop caddy
sudo systemctl restart caddy

# Reload config without restarting (if the service supports it)
sudo systemctl reload caddy

# Enable at boot / disable
sudo systemctl enable caddy
sudo systemctl disable caddy

# Enable and start in one step
sudo systemctl enable --now caddy

# Disable and stop in one step
sudo systemctl disable --now caddy

# Check status (shows state, PID, recent log lines)
systemctl status caddy

# List all running services
systemctl list-units --type=service --state=running

# List all failed units
systemctl --failed

# List all installed unit files and their state
systemctl list-unit-files --type=service
```

---

## journalctl — Logs

All service output is captured by the journal. No log files to find — `journalctl` is the single interface.

```bash
# Follow a service's logs in real time
journalctl -u caddy -f

# Show last 50 lines
journalctl -u caddy -n 50

# Since today
journalctl -u caddy --since today

# Between two timestamps
journalctl -u caddy --since "2026-04-01 00:00" --until "2026-04-02 00:00"

# Since a relative time
journalctl -u caddy --since -2h

# Show only errors
journalctl -u caddy -p err

# From this boot only
journalctl -u caddy -b

# From the previous boot
journalctl -u caddy -b -1

# All logs from the current boot (all services)
journalctl -b

# Kernel messages only
journalctl -k
journalctl -k | grep -i error

# Filter by syslog identifier (tag)
journalctl -t shani-update

# Output in JSON (for scripting)
journalctl -u caddy -n 10 -o json

# Disk usage of the journal
journalctl --disk-usage

# Rotate and vacuum (keep last 2 weeks)
sudo journalctl --rotate
sudo journalctl --vacuum-time=2weeks
sudo journalctl --vacuum-size=500M
```

---

## Writing Unit Files

Unit files live in `/etc/systemd/system/` (system services) or `~/.config/systemd/user/` (user services). The type is determined by the `[Unit]` section and the file extension.

### Service unit

```ini
# /etc/systemd/system/myapp.service

[Unit]
Description=My Application
Documentation=https://example.com/docs
# Start after the network is up
After=network-online.target
Wants=network-online.target
# Restart if caddy is running (soft dependency)
After=caddy.service

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
ExecStart=/opt/myapp/bin/server --config /etc/myapp/config.toml
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5s

# Environment
Environment=NODE_ENV=production
EnvironmentFile=/etc/myapp/env

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=myapp

# Resource limits
MemoryMax=512M
CPUQuota=50%

# Security hardening (see Security section below)
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

### oneshot service (runs once, like a script)

```ini
[Unit]
Description=Database Migration
After=postgresql.service

[Service]
Type=oneshot
ExecStart=/opt/myapp/bin/migrate
User=myapp
RemainAfterExit=yes   # systemd considers the service "active" after it exits
```

### Service types

| Type | Use |
|------|-----|
| `simple` | Default. Process started by `ExecStart` is the main process |
| `exec` | Like `simple` but systemd waits until `execve()` succeeds |
| `forking` | Process forks and the parent exits (traditional daemons) |
| `oneshot` | Short-lived process that exits when done (scripts, migrations) |
| `notify` | Process sends `sd_notify(READY=1)` when ready |
| `dbus` | Service is considered ready when it takes a D-Bus name |
| `idle` | Like `simple` but waits until the boot is complete |

---

## Timers

Timers replace cron for system services. They integrate with the journal and support `Persistent=true` to catch up missed runs after sleep or downtime.

### Paired timer + service

**`/etc/systemd/system/backup.service`**

```ini
[Unit]
Description=Restic Backup

[Service]
Type=oneshot
ExecStart=/home/user/scripts/backup.sh
User=user
```

**`/etc/systemd/system/backup.timer`**

```ini
[Unit]
Description=Run backup daily at 3 AM

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
RandomizedDelaySec=15min

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now backup.timer

# Check scheduled timers
systemctl list-timers

# Run the service immediately (for testing)
sudo systemctl start backup.service

# Watch output
journalctl -u backup.service -f
```

### Calendar expression syntax

| Expression | Meaning |
|-----------|---------|
| `daily` | Every day at midnight |
| `weekly` | Every Monday at midnight |
| `monthly` | First day of each month at midnight |
| `hourly` | Every hour |
| `*-*-* 03:00:00` | Every day at 3 AM |
| `Mon *-*-* 09:00:00` | Every Monday at 9 AM |
| `*-*-1 00:00:00` | First of every month at midnight |
| `*:0/15` | Every 15 minutes |
| `2026-04-25 14:30:00` | Once at a specific date and time |

```bash
# Validate and preview a calendar expression
systemd-analyze calendar "Mon *-*-* 09:00:00"
systemd-analyze calendar daily
```

### Monotonic timers (relative to boot or last run)

```ini
[Timer]
# 15 minutes after boot
OnBootSec=15min
# Then every 2 hours
OnUnitActiveSec=2h
```

---

## User Services

User services run under your UID without root. Timer-based user services require linger to fire when you're not logged in (see [Users & Groups](users-groups)).

```bash
# Unit files location
~/.config/systemd/user/

# Common commands (note --user flag)
systemctl --user daemon-reload
systemctl --user enable --now myservice.service
systemctl --user status myservice.service
journalctl --user -u myservice.service -f
systemctl --user list-timers

# Enable linger (fires timers even when not logged in)
sudo loginctl enable-linger $USER
```

---

## Overriding Upstream Unit Files

Never edit unit files under `/usr/lib/systemd/system/` — they are part of the OS and will be overwritten on updates. Use drop-ins or full overrides instead, both of which are captured by the `/etc` overlay.

```bash
# Create a drop-in override (merges with the upstream unit)
sudo systemctl edit sshd.service
# Opens an editor — your additions go between the comments
# Saved to /etc/systemd/system/sshd.service.d/override.conf

# Full override (copy of the upstream unit you can freely modify)
sudo systemctl edit --full sshd.service
# Saved to /etc/systemd/system/sshd.service

# View the effective merged unit (upstream + all drop-ins)
systemctl cat sshd.service

# Common drop-in: add an environment variable to an existing service
# /etc/systemd/system/caddy.service.d/env.conf
[Service]
Environment=MY_VAR=value

# Common drop-in: increase restart attempts
# /etc/systemd/system/caddy.service.d/restart.conf
[Service]
Restart=always
RestartSec=10s
StartLimitIntervalSec=60
StartLimitBurst=5
```

---

## Targets (Runlevels)

Targets group units and define system states. They replace traditional runlevels.

```bash
# Current target
systemctl get-default

# Change default target
sudo systemctl set-default multi-user.target   # server (no GUI)
sudo systemctl set-default graphical.target    # desktop (GUI)

# Switch target immediately (without rebooting)
sudo systemctl isolate multi-user.target

# Common targets
# poweroff.target   — shutdown
# rescue.target     — single-user recovery mode
# multi-user.target — multi-user, network, no GUI
# graphical.target  — multi-user + display manager
```

---

## Dependencies

```bash
# Show what a unit requires/wants/conflicts with
systemctl show caddy.service -p Requires,Wants,After,Before

# Show units that depend on a given unit
systemctl list-dependencies --reverse caddy.service

# Show the full dependency tree of a unit
systemctl list-dependencies caddy.service
```

Key dependency directives:

| Directive | Meaning |
|-----------|---------|
| `Requires=` | Hard dependency — if it fails, this unit fails |
| `Wants=` | Soft dependency — starts it, but this unit continues if it fails |
| `After=` | Ordering — start after this unit (does not imply dependency) |
| `Before=` | Ordering — start before this unit |
| `BindsTo=` | Like `Requires=` but also stops this unit if the dependency stops |
| `Conflicts=` | Cannot run at the same time |

---

## Security Hardening Options

Add these to the `[Service]` section to sandbox a service. Start with the basics and add more as needed.

```ini
[Service]
# Prevent the process from gaining new privileges (setuid, capabilities)
NoNewPrivileges=yes

# Mount /usr, /boot, /efi read-only; prevent writing outside WorkingDirectory
ProtectSystem=strict

# Hide /home, /root from the service
ProtectHome=yes

# Private /tmp (invisible to other services)
PrivateTmp=yes

# Prevent writing to /proc and /sys
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes

# Restrict which address families can be used
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX

# Whitelist writable paths (needed with ProtectSystem=strict)
ReadWritePaths=/var/lib/myapp /var/log/myapp

# Run as a specific user/group
User=myapp
Group=myapp

# Drop all capabilities except what's needed
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
AmbientCapabilities=CAP_NET_BIND_SERVICE

# Memory and CPU limits
MemoryMax=512M
CPUQuota=50%
TasksMax=64
```

```bash
# Check what capabilities and security restrictions are active for a service
systemctl show caddy.service | grep -E "Cap|Protect|Restrict|Private"
```

---

## Boot Analysis

```bash
# Total boot time
systemd-analyze

# Time spent in each phase
systemd-analyze time

# Per-unit startup time (slowest first)
systemd-analyze blame

# Critical chain (the path that determined boot time)
systemd-analyze critical-chain

# Plot interactive SVG of the boot sequence
systemd-analyze plot > /tmp/boot.svg

# Check unit file syntax
systemd-analyze verify /etc/systemd/system/myapp.service
```

---

## Socket Activation

Socket activation starts a service on demand when a connection arrives on a socket. The service stays stopped when idle.

```ini
# /etc/systemd/system/myapp.socket
[Unit]
Description=myapp socket

[Socket]
ListenStream=8080
Accept=no

[Install]
WantedBy=sockets.target
```

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=myapp (socket-activated)
Requires=myapp.socket

[Service]
Type=simple
ExecStart=/opt/myapp/bin/server
# The socket FD is passed automatically — no need to bind
StandardInput=socket
```

```bash
sudo systemctl enable --now myapp.socket
# myapp.service starts automatically when a connection arrives
```

`sshd.socket` on Shani OS uses this pattern — see [OpenSSH](openssh).

---

## Useful Patterns

### Restart on failure with back-off

```ini
[Service]
Restart=on-failure
RestartSec=5s
StartLimitIntervalSec=60s
StartLimitBurst=3
# After 3 failures in 60s, stop trying and enter failed state
```

### Run after network is available

```ini
[Unit]
After=network-online.target
Wants=network-online.target
```

### Run a script on file change (path unit)

```ini
# /etc/systemd/system/deploy-on-change.path
[Unit]
Description=Watch for deploy trigger

[Path]
PathExists=/tmp/deploy-now
# Or watch for content changes:
# PathChanged=/etc/myapp/config.toml

[Install]
WantedBy=multi-user.target
```

### ExecStartPre / ExecStartPost / ExecStopPost

```ini
[Service]
ExecStartPre=/bin/mkdir -p /var/run/myapp
ExecStart=/opt/myapp/bin/server
ExecStartPost=/usr/bin/curl -s https://hc.home.local/ping/UUID
ExecStopPost=/bin/rm -rf /var/run/myapp
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Service won't start | `systemctl status myapp` for the last error; `journalctl -u myapp -n 50` for full logs |
| `Failed to enable unit: Unit file ... is masked` | `sudo systemctl unmask myapp` then `enable` |
| Service starts then immediately exits | Check `Type=` — a `simple` service that forks needs `Type=forking`; check `journalctl -u myapp` for the actual error |
| Timer not firing | `systemctl list-timers` — check `NEXT` column; validate the expression with `systemd-analyze calendar` |
| Drop-in not taking effect | Run `sudo systemctl daemon-reload` after creating/editing drop-ins |
| `systemctl edit` opened wrong editor | Set `EDITOR=nano` or `SUDO_EDITOR=nano` before running |
| Changes lost after OS update | Unit files must be in `/etc/systemd/system/` (captured by overlay), not in `/usr/lib/systemd/system/` |
| Service can't write to a path | With `ProtectSystem=strict`, add the path to `ReadWritePaths=`; check AppArmor denials: `journalctl | grep apparmor` |
| Want to see all env vars systemd passes to a service | `sudo systemctl show myapp -p Environment; sudo cat /proc/$(systemctl show myapp -p MainPID --value)/environ \| tr '\0' '\n'` |

---

## See Also

- [System Config](config) — overlay persistence, `systemctl edit`, sysctl via systemd
- [Backup & Recovery](backup) — full example of a user timer with `loginctl enable-linger`
- [cronie](cronie) — cron as an alternative for simple per-user schedules
- [Process Management](process-management) — `systemd-cgls`, `systemd-cgtop`, cgroup resource usage
- [shani-health](shani-health) — reports on failed units, journal errors, and boot time
