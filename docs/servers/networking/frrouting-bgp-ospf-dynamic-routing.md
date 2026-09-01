---
title: FRRouting — BGP, OSPF & Dynamic Routing
section: Self-Hosted Networking
updated: 2026-08-28
---

> **Part of the Networking & Infrastructure series:** See [all networking docs](../networking)

## FRRouting (BGP / OSPF / Dynamic Routing)

**Purpose:** Full-featured open-source routing suite implementing BGP, OSPF, IS-IS, RIP, PIM, and BFD — the same protocols running on enterprise and ISP routers. On a homelab or small datacenter, FRR is most useful for: advertising your Tailscale/WireGuard subnets into BGP, running BGP between your Shani OS host and a pfSense/OPNsense router, implementing ECMP load-balancing between uplinks, or learning BGP/OSPF for job preparation. FRR runs as a container alongside your network stack — it doesn't require a separate router appliance.

> **Note:** FRR needs `--network host` and `--cap-add NET_ADMIN,NET_RAW,SYS_ADMIN` to manipulate kernel routing tables. These capabilities are available to rootless Podman containers on this system with `--privileged` or explicit `--cap-add`. The kernel routing changes FRR makes are real — they affect the host's routing table.

```yaml
# ~/frr/compose.yaml
services:
  frr:
    image: frrouting/frr:latest
    network_mode: host
    cap_add: [NET_ADMIN, NET_RAW, SYS_ADMIN]
    volumes:
      - /home/user/frr/etc:/etc/frr:Z
    restart: unless-stopped
```

```bash
mkdir -p ~/frr/etc
cd ~/frr && podman-compose up -d
```

#### Initial FRR config files
```bash
# ~/frr/etc/daemons — enable only what you need
cat > ~/frr/etc/daemons << 'EOF'
zebra=yes      # core routing daemon — always required
bgpd=yes       # enable for BGP
ospfd=yes      # enable for OSPFv2
ospf6d=no
ripd=no
ripngd=no
isisd=no
pimd=no
bfdd=yes       # Bidirectional Forwarding Detection — fast link failure detection
EOF

# ~/frr/etc/vtysh.conf
cat > ~/frr/etc/vtysh.conf << 'EOF'
service integrated-vtysh-config
EOF
```

##### Connect to the FRR CLI (vtysh)

```bash
podman exec -it frr vtysh
```

#### Example: iBGP between Shani OS host and a pfSense/OPNsense router
```
# Inside vtysh:

# Set the router ID (use host's LAN IP)
configure terminal
 router bgp 65001
  bgp router-id 192.168.1.10
  neighbor 192.168.1.1 remote-as 65001          ! pfSense/OPNsense LAN IP, same AS = iBGP
  neighbor 192.168.1.1 description pfsense-router
  !
  address-family ipv4 unicast
   network 10.8.0.0/24                           ! advertise WireGuard VPN subnet into BGP
   network 100.64.0.0/10                         ! advertise Tailscale CGNAT range
   neighbor 192.168.1.1 activate
   neighbor 192.168.1.1 soft-reconfiguration inbound
  exit-address-family
 !
 ip route 10.8.0.0/24 wg0                        ! static route so zebra knows the next-hop
exit
```

#### Example: BGP with a Hetzner cloud server (eBGP over WireGuard)
```
configure terminal
 router bgp 65001
  bgp router-id 192.168.1.10
  neighbor 10.8.0.2 remote-as 65002             ! Hetzner VM, different AS = eBGP
  neighbor 10.8.0.2 ebgp-multihop 2             ! required when peering over a tunnel
  neighbor 10.8.0.2 update-source wg0
  !
  address-family ipv4 unicast
   network 192.168.1.0/24                        ! advertise homelab LAN to the cloud
   neighbor 10.8.0.2 activate
   neighbor 10.8.0.2 route-map EXPORT out
  exit-address-family
 !
 route-map EXPORT permit 10
  match ip address prefix-list HOMELAB
 !
 ip prefix-list HOMELAB seq 5 permit 192.168.1.0/24
exit
```

#### Example: OSPF for automatic route redistribution (all routers learn all subnets)
```
configure terminal
 router ospf
  ospf router-id 192.168.1.10
  network 192.168.1.0/24 area 0.0.0.0
  network 10.8.0.0/24 area 0.0.0.0
  passive-interface default           ! don't send OSPF hellos on all interfaces
  no passive-interface eth0           ! only peer on the LAN interface
  redistribute connected              ! inject directly connected routes
exit
```

#### Useful show commands (inside vtysh)
```
show ip bgp summary          # peer status, uptime, prefixes received
show ip bgp                  # full BGP table
show ip route                # kernel routing table (zebra view)
show ip route bgp            # only BGP-learned routes
show ip ospf neighbor        # OSPF adjacency table
show bfd peers               # BFD session status (sub-second failure detection)
show running-config          # full current config
write memory                 # save config to /etc/frr/frr.conf
```

#### BFD (fast failover in under 1 second)
```
configure terminal
 bfd
  peer 192.168.1.1
   detect-multiplier 3
   receive-interval 300
   transmit-interval 300
  !
 exit
 !
 router bgp 65001
  neighbor 192.168.1.1 bfd       ! attach BFD to the BGP peer
exit
```

> **FRR vs a dedicated router VM:** FRR in a container is appropriate for BGP peering, route redistribution, and learning. For a full home router (DHCP, NAT, firewall, PPPoE), use OPNsense or pfSense on a dedicated machine or VM. FRR and OPNsense complement each other — OPNsense handles the internet edge, FRR handles internal routing between segments.



---

## See Also

- [Networking & Infrastructure](networking) — overview
