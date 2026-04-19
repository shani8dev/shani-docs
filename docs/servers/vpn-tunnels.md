---
title: VPN & Tunnels
section: Self-Hosting & Servers
updated: 2026-04-22
---

# VPN & Tunnels

All VPN and tunnel solutions on Shani OS can run fully containerised. Rootless containers handle traffic routing but require specific capabilities (`NET_ADMIN`, `NET_RAW`), kernel modules (`tun`), and IP forwarding enabled on the host.

---

## Prerequisites

Before running any VPN container, enable IP forwarding and load the TUN module:

```bash
# Enable IPv4 and IPv6 forwarding
sudo sysctl -w net.ipv4.ip_forward=1
sudo sysctl -w net.ipv6.conf.all.forwarding=1

# Make it persistent across reboots
echo "net.ipv4.ip_forward=1" | sudo tee /etc/sysctl.d/99-ipforward.conf
echo "net.ipv6.conf.all.forwarding=1" | sudo tee -a /etc/sysctl.d/99-ipforward.conf

# Load the TUN/TAP module (usually auto-loaded on first use)
sudo modprobe tun
```

---

## Quick Selection Guide

| Tool | Best For | Complexity | Web UI | Protocol |
|------|----------|------------|--------|----------|
| **WG-Easy** | Home/SOHO WireGuard with a clean UI | Low | ✅ | WireGuard |
| **Tailscale** | Zero-config mesh for personal/team use | Low | ✅ App | WireGuard (managed) |
| **Headscale + Headplane** | Self-hosted Tailscale control server | Medium | ✅ | WireGuard |
| **Cloudflared** | Expose services publicly, no port forwarding | Low | ✅ Dashboard | HTTPS/TLS |
| **Pangolin + Newt** | Self-hosted tunnel server, full data ownership | Medium | ✅ | WireGuard |
| **NetBird** | Open-source self-hosted Tailscale alternative | Medium | ✅ | WireGuard |
| **Pritunl** | Enterprise VPN — SSO, multi-site, audit logs | Medium | ✅ | WireGuard / OpenVPN |
| **Firezone** | Zero-trust access (ZTNA), granular policies | High | ✅ | WireGuard |
| **Nebula** | Decentralised mesh, cert-based auth, GitOps | Medium | ❌ CLI | Nebula (UDP) |
| **ZeroTier** | ZeroTier network with self-hosted controller | Medium | ✅ | ZeroTier (UDP) |
| **Hysteria 2** | High-loss / censored networks (QUIC) | Medium | ⚠️ Experimental | QUIC (HTTP/3) |
| **OpenVPN** | Legacy compatibility, cert-based auth | Medium | ⚠️ Community | UDP/TCP |

---

## WireGuard / WG-Easy

**Purpose:** Modern, high-performance VPN with state-of-the-art cryptography. WG-Easy adds a lightweight web UI for managing peers, generating QR codes, and controlling routes — no CLI required.

```bash
podman run -d \
  --name wg-easy \
  -p 127.0.0.1:51821:51821 \
  -p 0.0.0.0:51820:51820/udp \
  -v /home/user/wgeasy:/etc/wireguard:Z \
  -e WG_HOST=vpn.example.com \
  -e PASSWORD=changeme \
  -e WG_DEFAULT_ADDRESS=10.8.0.x \
  -e WG_DEFAULT_DNS=1.1.1.1 \
  --cap-add NET_ADMIN \
  --cap-add SYS_MODULE \
  --sysctl net.ipv4.ip_forward=1 \
  --restart unless-stopped \
  ghcr.io/wg-easy/wg-easy
```

- **Management UI:** `http://localhost:51821` (proxy through Caddy for HTTPS)
- **Client data:** persisted in `/home/user/wgeasy/`
- **Firewall:** `sudo firewall-cmd --add-port=51820/udp --permanent && sudo firewall-cmd --reload`

---

## Tailscale / Headscale + Headplane

**Purpose:** Zero-config mesh VPN built on WireGuard. Tailscale uses managed coordination; Headscale is the fully open-source self-hosted control server — giving you the same experience with no third-party dependency.

### Tailscale (Managed)

```bash
# Tailscale is pre-installed on Shani OS — just run:
sudo tailscale up

# Enable SSH over Tailscale
sudo tailscale up --ssh

# Advertise as an exit node
sudo tailscale up --advertise-exit-node

# Advertise local subnets (share your LAN with other tailnet devices)
sudo tailscale up --advertise-routes=192.168.1.0/24
```

Or run as a container:
```bash
podman run -d \
  --name tailscale \
  -v /home/user/tailscale:/var/lib:Z \
  --device /dev/net/tun \
  --cap-add NET_ADMIN \
  --cap-add NET_RAW \
  --restart unless-stopped \
  tailscale/tailscale tailscaled --tun=userspace-networking --socks5-server=:1080
```

### Headscale (Self-Hosted)

**1. Create config directory and config file:**
```bash
mkdir -p /home/user/headscale/{config,data}
```

`/home/user/headscale/config/config.yaml`:
```yaml
server_url: https://headscale.example.com
listen_addr: 0.0.0.0:8080
grpc_listen_addr: 0.0.0.0:9090
database:
  type: sqlite3
  sqlite:
    path: /var/lib/headscale/db.sqlite
dns:
  base_domain: headscale.lan
  magic_dns: true
  nameservers:
    - 1.1.1.1
    - 8.8.8.8
```

**2. Run the container:**
```bash
podman run -d \
  --name headscale \
  -p 127.0.0.1:8080:8080 \
  -p 127.0.0.1:9090:9090 \
  -v /home/user/headscale/config:/etc/headscale:Z \
  -v /home/user/headscale/data:/var/lib/headscale:Z \
  --restart unless-stopped \
  headscale/headscale:latest
```

**3. Create a user and connect devices:**
```bash
# Create a namespace
podman exec headscale headscale users create home

# Generate a reusable pre-auth key (valid 30 days)
podman exec headscale headscale preauthkeys create --user home --reusable --expiration 30d

# Connect any Tailscale-compatible device to your Headscale server
tailscale up --login-server https://headscale.example.com --authkey <key>

# List connected nodes
podman exec headscale headscale nodes list
```

### Headplane (Web UI for Headscale)

```bash
podman run -d \
  --name headplane \
  -p 127.0.0.1:3001:3000 \
  -v /home/user/headscale/config:/etc/headscale:ro,Z \
  --restart unless-stopped \
  ghcr.io/tale/headplane:latest
```

---

## Cloudflare Tunnel (Cloudflared)

**Purpose:** Expose local services to the internet without opening any firewall ports. Cloudflared makes outbound-only HTTPS connections to Cloudflare's edge — your router needs no changes.

```bash
# Authenticate with your Cloudflare account
cloudflared login

# Create a tunnel
cloudflared tunnel create home-server

# Configure services to expose
cat > ~/.cloudflared/config.yml << EOF
tunnel: <tunnel-id>
credentials-file: /home/user/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: media.example.com
    service: http://localhost:8096
  - hostname: files.example.com
    service: http://localhost:8384
  - service: http_status:404
EOF

# Run as a persistent system service
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Or run as a container using a token from the Cloudflare Zero Trust dashboard:
```bash
podman run -d \
  --name cloudflared \
  -v /home/user/cloudflared/config:/etc/cloudflared:Z \
  --restart unless-stopped \
  cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <your-token>
```

- **DNS:** Add a CNAME for each hostname pointing to `<tunnel-id>.cfargotunnel.com`
- **Firewall:** None required — all traffic is outbound

---

## Pangolin (Self-Hosted Tunnel Server)

**Purpose:** A fully open-source alternative to Cloudflare Tunnel. Expose local services via a public HTTPS URL through an encrypted WireGuard tunnel to a VPS you control. No third-party cloud — you own the entire path. Supports identity-aware access control per resource.

Pangolin has two components:
- **Pangolin** — the server, runs on a VPS, receives tunnelled traffic and routes it to your services
- **Newt** — the agent, runs on your Shani OS machine, creates the outbound WireGuard tunnel

### 1. Server Setup (on a VPS)

`/home/user/pangolin/config/config.yml`:
```yaml
app:
  dashboard_url: https://pangolin.yourdomain.com
  base_domain: yourdomain.com
  admin_email: admin@yourdomain.com
  admin_password: changeme
  log_level: info
server:
  external_port: 443
  internal_port: 8080
db:
  encryption_key: "your-32-char-hex-key"
```

```bash
podman run -d \
  --name pangolin \
  -p 0.0.0.0:443:443 \
  -p 0.0.0.0:51820:51820/udp \
  -v /home/user/pangolin/config:/app/config:Z \
  -v /home/user/pangolin/data:/app/data:Z \
  --restart unless-stopped \
  fosrl/pangolin:latest
```

Access the dashboard at `https://pangolin.yourdomain.com`, create a site, and copy the Newt credentials.

**VPS firewall:** open `443/tcp` and `51820/udp`

### 2. Newt Agent (on Shani OS)

```bash
podman run -d \
  --name newt \
  -e PANGOLIN_URL=https://pangolin.yourdomain.com \
  -e NEWT_ID=<your-newt-id> \
  -e NEWT_SECRET=<your-newt-secret> \
  --restart unless-stopped \
  fosrl/newt:latest
```

---

## NetBird

**Purpose:** Open-source, peer-to-peer WireGuard mesh VPN platform. The most complete self-hosted alternative to Tailscale — management dashboard, STUN/TURN relay, and kernel-level WireGuard all run on hardware you control. Supports SSO (OIDC), ACL policies, DNS routing, and split tunnelling. Clients are available for Linux, macOS, Windows, iOS, and Android.

### Architecture

NetBird has three server components:
- **Management** — API, ACL policy store, device registry
- **Signal** — WebRTC signalling for peer hole-punching
- **Relay (Coturn)** — TURN relay for peers behind strict NAT

### Full Self-Hosted Deployment

```bash
# 1. Get the official compose stack
curl -sSL https://raw.githubusercontent.com/netbirdio/netbird/main/infrastructure_files/docker-compose.yml \
  -o ~/netbird/compose.yml
curl -sSL https://raw.githubusercontent.com/netbirdio/netbird/main/infrastructure_files/.env.example \
  -o ~/netbird/.env

# 2. Edit .env — set your domain, OIDC provider, and TURN credentials
nano ~/netbird/.env
```

**Key `.env` variables:**
```bash
NETBIRD_DOMAIN=netbird.example.com

# OIDC provider (e.g., Authentik, Keycloak, Zitadel, or Dex)
NETBIRD_AUTH_OIDC_CONFIGURATION_ENDPOINT=https://auth.example.com/application/o/netbird/.well-known/openid-configuration
NETBIRD_AUTH_CLIENT_ID=netbird
NETBIRD_AUTH_CLIENT_SECRET=changeme

# TURN relay credentials
NETBIRD_TURN_USER=coturn
NETBIRD_TURN_PASSWORD=changeme
```

**3. Start all services:**
```bash
cd ~/netbird && podman-compose up -d
```

**Services started:**
- `management` on port `443` (HTTPS/gRPC)
- `signal` on port `10000`
- `coturn` (TURN relay) on port `3478/udp` and `5349/tcp`
- `dashboard` (React SPA served by Nginx)

**Firewall:**
```bash
sudo firewall-cmd --add-port=443/tcp \
  --add-port=10000/tcp \
  --add-port=3478/udp \
  --add-port=5349/tcp \
  --permanent && sudo firewall-cmd --reload
```

### Connect a Client

```bash
# Install the NetBird client
curl -fsSL https://pkgs.netbird.io/install.sh | sh

# Connect to your self-hosted management server
netbird up --management-url https://netbird.example.com:443

# Check status
netbird status

# Show peers
netbird peers

# Disconnect
netbird down
```

### ACL Policies

NetBird lets you define granular access policies per group in the dashboard:
- Create groups (e.g., `servers`, `laptops`, `phones`)
- Assign devices to groups
- Create policies that allow specific traffic (e.g., `laptops` → `servers` on port 22)
- Block all other inter-peer traffic by default

### DNS Routes

Route private DNS to your server's Pi-hole or AdGuard instance:
- In the dashboard: DNS → Nameservers → Add
- Domain: `home.local`, Nameserver: IP of your Pi-hole peer
- Enable: all peers in the `laptops` group use this nameserver for `.home.local`

### Caddy Configuration

```caddyfile
netbird.example.com {
  reverse_proxy localhost:80
  # gRPC for management API
  @grpc protocol grpc
  reverse_proxy @grpc localhost:443 {
    transport http { versions h2c }
  }
}
```

---

## Pritunl (Enterprise VPN)

**Purpose:** Enterprise-grade VPN with a modern web UI. Supports WireGuard and OpenVPN, SSO, multi-site routing, and audit logging. Requires MongoDB.

### 1. MongoDB Backend
```bash
podman run -d \
  --name pritunl-mongo \
  -p 127.0.0.1:27017:27017 \
  -v /home/user/pritunl/mongo:/data/db:Z \
  --restart unless-stopped \
  mongo:6
```

### 2. Pritunl Server
```bash
podman run -d \
  --name pritunl \
  --network host \
  --cap-add NET_ADMIN \
  --cap-add SYS_ADMIN \
  -v /home/user/pritunl/config:/etc/pritunl:Z \
  --restart unless-stopped \
  linuxserver/pritunl:latest
```

**Initial setup:**
1. Generate setup key: `podman exec pritunl pritunl setup-key`
2. Access UI: `https://<server-ip>:443`
3. Set MongoDB URI: `mongodb://127.0.0.1:27017/pritunl`
4. Create Org → Add Users → Create Server → Attach → Start

**Firewall:** `sudo firewall-cmd --add-port=443/tcp --add-port=51820/udp --add-port=1194/udp --permanent && sudo firewall-cmd --reload`

---

## Firezone (Zero-Trust Access)

**Purpose:** Zero-trust network access (ZTNA) built on WireGuard. Features SSO (OIDC/SAML), granular access policies, device posture checks, and a unified dashboard.

```yaml
# ~/firezone/compose.yml
services:
  db:
    image: postgres:14-alpine
    environment:
      POSTGRES_USER: firezone
      POSTGRES_PASSWORD: strongpassword
      POSTGRES_DB: firezone
    volumes: [db_data:/var/lib/postgresql/data]
    restart: unless-stopped

  firezone:
    image: firezone/firezone:latest
    ports:
      - "0.0.0.0:4443:443"
      - "0.0.0.0:51820:51820/udp"
    environment:
      DATABASE_URL: postgresql://firezone:strongpassword@db:5432/firezone
      SECRET_KEY_BASE: changeme-generate-with-openssl-rand-base64-64
      DEFAULT_ADMIN_EMAIL: admin@example.com
    cap_add: [NET_ADMIN]
    sysctls:
      net.ipv4.ip_forward: "1"
      net.ipv6.conf.all.disable_ipv6: "0"
    depends_on: [db]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/firezone && podman-compose up -d
```

- **Access:** `https://localhost:4443`
- **Firewall:** `sudo firewall-cmd --add-port=4443/tcp --add-port=51820/udp --permanent && sudo firewall-cmd --reload`

---

## Nebula (Overlay Mesh Network)

**Purpose:** A scalable, decentralised overlay network developed by Slack. Nodes communicate directly using certificate-based PKI. Designed for GitOps-style config management — no web UI.

### 1. Generate Certificates

```bash
# Generate CA
nebula-cert ca -name "Home Network CA"

# Generate lighthouse (coordination node) certificate
nebula-cert sign -name "lighthouse" -ip "192.168.100.1/24"

# Generate client certificate
nebula-cert sign -name "shani-server" -ip "192.168.100.2/24"
```

### 2. Lighthouse Config (`config.yml`)

```yaml
pki:
  ca: /etc/nebula/ca.crt
  cert: /etc/nebula/lighthouse.crt
  key: /etc/nebula/lighthouse.key

static_host_map:
  "192.168.100.1": ["your-vps-public-ip:4242"]

lighthouse:
  am_lighthouse: true

listen:
  host: 0.0.0.0
  port: 4242

firewall:
  outbound: [{ port: any, proto: any, host: any }]
  inbound: [{ port: any, proto: any, host: any }]
```

### 3. Run Container

```bash
podman run -d \
  --name nebula \
  -p 0.0.0.0:4242:4242/udp \
  -v /home/user/nebula:/etc/nebula:Z \
  --device /dev/net/tun \
  --cap-add NET_ADMIN \
  --restart unless-stopped \
  slacktechnologiesllc/nebula:latest
```

**Firewall:** `sudo firewall-cmd --add-port=4242/udp --permanent && sudo firewall-cmd --reload`

> Nebula has no official web UI. Manage configs via Git and distribute with `scp` or Ansible.

---

## ZeroTier (Self-Hosted Controller)

**Purpose:** Run a private ZeroTier network controller without using ZeroTier's central cloud servers. Manage virtual networks and peers on your own hardware.

```bash
podman run -d \
  --name zerotier-controller \
  -p 127.0.0.1:9993:9993/udp \
  -p 127.0.0.1:3180:3180/tcp \
  -v /home/user/zerotier-controller:/var/lib/ztnetwork:Z \
  --restart unless-stopped \
  mgk/zerotier-controller:latest
```

- **Dashboard:** `http://localhost:3180`
- **Client setup:** `zerotier-cli join <network-id> --controller <your-server-ip>:3180`

---

## OpenVPN

**Purpose:** Legacy, highly configurable VPN standard. Use when you need specific cipher suites, client certificate management, or compatibility with older devices.

```bash
# Generate config and PKI (run once)
podman run --rm \
  -v /home/user/openvpn:/etc/openvpn \
  kylemanna/openvpn ovpn_genconfig -u udp://vpn.example.com
podman run --rm \
  -v /home/user/openvpn:/etc/openvpn -it \
  kylemanna/openvpn ovpn_initpki

# Run the server
podman run -d \
  --name openvpn \
  -p 0.0.0.0:1194:1194/udp \
  -v /home/user/openvpn:/etc/openvpn:Z \
  --cap-add NET_ADMIN \
  --cap-add SYS_MODULE \
  --sysctl net.ipv4.ip_forward=1 \
  --restart unless-stopped \
  kylemanna/openvpn

# Generate and export a client config
podman run --rm -v /home/user/openvpn:/etc/openvpn -it kylemanna/openvpn easyrsa build-client-full client1 nopass
podman run --rm -v /home/user/openvpn:/etc/openvpn kylemanna/openvpn ovpn_getclient client1 > client1.ovpn
```

---

## Hysteria 2 (High-Loss Networks)

**Purpose:** A QUIC-based proxy and tunnel that performs well in high-latency, high-loss, or censored network environments where WireGuard/TCP struggle. Traffic looks like normal HTTP/3 to firewalls.

`/home/user/hysteria/config.yaml`:
```yaml
listen: :443
tls:
  cert: /etc/hysteria/fullchain.pem
  key: /etc/hysteria/privkey.pem
auth:
  type: password
  password: "your-strong-password"
```

```bash
podman run -d \
  --name hysteria \
  -p 0.0.0.0:443:443/udp \
  -v /home/user/hysteria/config.yaml:/etc/hysteria/config.yaml:ro,Z \
  -v /home/user/hysteria/certs:/etc/hysteria:ro,Z \
  --restart unless-stopped \
  ghcr.io/apernet/hysteria:latest server -c /etc/hysteria/config.yaml
```

---

## Gluetun (VPN Client Container)

**Purpose:** Route any container's traffic through a commercial VPN provider — without installing a VPN client on the host. Gluetun supports 50+ providers (Mullvad, ProtonVPN, NordVPN, Private Internet Access, ExpressVPN, etc.) and acts as a network gateway container. Other containers join its network namespace via `network_mode: service:gluetun` — their traffic exits through the VPN tunnel transparently.

**Common use case:** Route qBittorrent through Mullvad so torrent traffic never uses your home IP.

```yaml
# ~/gluetun/compose.yml
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

> When `network_mode: service:gluetun` is set, the dependent container shares gluetun's network — all ports are exposed on the gluetun container, not the app container. The qBittorrent WebUI is reached at `http://localhost:8080` via gluetun's port mapping.

**Check that traffic is routed through the VPN:**
```bash
podman exec qbittorrent curl -s https://api.ipify.org
# Should return the VPN exit IP, not your home IP
```

**Supported providers include:** Mullvad, ProtonVPN, NordVPN, ExpressVPN, Private Internet Access, Surfshark, Windscribe, IVPN, AzireVPN, and any custom WireGuard/OpenVPN config.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `TUN/TAP device not found` | Run `sudo modprobe tun` on the host |
| Clients can't route traffic | Verify `net.ipv4.ip_forward=1` is set; check `--sysctl` flags in the container run command |
| DNS not resolving for VPN clients | Set `WG_DEFAULT_DNS` or equivalent to `1.1.1.1` or your Pi-hole address |
| Headscale nodes show offline | Verify Headscale is listening on `0.0.0.0:8080`; check that `server_url` in config matches your public domain |
| Pangolin tunnel not connecting | Verify Newt credentials (`NEWT_ID`, `NEWT_SECRET`); check VPS firewall allows `51820/udp` |
| NetBird peers not connecting | Ensure the TURN relay (Coturn) port `3478/udp` is open; check signal server is reachable on port `10000` |
| NetBird dashboard blank | OIDC configuration may be wrong — check management logs: `podman-compose logs management` |
| Firezone DB error on startup | Ensure `DATABASE_URL` host points to the `db` service name; check `podman-compose logs db` |
| Hysteria QUIC timeout | Ensure UDP port 443 is open on your VPS firewall and not blocked by the ISP |
| Nebula nodes can't reach each other | Verify `ca.crt` matches on all nodes; check `static_host_map` IPs resolve correctly |
| MongoDB connection refused (Pritunl) | Confirm `pritunl-mongo` is running; use `--network host` so both containers share the same network namespace |
| OpenVPN auth fails | Re-export the client config with `ovpn_getclient`; verify firewall allows `1194/udp` |
| Gluetun VPN not connecting | Verify `WIREGUARD_PRIVATE_KEY` and `WIREGUARD_ADDRESSES` are correct; check `podman logs gluetun` for auth errors |
| Gluetun leaking real IP | Ensure the app container uses `network_mode: service:gluetun` — any other network mode bypasses the tunnel |
| qBittorrent WebUI unreachable via Gluetun | Port must be published on the `gluetun` container, not `qbittorrent`; the app container shares gluetun's network |

> 🔒 **Security tip:** Always bind management UIs (`wg-easy`, `headplane`, `portainer`) to `127.0.0.1` and proxy through Caddy. Never expose control-plane interfaces directly to the internet. Rotate pre-auth keys periodically and use `fail2ban` on any publicly facing port.
