---
title: NFS File Sharing
section: Networking
updated: 2026-04-01
---

# NFS — Network File System

Native Linux file sharing at near-local disk speeds. Best for Linux-to-Linux sharing on a trusted LAN. NFS state is bind-mounted from `/data/varlib/nfs` and persists across updates.

## Server Setup

```bash
# Enable NFS server
sudo systemctl enable --now nfs-server

# Define exports in /etc/exports
echo "/home/user/shared  192.168.1.0/24(rw,sync,no_subtree_check)" | sudo tee -a /etc/exports
sudo exportfs -arv

# Allow through firewall
sudo firewall-cmd --add-service=nfs --permanent
sudo firewall-cmd --add-service=rpcbind --permanent
sudo firewall-cmd --add-service=mountd --permanent
sudo firewall-cmd --reload

# Check active exports
sudo exportfs -v
showmount -e localhost
```

## Client — Mounting

```bash
# Temporary mount
sudo mount -t nfs 192.168.1.100:/home/user/shared /mnt/remote

# Check mount
mount | grep nfs
```

## Auto-mount at Boot

Add to `/etc/fstab`:

```
192.168.1.100:/home/user/shared  /mnt/remote  nfs  defaults,_netdev,nfsvers=4  0 0
```
