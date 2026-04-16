---
title: Samba (Windows)
section: Networking
updated: 2026-04-01
---

# Samba — SMB/CIFS (Windows / macOS / Linux)

SMB/CIFS shares visible to Windows, macOS Finder, and other Linux machines. Samba state is bind-mounted from `/data/varlib/samba` and persists across updates.

## Server Setup

```bash
# Enable Samba services
sudo systemctl enable --now smb nmb

# Edit /etc/samba/smb.conf — add a share
sudo nano /etc/samba/smb.conf
```

Example share to append to `smb.conf`:

```ini
[SharedDocs]
   comment = My Documents
   path = /home/user/Documents
   browseable = yes
   read only = no
   valid users = youruser
   create mask = 0664
   directory mask = 0775
```

```bash
# Set Samba password (separate from system password)
sudo smbpasswd -a youruser

# Apply config changes
sudo systemctl restart smb nmb

# Test config syntax
testparm

# Allow through firewall
sudo firewall-cmd --add-service=samba --permanent
sudo firewall-cmd --reload

# List active Samba shares
smbclient -L localhost -U youruser
```

## Mounting Remote Shares

```bash
# Temporary mount from another Linux machine
sudo mount -t cifs //192.168.1.100/SharedDocs /mnt/samba \
  -o username=youruser,uid=$(id -u),gid=$(id -g),vers=3.0
```

For persistent mounts, create a credentials file:

```bash
echo "username=youruser" > ~/.smbcredentials
echo "password=yourpass" >> ~/.smbcredentials
chmod 600 ~/.smbcredentials
```

Then add to `/etc/fstab`:

```
//192.168.1.100/SharedDocs /mnt/samba cifs credentials=/home/user/.smbcredentials,uid=1000,gid=1000,_netdev 0 0
```
