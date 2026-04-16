---
title: OpenSSH
section: Networking
updated: 2026-04-01
---

# OpenSSH — Remote Shell & File Transfer

SSH server is **not enabled by default**. Enable it only when needed; prefer access via Tailscale rather than exposing port 22 publicly.

## Enable SSH Server

```bash
sudo systemctl enable --now sshd

# Allow SSH in firewall (LAN only is safest)
sudo firewall-cmd --add-service=ssh --permanent
sudo firewall-cmd --reload
```

## Hardening `/etc/ssh/sshd_config`

```bash
sudo nano /etc/ssh/sshd_config
```

Key settings to set:

```
PasswordAuthentication no   # key-only auth
PermitRootLogin no
Port 2222                   # non-default port (optional)
AllowUsers youruser         # restrict to specific users
MaxAuthTries 3
```

```bash
sudo systemctl restart sshd
```

## Key-Based Authentication

```bash
# Generate an ED25519 key pair on the CLIENT
ssh-keygen -t ed25519 -C "mydesktop"

# Copy public key to server
ssh-copy-id user@hostname
# or manually append ~/.ssh/id_ed25519.pub to server's ~/.ssh/authorized_keys
```

## Connecting & File Transfer

```bash
# Connect
ssh user@hostname
ssh -p 2222 user@hostname   # non-default port

# Tunnel a local port via SSH
ssh -L 8080:localhost:3000 user@hostname

# Transfer files
scp localfile.txt user@hostname:/home/user/
rsync -avz /local/dir/ user@hostname:/remote/dir/

# SFTP interactive session
sftp user@hostname
```

> **Never expose SSH directly to the internet.** Use SSH over Tailscale (`tailscale ssh`), or tunnel it through Cloudflared. If public SSH is unavoidable: use key-only auth, disable PasswordAuthentication, change the default port, and enable Fail2ban.
