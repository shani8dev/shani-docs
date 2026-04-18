---
title: Tailscale VPN
section: Networking
updated: 2026-04-22
---

# Tailscale — Private WireGuard Mesh

Tailscale builds a private, peer-to-peer encrypted network (a "tailnet") between all your devices using WireGuard under the hood. Every device gets a stable Tailscale IP (`100.x.x.x`) and a DNS hostname. Traffic between devices is authenticated and encrypted end-to-end — no device on your tailnet is reachable by anyone outside it, even if both devices are behind NAT.

Tailscale is pre-installed on Shani OS. State is persisted at `/data/varlib/tailscale` and survives all OS updates and rollbacks — **you stay authenticated across reboots, updates, and rollbacks without ever re-running `tailscale up`**.

**Inactive until you authenticate.**

---

## Enable & Authenticate

```bash
# 1. Enable and start the daemon
sudo systemctl enable --now tailscaled

# 2. Authenticate (opens a browser — complete login there)
sudo tailscale up
```

That's it. Your machine is now on your tailnet and reachable from all your other Tailscale devices at its stable `100.x.x.x` IP and MagicDNS hostname.

---

## Common Startup Options

These flags are passed to `tailscale up` and can be combined freely:

```bash
# Enable Tailscale SSH — the recommended way to access your server remotely.
# Eliminates the need to manage sshd, authorized_keys, or firewall ports.
sudo tailscale up --ssh

# Accept subnet routes advertised by other tailnet nodes (e.g., a subnet router
# that exposes your NAS or printer to the whole tailnet)
sudo tailscale up --accept-routes

# Advertise this machine as an exit node — route other devices' internet traffic
# through your home connection when they're on untrusted networks
sudo tailscale up --advertise-exit-node

# Expose your entire home LAN to all tailnet devices (subnet router mode)
# Approve the route in the admin console after running this
sudo tailscale up --advertise-routes=192.168.1.0/24

# Accept MagicDNS from the tailnet — resolve device hostnames automatically
sudo tailscale up --accept-dns=true

# Combine options freely
sudo tailscale up --ssh --accept-routes --accept-dns=true
```

> **Tip:** Run `tailscale up` again any time you want to change flags — it applies the new configuration without dropping existing connections.

---

## Status & Diagnostics

```bash
# Show your tailnet, peers, their IPs, and connection status
tailscale status

# Show your Tailscale IPs (IPv4 and IPv6)
tailscale ip
tailscale ip -4
tailscale ip -6

# Diagnose NAT traversal and relay (DERP) connectivity
tailscale netcheck

# Ping a peer by Tailscale hostname (tests direct vs relayed connectivity)
tailscale ping myhostname

# Show detailed info about a specific peer
tailscale status --json | jq '.Peer[] | select(.HostName=="myhostname")'

# Show the current version
tailscale version

# Generate a full debug report (useful when filing issues)
tailscale bugreport
```

---

## SSH via Tailscale

Tailscale SSH is the simplest and most secure way to access your Shani OS machine remotely. When enabled, Tailscale intercepts port 22 and authenticates connections using Tailscale identity — no `sshd` daemon, no `authorized_keys`, no open firewall ports required.

```bash
# On the server — enable Tailscale SSH (one-time setup)
sudo tailscale up --ssh

# From any device on the same tailnet
tailscale ssh youruser@myhostname

# Standard ssh also works — Tailscale intercepts transparently
ssh youruser@myhostname
ssh youruser@100.x.y.z
```

Access control for Tailscale SSH is managed in the [Tailscale ACL editor](https://login.tailscale.com/admin/acls). You can restrict which users can SSH to which machines, require specific source devices, and log all access attempts.

> **Recommendation:** Use `tailscale up --ssh` for your home server instead of running a public-facing `sshd`. Enable `sshd` only for machines that need access from non-Tailscale clients. See the [OpenSSH wiki page](https://docs.shani.dev/doc/networking/openssh) for `sshd` configuration when you do need it.

---

## MagicDNS

When MagicDNS is enabled in the Tailscale admin console (DNS tab), every device on your tailnet gets a DNS hostname in the form `hostname.tailnet-name.ts.net`. Use hostnames instead of IP addresses for everything on your tailnet — connections keep working even if Tailscale assigns a different IP after a re-auth.

```bash
# Enable MagicDNS on this machine
sudo tailscale up --accept-dns=true

# After enabling, reach services by hostname
ssh youruser@shani-server
curl http://shani-server:8096          # Jellyfin
curl http://shani-server:8384          # Syncthing
```

For `.home.local` internal domains, pair MagicDNS with Caddy's internal CA so browsers trust the TLS certificate. See the [Caddy wiki page](https://docs.shani.dev/doc/networking/caddy) for the `tls internal` setup.

---

## Subnet Router

Expose devices on your home LAN that don't have Tailscale installed — NAS boxes, printers, IP cameras, smart home hubs — to all your tailnet devices:

```bash
# 1. On the Shani OS machine connected to your LAN
sudo tailscale up --advertise-routes=192.168.1.0/24

# 2. Enable IP forwarding (required for traffic to pass through)
echo 'net.ipv4.ip_forward = 1' | sudo tee /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf

# 3. Approve the route in the Tailscale admin console:
#    Admin Console → Machines → your machine → Edit route settings → enable the route

# 4. On any other tailnet device — accept the advertised routes
sudo tailscale up --accept-routes
```

After approval, any tailnet device can reach `192.168.1.x` addresses directly through your Shani OS machine.

---

## Exit Node

Route all internet traffic from a travelling device through your home server — useful on untrusted hotel or café Wi-Fi:

```bash
# On your home Shani OS machine — advertise as an exit node
sudo tailscale up --advertise-exit-node

# Enable IP forwarding (same sysctl as subnet router above)
echo 'net.ipv4.ip_forward = 1' | sudo tee /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf

# Approve the exit node in the Tailscale admin console

# On your travelling laptop — use your home server as the exit node
sudo tailscale up --exit-node=shani-server

# Allow LAN access at the destination (so you can still reach local printers etc.)
sudo tailscale up --exit-node=shani-server --exit-node-allow-lan-access=true

# Disable the exit node when back on a trusted network
sudo tailscale up --exit-node=
```

---

## Key Expiry & Persistence

By default, Tailscale device keys expire every 180 days and require re-authentication. For a server you want running indefinitely:

1. Open the [Tailscale admin console](https://login.tailscale.com/admin/machines)
2. Find your Shani OS machine
3. Click **…** → **Disable key expiry**

Because Tailscale state is persisted in `/data/varlib/tailscale`, the machine stays authenticated across every OS update, rollback, and reboot without any action on your part — as long as key expiry is disabled or the key hasn't yet expired.

---

## Access Control Lists (ACLs)

Tailscale's default ACL allows all devices to reach all other devices on the tailnet. Lock this down in the [admin console ACL editor](https://login.tailscale.com/admin/acls) to control exactly who can reach what:

```json
{
  "acls": [
    // Allow your personal devices to reach everything
    {"action": "accept", "src": ["tag:personal"], "dst": ["*:*"]},

    // Allow the home server to accept SSH from personal devices only
    {"action": "accept", "src": ["tag:personal"], "dst": ["tag:server:22"]},

    // Allow the home server to be reached on specific service ports
    {"action": "accept", "src": ["tag:personal"], "dst": ["tag:server:8096,8384,9443"]}
  ],
  "ssh": [
    // Tailscale SSH: personal devices can SSH to servers as any user
    {"action": "accept", "src": ["tag:personal"], "dst": ["tag:server"], "users": ["autogroup:nonroot"]}
  ]
}
```

---

## Firewall

Tailscale works through NAT without any port forwarding. Opening UDP 41641 enables direct peer-to-peer connections and avoids DERP relay servers — improving latency and throughput, but entirely optional:

```bash
sudo firewall-cmd --add-port=41641/udp --permanent
sudo firewall-cmd --reload
```

Tailscale's `tailscale0` interface is automatically placed in the `trusted` firewalld zone on Shani OS — traffic from your tailnet peers is already treated as trusted without additional rules.

---

## Disconnect & Re-authenticate

```bash
# Temporarily disconnect (keeps auth state — reconnects immediately with 'tailscale up')
sudo tailscale down

# Reconnect
sudo tailscale up

# Log out completely — wipes auth state, requires browser login to reconnect
sudo tailscale logout
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `tailscaled` not starting | `sudo systemctl status tailscaled`; check `journalctl -u tailscaled -f` for errors |
| Peer hostname not resolving | Enable MagicDNS in the admin console and run `sudo tailscale up --accept-dns=true`; verify with `tailscale ping hostname` |
| Peer shows as offline but machine is on | Run `tailscale netcheck` — may be using a DERP relay; opening UDP 41641 enables direct connections |
| Subnet routes not working | Confirm the route is approved in the admin console; confirm every accepting device ran `tailscale up --accept-routes`; check IP forwarding with `sysctl net.ipv4.ip_forward` |
| Exit node not routing traffic | Verify IP forwarding is enabled (`cat /proc/sys/net/ipv4/ip_forward` should show `1`); confirm exit node is approved in the admin console |
| Tailscale SSH: permission denied | Check ACL rules in the admin console — the default policy allows all, but a custom ACL may be blocking SSH; add an `ssh` rule for your user/tag |
| Re-authentication required after update | Disable key expiry in the admin console for server machines; Shani OS persists Tailscale state across updates, but an expired key still requires re-auth |
| `tailscale netcheck` shows only DERP, no direct | UDP 41641 may be blocked at your router; add a firewall rule and check router port forwarding settings |
