---
title: frp (Fast Reverse Proxy)
section: Self-Hosting & Servers
updated: 2026-08-28
---

> **Part of the Networking & Infrastructure series:** See [all networking docs](../networking)

## frp (Fast Reverse Proxy)

**Purpose:** Expose services running behind NAT or a firewall to the internet via a VPS relay — without needing to open ports on your home router or ISP. You run `frps` (server) on a cheap VPS with a public IP, and `frpc` (client) on your home server. The client connects outbound to the VPS; all traffic to `vps-ip:port` is tunnelled back to your local service. A lightweight alternative to Cloudflare Tunnel or Pangolin when you need raw TCP/UDP forwarding or non-HTTP protocols.

```yaml
# On your VPS — ~/frps/compose.yaml
services:
  frps:
    image: snowdreamtech/frps:latest
    network_mode: host
    volumes:
      - /home/user/frps/frps.toml:/etc/frp/frps.toml:ro
    restart: unless-stopped
```

#### `frps.toml` on the VPS
```toml
bindPort = 7000           # frpc connects here
vhostHTTPPort = 8080      # HTTP vhost traffic (optional)
vhostHTTPSPort = 8443     # HTTPS vhost traffic (optional)

auth.method = "token"
auth.token = "changeme-strong-secret"

webServer.addr = "127.0.0.1"
webServer.port = 7500
webServer.user = "admin"
webServer.password = "changeme"
```

```yaml
# On your home server — ~/frpc/compose.yaml
services:
  frpc:
    image: snowdreamtech/frpc:latest
    network_mode: host
    volumes:
      - /home/user/frpc/frpc.toml:/etc/frp/frpc.toml:ro
    restart: unless-stopped
```

#### `frpc.toml` on your home server
```toml
serverAddr = "your.vps.ip"
serverPort = 7000

auth.method = "token"
auth.token = "changeme-strong-secret"

# Expose a local HTTP service
[[proxies]]
name = "homelab-web"
type = "http"
localIP = "127.0.0.1"
localPort = 80
customDomains = ["home.example.com"]

# Expose SSH
[[proxies]]
name = "homelab-ssh"
type = "tcp"
localIP = "127.0.0.1"
localPort = 22
remotePort = 2222          # ssh -p 2222 user@your.vps.ip

# Expose a raw TCP service (e.g. MQTT)
[[proxies]]
name = "mqtt"
type = "tcp"
localIP = "127.0.0.1"
localPort = 1883
remotePort = 1883
```

```bash
# Start on the VPS
cd ~/frps && podman-compose up -d

# Start on the home server
cd ~/frpc && podman-compose up -d
```

**Firewall on the VPS:**
```bash
sudo firewall-cmd --add-port=7000/tcp --permanent   # frpc control
sudo firewall-cmd --add-port=8080/tcp --permanent   # HTTP vhost
sudo firewall-cmd --add-port=8443/tcp --permanent   # HTTPS vhost
sudo firewall-cmd --add-port=2222/tcp --permanent   # SSH forwarding
sudo firewall-cmd --reload
```

> **frp vs Cloudflare Tunnel:** Cloudflare Tunnel is zero-config and free, but traffic passes through Cloudflare's network and requires HTTP/HTTPS. frp works for any TCP/UDP protocol, traffic stays on your VPS, and you keep full control. Use frp when you need to forward MQTT, SSH, game server ports, or any non-HTTP service.

---



---

## See Also

- [Networking & Infrastructure](networking) — overview
