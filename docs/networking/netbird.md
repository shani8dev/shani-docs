---
title: NetBird
section: Self-Hosted Networking
updated: 2026-08-28
---

> **Part of the VPN & Tunnels series:** See [all networking docs](../networking)

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



---

## See Also

- [Networking](../networking) — all networking docs
