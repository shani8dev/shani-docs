---
title: rsyncd (rsync Daemon)
section: Networking
updated: 2026-04-18
---

# rsync Daemon (rsyncd)

The rsync daemon exposes file modules over the `rsync://` protocol for fast, efficient network file synchronisation and backups. Unlike SSH-based rsync, rsyncd runs as a standalone service — useful for automated, password-protected transfers without requiring SSH access.

rsyncd is pre-installed on Shani OS. Lock and state files persist in `/data/varlib/rsync` across OS updates.

---

## Server Setup

### Configuration

Create `/etc/rsyncd.conf`:

```ini
# Global settings
uid = nobody
gid = nobody
use chroot = yes
max connections = 4
log file = /var/log/rsyncd.log
pid file = /var/run/rsyncd.pid

[backup]
    comment = Network Backup
    path = /home/user/backups
    read only = false
    auth users = syncuser
    secrets file = /etc/rsyncd.secrets
    hosts allow = 192.168.1.0/24

[media]
    comment = Read-only Media Mirror
    path = /srv/media
    read only = true
    list = true
    hosts allow = 192.168.1.0/24
```

### Authentication

Create `/etc/rsyncd.secrets` with `username:password` pairs:

```bash
echo "syncuser:StrongPassword123" | sudo tee /etc/rsyncd.secrets
sudo chmod 600 /etc/rsyncd.secrets
```

### Enable & Firewall

```bash
# Enable the service
sudo systemctl enable --now rsyncd

# Open port 873 (restrict to your LAN)
sudo firewall-cmd --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" port port="873" protocol="tcp" accept' --permanent
sudo firewall-cmd --reload
```

---

## Client Usage

```bash
# List available modules on the server
rsync rsync://syncuser@192.168.1.100/

# Sync a local directory to the server (with progress)
rsync -avz --progress /local/dir/ rsync://syncuser@192.168.1.100/backup/

# Pull files from the server to local
rsync -avz rsync://syncuser@192.168.1.100/media/ /mnt/media/

# Dry run (shows what would be transferred without doing it)
rsync -avzn /local/dir/ rsync://syncuser@192.168.1.100/backup/
```

For one-off transfers between machines that have SSH access, SSH-tunnelled rsync is simpler — no daemon required:

```bash
rsync -avz -e "ssh -p 2222" ~/myproject youruser@192.168.1.100:~/
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Connection refused` | Check `systemctl status rsyncd`; confirm port 873 is open: `sudo firewall-cmd --list-all` |
| `Auth failed` | Verify `/etc/rsyncd.secrets` has mode `600` (`sudo chmod 600 /etc/rsyncd.secrets`) and the username in the client command matches `auth users` in the config |
| `hosts allow` blocking your client | Check the client IP is within the `hosts allow` range; temporarily remove the restriction for testing |
| Files not syncing (no errors) | Add `-v` for verbose output; check that the source path ends with `/` if you want directory *contents* (not the directory itself) |
