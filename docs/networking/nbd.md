---
title: nbd-server
section: Networking
updated: 2026-04-16
---

# Network Block Device (NBD)

NBD allows you to export a block device (disk, partition, or image file) over the network. The client can mount it as a local block device (e.g., `/dev/nbd0`).

## Server Setup

### Configuration
Edit `/etc/nbd-server/config`:
```ini
[generic]
   [disk1]
      exportname = /home/user/nbd-images/disk1.img
      port = 10809
      readonly = false
      copyonwrite = false
      flush = true
```

### Management
```bash
# Enable service
sudo systemctl enable --now nbd-server

# Firewall
sudo firewall-cmd --add-port=10809/tcp --permanent
sudo firewall-cmd --reload
```

## Client Usage
```bash
# Install client tools
sudo pacman -S nbd

# Connect to remote block device
sudo nbd-client <server-ip> 10809 /dev/nbd0

# Mount the device
sudo mount /dev/nbd0 /mnt/remote-disk

# Disconnect (unmount first!)
sudo umount /mnt/remote-disk
sudo nbd-client -d /dev/nbd0
```
