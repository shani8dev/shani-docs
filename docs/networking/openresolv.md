---
title: openresolv (DNS)
section: Networking
updated: 2026-04-18
---

# openresolv — DNS Resolution Management

Shani OS uses **openresolv** to manage `/etc/resolv.conf`. Rather than any single program owning DNS, openresolv acts as a central broker: NetworkManager, VPN clients (OpenVPN, WireGuard, Tailscale), and dnsmasq all register their nameservers via the `resolvconf` command, which merges them into a single consistent `/etc/resolv.conf`. DNS "just works" when you connect a VPN, switch networks, or bring up Tailscale — no manual editing needed.

> **Note:** Shani OS does **not** use `systemd-resolved`. Commands like `resolvectl status` will not work. Use `resolvconf -l` and `cat /etc/resolv.conf` instead.

---

## Basic Inspection

```bash
# Show all currently registered nameserver records (one block per interface)
resolvconf -l

# Show which interfaces have registered DNS
resolvconf -l | grep -E "^\*\*\*"

# Show the final merged /etc/resolv.conf that all programs read
cat /etc/resolv.conf

# Force regeneration after a manual config change
sudo resolvconf -u
```

---

## How It Works

Each interface registers a block of nameserver records when it comes up, and deregisters them when it goes down:

```
*** eth0 ***
nameserver 192.168.1.1

*** tailscale0 ***
nameserver 100.100.100.100
search tailnet-name.ts.net

*** tun0 (OpenVPN) ***
nameserver 10.8.0.1
domain corp.example.com
```

openresolv merges these into `/etc/resolv.conf` according to priority rules in `/etc/resolvconf.conf`. VPN-specific domains are honoured — queries for `*.corp.example.com` go to the VPN's DNS, while all other queries go through your regular upstream.

---

## Manual Registration (Testing)

```bash
# Manually register a nameserver on a test interface
echo "nameserver 1.1.1.1" | sudo resolvconf -a eth0.test

# Remove the test record
sudo resolvconf -d eth0.test

# Regenerate resolv.conf after manual change
sudo resolvconf -u
```

---

## Configuration (`/etc/resolvconf.conf`)

```bash
# Use dnsmasq as a local caching resolver (recommended for performance and custom domains)
# When set, /etc/resolv.conf points to 127.0.0.1 and dnsmasq handles all queries.
# See the dnsmasq wiki page for full dnsmasq configuration details.
name_servers=127.0.0.1

# Rotate among nameservers for load distribution
resolv_conf_options=rotate

# Reduce per-server timeout (faster failover when a server is slow)
resolv_conf_options=timeout:2

# Prevent VPN DNS from leaking to non-VPN interfaces
private_interfaces="tun0 wg0"

# Exclude specific interfaces from DNS registration entirely
# (useful for virtual/container interfaces you don't want affecting global DNS)
# exclude_interfaces="docker0 virbr0"
```

After editing:

```bash
sudo resolvconf -u
cat /etc/resolv.conf  # verify the output
```

---

## Split DNS with VPNs

Split DNS — sending queries for `.corp.example.com` to the VPN's DNS while everything else goes to your regular resolver — is handled automatically. When OpenVPN or WireGuard (via NetworkManager) registers a domain-specific nameserver, openresolv routes matching queries to it without any manual configuration.

Example: your OpenVPN config pushes `dhcp-option DNS 10.8.0.1` and `dhcp-option DOMAIN corp.example.com`. openresolv registers this as:

```
nameserver 10.8.0.1
domain corp.example.com
```

Your system will then resolve `server.corp.example.com` through `10.8.0.1`, while `google.com` continues through your normal DNS — all transparently.

---

## dnsmasq Integration (Local Caching + Custom Domains)

Setting `name_servers=127.0.0.1` in `/etc/resolvconf.conf` routes all DNS queries through a local dnsmasq instance, adding caching and support for custom `.home` domain names. See the [dnsmasq wiki page](https://docs.shani.dev/doc/networking/dnsmasq) for full configuration details.

The key steps are:

```bash
# 1. Enable dnsmasq
sudo systemctl enable --now dnsmasq

# 2. Tell openresolv to use dnsmasq
echo 'name_servers=127.0.0.1' | sudo tee -a /etc/resolvconf.conf

# 3. Regenerate /etc/resolv.conf
sudo resolvconf -u
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `resolvectl status` shows nothing | Shani OS uses openresolv, not systemd-resolved — use `resolvconf -l` and `cat /etc/resolv.conf` instead |
| DNS stops working after VPN disconnects | Run `sudo resolvconf -u` to force regeneration; check `resolvconf -l` to see if stale records remain |
| VPN DNS not being used for corporate hostnames | Check that your VPN config pushes a domain suffix; verify with `resolvconf -l | grep domain` after connecting |
| `/etc/resolv.conf` shows only 127.0.0.1 | This is correct when dnsmasq is set as `name_servers=127.0.0.1`; check that dnsmasq is running: `systemctl status dnsmasq` |
| Tailscale MagicDNS not resolving | Confirm `tailscale0` appears in `resolvconf -l`; ensure `--accept-dns=true` was passed to `tailscale up` |
| DNS slow after switching networks | Enable dnsmasq as a local cache (`name_servers=127.0.0.1`) to avoid cold-start latency on every lookup |
