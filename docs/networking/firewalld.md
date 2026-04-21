---
title: Firewall (firewalld)
section: Networking
updated: 2026-04-20
---

# Firewall (firewalld)

firewalld is **active by default** on Shani OS with a restrictive inbound policy. It manages nftables under the hood using a zone-based model — every interface belongs to a zone, and each zone has its own allow/deny rules. Do not mix direct `nft` commands with firewalld rules as they will conflict.

Pre-configured zones for KDE Connect, GSConnect, Waydroid, and Tailscale are included out of the box.

| Zone | Default assignment | Policy |
|------|--------------------|--------|
| `public` | All physical NICs | Deny inbound, allow outbound |
| `trusted` | `waydroid0` | Accept all |

---

## Status & Inspection

```bash
# Confirm firewall is running
sudo firewall-cmd --state

# Show all rules for the active zone
sudo firewall-cmd --list-all

# Show all zones with their rules
sudo firewall-cmd --list-all-zones

# Show active zones and their interfaces
sudo firewall-cmd --get-active-zones

# Show which zone an interface belongs to
sudo firewall-cmd --get-zone-of-interface=eth0

# Show the default zone
sudo firewall-cmd --get-default-zone
```

---

## Opening Services & Ports

The `--permanent` flag writes the rule to disk so it survives reboots. Always follow with `--reload` to apply immediately to the running firewall.

```bash
# Allow a named service (uses built-in service definitions)
sudo firewall-cmd --add-service=http --permanent
sudo firewall-cmd --add-service=https --permanent
sudo firewall-cmd --add-service=ssh --permanent
sudo firewall-cmd --reload

# Allow a specific TCP/UDP port
sudo firewall-cmd --add-port=8080/tcp --permanent
sudo firewall-cmd --add-port=51820/udp --permanent   # WireGuard
sudo firewall-cmd --add-port=41641/udp --permanent   # Tailscale
sudo firewall-cmd --reload

# Remove a rule
sudo firewall-cmd --remove-service=http --permanent
sudo firewall-cmd --remove-port=8080/tcp --permanent
sudo firewall-cmd --reload

# List all available pre-defined service names
sudo firewall-cmd --get-services
```

---

## Zones

Zones let you apply different rules to different network interfaces or source IP ranges — useful when a LAN interface and a VPN interface should have different trust levels.

```bash
# Move an interface to a different zone
sudo firewall-cmd --zone=trusted --change-interface=tailscale0 --permanent
sudo firewall-cmd --reload

# Add a source IP range to a zone (all traffic from that range uses that zone's rules)
sudo firewall-cmd --zone=trusted --add-source=192.168.1.0/24 --permanent
sudo firewall-cmd --reload

# Create a custom zone
sudo firewall-cmd --new-zone=homelab --permanent
sudo firewall-cmd --reload
sudo firewall-cmd --zone=homelab --add-service=http --permanent
sudo firewall-cmd --reload
```

---

## Rich Rules

Rich rules allow more granular conditions — source IP, destination port, logging, and rate limiting.

```bash
# Allow SSH only from your LAN
sudo firewall-cmd --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" service name="ssh" accept' --permanent

# Block a specific IP entirely
sudo firewall-cmd --add-rich-rule='rule family="ipv4" source address="1.2.3.4" reject' --permanent

# Rate-limit new connections to port 443
sudo firewall-cmd --add-rich-rule='rule service name="https" limit value="50/m" accept' --permanent

# Log and drop traffic from a subnet
sudo firewall-cmd --add-rich-rule='rule family="ipv4" source address="10.0.0.0/8" log prefix="BLOCKED: " level="warning" drop' --permanent

sudo firewall-cmd --reload
```

---

## Port Forwarding

```bash
# Forward incoming port 80 to localhost:8080
sudo firewall-cmd --add-forward-port=port=80:proto=tcp:toport=8080:toaddr=127.0.0.1 --permanent
sudo firewall-cmd --reload
```

---

## Logging

```bash
# Enable logging of dropped packets
sudo firewall-cmd --set-log-denied=all --permanent
sudo firewall-cmd --reload

# View firewall-related kernel messages
sudo journalctl -k | grep -i "nft\|firewall\|REJECT\|DROP"
```

---

## Runtime vs Permanent

```bash
# Show rules currently active (runtime)
sudo firewall-cmd --list-all

# Show what will be active after the next reload (permanent config on disk)
sudo firewall-cmd --list-all --permanent

# Sync runtime to match permanent config
sudo firewall-cmd --reload

# Make the current runtime config permanent without re-running each command
sudo firewall-cmd --runtime-to-permanent
```

Omit `--permanent` to test a rule without committing it — it disappears on the next `--reload` or reboot.

---

## GUI

```bash
# Launch the graphical firewall manager (pre-installed)
sudo firewall-config
```

---

## Common Port Reference

| Service | Port | Protocol |
|---------|------|----------|
| SSH | 22 | TCP |
| HTTP | 80 | TCP |
| HTTPS | 443 | TCP |
| DNS | 53 | TCP/UDP |
| WireGuard | 51820 | UDP |
| Tailscale | 41641 | UDP |
| Syncthing | 22000 | TCP/UDP |
| KDE Connect | 1714–1764 | TCP/UDP |
| Minecraft | 25565 | TCP |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Service reachable locally but not from LAN | Check `--list-all` to confirm the port/service is open; verify the interface is in the correct zone |
| Rule added but not working | Did you forget `--reload`? Runtime and permanent configs can diverge |
| `ALREADY_ENABLED` error | The rule already exists permanently; inspect with `--list-all --permanent` |
| Port open but connection refused | The service itself may not be running; check `systemctl status <service>` |
| Rules disappear after reboot | Rule was added without `--permanent` |
| fail2ban bans not appearing in firewall | Confirm fail2ban's backend is `firewalld`; check `sudo firewall-cmd --direct --get-all-rules` |
| Waydroid has no network | Check `waydroid0` is in the trusted zone: `sudo firewall-cmd --get-zone-of-interface=waydroid0` |
| Podman/container networking broken | Add the container bridge to trusted: `sudo firewall-cmd --zone=trusted --add-interface=podman0 --permanent` |

---

## See Also

- [fail2ban](fail2ban) — brute-force protection layered on top of the firewall
- [WireGuard](wireguard) — opening the WireGuard UDP port
- [Security Features](features) — overview of all security layers
