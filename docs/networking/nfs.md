---
title: NFS File Sharing
section: Networking
updated: 2026-04-16
---

# NFS — Network File System

Native Linux file sharing at near-local disk speeds. Best for Linux-to-Linux sharing on a trusted LAN. NFS state is bind-mounted from `/data/varlib/nfs` and persists across updates.

## Server Setup

### 1. Enable NFS Server
```bash
sudo systemctl enable --now nfs-server
```

### 2. Define Exports
Edit `/etc/exports` to define which directories are shared and with what permissions.
```text
# /etc/exports
# Share syntax: /path/to/dir  allowed_clients(options)

/home/user/shared  192.168.1.0/24(rw,sync,no_subtree_check,no_root_squash)
```
**Common Options:**
- **rw**: Read/write access.
- **sync**: Data integrity (waits for write to disk).
- **no_subtree_check**: Improves performance when exporting a subdirectory of a volume.
- **no_root_squash**: **Security Warning**: Allows the remote root user to act as root on the share. Use only for trusted backups or cluster nodes.
- **root_squash**: (Default) Maps remote root to `nfsnobody` for security.

### 3. Apply & Check
```bash
# Refresh exports table
sudo exportfs -arv

# Verify active exports
showmount -e localhost
```

### 4. Firewall
```bash
# Open standard NFS services
sudo firewall-cmd --add-service=nfs --add-service=rpcbind --add-service=mountd --permanent
sudo firewall-cmd --reload
```

## Client — Mounting

### Temporary Mount
```bash
sudo mkdir -p /mnt/remote
sudo mount -t nfs 192.168.1.100:/home/user/shared /mnt/remote
```

### Persistent Mount (`/etc/fstab`)
```text
192.168.1.100:/home/user/shared  /mnt/remote  nfs  defaults,_netdev,nfsvers=4  0 0
```
- **_netdev**: Ensures the mount is attempted only after the network interface is up.
- **nfsvers=4**: Forces NFSv4, which is more firewall-friendly than v3.

## Troubleshooting
- **Permission Denied:** Ensure the client IP matches the allowed range in `/etc/exports` and that the underlying filesystem permissions on the host allow access.
- **Stale File Handle:** The file on the server was deleted or moved while the client had it open. `umount -f /mnt/remote` and remount.
- **Access denied by server:** Check `journalctl -u nfs-server` on the host.
