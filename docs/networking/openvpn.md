---
title: OpenVPN
section: Networking
updated: 2026-04-20
---

# OpenVPN

OpenVPN and its NetworkManager plugin are pre-installed on Shani OS. Use it to connect to corporate or university VPNs, self-hosted VPN servers, or any provider that issues `.ovpn` profile files.

> **OpenVPN vs WireGuard:** Use **WireGuard** for new self-hosted setups — it is faster, simpler, and has a smaller attack surface. Use **OpenVPN** when you need to connect to an existing OpenVPN server or a provider/employer that issues `.ovpn` files.

---

## Connecting with a .ovpn Profile

Most VPN providers and corporate IT departments issue a single `.ovpn` file that contains all configuration and certificates.

### Via NetworkManager (recommended)

```bash
# Import the profile
sudo nmcli connection import type openvpn file /path/to/client.ovpn

# Connect
nmcli connection up <profile-name>

# Disconnect
nmcli connection down <profile-name>

# List VPN connections
nmcli connection show | grep vpn

# Delete a profile
nmcli connection delete <profile-name>
```

Or use the GUI: **System Settings → Connections → Import** (KDE) / **Settings → Network → VPN → +** (GNOME).

### Via openvpn Directly

```bash
# Connect (foreground — Ctrl-C to disconnect)
sudo openvpn --config /path/to/client.ovpn

# Connect in background
sudo openvpn --config /path/to/client.ovpn --daemon --log /var/log/openvpn.log

# Watch the log
sudo tail -f /var/log/openvpn.log
```

---

## Manual Configuration

When you need to build a config from separate certificate files rather than an all-in-one `.ovpn`:

```ini
# /etc/openvpn/client/myvpn.conf

client
dev tun
proto udp
remote vpn.example.com 1194

# Certificates — inline or as file paths
ca   /etc/openvpn/client/ca.crt
cert /etc/openvpn/client/client.crt
key  /etc/openvpn/client/client.key

# TLS authentication (if server uses --tls-auth or --tls-crypt)
tls-crypt /etc/openvpn/client/ta.key

# Route all traffic through the VPN
redirect-gateway def1
dhcp-option DNS 1.1.1.1

# Reconnect on failure
resolv-retry infinite
nobind
persist-key
persist-tun

# Compression (match server setting)
# comp-lzo   # legacy — only enable if server requires it

verb 3
```

Start the manually configured connection:

```bash
sudo systemctl enable --now openvpn-client@myvpn
# Reads: /etc/openvpn/client/myvpn.conf

sudo systemctl status openvpn-client@myvpn
sudo journalctl -u openvpn-client@myvpn -f
```

---

## Inline Certificates (.ovpn Format)

Many providers embed certificates directly in the `.ovpn` file using XML-style tags. This is the standard format and works with both `nmcli` import and `openvpn --config`:

```ini
<ca>
-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
</ca>

<cert>
-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
</cert>

<key>
-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
</key>

<tls-crypt>
-----BEGIN OpenVPN Static key V1-----
...
-----END OpenVPN Static key V1-----
</tls-crypt>
```

---

## Username/Password Authentication

Some servers require credentials in addition to certificates:

```bash
# Connect interactively (prompts for username/password)
sudo openvpn --config client.ovpn --auth-user-pass

# Or store credentials in a file (one line each)
echo -e "myusername\nmypassword" | sudo tee /etc/openvpn/client/credentials
sudo chmod 600 /etc/openvpn/client/credentials
```

Add to the config:

```ini
auth-user-pass /etc/openvpn/client/credentials
```

---

## Firewall

OpenVPN creates a `tun0` interface. Add it to the trusted zone so VPN traffic is not blocked:

```bash
sudo firewall-cmd --zone=trusted --add-interface=tun0 --permanent
sudo firewall-cmd --reload
```

If running an OpenVPN **server** on this machine:

```bash
# Open the listen port
sudo firewall-cmd --add-port=1194/udp --permanent

# Enable masquerade so VPN clients can reach the internet
sudo firewall-cmd --zone=public --add-masquerade --permanent

sudo firewall-cmd --reload
```

---

## Status & Diagnostics

```bash
# Check if the tunnel interface is up
ip addr show tun0

# Check routes going through the VPN
ip route show | grep tun0

# Verify your external IP has changed (confirms traffic is tunnelled)
curl https://ifconfig.me

# View connection log (systemd unit)
sudo journalctl -u openvpn-client@myvpn -n 50

# View connection log (daemon mode)
sudo tail -f /var/log/openvpn.log
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| TLS handshake failed | Server may require a minimum TLS version — add `tls-version-min 1.2` to the config; verify `ca`, `cert`, `key` paths are correct |
| `AUTH_FAILED` | Wrong username/password, or certificate CN mismatch; check server logs |
| `tun0` not created | Check `dmesg` for TUN/TAP module errors; ensure `tun` module is loaded: `sudo modprobe tun` |
| Connected but no internet | `redirect-gateway def1` pushes a default route — ensure the server has masquerade enabled; add `dhcp-option DNS` to avoid DNS leaks |
| DNS leaks while connected | Set `dhcp-option DNS` in the config; or use [dnscrypt-proxy](dnscrypt) which is not affected by VPN DNS push |
| Connection drops on network change | Add `persist-tun` and `persist-key` to the config; NetworkManager handles reconnection automatically |
| `comp-lzo` deprecation warning | Remove `comp-lzo` from the config unless the server explicitly requires it; use `compress` instead if needed |

---

## See Also

- [WireGuard](wireguard) — preferred for new self-hosted VPN setups
- [Firewall](firewalld) — opening ports and masquerade for VPN servers
- [dnscrypt-proxy](dnscrypt) — encrypted DNS alongside VPN
