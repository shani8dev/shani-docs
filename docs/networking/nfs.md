---
title: NFS File Sharing
section: Networking
updated: 2026-04-18
---

# NFS — Network File System

Native Linux file sharing at near-local disk speeds. Best for Linux-to-Linux sharing on a trusted LAN. NFS state is bind-mounted from `/data/varlib/nfs` and persists across OS updates.

> **Prefer Samba** if you need to share with Windows or macOS clients. Use NFS for Linux-to-Linux shares where performance matters.

---

## Server Setup

### 1. Enable NFS Server

```bash
sudo systemctl enable --now nfs-server
```

### 2. Define Exports

Edit `/etc/exports`:

```text
# /etc/exports
# Syntax: /path  allowed_clients(options)

# Read-write share for LAN clients
/home/user/shared     192.168.1.0/24(rw,sync,no_subtree_check)

# Read-only share (e.g. for media)
/srv/media            192.168.1.0/24(ro,sync,no_subtree_check)

# Single trusted host with full root access (backup/cluster use only)
/var/backups          192.168.1.5(rw,sync,no_subtree_check,no_root_squash)
```

**Common export options:**

| Option | Effect |
|--------|--------|
| `rw` | Read/write access (default: `ro`) |
| `sync` | Wait for writes to commit to disk before replying (safer, slightly slower) |
| `no_subtree_check` | Improves performance when exporting a subdirectory; recommended |
| `root_squash` | **(Default)** Maps remote root UID to `nfsnobody` — prevents privilege escalation |
| `no_root_squash` | ⚠️ Allows remote root to act as root on the share. Use only on trusted hosts |

### 3. Apply & Verify

```bash
# Re-read /etc/exports without restarting the server
sudo exportfs -arv

# Check which exports are active
showmount -e localhost
```

### 4. Firewall

```bash
sudo firewall-cmd --add-service=nfs --add-service=rpcbind --add-service=mountd --permanent
sudo firewall-cmd --reload
```

---

## Client — Mounting

### Temporary Mount

```bash
sudo mkdir -p /mnt/remote
sudo mount -t nfs 192.168.1.100:/home/user/shared /mnt/remote

# Unmount
sudo umount /mnt/remote
```

### Persistent Mount (`/etc/fstab`)

```text
192.168.1.100:/home/user/shared  /mnt/remote  nfs  defaults,_netdev,nfsvers=4,timeo=14  0 0
```

| Option | Effect |
|--------|--------|
| `_netdev` | Delays mount until the network interface is up |
| `nfsvers=4` | Forces NFSv4 — more firewall-friendly and secure than v3 |
| `timeo=14` | Timeout in tenths of a second before retrying (1.4 s); reduces boot hang if server is down |

Apply without rebooting:

```bash
sudo mount -a
```

---

## Disk Quotas (quota-tools)

quota-tools enforces per-user and per-group disk usage limits on NFS-exported filesystems. Quotas are enforced on the **server** side — limits apply regardless of which client is writing.

### Enable Quotas on the Server

```bash
# 1. Mount the filesystem with quota options in /etc/fstab
#    Add usrquota and/or grpquota to the options field:
#    /dev/sdb1  /srv/shared  ext4  defaults,usrquota,grpquota  0 2

# 2. Remount to apply the new options
sudo mount -o remount /srv/shared

# 3. Initialise the quota database files
sudo quotacheck -cug /srv/shared

# 4. Enable quota enforcement
sudo quotaon /srv/shared
```

### Set User Quotas

```bash
# Edit quotas for a specific user (opens an editor)
sudo edquota -u alice

# The editor shows soft/hard limits for blocks (KB) and inodes (file count):
# Filesystem  blocks   soft   hard  inodes  soft  hard
# /srv/shared  102400  900000 1000000   512  4500  5000
#
# soft = warning threshold; hard = absolute limit
# grace period applies when usage is between soft and hard limits

# Set the grace period (how long a user can exceed soft limit before hard limit kicks in)
sudo edquota -t

# Copy one user's quota settings to another user
sudo edquota -p alice bob
```

### Reporting

```bash
# Show quota usage for all users on a filesystem
sudo repquota /srv/shared

# Show your own quota usage
quota -s

# Show quota for a specific user
sudo quota -su alice
```

### NFS + Quotas

NFS clients do not enforce quotas locally — writes that exceed a quota are rejected by the server with an `EDQUOT` (disk quota exceeded) error, which the client reports as "no space left on device".

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Permission denied` | Check the client IP is within the allowed range in `/etc/exports`; also verify Linux filesystem permissions on the export path |
| `Stale file handle` | The exported path was deleted or the server restarted while the client had it open — `sudo umount -f /mnt/remote` and remount |
| `Access denied by server` | Check `journalctl -u nfs-server` on the host for detailed errors |
| Mount hangs at boot | Add `_netdev` and `timeo=14` to fstab options; ensure `nfs-server` is running on the host |
| `showmount` fails from client | Open `rpcbind` and `mountd` firewall services on the server in addition to `nfs` |
