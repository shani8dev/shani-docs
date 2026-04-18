---
title: NetworkManager & VPN
section: Networking
updated: 2026-04-18
---

# NetworkManager & VPN

NetworkManager is **pre-installed and active by default** on Shani OS. It manages all network connections — wired, Wi-Fi, mobile broadband, and VPN — and integrates with Tailscale, openresolv, and KDE/GNOME settings panels.

Use `nmcli` for scripting and automation, `nmtui` for an interactive terminal UI, or **Settings → Network** for the full GUI.

---

## Connection Management

```bash
# Show all interfaces and their state
nmcli device status

# List all saved connections
nmcli connection show

# Show only active connections
nmcli connection show --active

# Activate a saved connection
nmcli connection up "MyWifi"

# Deactivate a connection
nmcli connection down "MyWifi"

# Delete a saved connection profile
nmcli connection delete "OldNetwork"

# Reload all connection files from disk (after manual edits)
nmcli connection reload
```

---

## Wi-Fi

```bash
# Scan for available networks
nmcli device wifi list

# Rescan (force a fresh scan)
nmcli device wifi rescan && nmcli device wifi list

# Connect to a new Wi-Fi network (saves the connection profile automatically)
nmcli device wifi connect "SSID" password "yourpassword"

# Connect using a specific interface
nmcli device wifi connect "SSID" password "yourpassword" ifname wlan0

# Create a Wi-Fi hotspot (AP mode)
nmcli device wifi hotspot ifname wlan0 ssid "MyHotspot" password "hotspotpass"

# Show saved password of a Wi-Fi connection (requires sudo)
sudo nmcli -s connection show "MyWifi" | grep psk
```

---

## Static IP

```bash
# Set a static IP on a wired connection
nmcli connection modify "Wired connection 1" \
  ipv4.method manual \
  ipv4.addresses 192.168.1.50/24 \
  ipv4.gateway 192.168.1.1 \
  ipv4.dns "1.1.1.1,8.8.8.8"

# Apply
nmcli connection up "Wired connection 1"

# Revert to DHCP
nmcli connection modify "Wired connection 1" ipv4.method auto
nmcli connection up "Wired connection 1"
```

---

## Terminal UI

```bash
nmtui
```

`nmtui` provides an interactive, keyboard-driven interface for editing connections, activating/deactivating them, and setting the hostname. Useful over SSH when you don't want to memorise `nmcli` syntax.

---

## VPN — All Protocols Pre-installed

Shani OS ships all major VPN protocol plugins for NetworkManager. No additional package installation is needed. Connect via **Settings → Network → VPN → +** and choose your protocol, or use `nmcli` below.

### OpenVPN

```bash
# Import a .ovpn client config file
nmcli connection import type openvpn file /path/to/client.ovpn

# Connect
nmcli connection up "client"

# Or import via GUI: Settings → Network → VPN → + → Import from file → select .ovpn
```

### WireGuard

```bash
# Import a wg0.conf file
nmcli connection import type wireguard file /etc/wireguard/wg0.conf

nmcli connection up "wg0"
```

WireGuard connections can also be created manually in the GUI with no config file. See the [WireGuard wiki page](https://docs.shani.dev/doc/networking/wireguard) for raw peer-to-peer setup without NetworkManager.

### IKEv2 / IPsec (strongSwan)

```bash
# Configure via the GUI: Settings → Network → VPN → + → IPsec/IKEv2
# Or interactively via nmtui
```

### Cisco AnyConnect / OpenConnect

```bash
# Connect interactively (prompts for username, password, and 2FA token)
openconnect --protocol=anyconnect vpn.example.com

# Or use the NetworkManager GUI plugin:
# Settings → Network → VPN → + → Cisco AnyConnect Compatible VPN (openconnect)
```

### Fortinet SSL VPN

```bash
openfortivpn vpn.example.com:443 --username=youruser
# Prompts for password
```

### PPTP / L2TP

Available via GUI: **Settings → Network → VPN → +** → Point-to-Point Tunneling Protocol (PPTP) or Layer 2 Tunneling Protocol (L2TP). These are legacy protocols — prefer WireGuard or OpenVPN where possible.

---

## All Supported VPN Protocols

| Protocol | Plugin / Tool | Notes |
|----------|--------------|-------|
| OpenVPN | `NetworkManager-openvpn` | Most common; import `.ovpn` |
| WireGuard | `NetworkManager-wireguard` | Fast, modern; import `.conf` |
| IKEv2 / IPsec | `NetworkManager-strongswan` | Common in enterprise |
| L2TP/IPsec | `NetworkManager-l2tp` | Legacy enterprise |
| PPTP | `NetworkManager-pptp` | Legacy; avoid if possible |
| Cisco AnyConnect | `openconnect` | `--protocol=anyconnect` |
| GlobalProtect (Palo Alto) | `openconnect` | `--protocol=gp` |
| Pulse/Ivanti Secure | `openconnect` | `--protocol=pulse` |
| Fortinet SSL VPN | `openfortivpn` | Standalone client |
| Cisco VPNC | `vpnc` | Older Cisco IPsec |
| SSTP (Microsoft) | `NetworkManager-sstp` | Via GUI plugin |

---

## DNS & Split DNS with VPNs

Shani OS uses openresolv to broker DNS across multiple simultaneous connections. When a VPN connects, its DNS servers are automatically registered — split DNS (sending only `.corp` queries to the VPN) works without any manual `/etc/resolv.conf` editing. See the [openresolv wiki page](https://docs.shani.dev/doc/networking/openresolv) for details.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `nmcli device wifi list` shows nothing | Check `nmcli radio wifi` — if off, run `nmcli radio wifi on`; also check `rfkill list` for hardware blocks |
| Wi-Fi connects but no internet | Check DNS: `cat /etc/resolv.conf`; try `ping 1.1.1.1` vs `ping example.com` to distinguish routing vs DNS issues |
| VPN connects but traffic doesn't route | Check active routes: `ip route show`; the VPN connection may need `ipv4.never-default false` |
| OpenVPN import fails | Ensure the `.ovpn` file doesn't reference external certificate files — all certs must be inline |
| WireGuard connection times out | Confirm endpoint IP and port are correct; check that your ISP doesn't block UDP on that port |
| GUI not showing all VPN protocols | Some protocols only appear in `nmtui` or `nmcli` — all are installed regardless |
