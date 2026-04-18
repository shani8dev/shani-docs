---
title: OpenSSH
section: Networking
updated: 2026-04-18
---

# OpenSSH — Remote Shell & File Transfer

OpenSSH provides encrypted remote access, file transfer, and port forwarding. On Shani OS, the SSH daemon (`sshd`) is **not enabled by default**.

**Recommended approach:** Use SSH over Tailscale (`tailscale ssh`) for access between your own devices — it eliminates the need to manage keys or open firewall ports. Enable `sshd` directly only when you need access from machines that are not on your Tailscale network.

---

## Quick Start

```bash
# Enable and start the SSH daemon
sudo systemctl enable --now sshd

# Confirm it's listening
ss -tlnp | grep 22
```

---

## Server Setup

### 1. Harden `/etc/ssh/sshd_config`

The defaults are functional but not maximally secure. Edit the config:

```bash
sudo nano /etc/ssh/sshd_config
```

Recommended settings:

```text
# Use a non-standard port to reduce automated scanner noise
Port 2222

# Key-based authentication only — disable passwords
PasswordAuthentication no
KbdInteractiveAuthentication no

# Disable root login entirely
PermitRootLogin no

# Only allow specific users
AllowUsers youruser

# Disable unused authentication methods
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys

# Reduce login grace period
LoginGraceTime 30

# Disconnect idle sessions after 15 minutes
ClientAliveInterval 900
ClientAliveCountMax 0

# Disable X11 and TCP forwarding if not needed
X11Forwarding no
AllowTcpForwarding no

# Speed up login by skipping reverse DNS lookup
UseDNS no

# Limit to modern ciphers and MACs
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com
```

Apply changes:

```bash
# Validate config before restarting (catches syntax errors)
sudo sshd -t

sudo systemctl restart sshd
```

### 2. Socket Activation (On-Demand)

For machines that rarely accept SSH connections, use socket activation instead of a persistent daemon. `sshd` starts only when a connection attempt arrives:

```bash
# Disable the persistent daemon
sudo systemctl disable --now sshd

# Enable socket activation instead
sudo systemctl enable --now sshd.socket
```

### 3. Open the Firewall

```bash
# Custom port (adjust 2222 to your chosen port)
sudo firewall-cmd --add-port=2222/tcp --permanent
sudo firewall-cmd --reload

# Or if using the default port 22
# sudo firewall-cmd --add-service=ssh --permanent
# sudo firewall-cmd --reload
```

> **Tip:** Pair with [Fail2ban](https://docs.shani.dev/doc/networking/fail2ban) to automatically ban IPs with repeated failed login attempts.

---

## Client Setup

### 1. Generate a Key Pair

Run this on your **client** machine (not the server):

```bash
# Ed25519 is fast, compact, and recommended
ssh-keygen -t ed25519 -C "laptop-$(date +%Y)"

# Key pair saved to:
# ~/.ssh/id_ed25519       (private key — never share this)
# ~/.ssh/id_ed25519.pub   (public key — copy this to servers)
```

### 2. Copy the Public Key to the Server

```bash
ssh-copy-id -p 2222 youruser@192.168.1.100

# Or manually:
cat ~/.ssh/id_ed25519.pub | ssh -p 2222 youruser@192.168.1.100 \
  "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

### 3. Client Configuration (`~/.ssh/config`)

Create a config file on your client to avoid typing full addresses every time:

```text
Host shanios
    HostName 192.168.1.100
    User youruser
    Port 2222
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes

# Access via Tailscale (no port or key management needed)
Host shanios-ts
    HostName shani-server
    User youruser

# Jump host (reach an internal server via your Shani OS box)
Host internal-server
    HostName 10.0.0.5
    User admin
    ProxyJump shanios
```

Connect with:

```bash
ssh shanios
ssh shanios-ts
ssh internal-server
```

---

## SSH via Tailscale

If Tailscale SSH is enabled on the server, you can SSH to any device on your tailnet without managing `authorized_keys`, firewall rules, or port numbers:

```bash
# On the server — enable Tailscale SSH (one-time setup)
sudo tailscale up --ssh

# From any client on the same tailnet
tailscale ssh youruser@shani-server
# or using the Tailscale IP directly
ssh youruser@100.x.y.z
```

ACLs for Tailscale SSH are managed in the Tailscale admin console — you can restrict which users/devices can SSH to which targets.

---

## File Transfer

```bash
# Copy a file from local to remote
scp -P 2222 file.txt youruser@shanios:/home/youruser/

# Copy a directory recursively
scp -P 2222 -r ~/myproject youruser@shanios:~/

# Using rsync (faster for large or repeated transfers, resumes interrupted copies)
rsync -avz -e "ssh -p 2222" ~/myproject youruser@shanios:~/
```

For mounting a remote directory as a local filesystem over SSH, see the [SSHFS wiki page](https://docs.shani.dev/doc/networking/sshfs).

---

## Port Forwarding & Tunnels

```bash
# Local forwarding: access a remote service on your local machine
# (reach the server's Jellyfin at localhost:8096)
ssh -L 8096:localhost:8096 shanios

# Remote forwarding: expose a local service on the remote server
# (the server's port 3000 tunnels back to your local port 3000)
ssh -R 3000:localhost:3000 shanios

# Dynamic SOCKS proxy (route all browser traffic through your server)
ssh -D 1080 shanios
# Then configure your browser to use SOCKS5 proxy at localhost:1080

# Keep a tunnel alive in the background
ssh -N -f -L 5432:localhost:5432 shanios   # tunnel remote Postgres locally
```

---

## Server Key Persistence

On Shani OS, SSH host keys are stored in `/etc/ssh/` and persisted across OS updates and rollbacks. You will not see `REMOTE HOST IDENTIFICATION HAS CHANGED` warnings after a system update.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Connection refused` | Confirm `sshd` or `sshd.socket` is active: `systemctl status sshd sshd.socket`; check firewall: `sudo firewall-cmd --list-ports` |
| `Permission denied (publickey)` | Check permissions: `~/.ssh` must be `700` and `~/.ssh/authorized_keys` must be `600`; verify the key is actually in `authorized_keys` |
| `Host key verification failed` | The server's host key changed — if expected (reinstall), remove the old entry: `ssh-keygen -R 192.168.1.100` |
| Slow login (10+ second delay) | `UseDNS no` should be set in `sshd_config` — reverse DNS lookup on connect causes the delay |
| `Too many authentication failures` | Add `IdentitiesOnly yes` to `~/.ssh/config` for that host to prevent the SSH agent from offering all stored keys |
| Cannot connect after changing port | Ensure the new port is open in the firewall and you verified connectivity before closing the existing session |
| View server-side logs | `journalctl -u sshd -f` |
| View client-side debug output | Add `-v` (or `-vvv` for maximum verbosity) to the `ssh` command |
