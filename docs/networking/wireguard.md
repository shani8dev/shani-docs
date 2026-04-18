---
title: WireGuard (Manual)
section: Networking
updated: 2026-04-18
---

# WireGuard — Manual Peer-to-Peer VPN

WireGuard kernel support and `wireguard-tools` are pre-installed on Shani OS. Tailscale uses WireGuard under the hood, but you can configure raw WireGuard tunnels manually — useful for site-to-site VPNs, connecting to a VPS, or any setup where you control both peers and don't want a coordination server.

> **Tailscale vs raw WireGuard:** Use **Tailscale** when you want zero-config mesh networking with no key management. Use **raw WireGuard** when you control both endpoints, need a static tunnel to a VPS or router, or want full control over routing.

---

## Key Generation

Run this on **each peer** independently:

```bash
wg genkey | tee /tmp/privatekey | wg pubkey > /tmp/publickey
cat /tmp/privatekey   # keep secret — goes in [Interface] PrivateKey
cat /tmp/publickey    # share with the other peer — goes in their [Peer] PublicKey
```

Store keys securely:

```bash
sudo install -d -m 700 /etc/wireguard
wg genkey | sudo tee /etc/wireguard/privatekey | wg pubkey | sudo tee /etc/wireguard/publickey
sudo chmod 600 /etc/wireguard/privatekey
```

---

## Configuration

### Peer-to-Peer Tunnel (Site-to-Site)

Create `/etc/wireguard/wg0.conf` on **Peer A**:

```ini
[Interface]
Address    = 10.0.0.1/24          # this peer's VPN IP
PrivateKey = <peer-A-private-key>
ListenPort = 51820                # UDP port to listen on

[Peer]
PublicKey           = <peer-B-public-key>
Endpoint            = 203.0.113.10:51820  # peer B's public IP:port
AllowedIPs          = 10.0.0.2/32         # route only peer B's VPN IP through the tunnel
PersistentKeepalive = 25                   # keep NAT hole open (set if behind NAT)
```

Create `/etc/wireguard/wg0.conf` on **Peer B**:

```ini
[Interface]
Address    = 10.0.0.2/24
PrivateKey = <peer-B-private-key>
ListenPort = 51820

[Peer]
PublicKey           = <peer-A-public-key>
Endpoint            = 203.0.113.20:51820  # peer A's public IP:port
AllowedIPs          = 10.0.0.1/32
PersistentKeepalive = 25
```

### Road Warrior (Client → Server, Full-Tunnel)

Route all client traffic through the server — useful for privacy or bypassing restrictive networks.

**Server** (`/etc/wireguard/wg0.conf`):

```ini
[Interface]
Address    = 10.0.0.1/24
PrivateKey = <server-private-key>
ListenPort = 51820

# Enable IP forwarding and NAT masquerade (run these once, or add to PostUp/PreDown)
PostUp   = sysctl -w net.ipv4.ip_forward=1; firewall-cmd --zone=public --add-masquerade
PreDown  = firewall-cmd --zone=public --remove-masquerade

[Peer]
# Client 1
PublicKey  = <client-public-key>
AllowedIPs = 10.0.0.2/32
```

**Client** (`/etc/wireguard/wg0.conf`):

```ini
[Interface]
Address    = 10.0.0.2/24
PrivateKey = <client-private-key>
DNS        = 1.1.1.1              # use a public resolver through the tunnel

[Peer]
PublicKey           = <server-public-key>
Endpoint            = <server-public-ip>:51820
AllowedIPs          = 0.0.0.0/0, ::/0   # route ALL traffic through the tunnel
PersistentKeepalive = 25
```

### Split-Tunnel (Route Only Specific Subnets)

To route only LAN traffic (e.g., `192.168.1.0/24`) through the tunnel and let all other traffic go directly:

```ini
[Peer]
...
AllowedIPs = 10.0.0.0/24, 192.168.1.0/24   # only these subnets go through the tunnel
```

---

## Bring Up / Down

```bash
# Bring up the interface
sudo wg-quick up wg0

# Bring it down
sudo wg-quick down wg0

# Start at boot (persists across reboots)
sudo systemctl enable --now wg-quick@wg0
```

---

## Status & Diagnostics

```bash
# Show all interfaces: peers, latest handshake time, and traffic counters
sudo wg show

# Specific interface
sudo wg show wg0

# Check the assigned IP
ip addr show wg0

# Check routes going through the tunnel
ip route show | grep wg0

# Live handshake monitoring (useful for debugging connectivity)
watch -n 2 sudo wg show
```

---

## Firewall

```bash
# Open the WireGuard UDP listen port
sudo firewall-cmd --add-port=51820/udp --permanent

# Add the WireGuard interface to the trusted zone (allow all traffic from peers)
sudo firewall-cmd --zone=trusted --add-interface=wg0 --permanent

sudo firewall-cmd --reload
```

---

## Adding More Peers

Each new peer gets a `[Peer]` block in the server's config. You can add peers without restarting WireGuard:

```bash
# Add a peer at runtime (no restart needed)
sudo wg set wg0 peer <new-client-pubkey> allowed-ips 10.0.0.3/32

# Save the runtime state back to the config file
sudo wg-quick save wg0
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `wg show` shows no handshake (or very old) | Check that the remote endpoint is reachable: `nc -zu <endpoint-ip> 51820`; verify the public key on both sides matches |
| Handshake OK but no traffic flowing | Check `AllowedIPs` — the destination IP must be covered; on the server, confirm IP forwarding is enabled: `sysctl net.ipv4.ip_forward` |
| Full-tunnel: internet stops working | Ensure `PostUp` masquerade rule is active: `sudo firewall-cmd --query-masquerade`; check `DNS =` is set in the client `[Interface]` |
| Client behind NAT won't connect | Set `PersistentKeepalive = 25` in the client's `[Peer]` block to keep the NAT hole open |
| `RTNETLINK answers: Operation not supported` | The WireGuard kernel module isn't loaded — run `sudo modprobe wireguard` |
| Config changes not applied | `wg-quick` does not hot-reload — bring the interface down and up: `sudo wg-quick down wg0 && sudo wg-quick up wg0` |
