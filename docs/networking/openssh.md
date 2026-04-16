---
title: OpenSSH
section: Networking
updated: 2026-04-16
---

# OpenSSH — Remote Shell & File Transfer

SSH provides encrypted remote access. On Shanios, the SSH daemon (`sshd`) is not enabled by default. It is recommended to use SSH over Tailscale (`tailscale ssh`) or via Cloudflared tunnels rather than exposing port 22 directly to the public internet.

## Server Setup

### 1. Enable SSH Server
```bash
sudo systemctl enable --now sshd
```
*Tip: For on-demand access, you can use `sshd.socket` (socket activation) instead of `sshd.service`. This starts the SSH daemon only when a connection is attempted.*

### 2. Hardening `/etc/ssh/sshd_config`
For better security, modify `/etc/ssh/sshd_config`:

```text
# Disable password login (require keys)
PasswordAuthentication no

# Disable root login
PermitRootLogin no

# Optional: Change default port
Port 2222

# Restrict access to specific users
AllowUsers youruser
```
Restart the service after changes: `sudo systemctl restart sshd`

### 3. Firewall
```bash
# If using a custom port
sudo firewall-cmd --add-port=2222/tcp --permanent
# Or allow the default ssh service
# sudo firewall-cmd --add-service=ssh --permanent
sudo firewall-cmd --reload
```

## Client Setup

### 1. Generate Key Pair
Run this on your **client** machine:
```bash
ssh-keygen -t ed25519 -C "my-desktop"
```

### 2. Copy Key to Server
```bash
ssh-copy-id -p 2222 user@shanios-ip
```

### 3. Client Configuration
Create `~/.ssh/config` on your client for easy access:
```text
Host shanios
    HostName 192.168.1.100
    User myuser
    Port 2222
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
```
Now connect with simply: `ssh shanios`

## Troubleshooting
- **Logs:** `journalctl -u sshd`
- **Connection Refused:** Check if `sshd` is running (`systemctl status sshd`) and verify `firewalld` settings.
- **Permission Denied (publickey):** Check permissions on the server. The `~/.ssh` directory must be `700` and `~/.ssh/authorized_keys` must be `600`.
