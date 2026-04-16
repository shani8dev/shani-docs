---
title: rsyncd
section: Networking
updated: 2026-04-16
---

# rsync Daemon (rsyncd)

The `rsync` daemon allows fast, efficient file synchronization and backups over the network using the `rsync://` protocol.

## Setup

### Configuration
Create `/etc/rsyncd.conf`:
```ini
# /etc/rsyncd.conf
[backup]
   comment = Network Backup
   path = /home/user/backups
   read only = false
   auth users = syncuser
   secrets file = /etc/rsyncd.secrets
   hosts allow = 192.168.1.0/24

[www]
   comment = Web Server Mirror
   path = /var/www/html
   read only = true
   list = true
```

### Authentication
Create `/etc/rsyncd.secrets` with `username:password` format:
```bash
echo "syncuser:StrongPassword123" | sudo tee /etc/rsyncd.secrets
sudo chmod 600 /etc/rsyncd.secrets
```

### Persistence
On Shanios, the rsync lock and state files persist in `/data/varlib/rsync`.

### Management
```bash
# Enable service
sudo systemctl enable --now rsyncd

# Firewall
sudo firewall-cmd --add-port=873/tcp --permanent
sudo firewall-cmd --reload
```

## Client Usage
```bash
# List available modules
rsync rsync://syncuser@192.168.1.100/

# Sync to server
rsync -avz /local/dir/ rsync://syncuser@192.168.1.100/backup/
```
