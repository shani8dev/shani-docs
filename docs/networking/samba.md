---
title: Samba (Windows)
section: Networking
updated: 2026-04-16
---

# Samba — SMB/CIFS (Windows / macOS / Linux)

Samba provides file and print services to SMB/CIFS clients. On Shanios, Samba's runtime state (locks, caches, `tdbsam` database) is bind-mounted from `/data/varlib/samba`, ensuring it persists across OS updates.

## Server Setup

### 1. Enable Services
Samba consists of `smbd` (file sharing) and `nmbd` (NetBIOS name resolution).
```bash
sudo systemctl enable --now smb nmb
```

### 2. Configuration
The default configuration below enables Home directory auto-sharing (`[homes]`), printer sharing, and standard security settings. 

**File:** `/etc/samba/smb.conf`
```ini
[global]
   workgroup = WORKGROUP
   dns proxy = no
   log file = /var/log/samba/%m.log
   max log size = 1000
   client min protocol = SMB2
   server min protocol = SMB2
   server role = standalone server
   passdb backend = tdbsam
   obey pam restrictions = yes
   unix password sync = yes
   passwd program = /usr/bin/passwd %u
   passwd chat = *New*UNIX*password* %n\n *ReType*new*UNIX*password* %n\n *passwd:*all*authentication*tokens*updated*successfully*
   pam password change = yes
   map to guest = Bad Password
   usershare allow guests = yes
   name resolve order = lmhosts bcast host wins
   security = user
   guest account = nobody
   usershare path = /var/lib/samba/usershare
   usershare max shares = 100
   usershare owner only = yes
   force create mode = 0070
   force directory mode = 0070

[homes]
   comment = Home Directories
   browseable = no
   read only = yes
   create mask = 0700
   directory mask = 0700
   valid users = %S

[printers]
   comment = All Printers
   browseable = no
   path = /var/spool/samba
   printable = yes
   guest ok = no
   read only = yes
   create mask = 0700

[print$]
   comment = Printer Drivers
   path = /var/lib/samba/printers
   browseable = yes
   read only = yes
   guest ok = no
```

> 💡 **Validate Config:** Run `testparm` to check for syntax errors.

### 3. User Authentication
Samba maintains its own password database. Even with `unix password sync = yes`, you must initially create the Samba user.

```bash
# Create Samba password for your Linux user
sudo smbpasswd -a youruser
```
*This grants access to your `\\server\youruser` share (via the `[homes]` section).*

### 4. Adding a Custom Share
To share a specific folder (e.g., `/home/user/shared`), append the following to the **bottom** of `/etc/samba/smb.conf`:

```ini
[MySharedFolder]
   comment = Shared Files
   path = /home/user/shared
   browseable = yes
   read only = no
   valid users = youruser
   create mask = 0644
   directory mask = 0755
```
Then restart Samba: `sudo systemctl restart smb nmb`.

### 5. Firewall
```bash
sudo firewall-cmd --add-service=samba --permanent
sudo firewall-cmd --reload
```

## Client Usage

### Linux
Mount a share manually:
```bash
sudo mount -t cifs //192.168.1.100/MySharedFolder /mnt/samba \
  -o username=youruser,uid=$(id -u),gid=$(id -g),vers=3.0
```

**Persistent Mount (`/etc/fstab`):**
Create `~/.smbcredentials` (mode `600`):
```text
username=youruser
password=yourpass
```
Add to fstab:
```text
//192.168.1.100/MySharedFolder /mnt/samba cifs credentials=/home/user/.smbcredentials,uid=1000,gid=1000,_netdev 0 0
```

### Windows
In File Explorer address bar: `\\shanios-ip\MySharedFolder` or `\\shanios-ip\youruser`.

## Troubleshooting
- **Discovery Issues:** Ensure `nmb` is running. Windows relies on NetBIOS/WSD for automatic discovery.
- **Permission Denied:** Ensure Linux filesystem permissions allow the Samba user to access the path. Samba permissions (`read only = no`) act as a gate on top of file system permissions.
- **Logs:** `journalctl -u smb` or `/var/log/samba/log.smbd`.
