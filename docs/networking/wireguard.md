---
title: WireGuard (Manual)
section: Networking
updated: 2026-04-01
---

# WireGuard — Manual Peer-to-Peer VPN

WireGuard kernel module and `wireguard-tools` are pre-installed. Tailscale uses WireGuard underneath, but you can configure raw WireGuard tunnels manually — useful for site-to-site VPNs, connecting to a VPS, or any setup where you control both peers directly.

## Key Generation

Do this on each peer:

```bash
wg genkey | tee /tmp/privatekey | wg pubkey > /tmp/publickey
cat /tmp/privatekey   # keep secret — goes in [Interface] PrivateKey
cat /tmp/publickey    # share with the other peer — goes in their [Peer] PublicKey
```

## Configuration

Create `/etc/wireguard/wg0.conf`:

```ini
[Interface]
Address = 10.0.0.1/24          # this peer's VPN IP
PrivateKey = <your-private-key>
ListenPort = 51820              # UDP port to listen on

[Peer]
PublicKey = <other-peer-public-key>
Endpoint = 203.0.113.10:51820  # other peer's public IP:port
AllowedIPs = 10.0.0.2/32       # route only the peer's VPN IP through tunnel
PersistentKeepalive = 25        # keep NAT hole open (set if behind NAT)
```

## Bring Up / Down

```bash
# Bring up interface
sudo wg-quick up wg0

# Bring down
sudo wg-quick down wg0

# Start at boot
sudo systemctl enable --now wg-quick@wg0
```

## Status & Diagnostics

```bash
# All interfaces: peers, handshakes, traffic
sudo wg show

# Specific interface
sudo wg show wg0

# Check assigned IP
ip addr show wg0

# Routes through the tunnel
ip route show | grep wg0
```

## Firewall

```bash
# Open WireGuard UDP port
sudo firewall-cmd --permanent --add-port=51820/udp
sudo firewall-cmd --reload

# Add WireGuard interface to trusted zone
sudo firewall-cmd --permanent --zone=trusted --add-interface=wg0
sudo firewall-cmd --reload
```

> **Tailscale vs raw WireGuard:** Use **Tailscale** when you want zero-config mesh networking with no key management. Use **raw WireGuard** when you control both endpoints, need a static tunnel to a VPS or router, or want full control without a third-party coordination server.
