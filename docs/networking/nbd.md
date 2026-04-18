---
title: nbd-server (Network Block Device)
section: Networking
updated: 2026-04-18
---

# Network Block Device (NBD)

NBD exports a block device (disk, partition, or image file) over the network. The client side presents it as a local block device (e.g., `/dev/nbd0`) that can be formatted, mounted, or used as raw storage.

Common uses: thin-client boot images, centralised VM disk storage, and network-attached swap.

---

## Server Setup

### Configuration

Edit `/etc/nbd-server/config`:

```ini
[generic]
    # user = nbd
    # group = nbd

[disk1]
    exportname = /home/user/nbd-images/disk1.img
    port = 10809
    readonly = false
    copyonwrite = false
    flush = true
    sync = true
```

Multiple export sections (`[disk1]`, `[disk2]`, …) can be defined in the same file, each on a different port.

### Enable & Firewall

```bash
# Enable the NBD server
sudo systemctl enable --now nbd-server

# Open the port in the firewall (restrict to your LAN — NBD has no built-in auth)
sudo firewall-cmd --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" port port="10809" protocol="tcp" accept' --permanent
sudo firewall-cmd --reload
```

> ⚠️ **Security:** NBD has no built-in authentication or encryption. Always restrict access to trusted networks via firewall rules, or tunnel NBD over SSH/WireGuard on untrusted networks.

---

## Client Usage

`nbd-client` is pre-installed on Shani OS.

```bash
# Load the nbd kernel module if not already loaded
sudo modprobe nbd

# Connect to a remote block device
sudo nbd-client <server-ip> 10809 /dev/nbd0

# Format the device (first-time setup only — this destroys existing data)
sudo mkfs.ext4 /dev/nbd0

# Mount the device
sudo mkdir -p /mnt/remote-disk
sudo mount /dev/nbd0 /mnt/remote-disk

# Work with the files...

# Disconnect (unmount first, then disconnect)
sudo umount /mnt/remote-disk
sudo nbd-client -d /dev/nbd0
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `nbd-client: No such device /dev/nbd0` | Load the kernel module: `sudo modprobe nbd` |
| `Connection refused` on the client | Check `systemctl status nbd-server` on the server; verify the port and firewall with `sudo firewall-cmd --list-all` |
| Filesystem errors after disconnect | Always unmount before disconnecting — `umount` first, then `nbd-client -d` |
| Server crashes on large writes | Add `flush = true` and `sync = true` to the export section in the config |
