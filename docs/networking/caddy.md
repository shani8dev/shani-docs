---
title: Caddy
section: Networking
updated: 2026-04-01
---

# Caddy Web Server

[Caddy](https://caddyserver.com/) is a modern, enterprise-grade web server with automatic HTTPS. On Shanios, it is the recommended reverse proxy and static file server due to its security defaults, systemd integration, and simplicity.

---

## Installation

Caddy is available in the official repositories.

```bash
sudo pacman -S caddy
```

---

## Configuration Loading & Context

It is important to understand where Caddy looks for its configuration file (`Caddyfile`) depending on how you launch it.

### 1. Manual Execution (Current Directory)
When running Caddy manually via the CLI, it automatically looks for a `Caddyfile` in your **current working directory**.

```bash
# If you are inside a project folder:
cd ~/projects/my-app/
caddy run
# 👆 This automatically loads ./Caddyfile
```

### 2. System Service (Global Config)
When Caddy is managed via systemd (`sudo systemctl start caddy`), it is configured to load the system-wide configuration file, regardless of your current directory.

*   **Path:** `/etc/caddy/Caddyfile`
*   **User:** Runs as the `caddy` system user.

```bash
sudo systemctl start caddy
# 👆 Loads /etc/caddy/Caddyfile
```

---

## Configuration

The primary configuration file for the system service is `/etc/caddy/Caddyfile`. On Shanios, `/etc` is managed atomically, so your configuration persists safely across updates and rollbacks.

### Basic Reverse Proxy
Route traffic to local services (e.g., apps running in Distrobox, systemd-nspawn, or Podman).

```caddyfile
# /etc/caddy/Caddyfile

# Public domain (auto HTTPS via Let's Encrypt)
app.example.com {
    reverse_proxy localhost:8080
}

# Local development (.lan or .localhost)
myapp.lan {
    tls internal
    reverse_proxy localhost:3000
}

# Static site hosting
docs.example.com {
    root * /srv/http/docs
    file_server
    encode zstd gzip
}
```

### Global Options
```caddyfile
{
    # Adjust email for Let's Encrypt
    email admin@example.com
    # Prefer IPv4 if IPv6 is problematic
    default_bind 0.0.0.0
}

example.com {
    reverse_proxy 192.168.1.50:80
}
```

---

## Service Management

Caddy runs as a systemd service under the `caddy` user.

```bash
# Enable and start
sudo systemctl enable --now caddy

# Reload config (zero-downtime)
sudo systemctl reload caddy

# Check status
systemctl status caddy

# View logs
journalctl -u caddy -f
```

---

## Permissions & File Serving

By default, Caddy runs as the `caddy` user with restricted privileges. To serve files from your home directory or custom paths, grant read access:

```bash
# Grant recursive read+execute to Caddy
sudo setfacl -R -m u:caddy:rx /home/user/www

# Or add Caddy to a group that owns the files
sudo usermod -aG http caddy
sudo chown -R :http /home/user/www
```

---

## Storage & Persistence

Caddy stores persistent data (TLS certificates, ACME state, internal CA keys) in:
```
/var/lib/caddy/.local/share/caddy/
```
On Shanios, this directory resides on the persistent root Btrfs subvolume. Certificates survive OS updates and rollbacks automatically.

---

## TLS & Certificates

- **Public Domains**: Automatically provisioned and renewed via Let's Encrypt.
- **Internal/Local**: `tls internal` generates a self-signed CA. Export the CA to your host/browser trust store to avoid security warnings:
  ```bash
  # Find the Caddy root CA
  ls /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt
  
  # Trust it on the host (Arch/Shanios)
  sudo trust anchor /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt
  sudo update-ca-trust
  ```

---

## Firewall Configuration

If exposing services externally, ensure ports 80 and 443 are open:

```bash
# Using firewalld (common on desktop profiles)
sudo firewall-cmd --add-port=80/tcp --add-port=443/tcp --permanent
sudo firewall-cmd --reload

# Using ufw
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `permission denied` when accessing files | Check `setfacl` permissions or SELinux/AppArmor context |
| HTTPS fails for local domains | Use `tls internal` and trust the local CA |
| Service won't start | Validate config: `sudo caddy validate --config /etc/caddy/Caddyfile` |
| Logs show `bind: address already in use` | Stop conflicting services (nginx, apache) or change port |
| Container reverse proxy fails | Ensure host networking or port forwarding is correctly configured in Podman/Docker |

> 💡 **Tip**: Use `caddy fmt --overwrite /etc/caddy/Caddyfile` to auto-format and validate your configuration before reloading.
