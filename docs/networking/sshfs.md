---
title: SSHFS
section: Networking
updated: 2026-04-01
---

# SSHFS — Mount Remote Directories over SSH

Mount any directory from an SSH-accessible machine as a local folder. Requires only an SSH server on the remote — no special server software needed.

## Mounting

```bash
# Mount a remote directory
sshfs user@hostname:/home/user/projects ~/mnt/remote-projects

# Mount with reconnect options
sshfs user@hostname:/data ~/mnt/server \
  -o reconnect,ServerAliveInterval=15,ServerAliveCountMax=3

# Unmount
fusermount -u ~/mnt/remote-projects
```

## Auto-mount at Login

Add to `/etc/fstab`:

```
user@hostname:/home/user/projects /home/user/mnt/remote fuse.sshfs defaults,_netdev,reconnect,uid=1000,gid=1000,IdentityFile=/home/user/.ssh/id_ed25519 0 0
```
