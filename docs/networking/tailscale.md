---
title: Tailscale VPN
section: Networking
updated: 2026-04-01
---

# Tailscale — Private WireGuard Mesh

Builds a private peer-to-peer encrypted network between all your devices using WireGuard. All traffic is authenticated; devices are only reachable by other Tailscale nodes. **Inactive until you sign in.**

Tailscale state is bind-mounted from `/data/varlib/tailscale` and persists across all system updates — you stay authenticated after every update.

## Enable & Authenticate

```bash
# Enable the daemon
sudo systemctl enable --now tailscaled

# Authenticate (opens browser)
sudo tailscale up

# Bring up with specific options
sudo tailscale up --accept-routes --ssh            # accept subnet routes; enable Tailscale SSH
sudo tailscale up --advertise-exit-node            # act as exit node (route all traffic)
sudo tailscale up --advertise-routes=192.168.1.0/24  # expose your LAN to the tailnet
```

## Status & Diagnostics

```bash
# Status and peer list
tailscale status

# Diagnose NAT/relay connectivity
tailscale netcheck

# Check your Tailscale IP
tailscale ip -4

# Ping a peer by Tailscale hostname
tailscale ping myhostname
```

## SSH via Tailscale

```bash
# SSH to a peer (no OpenSSH setup needed on target if Tailscale SSH is enabled)
tailscale ssh user@myhostname
```

## Firewall (Optional)

Opening UDP 41641 improves performance but is not required:

```bash
sudo firewall-cmd --add-port=41641/udp --permanent
sudo firewall-cmd --reload
```
