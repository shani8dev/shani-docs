---
title: WireGuard Road Warrior — Split-Tunnel
section: Networking
updated: 2026-08-28
---

> **Part of the VPN & Tunnels series:** See [all networking docs](../networking)

## WireGuard Road Warrior (Manual Split-Tunnel Config)

**Purpose:** A "road warrior" setup lets mobile or laptop clients connect to your home server from anywhere, routing only selected traffic through the VPN (split tunnel) rather than all traffic. Unlike WG-Easy, this is a fully manual config — useful when you want precise control over allowed IPs, DNS, and per-client routing without running a web UI.

### 1. Server Config

`/etc/wireguard/wg0.conf` on the **server**:
```ini
[Interface]
Address = 10.10.0.1/24
ListenPort = 51820
PrivateKey = <server-private-key>

# Allow VPN clients to reach the server LAN
PostUp   = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
# Mobile client — phone or laptop
PublicKey = <client-public-key>
AllowedIPs = 10.10.0.2/32
```

```bash
# Generate server key pair
wg genkey | tee server.key | wg pubkey > server.pub

# Generate client key pair (on the client or server)
wg genkey | tee client.key | wg pubkey > client.pub

# Bring the interface up
sudo wg-quick up wg0

# Enable on boot
sudo systemctl enable wg-quick@wg0
```

### 2. Client Config (Split Tunnel)

`/etc/wireguard/wg0.conf` on the **client** (phone or laptop):
```ini
[Interface]
Address = 10.10.0.2/24
PrivateKey = <client-private-key>
DNS = 10.10.0.1        # or your Pi-hole / Adguard address

[Peer]
PublicKey = <server-public-key>
Endpoint = vpn.example.com:51820
# Split tunnel — only route home LAN and VPN subnet through WireGuard
# Change to 0.0.0.0/0 for full tunnel (all traffic)
AllowedIPs = 10.10.0.0/24, 192.168.1.0/24
PersistentKeepalive = 25
```

Generate a scannable QR code for the mobile WireGuard app:
```bash
nix-env -iA nixpkgs.qrencode
qrencode -t ansiutf8 < /etc/wireguard/client.conf
```

### 3. Run in a Container (Podman)

For a fully containerised road warrior server without touching the host WireGuard stack:
```yaml
# ~/wireguard-rw/compose.yaml
services:
  wireguard:
    image: lscr.io/linuxserver/wireguard
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    sysctls:
      net.ipv4.ip_forward: "1"
    ports:
      - "0.0.0.0:51820:51820/udp"
    volumes:
      - /home/user/wireguard-rw/config:/config:Z
    environment:
      PUID: "1000"
      PGID: "1000"
      TZ: Asia/Kolkata
      SERVERURL: vpn.example.com
      SERVERPORT: "51820"
      PEERS: phone,laptop           # generates one config per peer name
      PEERDNS: auto
      ALLOWEDIPS: 10.13.13.0/24,192.168.1.0/24   # split tunnel
      INTERNAL_SUBNET: 10.13.13.0
    restart: unless-stopped
```

```bash
cd ~/wireguard-rw && podman-compose up -d
```

Client configs and QR codes are generated automatically at `/home/user/wireguard-rw/config/peer_phone/` and `peer_laptop/`.

- **Firewall:** `sudo firewall-cmd --add-port=51820/udp --permanent && sudo firewall-cmd --reload`

> **Split tunnel vs full tunnel:** `AllowedIPs = 0.0.0.0/0` routes all traffic through the VPN (full tunnel — use for privacy on untrusted networks). `AllowedIPs = 10.13.13.0/24, 192.168.1.0/24` routes only the VPN subnet and home LAN (split tunnel — use when you only need access to home services without affecting other traffic).

---



---

## See Also

- [Networking](../networking) — all networking docs
