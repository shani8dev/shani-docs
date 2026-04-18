---
title: VPN & Tunnels
section: Self-Hosting & Servers
updated: 2026-04-16
---

# VPN & Tunnels

All VPN and tunnel solutions on Shanios can run fully containerized. Rootless containers handle traffic routing, but require specific capabilities (`NET_ADMIN`, `NET_RAW`), kernel modules (`tun`), and IP forwarding enabled on the host.

## 🔧 Container Networking Prerequisites
Before running VPN containers, ensure your host is configured:
```bash
# Enable IPv4/IPv6 forwarding
sudo sysctl -w net.ipv4.ip_forward=1
sudo sysctl -w net.ipv6.conf.all.forwarding=1

# Make forwarding persistent
echo "net.ipv4.ip_forward=1" | sudo tee /etc/sysctl.d/99-ipforward.conf
echo "net.ipv6.conf.all.forwarding=1" | sudo tee -a /etc/sysctl.d/99-ipforward.conf

# Load TUN/TAP module (usually auto-loaded on first use)
sudo modprobe tun
```

---

## WireGuard / WG-Easy

**Purpose**: Modern, high-performance VPN using state-of-the-art cryptography. WG-Easy provides a lightweight web UI for managing peers, generating QR codes, and controlling routes without manual CLI work.

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
  --sysctl net.ipv6.conf.all.disable_ipv6=0 \
  --restart unless-stopped \
  ghcr.io/wg-easy/wg-easy
```

- **Management**: `http://localhost:51821`
- **Persistence**: `/home/user/wgeasy/wireguard/`
- **Firewall**: `sudo firewall-cmd --add-port=51820/udp --permanent && sudo firewall-cmd --reload`

---

## Tailscale / Headscale + Headplane

**Purpose**: Zero-config mesh VPN using WireGuard. Tailscale uses managed coordination; **Headscale** is the fully open-source, self-hosted control server.

### Tailscale (Managed)
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
**Connect Client**: `tailscale up --login-server https://login.tailscale.com`

### Headscale (Self-Hosted)
**1. Setup Directories & Config**
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
  sqlite: { path: /var/lib/headscale/db.sqlite }
dns:
  base_domain: headscale.lan
  magic_dns: true
  nameservers: [1.1.1.1, 8.8.8.8]
```

**2. Run Container**
```bash
podman run -d \
  --name headscale \
  -p 127.0.0.1:8080:8080 \
  -p 127.0.0.1:9090:9090 \
  -v /home/user/headscale/config:/etc/headscale:Z \
  -v /home/user/headscale//var/lib/headscale:Z \
  --restart unless-stopped \
  headscale/headscale:latest
```

**3. Initialize & Connect**
```bash
# Create namespace
podman exec headscale headscale users create default

# Generate pre-auth key (30 days)
podman exec headscale headscale preauthkeys create --user default --reusable --expiration 30d

# Client connect
tailscale up --login-server https://headscale.example.com --authkey <key>
```

### Headscale UI: Headplane
**Purpose**: Modern, feature-rich web UI for Headscale. Replaces CLI management with a dashboard for node provisioning, routing, ACLs, and API key generation.

```bash
podman run -d \
  --name headplane \
  -p 127.0.0.1:3000:3000 \
  -v /home/user/headscale/config:/etc/headscale:ro,Z \
  -v /home/user/headplane//app/Z \
  --restart unless-stopped \
  ghcr.io/tale/headplane:latest
```
- **Access**: `http://localhost:3000`
- **Proxy**: `headplane.example.com { reverse_proxy localhost:3000 }`

---

## Hysteria 2 (High Performance) + Community UI

**Purpose**: A powerful proxy/tunnel based on QUIC protocol. Excels in high-latency, high-loss network environments where TCP/WireGuard struggle. Uses UDP and looks like normal video traffic (HTTP3) to firewalls.

### 1. Core Server
Create `/home/user/hysteria/config.yaml`:
```yaml
listen: :443
tls:
  cert: /etc/hysteria/fullchain.pem
  key: /etc/hysteria/privkey.pem
auth:
  type: password
  password: "your-strong-password"
quic:
  initStreamReceiveWindow: 16777216
  maxStreamReceiveWindow: 16777216
  initConnReceiveWindow: 33554432
  maxConnReceiveWindow: 33554432
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

### 2. Community Web UI: Hysteria Dashboard
> ⚠️ **Note**: Hysteria 2 has no official Web UI. Community dashboards exist but are experimental. Use with caution in production.
```bash
podman run -d \
  --name hysteria-dashboard \
  -p 127.0.0.1:8080:8080 \
  -v /home/user/hysteria/config.yaml:/app/config.yaml:ro,Z \
  -v /home/user/hysteria/dashboard.db:/app/db.sqlite:Z \
  -e HYSTERIA_CONFIG=/app/config.yaml \
  --restart unless-stopped \
  jonssonyan/hysteria-dashboard:latest
```
- **Access**: `http://localhost:8080`
- **Recommendation**: For production, manage configs via Git + Caddy, or use WireGuard/Pritunl for UI-driven setups.

---

## Cloudflare Tunnel (Cloudflared)

**Purpose**: Securely expose local services to the internet without opening firewall ports. Uses outbound-only HTTPS connections to Cloudflare's edge network.

```bash
podman run -d \
  --name cloudflared \
  -v /home/user/cloudflared/config:/etc/cloudflared:Z \
  --restart unless-stopped \
  cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <your-token>
```
- **Setup**: Generate token via Cloudflare Zero Trust dashboard. Add `CNAME` to `<tunnel-id>.cfargotunnel.com`.
- **Firewall**: None required. Traffic is outbound-only.

---

## Pangolin (Self-Hosted Tunnel Server)

**Purpose**: Pangolin is a self-hosted tunnelled reverse proxy with identity-aware access control — a fully open-source alternative to Cloudflare Tunnel and Ngrok. It exposes local services to the internet through an encrypted WireGuard tunnel to a lightweight VPS, without opening any inbound ports on your home network. Unlike Cloudflared, Pangolin requires no third-party cloud — you own the entire path.

Pangolin consists of two components:
- **Pangolin** — the server, runs on a cheap VPS, receives tunnelled traffic and routes it to your services
- **Newt** — the client agent, runs on your Shani OS machine, creates the tunnel back to Pangolin

### 1. Server (on a VPS)

Create `/home/user/pangolin/config/config.yml`:
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
  encryption_key: "$(openssl rand -hex 32)"
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

Access the dashboard at `https://pangolin.yourdomain.com`. Create a site and copy the Newt token.

### 2. Client Agent on Shani OS (Newt)

```bash
podman run -d \
  --name newt \
  -e PANGOLIN_URL=https://pangolin.yourdomain.com \
  -e NEWT_ID=<your-newt-id> \
  -e NEWT_SECRET=<your-newt-secret> \
  --restart unless-stopped \
  fosrl/newt:latest
```

Once the tunnel is up, define your exposed services in the Pangolin dashboard — map hostnames to local ports on your Shani OS machine. Pangolin handles TLS via Let's Encrypt automatically.

- **Firewall on VPS**: Open `443/tcp` and `51820/udp`
- **Firewall on Shani OS**: None required — Newt connects outbound only
- **Identity-aware access**: Pangolin supports resource-level access control — restrict services to authenticated users without a separate SSO layer

---

## OpenVPN + Web UI Alternatives

**Purpose**: Legacy, highly configurable VPN standard. Ideal for specific cipher suites, client certificate management, or older device compatibility.

### 1. Core Server (CLI)
```bash
podman run -d \
  --name openvpn \
  -p 0.0.0.0:1194:1194/udp \
  -v /home/user/openvpn:/etc/openvpn:Z \
  --cap-add NET_ADMIN \
  --cap-add SYS_MODULE \
  --sysctl net.ipv4.ip_forward=1 \
  --restart unless-stopped \
  kylemanna/openvpn
```
**Containerized Setup**:
```bash
# Generate config & PKI (run once)
podman run --rm -v /home/user/openvpn:/etc/openvpn kylemanna/openvpn ovpn_genconfig -u udp://vpn.example.com
podman run --rm -v /home/user/openvpn:/etc/openvpn -it kylemanna/openvpn ovpn_initpki

# Start container after init
podman start openvpn

# Generate client cert
podman run --rm -v /home/user/openvpn:/etc/openvpn -it kylemanna/openvpn easyrsa build-client-full client1 nopass

# Export client config
podman run --rm -v /home/user/openvpn:/etc/openvpn kylemanna/openvpn ovpn_getclient client1 > client1.ovpn
```

### 2. Community Web UI: OpenVPN WebUI
> ⚠️ **Note**: Community-maintained. Not officially supported by the OpenVPN project.
```bash
podman run -d \
  --name openvpn-webui \
  -p 127.0.0.1:8080:80 \
  -v /home/user/openvpn:/etc/openvpn:Z \
  -e OPENVPN_ADMIN_USERNAME=admin \
  -e OPENVPN_ADMIN_PASSWORD=changeme \
  --restart unless-stopped \
  d3vilbug/openvpn-webui:latest
```
- **Access**: `http://localhost:8080`
- **Production Alternative**: Use **Pritunl** (natively supports OpenVPN + WireGuard with a polished, audited UI).

---

## Pritunl

**Purpose**: Enterprise-grade distributed VPN server with a modern web UI. Supports WireGuard/OpenVPN, SSO, multi-site routing, and audit logging. Requires MongoDB.

### 1. MongoDB Backend
```bash
podman run -d \
  --name pritunl-mongo \
  -p 127.0.0.1:27017:27017 \
  -v /home/user/pritunl/mongo/db:/data/db:Z \
  --restart unless-stopped \
  mongo:6
```

### 2. Pritunl Server (Containerized)
> ⚠️ Requires `--network host` and privileged capabilities for routing/NAT and TUN/TAP access.
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

**Setup**:
1. Generate key: `podman exec pritunl pritunl setup-key`
2. Access UI: `https://<server-ip>:443`
3. Configure MongoDB URI in UI: `mongodb://127.0.0.1:27017/pritunl`
4. Create Org → Add Users → Create Server → Attach → Start.

**Firewall**: `sudo firewall-cmd --add-port=443/tcp --add-port=51820/udp --add-port=1194/udp --permanent && sudo firewall-cmd --reload`

---

## Firezone (Zero-Trust Access)

**Purpose**: Zero-trust network access (ZTNA) built on WireGuard. Features SSO integration (OIDC/SAML), granular access policies, device posture checks, and a unified web dashboard.

**Podman Compose Setup**:
```yaml
# ~/firezone/compose.yml
services:
  db:
    image: postgres:14-alpine
    environment:
      POSTGRES_USER: firezone
      POSTGRES_PASSWORD: strongpassword
      POSTGRES_DB: firezone
    volumes: [db_/var/lib/postgresql/data:Z]
    restart: unless-stopped

  firezone:
    image: firezone/firezone:latest
    ports: ["0.0.0.0:4443:443", "0.0.0.0:51820:51820/udp"]
    environment:
      DATABASE_URL: postgresql://firezone:strongpassword@db:5432/firezone
      SECRET_KEY_BASE: $(openssl rand -base64 64)
      DEFAULT_ADMIN_EMAIL: admin@example.com
    volumes: [etc_/etc/firezone:Z]
    cap_add: [NET_ADMIN]
    sysctls:
      net.ipv4.ip_forward: "1"
      net.ipv6.conf.all.disable_ipv6: "0"
    depends_on: [db]
    restart: unless-stopped

volumes: {db_ {}, etc_ {}}
```

```bash
mkdir -p ~/firezone && cd ~/firezone
podman-compose up -d
```
- **Access**: `https://localhost:4443` (Login with email & password from `podman logs firezone`)
- **Firewall**: `sudo firewall-cmd --add-port=4443/tcp --add-port=51820/udp --permanent && reload`

---

## Nebula (Overlay Network)

**Purpose**: A scalable overlay network tool developed by Slack. It creates a mesh network where nodes communicate directly. It uses a certificate-based PKI and a "Lighthouse" for discovery. Highly secure and decentralized.

### 1. Generate Certificates
You need a `nebula-cert` binary on your host or run a temporary container to generate your CA and node certificates.
```bash
# Generate CA
nebula-cert ca -name "MyCompany Nebula"

# Generate Lighthouse cert
nebula-cert sign -name "lighthouse" -ip "192.168.100.1/24"

# Generate Client cert
nebula-cert sign -name "client1" -ip "192.168.100.2/24"
```
Move the resulting `ca.crt`, `lighthouse.crt`, `lighthouse.key` to `/home/user/nebula/`.

### 2. Lighthouse Config (`config.yml`)
```yaml
pki:
  ca: /etc/nebula/ca.crt
  cert: /etc/nebula/lighthouse.crt
  key: /etc/nebula/lighthouse.key

static_host_map:
  "192.168.100.1": ["10.0.0.5:4242"] # Map Lighthouse IP to its Public IP

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
  --name nebula-lighthouse \
  -p 0.0.0.0:4242:4242/udp \
  -v /home/user/nebula:/etc/nebula:Z \
  --device /dev/net/tun \
  --cap-add NET_ADMIN \
  --restart unless-stopped \
  slacktechnologiesllc/nebula:latest
```
- **Firewall**: `sudo firewall-cmd --add-port=4242/udp --permanent && reload`

> 🖥️ **UI Status**: Nebula has **no official Web UI**. It is designed for GitOps/declarative config management. Use Git + CI/CD to manage `config.yml` files, or wrap it with a lightweight config server. Community dashboards exist but are unmaintained.

---

## ZeroTier Controller

**Purpose**: Self-hosted network controller for ZeroTier One. Allows you to manage virtual networks and peers without relying on ZeroTier's central cloud servers.

```bash
podman run -d \
  --name zerotier-controller \
  -p 127.0.0.1:9993:9993/udp \
  -p 127.0.0.1:3180:3180/tcp \
  -v /home/user/zerotier-controller:/var/lib/ztnetwork:Z \
  --restart unless-stopped \
  mgk/zerotier-controller:latest
```
- **Access**: `http://localhost:3180`
- **Client Setup**: `zerotier-cli join <network-id> --controller <your-server-ip>:3180`

---

## NetBird

**Purpose**: Open-source, peer-to-peer VPN management platform. Self-hosted alternative to Tailscale with centralized management and dashboard.

**Containerized Quickstart** (uses official management server + STUN + Signal):
```bash
# Run the official all-in-one management stack
podman run -d \
  --name netbird \
  --network host \
  -v /home/user/netbird:/etc/netbird:Z \
  --restart unless-stopped \
  netbirdio/netbird:latest
```
> 💡 **Note**: Full production deployment requires Postgres, Redis, and Coturn. Use the official [NetBird self-hosting compose](https://docs.netbird.io/selfhosting) for multi-node setups.

**Connect Client**: `netbird up --management-url https://netbird.example.com`

---

## Quick Selection Guide

| Tool | Best For | Complexity | UI | Protocol |
|------|----------|------------|----|----------|
| **WG-Easy** | Home/SOHO WireGuard management | Low | ✅ Web | WireGuard |
| **Headscale + Headplane** | Self-hosted Tailscale with dashboard | Medium | ✅ Web (Headplane) | WireGuard |
| **Hysteria 2 + Dashboard** | High packet loss / censorship bypass | Medium | ⚠️ Experimental Web | QUIC (HTTP3) |
| **Cloudflared** | Exposing services via Cloudflare, no port forwarding | Low | ✅ Web/Dashboard | HTTPS/TCP/UDP over TLS |
| **Pangolin + Newt** | Self-hosted tunnel server, no third-party cloud | Medium | ✅ Web | WireGuard tunnel |
| **OpenVPN + WebUI** | Legacy compatibility, cert-based auth | Medium | ⚠️ Community Web | UDP/TCP (SSL) |
| **Pritunl** | Enterprise, SSO, multi-site, audit logging | Medium | ✅ Web | WireGuard, OpenVPN |
| **Firezone** | Zero-trust access (ZTNA), granular policies | High | ✅ Web | WireGuard |
| **Nebula** | Decentralized mesh, cert-based auth | Medium | ❌ CLI/GitOps | Nebula (UDP) |
| **ZeroTier Ctrl**| ZT1 management, private controller | Medium | ✅ Web | ZeroTier (UDP) |
| **NetBird** | Open-source Tailscale alternative | Medium | ✅ Web | WireGuard |
| **Tailscale** | Zero-config mesh for teams/personal use | Low | ✅ App/Web | WireGuard (managed) |

---

## Troubleshooting (Containerized VPNs)

| Issue | Solution |
|-------|----------|
| `TUN/TAP device not found` | Load module on host: `sudo modprobe tun` |
| Clients can't route traffic | Verify `net.ipv4.ip_forward=1` on host; check container `--sysctl` flags |
| DNS not resolving for clients | Set custom DNS in container env/config (e.g., `WG_DEFAULT_DNS=1.1.1.1`) |
| `headscale`/`headplane` shows offline | Verify API connectivity; ensure Headscale listens on `0.0.0.0:8080` or mount config dir |
| OpenVPN auth fails | Check `ovpn_getclient` export; ensure firewall allows `1194/udp` |
| OpenVPN WebUI not loading | Ensure `/home/user/openvpn` contains valid PKI; check container logs |
| MongoDB connection fails (Pritunl) | Verify `podman logs pritunl-mongo`; ensure `--network host` or correct IP routing |
| Firezone DB error | Ensure `DATABASE_URL` points to `db` service name or host IP; check `podman-compose logs db` |
| Hysteria QUIC timeout | Ensure UDP `443` is open on host firewall and not blocked by ISP |
| Nebula nodes can't ping | Verify `ca.crt` matches on all nodes; check `static_host_map` IP resolution |

> 🔒 **Security Tip**: Always use strong pre-auth keys or certificates. Rotate keys periodically. Prefer WireGuard over OpenVPN for better performance. Never expose MongoDB or control-plane UIs directly to the internet without reverse proxy authentication. Use `fail2ban` or rate-limiting on web UIs if exposed publicly. Keep `headplane`, `wg-easy`, and community dashboards bound to `127.0.0.1` and proxy through Caddy for HTTPS termination.
