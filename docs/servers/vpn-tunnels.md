---
title: VPN & Tunnels
section: Self-Hosting & Servers
updated: 2026-04-22
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.


# VPN & Tunnels

All VPN and tunnel solutions on this system can run fully containerised. Rootless containers handle traffic routing but require specific capabilities (`NET_ADMIN`, `NET_RAW`), kernel modules (`tun`), and IP forwarding enabled on the host.

---

## Job-Ready Concepts

### VPN & Tunnels Interview Essentials

#### WireGuard vs OpenVPN vs IPSec — when interviewers ask
WireGuard: modern (2015), small codebase (~4000 lines), fast, kernel-level, uses fixed modern crypto (ChaCha20, Curve25519). No backward compatibility negotiation — a feature, not a limitation. OpenVPN: mature (2001), large ecosystem, configurable cipher suites, userspace TLS so slower, supports TCP mode (useful when UDP is blocked). IPSec: the enterprise/router standard, complex to configure, built into most OSes natively.

#### Mesh VPN topology vs hub-and-spoke
Traditional VPNs are hub-and-spoke — all client traffic flows through a central VPN server. Mesh VPNs (Tailscale, NetBird, Nebula, ZeroTier) connect every peer directly to every other peer using STUN/TURN for NAT traversal. Advantages: lower latency (direct peer-to-peer), no single point of failure, no bandwidth bottleneck at the hub. Tailscale's control plane manages the key exchange; the data plane is direct WireGuard.

#### STUN vs TURN vs ICE
- **STUN** (Session Traversal Utilities for NAT) — tells a client its public IP and port as seen from the internet. Used for hole-punching.
- **TURN** (Traversal Using Relays around NAT) — a relay that proxies traffic when direct hole-punching fails (symmetric NAT). More expensive (all traffic flows through the relay).
- **ICE** (Interactive Connectivity Establishment) — the negotiation protocol that tries STUN first, falls back to TURN. Used by WebRTC and mesh VPNs.

#### Zero-trust network access (ZTNA) vs VPN
A traditional VPN grants access to the network — once connected, the user can typically reach everything on the network. ZTNA grants access to specific applications or resources, not the network itself. Firezone and Teleport implement ZTNA: you get access to `postgres.internal:5432` not to the entire `10.0.0.0/8` network. Better for the principle of least privilege.

#### Tunnel overhead and MTU
Every VPN tunnel adds overhead to each packet (headers, encryption padding). WireGuard adds ~60 bytes. This reduces the effective inner MTU below the standard 1500 bytes — if you send a full-size 1500-byte packet through a WireGuard tunnel, the outer packet exceeds the link MTU and gets fragmented or dropped. Solutions: (1) set the WireGuard client MTU to 1420 (`MTU = 1420` in wg0.conf), (2) enable MSS clamping on the server's PostUp iptables rule to automatically tell TCP connections about the reduced MTU.

#### Split tunnel security implications
With a split tunnel (`AllowedIPs = 192.168.1.0/24`), only traffic to the home LAN goes through the VPN — all other internet traffic goes directly from the client's ISP. This means: (1) DNS queries for non-`.home.local` domains don't use your Pi-hole, (2) your ISP can still see your general browsing, (3) a malicious website can't be blocked by your home DNS. A full tunnel (`AllowedIPs = 0.0.0.0/0`) routes everything through home, but adds latency and uses your home bandwidth. Choose based on the use case.


#### Cloudflare Tunnel vs self-hosted reverse proxy — the trade-off
Cloudflare Tunnel (cloudflared) exposes a local service to the internet without opening firewall ports or having a public IP. The tunnel connects outbound to Cloudflare's network, which terminates HTTPS for your domain. Trade-offs: you must trust Cloudflare to terminate your TLS (they see plaintext), your availability depends on Cloudflare's uptime, and all traffic passes through their network (latency + bandwidth cost for large transfers). For services that don't need to bypass Cloudflare, Pangolin (self-hosted) or a VPS-based reverse proxy (frp) gives you the same capability without the dependency.

#### NAT traversal and hole-punching
When two peers are both behind NAT (typical home routers), neither can initiate a direct connection to the other because there's no public IP:port mapping. Hole-punching works by having both peers send UDP packets to each other simultaneously — each packet causes the NAT to create a mapping for the return direction, opening a bidirectional path. STUN servers facilitate this by telling each peer their external address. This fails with symmetric NAT (different external port for each destination), which requires a TURN relay. WireGuard-based mesh VPNs (Tailscale, NetBird) handle all of this automatically.

#### Access control at the VPN layer vs application layer
A VPN (WireGuard, OpenVPN) controls who can reach the network; the application still controls what authenticated users can do. Zero-Trust tools (Firezone, Teleport) add a third layer: per-application access policies enforced at the gateway — user Alice can SSH to server A but not server B, even though both are on the same VPN subnet. This maps access control to identity (user + device) rather than just network position. Audit logs at the gateway layer (Teleport's session recording) are also available here, not possible with a plain VPN.

#### Protocol obfuscation — when and why
Standard WireGuard and OpenVPN traffic patterns are fingerprint-able by deep packet inspection (DPI). ISPs and national firewalls (GFW) identify and block them. Obfuscation tools (Xray/V2Ray with VLESS+XTLS-Reality, Hysteria2) make VPN traffic look like normal HTTPS, video streaming, or QUIC traffic. This is relevant for: (1) countries with internet censorship, (2) corporate networks that block non-HTTP outbound, (3) ISPs that throttle VPN traffic. Hysteria2 additionally uses QUIC's congestion control to improve performance on high-latency, high-loss links (satellite, mobile).
---
---

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
| **WireGuard Road Warrior** | Manual split-tunnel config for mobile clients | Medium | ❌ CLI | WireGuard |
| **Outline VPN** | Simple Shadowsocks proxy for censorship resistance | Low | ✅ App | Shadowsocks |
| **Xray / V2Ray** | Protocol-obfuscating proxy for censored networks | Medium | ❌ CLI | VLESS/VMESS/XTLS |

---

## WireGuard / WG-Easy

**Purpose:** Modern, high-performance VPN with state-of-the-art cryptography. WG-Easy adds a lightweight web UI for managing peers, generating QR codes, and controlling routes — no CLI required.

```yaml
# ~/wg-easy/compose.yaml
services:
  wg-easy:
    image: ghcr.io/wg-easy/wg-easy
    ports:
      - "127.0.0.1:51821:51821"
      - "0.0.0.0:51820:51820/udp"
    volumes:
      - /home/user/wgeasy:/etc/wireguard:Z
    environment:
      WG_HOST: vpn.example.com
      PASSWORD: changeme
      WG_DEFAULT_ADDRESS: 10.8.0.x
      WG_DEFAULT_DNS: 1.1.1.1
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    sysctls:
      net.ipv4.ip_forward: "1"
    restart: unless-stopped
```

```bash
cd ~/wg-easy && podman-compose up -d
```

#### Common operations
```bash
# View connected peers and their traffic stats
# Get session cookie first
SESSION=$(curl -s -c - -X POST http://localhost:51821/api/session \
  -H 'Content-Type: application/json' \
  -d '{"password":"changeme"}' | grep -o 'connect.sid=[^;]*')
# Then use it
curl http://localhost:51821/api/wireguard/client -H "Cookie: $SESSION"

# View WireGuard interface status on the host
sudo wg show

# View logs
podman logs -f wg-easy

# Restart to apply config changes
podman restart wg-easy
```

- **Management UI:** `http://localhost:51821` (proxy through Caddy for HTTPS)
- **Client data:** persisted in `/home/user/wgeasy/`
- **Firewall:** `sudo firewall-cmd --add-port=51820/udp --permanent && sudo firewall-cmd --reload`

### How WireGuard Works

WireGuard is fundamentally different from older VPN protocols (OpenVPN, IPSec) in both design and implementation.

**Cryptography:** WireGuard uses a fixed, modern cryptographic suite — no negotiation, no cipher selection, no version mismatches:
- **ChaCha20-Poly1305** — authenticated symmetric encryption (fast on CPUs without AES hardware acceleration)
- **Curve25519** — elliptic-curve Diffie-Hellman key exchange
- **BLAKE2s** — fast cryptographic hashing
- **SipHash** — for routing table lookups

**No handshake at connection time:** WireGuard peers are configured with each other's public keys in advance. The "tunnel" is stateless — there is no session establishment phase. Packets are just encrypted and sent. This makes WireGuard silent when idle (nothing to detect) and extremely fast to reconnect after a network change (roaming between WiFi and mobile data works seamlessly).

**Kernel-space implementation:** WireGuard runs as a kernel module (or via a wireguard-go userspace implementation on unsupported platforms). This means packet processing happens without crossing the user/kernel boundary, giving it significantly better throughput than OpenVPN's userspace TLS stack.

**Compared to OpenVPN:** OpenVPN is a PKI-based TLS VPN running in userspace. It supports dynamic certificate revocation, many cipher suites, and protocol obfuscation — useful in enterprise environments. WireGuard trades that flexibility for simplicity, speed, and a drastically smaller codebase (~4000 lines vs ~100,000+ for OpenVPN).

### Kill Switch

A kill switch ensures that if the VPN tunnel drops, traffic stops rather than falling back to your clearnet IP. Without it, a brief VPN disconnect leaks your real IP.

```bash
# Add to your WireGuard client config (wg0.conf)
[Interface]
PrivateKey = <your-private-key>
Address = 10.8.0.2/32
DNS = 10.8.0.1

# Kill switch: block all traffic except through wg0
PostUp = iptables -I OUTPUT ! -o %i -m mark ! --mark $(wg show %i fwmark) -m addrtype ! --dst-type LOCAL -j REJECT
PreDown = iptables -D OUTPUT ! -o %i -m mark ! --mark $(wg show %i fwmark) -m addrtype ! --dst-type LOCAL -j REJECT

[Peer]
...
```

This iptables rule allows only traffic marked by the WireGuard interface plus local traffic (LAN). All other outbound traffic is rejected at the kernel level. If WireGuard goes down, `PreDown` removes the rule and normal routing resumes.

### Split DNS for VPN Clients

When routing LAN traffic through WireGuard, DNS for `.home.local` domains must resolve to LAN IPs even from a remote client. Configure the WireGuard client to use your home DNS server for `.home.local` queries only:

```ini
# wg0.conf client config — split DNS
[Interface]
DNS = 192.168.1.10          # your home AdGuard Home / Pi-hole IP

[Peer]
AllowedIPs = 10.8.0.0/24, 192.168.1.0/24   # route LAN traffic through VPN
# DNS queries for .home.local go to 192.168.1.10, which resolves them correctly
```

On Linux clients, `systemd-resolved` handles split DNS when `DNS=` is set in the WireGuard interface config. On macOS/Windows, the WireGuard GUI app respects the DNS setting from the config file.

---

## Tailscale (Managed) & Headscale (Self-Hosted Control Server)

**Purpose:** Zero-config mesh VPN built on WireGuard. Tailscale uses managed coordination; Headscale is the fully open-source self-hosted control server — giving you the same experience with no third-party dependency.

### Tailscale (Managed)

```bash
# Tailscale is pre-installed on this system — just run:
sudo tailscale up

# Enable SSH over Tailscale
sudo tailscale up --ssh

# Advertise as an exit node
sudo tailscale up --advertise-exit-node

# Advertise local subnets (share your LAN with other tailnet devices)
sudo tailscale up --advertise-routes=192.168.1.0/24
```

Or run as a container:
```yaml
# ~/tailscale/compose.yaml
services:
  tailscale:
    image: tailscale/tailscale
    command: tailscaled --tun=userspace-networking --socks5-server=:1080
    volumes:
      - /home/user/tailscale:/var/lib:Z
    devices:
      - /dev/net/tun
    cap_add:
      - NET_ADMIN
      - NET_RAW
    restart: unless-stopped
```

```bash
cd ~/tailscale && podman-compose up -d
```

### Tailscale ACL Policies

By default, all devices in a Tailscale network can reach all other devices. ACL policies (in HuJSON format) let you control exactly which devices can talk to which — essential for separating personal devices from servers, or restricting access to sensitive ports.

Configure ACLs in the Tailscale admin console under **Access Controls**, or for Headscale via the `policy.hujson` config:

```json
{
  // Tags are assigned to devices — servers get "tag:server", laptops get "tag:laptop"
  "tagOwners": {
    "tag:server": ["autogroup:admin"],
    "tag:laptop": ["autogroup:admin"]
  },

  "acls": [
    // Laptops can SSH to servers
    {"action": "accept", "src": ["tag:laptop"], "dst": ["tag:server:22"]},
    // Servers can reach each other on any port (internal service mesh)
    {"action": "accept", "src": ["tag:server"], "dst": ["tag:server:*"]},
    // Laptops can reach Grafana dashboard on servers
    {"action": "accept", "src": ["tag:laptop"], "dst": ["tag:server:3001"]},
    // All other traffic denied (implicit deny at end of list)
  ],

  // Tailscale SSH — which users can SSH to which tags
  "ssh": [
    {
      "action": "accept",
      "src": ["autogroup:admin"],
      "dst": ["tag:server"],
      "users": ["autogroup:nonroot"]
    }
  ]
}
```

```bash
# Apply policy to Headscale
headscale policy set -f policy.hujson

# Verify policy was applied
headscale policy get
```

#### 1. Create config directory and config file
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

#### 2. Run the container
```yaml
# ~/headscale/compose.yaml
services:
  headscale:
    image: headscale/headscale:latest
    ports:
      - 127.0.0.1:8080:8080
      - 127.0.0.1:9090:9090
    volumes:
      - /home/user/headscale/config:/etc/headscale:Z
      - /home/user/headscale/data:/var/lib/headscale:Z
    restart: unless-stopped
```

```bash
cd ~/headscale && podman-compose up -d
```

#### 3. Create a user and connect devices
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

```yaml
# ~/headplane/compose.yaml
services:
  headplane:
    image: ghcr.io/tale/headplane:latest
    ports:
      - 127.0.0.1:3001:3000
    volumes:
      - /home/user/headscale/config:/etc/headscale:ro,Z
    restart: unless-stopped
```

```bash
cd ~/headplane && podman-compose up -d
```

#### Common operations
```bash
# Create a user (namespace)
podman exec headscale headscale users create myuser

# List users
podman exec headscale headscale users list

# Generate a reusable pre-auth key (30 days)
podman exec headscale headscale preauthkeys create --user myuser --reusable --expiration 30d

# List pre-auth keys
podman exec headscale headscale preauthkeys list --user myuser

# List all connected nodes
podman exec headscale headscale nodes list

# Expire (force-disconnect) a node
podman exec headscale headscale nodes expire --identifier NODE_ID

# Delete a node
podman exec headscale headscale nodes delete --identifier NODE_ID

# Get debug info for a node
podman exec headscale headscale nodes --output json list | python3 -m json.tool

# Generate an API key for Headplane
podman exec headscale headscale apikeys create

# Check server version
podman exec headscale headscale version
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
```yaml
# ~/cloudflared/compose.yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    volumes:
      - /home/user/cloudflared/config:/etc/cloudflared:Z
    command: tunnel --no-autoupdate run --token <your-token>
    restart: unless-stopped
```

```bash
cd ~/cloudflared && podman-compose up -d
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

```yaml
# ~/pangolin/compose.yaml
services:
  pangolin:
    image: fosrl/pangolin:latest
    ports:
      - 0.0.0.0:443:443
      - 0.0.0.0:51820:51820/udp
    volumes:
      - /home/user/pangolin/config:/app/config:Z
      - /home/user/pangolin/data:/app/data:Z
    restart: unless-stopped
```

```bash
cd ~/pangolin && podman-compose up -d
```

Access the dashboard at `https://pangolin.yourdomain.com`, create a site, and copy the Newt credentials.

#### VPS firewall
open `443/tcp` and `51820/udp`

### 2. Newt Agent (on this system)

```yaml
# ~/newt/compose.yaml
services:
  newt:
    image: fosrl/newt:latest
    environment:
      PANGOLIN_URL: https://pangolin.yourdomain.com
      NEWT_ID: <your-newt-id>
      NEWT_SECRET: <your-newt-secret>
    restart: unless-stopped
```

```bash
cd ~/newt && podman-compose up -d
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
  -o ~/netbird/compose.yaml
curl -sSL https://raw.githubusercontent.com/netbirdio/netbird/main/infrastructure_files/.env.example \
  -o ~/netbird/.env

# 2. Edit .env — set your domain, OIDC provider, and TURN credentials
nano ~/netbird/.env
```

#### Key `.env` variables
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

#### 3. Start all services
```bash
cd ~/netbird && podman-compose up -d
```

#### Services started
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
```yaml
# ~/pritunl-mongo/compose.yaml
services:
  pritunl-mongo:
    image: mongo:6
    ports:
      - 127.0.0.1:27017:27017
    volumes:
      - /home/user/pritunl/mongo:/data/db:Z
    restart: unless-stopped
```

```bash
cd ~/pritunl-mongo && podman-compose up -d
```

### 2. Pritunl Server
```yaml
# ~/pritunl/compose.yaml
services:
  pritunl:
    image: linuxserver/pritunl:latest
    network_mode: host
    volumes:
      - /home/user/pritunl/config:/etc/pritunl:Z
    cap_add:
      - NET_ADMIN
      - SYS_ADMIN
    restart: unless-stopped
```

```bash
cd ~/pritunl && podman-compose up -d
```

#### Initial setup
1. Generate setup key: `podman exec pritunl pritunl setup-key`
2. Access UI: `https://<server-ip>:443`
3. Set MongoDB URI: `mongodb://127.0.0.1:27017/pritunl`
4. Create Org → Add Users → Create Server → Attach → Start

**Firewall:** `sudo firewall-cmd --add-port=443/tcp --add-port=51820/udp --add-port=1194/udp --permanent && sudo firewall-cmd --reload`

---

## Firezone (Zero-Trust Access)

**Purpose:** Zero-trust network access (ZTNA) built on WireGuard. Features SSO (OIDC/SAML), granular access policies, device posture checks, and a unified dashboard.

```yaml
# ~/firezone/compose.yaml
services:
  db:
    image: postgres:16-alpine
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

```yaml
# ~/nebula/compose.yaml
services:
  nebula:
    image: slacktechnologiesllc/nebula:latest
    ports:
      - 0.0.0.0:4242:4242/udp
    volumes:
      - /home/user/nebula:/etc/nebula:Z
    devices:
      - /dev/net/tun
    cap_add:
      - NET_ADMIN
    restart: unless-stopped
```

```bash
cd ~/nebula && podman-compose up -d
```

**Firewall:** `sudo firewall-cmd --add-port=4242/udp --permanent && sudo firewall-cmd --reload`

> Nebula has no official web UI. Manage configs via Git and distribute with `scp` or Ansible.

---

## ZeroTier (Self-Hosted Controller)

**Purpose:** Run a private ZeroTier network controller without using ZeroTier's central cloud servers. Manage virtual networks and peers on your own hardware.

```yaml
# ~/zerotier-controller/compose.yaml
services:
  zerotier-controller:
    image: mgk/zerotier-controller:latest
    ports:
      - 127.0.0.1:9993:9993/udp
      - 127.0.0.1:3180:3180/tcp
    volumes:
      - /home/user/zerotier-controller:/var/lib/ztnetwork:Z
    restart: unless-stopped
```

```bash
cd ~/zerotier-controller && podman-compose up -d
```

- **Dashboard:** `http://localhost:3180`
- **Client setup:** `zerotier-cli join <network-id> --controller <your-server-ip>:3180`

---

## OpenVPN

**Purpose:** Legacy, highly configurable VPN standard. Use when you need specific cipher suites, client certificate management, or compatibility with older devices.

```yaml
# ~/openvpn/compose.yaml
services:
  openvpn:
    image: kylemanna/openvpn
    ports:
      - 0.0.0.0:1194:1194/udp
    volumes:
      - /home/user/openvpn:/etc/openvpn:Z
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    sysctls:
      net.ipv4.ip_forward: 1
    restart: unless-stopped
```

```bash
cd ~/openvpn && podman-compose up -d
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

```yaml
# ~/hysteria/compose.yaml
services:
  hysteria:
    image: ghcr.io/apernet/hysteria:latest
    ports:
      - 0.0.0.0:443:443/udp
    volumes:
      - /home/user/hysteria/config.yaml:/etc/hysteria/config.yaml:ro,Z
      - /home/user/hysteria/certs:/etc/hysteria:ro,Z
    command: server -c /etc/hysteria/config.yaml
    restart: unless-stopped
```

```bash
cd ~/hysteria && podman-compose up -d
```

---

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

## Outline VPN

**Purpose:** Shadowsocks-based proxy server by Jigsaw (Google). Designed for ease of deployment and resistance to traffic fingerprinting — traffic is indistinguishable from regular HTTPS to deep packet inspection. Unlike WireGuard, Outline is proxy-based rather than a full network tunnel, making it suitable for censorship circumvention where WireGuard is blocked. Management is via the Outline Manager desktop app (Linux/macOS/Windows) which generates a one-line `docker run` command and per-user access keys.

```yaml
# ~/outline/compose.yaml
# Note: Outline Manager generates an exact run command including ports and secrets.
# Use its output directly. The compose below is a representative template.
services:
  outline:
    image: quay.io/outline/shadowbox:stable
    ports:
      - "0.0.0.0:8080:8080/tcp"
      - "0.0.0.0:8080:8080/udp"
      - "0.0.0.0:9090:9090/tcp"    # management API (bind to 127.0.0.1 if behind a proxy)
    volumes:
      - /home/user/outline/persisted-state:/root/shadowbox/persisted-state:Z
    environment:
      SB_API_PORT: "9090"
      SB_API_PREFIX: "your-random-prefix"   # generated by Outline Manager
      SB_CERTIFICATE_FILE: /root/shadowbox/persisted-state/shadowbox-selfsigned.crt
      SB_PRIVATE_KEY_FILE: /root/shadowbox/persisted-state/shadowbox-selfsigned.key
    restart: unless-stopped
```

> **Recommended:** Use the **Outline Manager** desktop app to generate the exact command, copy the `docker run` output and convert it to compose. The Manager handles certificate generation, port selection, and API key management automatically.

**Firewall:** Open the data port (default `8080/tcp` and `8080/udp`) and the management API port on your server.

```bash
sudo firewall-cmd --add-port=8080/tcp --add-port=8080/udp --permanent
sudo firewall-cmd --reload
```

#### Clients
Distribute per-user access keys (ss:// URIs) generated by the Manager. Users install the Outline Client app on Android, iOS, Windows, macOS, or Linux.

> Outline and Hysteria 2 solve different problems. Outline is optimised for **censorship circumvention** (traffic obfuscation). Hysteria 2 is optimised for **high-loss / high-latency networks** (QUIC transport). Use Outline where WireGuard is fingerprinted and blocked; use Hysteria 2 where packet loss degrades TCP-based protocols.

---

## Xray / V2Ray (Protocol-Obfuscating Proxy)

**Purpose:** A suite of network proxy tools that wrap traffic in protocols designed to evade deep packet inspection — VLESS, VMESS, and XTLS over WebSocket or gRPC, disguised as ordinary HTTPS. Widely used alongside Hysteria 2 for censorship circumvention. Xray is the actively maintained fork of V2Ray with additional protocols (XTLS, VLESS, XHTTP) and better performance.

#### Use case vs WireGuard
Xray is a proxy, not a VPN — it forwards traffic through an HTTPS tunnel that looks like web traffic. WireGuard is a full network tunnel with a distinct UDP fingerprint. In environments where WireGuard and Shadowsocks are actively blocked, Xray VLESS+XTLS over port 443 is significantly harder to detect.

`/home/user/xray/config.json` (VLESS + XTLS-Reality — the modern recommended config):
```json
{
  "inbounds": [{
    "port": 443,
    "protocol": "vless",
    "settings": {
      "clients": [{
        "id": "your-uuid-here",
        "flow": "xtls-rprx-vision"
      }],
      "decryption": "none"
    },
    "streamSettings": {
      "network": "tcp",
      "security": "reality",
      "realitySettings": {
        "dest": "www.google.com:443",
        "serverNames": ["www.google.com"],
        "privateKey": "your-reality-private-key",
        "shortIds": ["your-short-id"]
      }
    }
  }],
  "outbounds": [{"protocol": "freedom"}]
}
```

```yaml
# ~/xray/compose.yaml
services:
  xray:
    image: ghcr.io/xtls/xray-core:latest
    ports:
      - "0.0.0.0:443:443/tcp"
    volumes:
      - /home/user/xray/config.json:/etc/xray/config.json:ro,Z
    command: run -config /etc/xray/config.json
    restart: unless-stopped
```

```bash
cd ~/xray && podman-compose up -d
```

**Generate a UUID and Reality keys:**
```bash
# Generate a UUID for the client ID
podman run --rm ghcr.io/xtls/xray-core:latest uuid

# Generate a Reality key pair
podman run --rm ghcr.io/xtls/xray-core:latest x25519
```

#### Clients
[v2rayN](https://github.com/2dust/v2rayN) (Windows), [v2rayNG](https://github.com/2dust/v2rayNG) (Android), [Shadowrocket](https://apps.apple.com/app/shadowrocket/id932747118) (iOS), [Nekoray](https://github.com/MatsuriDayo/nekoray) (Linux/Windows). Share the connection config as a `vless://` URI or QR code.

> **XTLS-Reality** (shown above) is the recommended modern config — it borrows a real TLS certificate fingerprint from a public site (`www.google.com`), making the server indistinguishable from that site even to active probers. Older VMESS+WS configs are simpler but more detectable.

**Firewall:**
```bash
sudo firewall-cmd --add-port=443/tcp --permanent && sudo firewall-cmd --reload
```


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
| WireGuard client can't reach LAN | Ensure `AllowedIPs` includes the home subnet (e.g., `192.168.1.0/24`) and that `PostUp` iptables MASQUERADE rule is active on the server |
| WireGuard road warrior QR not showing | Install `qrencode` via Nix: `nix-env -iA nixpkgs.qrencode`; for the linuxserver container, peer QR PNGs are in `config/peer_<name>/peer_<name>.png` |
| Outline Manager can't connect to server | The management API port (default `9090`) must be reachable; check firewall and that the `SB_API_PREFIX` in the environment matches the Manager's saved config |
| Outline client times out | Ensure both TCP and UDP on the data port are open; Shadowsocks uses both; check ISP is not blocking the port |
| Xray VLESS connection rejected | Verify the client UUID matches exactly; check that port 443 is open; confirm the Reality `serverNames` is reachable from the server itself |
| Xray Reality `private key` error | Regenerate the key pair with `xray x25519` — the public key goes in the client config, private key stays on the server |

> 🔒 **Security tip:** Always bind management UIs (`wg-easy`, `headplane`, `portainer`) to `127.0.0.1` and proxy through Caddy. Never expose control-plane interfaces directly to the internet. Rotate pre-auth keys periodically and use `fail2ban` on any publicly facing port.
