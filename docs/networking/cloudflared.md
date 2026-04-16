---
title: Cloudflared Tunnels
section: Networking
updated: 2026-04-01
---

# Cloudflared — Zero-Trust Tunnels

Creates an encrypted outbound-only tunnel to Cloudflare's edge, exposing local services publicly without opening inbound firewall ports or having a static IP. **Disabled by default.**

Tunnel credentials are stored at `/data/varlib/cloudflared` and survive all system updates. No inbound firewall changes are needed — Cloudflared establishes only outbound HTTPS connections.

## Setup

```bash
# Authenticate with your Cloudflare account
cloudflared tunnel login

# Create a named tunnel
cloudflared tunnel create my-tunnel
```

## Configure Ingress

Edit `~/.cloudflared/config.yml`:

```yaml
tunnel: <YOUR-TUNNEL-UUID>
credentials-file: /home/user/.cloudflared/<UUID>.json
ingress:
  - hostname: mysite.example.com
    service: http://localhost:8080
  - hostname: api.example.com
    service: http://localhost:3000
  - service: http_status:404
```

## Route DNS & Run

```bash
# Route DNS to this tunnel (Cloudflare manages DNS record automatically)
cloudflared tunnel route dns my-tunnel mysite.example.com

# Test locally before enabling as service
cloudflared tunnel run my-tunnel

# Install and enable as a persistent systemd service
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

## Status

```bash
cloudflared tunnel list
cloudflared tunnel info my-tunnel
sudo journalctl -u cloudflared -f
```
