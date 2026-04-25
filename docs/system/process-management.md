---
title: Process Management
section: System
updated: 2026-04-25
---

# Process Management

Standard Linux process management tools are all available on Shani OS. This page covers inspecting, controlling, and debugging running processes.

---

## Viewing Processes

### ps — snapshot of running processes

```bash
# All processes, full format (most useful general view)
ps aux

# Process tree (shows parent-child relationships)
ps auxf

# All processes, long format with threads
ps -eLf

# Specific user's processes
ps -u alice

# Specific process by name
ps aux | grep caddy

# Sort by CPU usage
ps aux --sort=-%cpu | head -20

# Sort by memory usage
ps aux --sort=-%mem | head -20

# Show a specific PID
ps -p 1234 -o pid,ppid,user,cmd,%cpu,%mem
```

### pgrep / pidof — find PIDs by name

```bash
# Find PIDs matching a name
pgrep caddy
pgrep -u alice          # all PIDs owned by alice
pgrep -la caddy         # with full command line

# Get PID of an exact binary name
pidof sshd
```

### htop — interactive process viewer

`htop` is pre-installed. Press `F1` for help, `F6` to sort, `F9` to kill, `q` to quit.

```bash
htop

# Filter to a specific user
htop -u alice

# Filter to a specific PID
htop -p 1234,5678
```

Useful htop shortcuts:

| Key | Action |
|-----|--------|
| `F6` | Sort by column |
| `F4` | Filter by name |
| `F9` | Send signal to selected process |
| `t` | Toggle tree view |
| `H` | Toggle user threads |
| `K` | Toggle kernel threads |
| `Space` | Tag a process (for batch operations) |

---

## Signals & Killing Processes

### kill / killall / pkill

```bash
# Send SIGTERM (15) — graceful shutdown request
kill 1234
kill -TERM 1234

# Send SIGKILL (9) — force kill, cannot be caught or ignored
kill -9 1234
kill -KILL 1234

# Send SIGHUP (1) — reload config (many daemons interpret this as a reload)
kill -HUP 1234

# Kill all processes matching a name
killall caddy
killall -9 caddy         # force

# Kill processes by pattern
pkill -f "python manage.py"   # matches full command line
pkill -u alice                # kill all of alice's processes

# Kill all processes for a user (also terminates their session)
sudo loginctl kill-user alice
```

### Common signals

| Signal | Number | Default action | Use |
|--------|--------|----------------|-----|
| `SIGTERM` | 15 | Terminate (graceful) | Normal shutdown — gives process time to clean up |
| `SIGKILL` | 9 | Terminate (forced) | Last resort — process cannot catch or ignore this |
| `SIGHUP` | 1 | Terminate (or reload) | Reload config in daemons (nginx, sshd, etc.) |
| `SIGINT` | 2 | Terminate | Same as Ctrl+C |
| `SIGSTOP` | 19 | Pause | Pause a process (cannot be caught) |
| `SIGCONT` | 18 | Resume | Resume a paused process |
| `SIGUSR1/2` | 10/12 | User-defined | App-specific (e.g. log rotation) |

```bash
# List all signal names and numbers
kill -l
```

---

## Priority & Scheduling

### nice / renice — CPU priority

Priority ranges from -20 (highest) to +19 (lowest). Default is 0. Only root can set negative (higher priority) values.

```bash
# Start a process with low priority (nice value 10)
nice -n 10 make -j8

# Start with very low priority (background batch job)
nice -n 19 restic backup ~/

# Change priority of a running process
sudo renice -n 5 -p 1234       # by PID
sudo renice -n 10 -u alice     # all of alice's processes

# Check current nice value
ps -o pid,ni,comm -p 1234
```

### ionice — I/O scheduling priority

Controls how the kernel schedules disk I/O for a process.

```bash
# Run with idle I/O priority (only gets disk when nothing else needs it)
ionice -c 3 rsync -a /home /backup

# Best-effort, low priority (class 2, priority 7 = lowest)
ionice -c 2 -n 7 dd if=/dev/sda of=/dev/null

# Check I/O priority of a process
ionice -p 1234

# Change I/O priority of a running process
sudo ionice -c 3 -p 1234
```

---

## Background Jobs & Job Control

```bash
# Run a command in the background
long-running-command &

# List background jobs in the current shell
jobs
jobs -l   # with PIDs

# Bring a background job to the foreground
fg %1     # job number 1
fg        # most recent job

# Send a foreground process to the background (first Ctrl+Z to pause, then bg)
Ctrl+Z
bg %1

# Detach from terminal completely (survives shell exit)
nohup long-running-command &
nohup long-running-command > ~/output.log 2>&1 &

# Disown a job (remove from shell's job table)
disown %1
```

For long-running tasks that must survive terminal disconnection, use `tmux` (pre-installed) instead of `nohup`:

```bash
tmux new -s backup
# run your command
Ctrl+B then D   # detach — command keeps running
tmux attach -t backup   # reattach later
```

---

## /proc — Process Information

Every process has a directory at `/proc/<PID>/` exposing its state as virtual files.

```bash
# Command line of a process
cat /proc/1234/cmdline | tr '\0' ' '

# Environment variables of a process (requires same user or root)
cat /proc/1234/environ | tr '\0' '\n'

# Open file descriptors
ls -la /proc/1234/fd
ls /proc/1234/fd | wc -l   # count open files

# Memory maps
cat /proc/1234/maps

# Current working directory
readlink /proc/1234/cwd

# Executable path
readlink /proc/1234/exe

# Resource limits
cat /proc/1234/limits

# CPU and memory stats
cat /proc/1234/status

# System-wide info
cat /proc/cpuinfo       # CPU details
cat /proc/meminfo       # memory usage
cat /proc/loadavg       # 1/5/15-minute load averages, running/total threads, last PID
cat /proc/uptime        # seconds since boot
```

---

## lsof — Open Files & Sockets

`lsof` lists all open files, including network sockets, pipes, and device files.

```bash
# All open files (large output)
sudo lsof

# Open files by a specific process
lsof -p 1234

# Open files by a specific user
lsof -u alice

# What process has a file open
lsof /var/log/syslog

# What process is using a port
sudo lsof -i :80
sudo lsof -i :443
sudo lsof -i TCP:22

# All network connections (no DNS lookup)
sudo lsof -i -n -P

# All open files in a directory
lsof +D /home/alice

# Files opened by a specific command name
lsof -c caddy
```

---

## strace — System Call Tracing

`strace` traces system calls made by a process — useful for debugging why something is failing.

```bash
# Trace a new command
strace ls /tmp

# Attach to a running process
sudo strace -p 1234

# Trace with timestamps
strace -t ls /tmp

# Trace only specific system calls
strace -e openat,read,write ls /tmp

# Trace file operations only
strace -e trace=file ls /tmp

# Count system calls (summary)
strace -c ls /tmp

# Follow child processes (forks)
strace -f bash -c "ls && echo done"

# Write output to a file
strace -o /tmp/trace.txt ls /tmp

# Practical: why is a service failing to start?
sudo strace -f -e trace=file systemctl start myservice 2>&1 | grep -E "ENOENT|EACCES|open"
```

---

## systemd-cgls / systemctl — Process Hierarchy

Systemd organises all processes into control groups (cgroups). This is the authoritative view of what's running and under which service.

```bash
# Show the full cgroup tree (which service owns which processes)
systemd-cgls

# Show resource usage by service (CPU, memory, I/O)
systemd-cgtop

# Show processes for a specific service
systemctl status caddy
# (the PID list at the bottom includes all child processes)

# Which service owns a PID?
systemctl status 1234
```

---

## Memory & Resource Usage

```bash
# Memory overview
free -h

# Detailed memory breakdown
cat /proc/meminfo

# Per-process memory (resident set size)
ps aux --sort=-%rss | head -20

# Virtual, resident, and shared memory for a process
cat /proc/1234/status | grep -E "VmRSS|VmSize|VmSwap"

# Check for OOM kills (Out of Memory killer events)
sudo journalctl -k | grep -i "oom\|killed process"
dmesg | grep -i oom

# Shared memory segments
ipcs -m

# ZRAM swap usage (Shani OS uses ZRAM by default)
zramctl
```

---

## Monitoring CPU Load

```bash
# Current load averages (1, 5, 15 minutes)
uptime
cat /proc/loadavg

# CPU usage summary (press 1 to show per-core)
top

# Watch CPU usage of a specific process
watch -n 1 'ps -p 1234 -o %cpu,%mem,cmd'

# Per-core usage snapshot
mpstat -P ALL 1 3

# CPU frequency and governor
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Process won't die with `kill -9` | The process is in an uninterruptible sleep (D state) — usually waiting on I/O. Check `ps aux` for `D` state; may need to wait for I/O to complete or reboot |
| `kill: Operation not permitted` | You don't own the process — use `sudo kill` |
| High load but low CPU usage | Check I/O wait: `top` → look at `%wa` in the CPU line; `iostat -x 1` for disk I/O |
| Process keeps respawning after kill | It's managed by systemd — use `sudo systemctl stop <service>` instead |
| Can't find which process owns a port | `sudo ss -tlnp | grep :PORT` or `sudo lsof -i :PORT` |
| `strace` shows permission denied | Run with `sudo`; or check `/proc/sys/kernel/yama/ptrace_scope` (0 = unrestricted, 1 = parent only) |
| Process using too much memory | Check `cat /proc/<PID>/status | grep VmRSS`; consider setting memory limits in the service unit with `MemoryMax=` |

---

## See Also

- [Systemd](systemd) — service management, unit files, resource limits with `MemoryMax=` and `CPUQuota=`
- [Shell & Environment](shell) — `htop`, `ncdu`, and other pre-installed monitoring tools
- [shani-health](shani-health) — `--hardware` report includes CPU load, memory, OOM events, and zombie processes
