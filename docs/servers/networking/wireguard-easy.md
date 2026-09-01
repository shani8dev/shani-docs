---
title: WireGuard / WG-Easy
section: Self-Hosted Networking
updated: 2026-08-28
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.

All VPN and tunnel solutions on this system can run fully containerised. Rootless containers handle traffic routing but require specific capabilities (`NET_ADMIN`, `NET_RAW`), kernel modules (`tun`), and IP forwarding enabled on the host.

---

## Key Concepts

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

#### WireGuard cryptography — what you're actually running
WireGuard uses Curve25519 for key exchange (ECDH), ChaCha20-Poly1305 for symmetric encryption (authenticated, AEAD), and BLAKE2s for hashing. This is a modern, audited cryptographic stack — significantly simpler than OpenVPN's TLS negotiation (which can be misconfigured to use weak ciphers). Each peer has a 32-byte public key derived from its private key. Handshakes are silent — WireGuard never responds to unauthenticated packets, making it invisible to port scanners.

#### Tailscale vs Headscale — what the control plane actually does
WireGuard handles data-plane encryption; the control plane distributes public keys, allocates IP addresses, and implements NAT traversal. Tailscale's control plane is managed (tailscale.com servers). Headscale self-hosts the control plane — same WireGuard data plane, but your server handles key distribution and NAT traversal coordination. The trade-off: Headscale means no Tailscale SaaS dependency, but you run the coordination server, and some Tailscale features (MagicDNS via their resolvers, some client apps) may have reduced functionality.

#### Key rotation and peer management at scale
WireGuard has no built-in PKI — each peer is a static public key. At small scale (10 peers) this is manageable. At medium scale (50+ peers), use Headscale's API or Netbird's management plane to automate key distribution and rotation. Key compromise in WireGuard requires removing the peer's public key from all other peers' `AllowedPeers` lists — in a mesh of 50 nodes, this means 49 config updates. This is why a management plane (Headscale, Netbird, Innernet) is not optional at scale.

#### VPN split tunneling — security implications
Full tunnel routes all traffic through the VPN — protects DNS queries, prevents local network leakage, but adds latency and routes your ISP's traffic through your home server. Split tunnel routes only specific CIDRs through the VPN — your home LAN is accessible, but public traffic goes direct. Security risk: split tunnel exposes your traffic on the exit network (corporate WiFi, coffee shop) for non-VPN-routed traffic. DNS leak: even with split tunnel, ensure DNS queries for home resources go through the VPN resolver, not the local network's DNS.

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

## See Also

- [Tailscale & Headscale](./headscale.md)
- [Pangolin](./pangolin.md)
- [NetBird](./netbird.md)
- [Pritunl](./pritunl.md)
- [Firezone](./firezone.md)
- [WireGuard](../networking/wireguard.md)
- [Cloudflared](../networking/cloudflared.md)
