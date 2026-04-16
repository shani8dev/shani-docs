---
title: openresolv (DNS)
section: Networking
updated: 2026-04-01
---

# openresolv — DNS Resolution Management

Shanios uses **openresolv** to manage `/etc/resolv.conf`. Instead of any single program owning DNS, openresolv acts as a central broker: NetworkManager, VPN clients (OpenVPN, WireGuard, Tailscale), and dnsmasq all register their nameservers via `resolvconf`, which merges them into a single `/etc/resolv.conf`. DNS "just works" when you connect a VPN or switch networks — no manual editing needed.

> **Note:** Shanios does **not** use `systemd-resolved`. Commands like `resolvectl status` will not work. Use `resolvconf -l` and `cat /etc/resolv.conf` instead.

## Basic Usage

```bash
# View all currently registered nameserver records (one block per interface)
resolvconf -l

# Show the final merged /etc/resolv.conf
cat /etc/resolv.conf

# Force regeneration (useful after manual changes)
sudo resolvconf -u

# See which interfaces have registered DNS
resolvconf -l | grep -E "^\*\*\*"
```

## Manual Registration (Testing)

```bash
# Manually register a nameserver for testing
echo "nameserver 1.1.1.1" | sudo resolvconf -a eth0.test

# Remove the test record
sudo resolvconf -d eth0.test
```

## Configuration

Edit `/etc/resolvconf.conf`:

```bash
# Use dnsmasq as local caching resolver
name_servers=127.0.0.1

# Rotate nameservers for load balancing
resolv_conf_options=rotate

# Reduce per-server timeout
resolv_conf_options=timeout:2

# Don't leak VPN DNS to other interfaces
private_interfaces="tun0 wg0"
```

VPN split DNS (e.g. send `.corp` queries to VPN DNS) is handled automatically when a VPN client registers a domain-specific nameserver — no manual `/etc/resolv.conf` editing required.
