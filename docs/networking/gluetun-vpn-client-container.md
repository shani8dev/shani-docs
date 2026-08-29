---
title: Gluetun (VPN Client Container)
section: Self-Hosted Networking
updated: 2026-08-28
---

> **Part of the VPN & Tunnels series:** See [all networking docs](../networking)

## Gluetun (VPN Client Container)

**Purpose:** Route any container's traffic through a commercial VPN provider — without installing a VPN client on the host. Gluetun supports 50+ providers (Mullvad, ProtonVPN, NordVPN, Private Internet Access, ExpressVPN, etc.) and acts as a network gateway container. Other containers join its network namespace via `network_mode: service:gluetun` — their traffic exits through the VPN tunnel transparently.

#### Common use case
Route qBittorrent through Mullvad so torrent traffic never uses your home IP.

```yaml
# ~/gluetun/compose.yaml
services:
  gluetun:
    image: qmcgaw/gluetun:latest
    cap_add: [NET_ADMIN]
    devices:
      - /dev/net/tun
    ports:
      - "127.0.0.1:8080:8080"   # qBittorrent WebUI exposed via gluetun
    environment:
      VPN_SERVICE_PROVIDER: mullvad
      VPN_TYPE: wireguard
      WIREGUARD_PRIVATE_KEY: your-mullvad-wireguard-private-key
      WIREGUARD_ADDRESSES: 10.64.222.21/32
      SERVER_COUNTRIES: Netherlands
    volumes:
      - /home/user/gluetun:/gluetun:Z
    restart: unless-stopped

  qbittorrent:
    image: lscr.io/linuxserver/qbittorrent:latest
    network_mode: "service:gluetun"   # all qbittorrent traffic goes through gluetun
    environment:
      PUID: "1000"
      PGID: "1000"
      WEBUI_PORT: 8080
    volumes:
      - /home/user/qbittorrent:/config:Z
      - /home/user/downloads:/downloads:Z
    depends_on: [gluetun]
    restart: unless-stopped
```

```bash
cd ~/gluetun && podman-compose up -d
```

> When `network_mode: service:gluetun` is set, the dependent container shares gluetun's network — all ports are exposed on the gluetun container, not the app container. The qBittorrent WebUI is reached at `http://localhost:8080` via gluetun's port mapping.

#### Check that traffic is routed through the VPN
```bash
podman exec qbittorrent curl -s https://api.ipify.org
# Should return the VPN exit IP, not your home IP
```

#### Common operations
```bash
# Verify traffic is routed through VPN (should show VPN exit IP)
podman exec qbittorrent curl -s https://api.ipify.org

# Check Gluetun control server status
curl http://localhost:8000/v1/openvpn/status 2>/dev/null ||   curl http://localhost:8000/v1/publicip/ip

# View logs to debug connection issues
podman logs -f gluetun

# Force reconnect (pick a different VPN server)
podman restart gluetun

# List available servers for your provider (Mullvad example)
podman exec gluetun cat /gluetun/servers.json | python3 -m json.tool | grep '"city"' | head -20
```

#### Supported providers include
Mullvad, ProtonVPN, NordVPN, ExpressVPN, Private Internet Access, Surfshark, Windscribe, IVPN, AzireVPN, and any custom WireGuard/OpenVPN config.

---



---

## See Also

- [Networking](../networking) — all networking docs
