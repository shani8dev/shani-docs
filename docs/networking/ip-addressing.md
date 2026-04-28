---
title: IP Addressing & Routing
section: Networking
updated: 2026-04-28
---

# IP Addressing & Routing

This page covers IP addressing fundamentals — CIDR notation, subnetting, IPv4 and IPv6 — and practical `ip` command usage for managing addresses, gateways, and routes on Shani OS. All operations use `iproute2` which is pre-installed.

For virtual interfaces (bridges, VLANs, veth pairs) see [Virtual Networking](virtual-networking). For diagnostics and traffic inspection see [Network Tools](network-tools).

---

## CIDR Notation

**CIDR (Classless Inter-Domain Routing)** notation expresses an IP address and its network mask together:

```
192.168.1.0/24
│           │
│           └─ prefix length: how many bits are the network part
└─ network address
```

The prefix length determines how many host addresses the network contains:

| CIDR | Subnet Mask | Hosts | Common Use |
|------|------------|-------|------------|
| `/8` | `255.0.0.0` | 16,777,214 | Class A private (10.0.0.0/8) |
| `/16` | `255.255.0.0` | 65,534 | Class B private (172.16.0.0/16) |
| `/24` | `255.255.255.0` | 254 | Typical home/office LAN |
| `/25` | `255.255.255.128` | 126 | Split a /24 in half |
| `/26` | `255.255.255.192` | 62 | Quarter of a /24 |
| `/28` | `255.255.255.240` | 14 | Small VLAN or DMZ |
| `/30` | `255.255.255.252` | 2 | Point-to-point link |
| `/31` | `255.255.255.254` | 2 (no broadcast) | Point-to-point (RFC 3021) |
| `/32` | `255.255.255.255` | 1 | Single host / loopback route |

**Formula:** `2^(32 − prefix) − 2` usable hosts (subtract network and broadcast addresses). `/31` and `/32` are exceptions used for point-to-point links and host routes respectively.

### Quick Mental Math

For any `/prefix`:
- **Network bits**: the prefix number
- **Host bits**: `32 − prefix`
- **Hosts**: `2^host_bits − 2`

Example — `192.168.10.0/26`:
- Host bits: `32 − 26 = 6`
- Hosts: `2^6 − 2 = 62`
- Range: `192.168.10.1` – `192.168.10.62`
- Broadcast: `192.168.10.63`

---

## Reserved and Special IPv4 Ranges

| Range | Purpose |
|-------|---------|
| `10.0.0.0/8` | Private (RFC 1918) |
| `172.16.0.0/12` | Private (RFC 1918) — `172.16.x.x` to `172.31.x.x` |
| `192.168.0.0/16` | Private (RFC 1918) |
| `127.0.0.0/8` | Loopback |
| `169.254.0.0/16` | Link-local / APIPA (no DHCP response) |
| `100.64.0.0/10` | Carrier-grade NAT (CGNAT) — also used by Tailscale |
| `0.0.0.0/0` | Default route (all destinations) |
| `255.255.255.255/32` | Limited broadcast |
| `224.0.0.0/4` | Multicast |
| `240.0.0.0/4` | Reserved (experimental) |

---

## Subnetting a Network

### Splitting a /24 into Smaller Subnets

A common task: take a `192.168.1.0/24` and divide it into smaller segments.

| Subnet | Range | Broadcast | Hosts |
|--------|-------|-----------|-------|
| `192.168.1.0/25` | `.1` – `.126` | `.127` | 126 |
| `192.168.1.128/25` | `.129` – `.254` | `.255` | 126 |

Split again into `/26`:

| Subnet | Range | Broadcast | Hosts |
|--------|-------|-----------|-------|
| `192.168.1.0/26` | `.1` – `.62` | `.63` | 62 |
| `192.168.1.64/26` | `.65` – `.126` | `.127` | 62 |
| `192.168.1.128/26` | `.129` – `.190` | `.191` | 62 |
| `192.168.1.192/26` | `.193` – `.254` | `.255` | 62 |

### Key Rule — Network Address Alignment

A subnet's network address must be a multiple of its block size (`2^host_bits`). For `/26` the block size is 64, so valid network addresses are `.0`, `.64`, `.128`, `.192`. `192.168.1.100/26` is valid as a host address but `192.168.1.100/26` is **not** a valid network address.

---

## IPv6 Addressing

IPv6 uses 128-bit addresses written as eight 16-bit groups in hexadecimal:

```
2001:0db8:85a3:0000:0000:8a2e:0370:7334
```

Two simplification rules:
1. Leading zeros in each group can be dropped: `0db8` → `db8`, `0000` → `0`
2. One consecutive run of all-zero groups can be replaced with `::`: `::` can appear only once

```
2001:db8:85a3::8a2e:370:7334
```

### IPv6 Prefix Lengths

IPv6 uses CIDR notation the same way. Common prefix lengths:

| Prefix | Use |
|--------|-----|
| `/128` | Single host (like IPv4 /32) |
| `/64` | Standard LAN segment — required for SLAAC |
| `/48` | Typical allocation to a site/organisation |
| `/32` | Typical ISP customer allocation |

A `/64` has `2^64` addresses — about 18 quintillion hosts per network segment.

### Special IPv6 Addresses

| Address | Meaning |
|---------|---------|
| `::1/128` | Loopback (IPv6 equivalent of 127.0.0.1) |
| `fe80::/10` | Link-local (auto-configured, non-routable) |
| `fc00::/7` | Unique local (ULA — IPv6 private, like RFC 1918) |
| `ff00::/8` | Multicast |
| `2000::/3` | Global unicast (public internet) |
| `64:ff9b::/96` | IPv4-mapped / NAT64 |
| `::ffff:0:0/96` | IPv4-mapped IPv6 address |
| `::/0` | Default route |

### Link-Local Addresses

Every IPv6-capable interface automatically generates a **link-local address** in the `fe80::/10` range derived from the MAC address (EUI-64) or a random value. Link-local addresses are only valid on their local segment and are never routed. They are always present even if no global IPv6 address is configured.

```bash
ip -6 addr show          # fe80::... addresses are link-local
ping6 fe80::1%eth0       # must specify the interface with %iface for link-local
```

---

## Managing Addresses with `ip`

### Viewing Addresses

```bash
# All interfaces with addresses
ip addr show
ip a                          # shorthand

# Compact one-line-per-interface view
ip -brief addr show
ip -br a

# Single interface
ip addr show eth0

# IPv4 only
ip -4 addr show

# IPv6 only
ip -6 addr show
```

### Adding and Removing Addresses

```bash
# Add an IPv4 address to an interface
sudo ip addr add 192.168.1.100/24 dev eth0

# Add an IPv6 address
sudo ip addr add 2001:db8::1/64 dev eth0

# Add a secondary address (multiple IPs on one interface)
sudo ip addr add 192.168.1.200/24 dev eth0

# Remove an address
sudo ip addr del 192.168.1.100/24 dev eth0

# Flush all addresses from an interface
sudo ip addr flush dev eth0
```

> 💡 Addresses added with `ip addr add` are ephemeral — they disappear on reboot. For persistence, configure them via NetworkManager or systemd-networkd. See [Persistent Configuration](#persistent-configuration).

### Bringing Interfaces Up and Down

```bash
sudo ip link set eth0 up
sudo ip link set eth0 down

# Set MTU
sudo ip link set eth0 mtu 9000    # jumbo frames

# Set MAC address
sudo ip link set eth0 address 02:00:00:00:00:01
```

---

## Default Gateway

The default gateway is the router that handles traffic destined for addresses not in any local subnet. It corresponds to the route for `0.0.0.0/0` (IPv4) or `::/0` (IPv6).

```bash
# Show the default gateway
ip route show default
ip route | grep default

# Example output:
# default via 192.168.1.1 dev eth0 proto dhcp src 192.168.1.50 metric 100

# Add a default gateway
sudo ip route add default via 192.168.1.1 dev eth0

# Add a default IPv6 gateway
sudo ip -6 route add default via fe80::1 dev eth0

# Remove a default gateway
sudo ip route del default via 192.168.1.1

# Change the default gateway
sudo ip route replace default via 192.168.1.254 dev eth0
```

---

## Routing Table

The routing table is the kernel's lookup table: for each destination, which interface and next-hop to use.

```bash
# Show the full IPv4 routing table
ip route show
ip route show table all          # all routing tables including policy routes

# Show the IPv6 routing table
ip -6 route show

# Trace which route would be used for a destination
ip route get 8.8.8.8
ip route get 10.0.0.5
ip -6 route get 2001:db8::1

# Example output of ip route get:
# 8.8.8.8 via 192.168.1.1 dev eth0 src 192.168.1.50 uid 1000
#     cache
```

### Adding and Removing Routes

```bash
# Add a static route to a specific network
sudo ip route add 10.10.0.0/16 via 192.168.1.254 dev eth0

# Add a host route (single IP)
sudo ip route add 10.20.30.40/32 via 192.168.1.254

# Add a route via a specific interface (no gateway — directly connected)
sudo ip route add 172.16.0.0/24 dev eth1

# Remove a route
sudo ip route del 10.10.0.0/16 via 192.168.1.254

# Blackhole route (silently drop matching traffic)
sudo ip route add blackhole 192.0.2.0/24

# Unreachable route (return ICMP unreachable)
sudo ip route add unreachable 192.0.2.0/24
```

### Route Metrics

When multiple routes match a destination, the one with the **lowest metric** wins.

```bash
# Add a route with a specific metric
sudo ip route add default via 192.168.1.1 metric 100
sudo ip route add default via 10.0.0.1 metric 200    # fallback

# Show metrics
ip route show | grep metric
```

---

## Multiple Routing Tables (Policy Routing)

Linux supports up to 252 named routing tables. Policy routing lets you route traffic differently based on source address, mark, or interface — useful for VPNs, multi-homing, and VRFs.

```bash
# List named routing tables
cat /etc/iproute2/rt_tables

# Add a route to a specific table (table 100)
sudo ip route add default via 10.0.0.1 table 100

# Add a rule: traffic from 192.168.2.0/24 uses table 100
sudo ip rule add from 192.168.2.0/24 table 100

# Show all routing rules (policy database)
ip rule show

# Show routes in a specific table
ip route show table 100

# Delete a rule
sudo ip rule del from 192.168.2.0/24 table 100
```

---

## ARP and Neighbour Table

ARP (IPv4) and NDP (IPv6) map IP addresses to MAC addresses on the local segment. The kernel caches these in the neighbour table.

```bash
# Show the ARP/neighbour cache
ip neigh show
ip neigh show dev eth0

# Add a static ARP entry
sudo ip neigh add 192.168.1.50 lladdr 00:11:22:33:44:55 dev eth0

# Delete an entry
sudo ip neigh del 192.168.1.50 dev eth0

# Flush all neighbours on an interface
sudo ip neigh flush dev eth0

# Flush stale entries only
sudo ip neigh flush nud stale dev eth0
```

---

## Persistent Configuration

### NetworkManager (recommended for desktops)

```bash
# Show all connections
nmcli connection show

# Set a static IP on a connection
nmcli connection modify "Wired connection 1" \
  ipv4.method manual \
  ipv4.addresses "192.168.1.100/24" \
  ipv4.gateway "192.168.1.1" \
  ipv4.dns "1.1.1.1,8.8.8.8"

# Set a static IPv6 address
nmcli connection modify "Wired connection 1" \
  ipv6.method manual \
  ipv6.addresses "2001:db8::10/64" \
  ipv6.gateway "2001:db8::1"

# Re-enable DHCP
nmcli connection modify "Wired connection 1" \
  ipv4.method auto \
  ipv4.addresses "" \
  ipv4.gateway "" \
  ipv4.dns ""

# Apply changes
nmcli connection up "Wired connection 1"

# Add a persistent static route via NetworkManager
nmcli connection modify "Wired connection 1" \
  +ipv4.routes "10.10.0.0/16 192.168.1.254"
```

### systemd-networkd (servers / headless)

**`/etc/systemd/network/10-eth0.network`**

```ini
[Match]
Name=eth0

[Network]
Address=192.168.1.100/24
Gateway=192.168.1.1
DNS=1.1.1.1
DNS=8.8.8.8

# Static IPv6
Address=2001:db8::10/64
Gateway=2001:db8::1

[Route]
Destination=10.10.0.0/16
Gateway=192.168.1.254
```

```bash
sudo systemctl restart systemd-networkd
networkctl status eth0
```

---

## IPv4 vs IPv6 Dual Stack

Most modern systems run **dual stack** — both IPv4 and IPv6 simultaneously. Applications try IPv6 first (RFC 6724 address selection). 

```bash
# Check if IPv6 is enabled on an interface
cat /proc/sys/net/ipv6/conf/eth0/disable_ipv6
# 0 = enabled, 1 = disabled

# Disable IPv6 on a specific interface
sudo sysctl net.ipv6.conf.eth0.disable_ipv6=1

# Disable IPv6 globally
sudo sysctl net.ipv6.conf.all.disable_ipv6=1

# Make permanent via systemd-sysctl
echo "net.ipv6.conf.all.disable_ipv6 = 1" | sudo tee /etc/sysctl.d/40-ipv6.conf

# Test which address is used to reach a host
ip route get 2001:4860:4860::8888    # Google's IPv6 DNS
curl -6 https://ipv6.google.com      # force IPv6
curl -4 https://google.com           # force IPv4
```

---

## IP Forwarding

IP forwarding must be enabled for a machine to route packets between interfaces (acting as a router, NAT gateway, or container host).

```bash
# Check current state
cat /proc/sys/net/ipv4/ip_forward       # 1=enabled, 0=disabled
cat /proc/sys/net/ipv6/conf/all/forwarding

# Enable temporarily (lost on reboot)
sudo sysctl -w net.ipv4.ip_forward=1
sudo sysctl -w net.ipv6.conf.all.forwarding=1

# Enable persistently
sudo tee /etc/sysctl.d/30-forwarding.conf << 'EOF'
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
EOF
sudo sysctl --system
```

---

## Useful One-Liners

```bash
# My public IPv4 address
curl -4 -s ifconfig.me

# My public IPv6 address
curl -6 -s ifconfig.me

# All local IPs (no loopback)
ip -br addr show | grep -v lo

# Default gateway
ip route show default | awk '{print $3}'

# Which interface reaches the internet?
ip route get 8.8.8.8 | awk '{print $5; exit}'

# Is an IP in a particular subnet? (bash arithmetic)
# e.g. is 192.168.1.50 in 192.168.1.0/24?
python3 -c "import ipaddress; print('yes' if ipaddress.ip_address('192.168.1.50') in ipaddress.ip_network('192.168.1.0/24') else 'no')"

# List all routes with their interface
ip route show | awk '{print $1, $3, $5}'

# Watch the routing table for changes
watch -n 1 ip route show
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No internet despite correct IP and gateway | Check DNS: `dig google.com @8.8.8.8`; check routing: `ip route get 8.8.8.8`; check firewall: `sudo nft list ruleset` |
| `Network unreachable` | No route to destination — check `ip route show`; verify the gateway is reachable with `ping 192.168.1.1` |
| `No route to host` | Route exists but the host is not responding — check firewall at the destination, check ARP: `ip neigh show` |
| Wrong gateway used | Multiple default routes — check metrics with `ip route show`; remove lower-priority duplicates |
| IPv6 link-local only, no global address | SLAAC or DHCPv6 failing — check `journalctl -u NetworkManager`; verify the router is sending RA (router advertisements) |
| `169.254.x.x` address assigned | DHCP failed — APIPA fallback; check DHCP server and cable/connection |
| Route disappears after reboot | Route was set with `ip route add` (ephemeral); persist via NetworkManager or systemd-networkd |
| Packets sent but not returned | Asymmetric routing — check return path on the other end; intermediate firewall may be blocking |
| VPN routes not taking effect | Check `ip rule show` for policy routing; VPN may need `table` configuration |

---

## See Also

- [Network Tools](network-tools) — `ping`, `traceroute`, `ss`, `tcpdump`, diagnostics
- [Virtual Networking](virtual-networking) — bridges, VLANs, veth pairs, namespaces
- [NetworkManager & VPN](networkmanager-vpn) — persistent interface configuration
- [Firewall (firewalld)](firewalld) — nftables rules affecting routing
- [WireGuard (Manual)](wireguard) — VPN with custom routing tables
- [Tailscale VPN](tailscale) — mesh VPN using `100.64.0.0/10` (CGNAT range)
