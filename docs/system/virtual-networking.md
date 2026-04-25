---
title: Virtual Networking
section: Network
updated: 2026-04-25
---

# Virtual Networking

Linux exposes a rich set of virtual network devices and primitives for building software-defined networks, container networking, VMs, VPN tunnels, and isolated test environments. All operations use `iproute2` (`ip` command), which is pre-installed on Shani OS.

> 💡 Virtual interfaces created with `ip link add` are ephemeral — they disappear on reboot. To make them persistent, define them as systemd-networkd `.netdev` and `.network` files (see [Persistent Configuration](#persistent-configuration-systemd-networkd)).

---

## Virtual Interface Types at a Glance

| Type | Purpose |
|------|---------|
| **bridge** | Software Layer 2 switch — connects multiple interfaces to one segment |
| **vlan** | 802.1Q VLAN tagging on an existing interface |
| **veth** | Virtual Ethernet pair — two ends of a virtual cable |
| **tun** | Layer 3 (IP) tunnel — used by WireGuard, OpenVPN, VPNs |
| **tap** | Layer 2 (Ethernet) tunnel — used by QEMU/KVM VMs, Libvirt |
| **dummy** | Loopback-like stub — useful for testing and stable routing |
| **macvlan** | Multiple MAC addresses on one physical NIC |
| **ipvlan** | Multiple IP addresses on one physical NIC, shared MAC |
| **vrf** | Virtual Routing and Forwarding — separate routing tables per tenant |
| **bond** | Aggregate multiple NICs (active-backup, LACP, etc.) |
| **team** | Like bonding but with a userspace daemon and richer policy |

---

## 1. Bridge — Software Layer 2 Switch

A bridge connects multiple network interfaces at Layer 2, acting like a virtual switch. Containers, VMs, and physical NICs can all be members of the same bridge.

```bash
# Create the bridge
sudo ip link add name br0 type bridge

# Bring it up and assign an IP
sudo ip link set br0 up
sudo ip addr add 192.168.100.1/24 dev br0

# Add an existing interface as a bridge port
sudo ip link set eth1 master br0

# Remove a port
sudo ip link set eth1 nomaster

# List bridge members
bridge link show

# Show bridge forwarding database (MAC table)
bridge fdb show br0

# Delete the bridge
sudo ip link delete br0 type bridge
```

> 💡 For QEMU/KVM VMs, the typical pattern is: create `br0` → bridge it to the physical NIC → attach each VM's TAP device to `br0`. The VM gets a real Layer 2 presence on the LAN.

---

## 2. VLAN — 802.1Q Tagged Sub-interfaces

VLANs create sub-interfaces that tag frames with a VLAN ID. Useful for segmenting traffic on a trunk port.

```bash
# Create VLAN 10 on eth0
sudo ip link add link eth0 name eth0.10 type vlan id 10

# Bring up both the parent and the VLAN interface
sudo ip link set eth0 up
sudo ip link set eth0.10 up
sudo ip addr add 10.10.0.1/24 dev eth0.10

# Show VLAN details
ip -d link show eth0.10

# Remove the VLAN sub-interface
sudo ip link delete eth0.10
```

Multiple VLANs on the same physical interface:

```bash
sudo ip link add link eth0 name eth0.20 type vlan id 20
sudo ip link add link eth0 name eth0.30 type vlan id 30
sudo ip link set eth0.20 up && sudo ip addr add 10.20.0.1/24 dev eth0.20
sudo ip link set eth0.30 up && sudo ip addr add 10.30.0.1/24 dev eth0.30
```

---

## 3. veth Pairs — Virtual Ethernet Cables

A veth pair is two virtual NICs connected back-to-back — anything sent into one end emerges from the other. Used heavily by containers (one end goes into a network namespace, the other into a bridge).

```bash
# Create a pair: veth0 <--> veth1
sudo ip link add veth0 type veth peer name veth1

# Bring both ends up
sudo ip link set veth0 up
sudo ip link set veth1 up

# Assign addresses and communicate
sudo ip addr add 192.168.200.1/24 dev veth0
sudo ip addr add 192.168.200.2/24 dev veth1
ping -c 2 192.168.200.2 -I veth0

# Move one end into a namespace (typical container setup)
sudo ip netns add myns
sudo ip link set veth1 netns myns
sudo ip netns exec myns ip link set veth1 up
sudo ip netns exec myns ip addr add 192.168.200.2/24 dev veth1

# Delete the pair (deleting either end removes both)
sudo ip link delete veth0
```

---

## 4. TUN / TAP — Userspace Tunnel Devices

TUN (Layer 3) and TAP (Layer 2) devices expose a virtual NIC to a userspace process via a file descriptor on `/dev/net/tun`. VPN daemons (WireGuard, OpenVPN, WireProxy) use TUN; QEMU/KVM uses TAP for VM networking.

### Manual TUN

```bash
# Create a persistent TUN device owned by your user
sudo ip tuntap add name tun0 mode tun user $USER

sudo ip link set tun0 up
sudo ip addr add 10.99.0.1 peer 10.99.0.2 dev tun0

# Remove it
sudo ip tuntap del name tun0 mode tun
```

### Manual TAP (for VMs)

```bash
# Create a TAP device and attach it to a bridge
sudo ip tuntap add name tap0 mode tap user $USER
sudo ip link set tap0 master br0
sudo ip link set tap0 up

# Remove it
sudo ip link delete tap0
```

> 💡 QEMU creates and destroys TAP devices automatically when using `-netdev tap,id=net0,ifname=tap0,script=no` — you rarely need to manage them by hand unless writing a custom networking script.

---

## 5. Network Namespaces — Full Isolation

A network namespace gives a process its own private network stack: interfaces, routes, firewall rules, and sockets are completely isolated from the host.

```bash
# Create a namespace
sudo ip netns add isolated

# List namespaces
ip netns list

# Run a command inside the namespace
sudo ip netns exec isolated ip link

# The namespace only has loopback by default — add connectivity via a veth pair
sudo ip link add veth-host type veth peer name veth-ns
sudo ip link set veth-ns netns isolated

sudo ip link set veth-host up
sudo ip addr add 10.0.0.1/24 dev veth-host

sudo ip netns exec isolated ip link set lo up
sudo ip netns exec isolated ip link set veth-ns up
sudo ip netns exec isolated ip addr add 10.0.0.2/24 dev veth-ns
sudo ip netns exec isolated ip route add default via 10.0.0.1

# Verify isolation: ping the namespace from host
ping -c 2 10.0.0.2

# Run a shell inside the namespace
sudo ip netns exec isolated bash

# Delete the namespace (also removes the veth-ns end)
sudo ip netns delete isolated
sudo ip link delete veth-host
```

Enable IP forwarding and NAT to give namespaces internet access:

```bash
echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward
sudo iptables -t nat -A POSTROUTING -s 10.0.0.0/24 -j MASQUERADE
```

---

## 6. Dummy Interface — Stable Stub

A dummy interface is like an extra loopback — useful for assigning stable IPs that don't depend on a physical link being present. Common in routing daemons, BGP anycast, and testing.

```bash
sudo ip link add dummy0 type dummy
sudo ip link set dummy0 up
sudo ip addr add 203.0.113.1/32 dev dummy0

# Remove
sudo ip link delete dummy0
```

---

## 7. macvlan — Multiple MACs on One NIC

macvlan creates virtual interfaces with distinct MAC addresses that share a physical NIC. Each macvlan interface is addressable separately on the LAN. Useful for containers that need a real LAN presence without a bridge.

```bash
# Modes: bridge, private, vepa, passthru
sudo ip link add macvlan0 link eth0 type macvlan mode bridge
sudo ip link set macvlan0 up
sudo ip addr add 192.168.1.200/24 dev macvlan0

# Move macvlan into a container namespace
sudo ip link set macvlan0 netns mycontainer

sudo ip link delete macvlan0
```

> ⚠️ A macvlan interface **cannot communicate with its parent** (`eth0`) directly — the host and the macvlan exist on different internal segments. Use a bridge instead if host-to-container communication is needed.

---

## 8. VRF — Virtual Routing and Forwarding

A VRF assigns interfaces to an isolated routing table. Traffic in one VRF cannot leak into another — useful for multi-tenant setups, management plane separation, or testing routing policies.

```bash
# Create a VRF with routing table ID 10
sudo ip link add vrf-mgmt type vrf table 10
sudo ip link set vrf-mgmt up

# Bind an interface to the VRF
sudo ip link set eth1 master vrf-mgmt

# Routes added to eth1 now live in table 10
sudo ip addr add 10.200.0.1/24 dev eth1
sudo ip route show vrf vrf-mgmt

# Run a command in the VRF context (uses SO_BINDTODEVICE)
sudo ip vrf exec vrf-mgmt ping 10.200.0.2

# Remove VRF
sudo ip link delete vrf-mgmt
```

---

## 9. Bonding — NIC Aggregation

Bonding combines multiple physical NICs into a single logical interface for redundancy or throughput.

```bash
# Load the bonding module
sudo modprobe bonding

# Create a bond in active-backup mode (mode 1)
sudo ip link add bond0 type bond
sudo ip link set bond0 type bond mode active-backup miimon 100

# Bring down member NICs before adding them
sudo ip link set eth0 down
sudo ip link set eth1 down

# Add members
sudo ip link set eth0 master bond0
sudo ip link set eth1 master bond0

# Bring everything up
sudo ip link set bond0 up
sudo ip addr add 192.168.1.50/24 dev bond0

# Show bond status
cat /proc/net/bonding/bond0
```

Common bond modes:

| Mode | Name | Description |
|------|------|-------------|
| 0 | balance-rr | Round-robin — requires switch support |
| 1 | active-backup | One active, one standby — no switch config needed |
| 2 | balance-xor | XOR hash — requires switch support |
| 4 | 802.3ad | LACP — requires managed switch with LACP |
| 5 | balance-tlb | Adaptive transmit — no switch config needed |
| 6 | balance-alb | Adaptive load balancing — no switch config needed |

---

## 10. Useful Inspection Commands

```bash
# List all interfaces with type
ip -d link show

# List all interfaces briefly
ip -brief link

# Show routing tables
ip route show table all

# Show a specific routing table
ip route show table 10

# Show neighbours (ARP/NDP cache)
ip neigh show

# Flush ARP cache for an interface
sudo ip neigh flush dev eth0

# Monitor real-time link/route/address events
ip monitor

# Show bridge ports and state (STP, etc.)
bridge link show
bridge vlan show
```

---

## Persistent Configuration (systemd-networkd)

To survive reboots, define virtual devices in `/etc/systemd/network/`.

### Persistent bridge with a member

**`/etc/systemd/network/10-br0.netdev`**

```ini
[NetDev]
Name=br0
Kind=bridge
```

**`/etc/systemd/network/10-br0.network`**

```ini
[Match]
Name=br0

[Network]
Address=192.168.100.1/24
```

**`/etc/systemd/network/20-eth1-bridge.network`**

```ini
[Match]
Name=eth1

[Network]
Bridge=br0
```

### Persistent VLAN

**`/etc/systemd/network/30-vlan10.netdev`**

```ini
[NetDev]
Name=eth0.10
Kind=vlan

[VLAN]
Id=10
```

**`/etc/systemd/network/30-vlan10.network`**

```ini
[Match]
Name=eth0.10

[Network]
Address=10.10.0.1/24
```

Apply changes:

```bash
sudo systemctl restart systemd-networkd
networkctl status          # Verify interfaces came up correctly
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Interface not forwarding between bridge ports | Check `net.ipv4.ip_forward` (`sysctl net.ipv4.ip_forward`); ensure it is `1` |
| Bridge member goes `blocking` or `listening` | STP convergence is normal — wait ~30s, or disable STP on the bridge: `sudo ip link set br0 type bridge stp_state 0` |
| macvlan can't reach host | Expected — macvlan parent and child can't communicate. Use a bridge or a veth pair to the host instead |
| Namespace has no internet | Add a default route inside the namespace and enable NAT on the host (see [Network Namespaces](#5-network-namespaces--full-isolation)) |
| Bond not failing over | Verify `miimon` is non-zero; check that both member NICs are actually `up` |
| Changes lost after reboot | Create systemd-networkd `.netdev`/`.network` files for persistence |
| `RTNETLINK answers: File exists` | Interface or route already exists — delete the old one first: `sudo ip link delete <name>` |

---

## See Also

- [Network Diagnostics & Tools](../troubleshooting/network-diag) — `ip`, `ss`, `tcpdump`, `nmap`
- [Containers](../system/containers) — Podman networking and CNI plugins
- [Firewall](../system/firewall) — nftables rules for virtual interfaces
- [WireGuard VPN](../network/wireguard) — TUN-based VPN setup
