---
title: Samba (SMB/CIFS)
section: Networking
updated: 2026-08-28
---

# Samba — SMB/CIFS (Windows / macOS / Linux)

Samba provides file and print sharing using the SMB/CIFS protocol, making your Shani OS machine appear as a Windows-compatible network share. It is pre-installed, and its runtime state (locks, caches, `tdbsam` database) is bind-mounted from `/data/varlib/samba`, ensuring it persists across OS updates.

> **Prefer NFS** for Linux-to-Linux sharing. Use Samba when you need Windows or macOS compatibility.

---

## Server Setup

### 1. Enable Services

Samba consists of `smbd` (file sharing) and `nmbd` (NetBIOS name resolution for Windows discovery):

```bash
sudo systemctl enable --now smb nmb
```

### 2. Configuration

**File:** `/etc/samba/smb.conf`

```ini
[global]
    workgroup = WORKGROUP
    server role = standalone server
    passdb backend = tdbsam
    security = user
    guest account = nobody

    ; Enforce SMB2+ — SMB1 is disabled for security
    client min protocol = SMB2
    server min protocol = SMB2

    ; Sync Samba password changes back to the Linux account
    unix password sync = yes
    passwd program = /usr/bin/passwd %u
    pam password change = yes
    obey pam restrictions = yes

    ; Logging
    log file = /var/log/samba/%m.log
    max log size = 1000

    ; User share support (GUI-created shares via Dolphin/Nautilus)
    usershare path = /var/lib/samba/usershare
    usershare max shares = 100
    usershare owner only = yes
    usershare allow guests = yes

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

> 💡 **Validate your config:** Run `testparm` after editing to catch syntax errors before restarting.

### 3. User Authentication

Samba maintains its own password database. Even with `unix password sync = yes`, you must create the Samba password entry initially:

```bash
# Add a Samba password for an existing Linux user
sudo smbpasswd -a youruser

# Enable an existing Samba user (if previously disabled)
sudo smbpasswd -e youruser
```

This grants access to the automatic `[homes]` share at `\\server-ip\youruser`.

### 4. Adding a Custom Share

Append to the bottom of `/etc/samba/smb.conf`:

```ini
[SharedFiles]
    comment = Shared Files
    path = /home/user/shared
    browseable = yes
    read only = no
    valid users = youruser
    create mask = 0644
    directory mask = 0755
```

Then restart Samba to apply:

```bash
sudo systemctl restart smb nmb
```

### 5. Firewall

```bash
sudo firewall-cmd --add-service=samba --permanent
sudo firewall-cmd --reload
```

### 6. File Permissions

> ⚠️ **Shanios does not use SELinux.** These commands come from the upstream documentation and will fail here — `semanage`, `setsebool`, `restorecon` and `ls -Z` are not installed, and Shanios enforces **AppArmor** (`lsm=landlock,lockdown,yama,integrity,apparmor,bpf`; see [AppArmor](../security/apparmor.md) and Cassini's LSM page). What actually governs a daemon's file access on Shanios is ordinary Unix ownership and permissions — fix those (`setfacl`, `chown`, `chmod`) and nothing SELinux-shaped. AppArmor profiles ship for third-party software; the image ships none of its own.

So for a custom share, make it readable by the `samba` user:

```bash
sudo chown -R samba:samba /srv/share
sudo chmod -R 0755 /srv/share          # or 0770 with group write
testparm -s | grep -A2 '\[srv\]'
```

`testparm` is the authority here, exactly as `sshd -t` is for Remote Access: it is the same parser `smbd` uses, so a share it accepts is a share the daemon will load.

For the `[homes]` share there is no boolean to enable — the upstream SELinux
step does not apply. What matters is that the user's home directory is readable
and not over-mounted:

```bash
getent passwd alice          # is alice a real user on this machine?
namei -l /home/alice         # walk the path, checking each hop
testparm -s | grep -A4 '\[homes\]'
```

---

## Client Usage

### Linux

The `mount.cifs` helper used below comes from `cifs-utils` (pre-installed).

Temporary mount:

```bash
sudo mount -t cifs //192.168.1.100/SharedFiles /mnt/samba \
  -o username=youruser,uid=$(id -u),gid=$(id -g),vers=3.0
```

Persistent mount via `/etc/fstab` — first create `~/.smbcredentials` (mode `600`):

```text
username=youruser
password=yourpass
```

Then add to `/etc/fstab`:

```text
//192.168.1.100/SharedFiles  /mnt/samba  cifs  credentials=/home/user/.smbcredentials,uid=1000,gid=1000,_netdev,vers=3.0  0 0
```

### Windows

In File Explorer address bar or Run dialog: `\\192.168.1.100\SharedFiles` or `\\192.168.1.100\youruser`

### macOS

Finder → Go → Connect to Server: `smb://192.168.1.100/SharedFiles`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Share not appearing in Windows network browser | Ensure `nmb` is running; Windows uses NetBIOS/WSD for discovery — connecting directly by IP (`\\192.168.1.100`) always works |
| `Permission denied` when accessing share | Check Linux filesystem permissions on the shared path — Samba permissions are layered on top; both must allow access |
| `NT_STATUS_LOGON_FAILURE` | Wrong Samba password — reset with `sudo smbpasswd youruser` |
| `mount error(13): Permission denied` on Linux | Add `sec=ntlmssp` to mount options; verify credentials in `.smbcredentials` |
| Config changes not taking effect | Run `testparm` to validate, then `sudo systemctl restart smb nmb` |
| View logs | `journalctl -u smb` or `/var/log/samba/log.smbd` |

## See Also

- [NFS exports](nfs)
- [Firewall rules for SMB](firewalld)
