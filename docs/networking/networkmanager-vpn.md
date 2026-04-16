---
title: NetworkManager & VPN
section: Networking
updated: 2026-04-01
---

# NetworkManager & VPN

NetworkManager is pre-installed and active by default. All network connections — wired, Wi-Fi, mobile broadband, and VPN — are managed through it. Use `nmcli` for scripting, `nmtui` for a terminal UI, or the full `nm-connection-editor` GUI.

## Connection Management

```bash
# Show all interfaces
nmcli device status

# List all saved connections
nmcli connection show

# Activate a saved connection
nmcli connection up "MyWifi"

# Scan for available Wi-Fi networks
nmcli device wifi list

# Connect to a Wi-Fi network
nmcli device wifi connect "SSID" password "pass"

# Create a Wi-Fi hotspot
nmcli device wifi hotspot ssid "MyHotspot" password "secret"

# Set a static IP
nmcli connection modify "eth0" ipv4.method manual \
  ipv4.addresses 192.168.1.50/24 \
  ipv4.gateway 192.168.1.1 \
  ipv4.dns 1.1.1.1

# Terminal UI (interactive)
nmtui
```

## VPN Protocols — All Pre-installed

All major VPN protocols are pre-installed as NetworkManager plugins. Connect to any VPN by opening **Settings → Network → VPN → +** and choosing your protocol — no manual package installation needed.

```bash
# --- OpenVPN (most common, .ovpn file) ---
# Import via GUI: Settings → Network → VPN → + → Import from file → select .ovpn
nmcli connection import type openvpn file /path/to/client.ovpn
nmcli connection up "MyOpenVPN"

# --- WireGuard (fast, modern) ---
nmcli connection import type wireguard file /etc/wireguard/wg0.conf

# --- Cisco AnyConnect / OpenConnect ---
openconnect --protocol=anyconnect vpn.example.com

# --- Fortinet SSL VPN ---
openfortivpn vpn.example.com:443 --username=you

# --- List and toggle VPN connections ---
nmcli connection show --active
nmcli connection up   "MyVPN"
nmcli connection down "MyVPN"
```

**All supported protocols:** OpenVPN, WireGuard, L2TP/IPsec (strongSwan), PPTP, IKEv2 (strongSwan), Cisco AnyConnect (openconnect), SSTP, Fortinet SSL VPN (openfortivpn), Cisco VPNC — all configured through **Settings → Network → VPN → +**.
