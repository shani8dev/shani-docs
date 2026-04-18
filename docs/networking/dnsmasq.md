---
title: dnsmasq (Local DNS)
section: Networking
updated: 2026-04-18
---

# dnsmasq — Local DNS, DHCP & Split DNS

dnsmasq is a lightweight DNS forwarder, local caching resolver, and DHCP server — ideal for homelab setups. Use it for custom `.home` domains, split DNS (different resolution for LAN vs internet), local ad-blocking, or caching DNS responses to speed up lookups. It integrates with openresolv so VPN and Tailscale DNS still work correctly alongside it.

**Not active by default.** Enable it when you want local domain names, faster DNS, or DHCP control on your LAN.

---

## Enable dnsmasq

```bash
sudo systemctl enable --now dnsmasq
```

To integrate with openresolv so all programs use dnsmasq as their resolver, set `name_servers=127.0.0.1` in `/etc/resolvconf.conf`, then run `sudo resolvconf -u`. See the [openresolv wiki page](https://docs.shani.dev/doc/networking/openresolv) for details.

---

## Configuration

Edit `/etc/dnsmasq.conf`. The file uses `key=value` syntax — lines starting with `#` are comments.

```ini
# ── Upstream resolvers ────────────────────────────────────────────────────────
# Forward all unresolved queries to these DNS servers
server=1.1.1.1
server=8.8.8.8

# Don't forward single-label names (e.g. "nas" without a dot) upstream
domain-needed

# Don't forward reverse lookups for private IP ranges upstream
bogus-priv

# ── Custom local hostnames ────────────────────────────────────────────────────
address=/nas.home/192.168.1.10
address=/printer.home/192.168.1.20
address=/desktop.home/192.168.1.50

# ── DHCP server (optional) ───────────────────────────────────────────────────
# Uncomment to have dnsmasq serve DHCP on your LAN
# dhcp-range=192.168.1.100,192.168.1.200,12h
# dhcp-option=3,192.168.1.1          # default gateway
# dhcp-option=6,192.168.1.1          # DNS server (point clients to dnsmasq itself)

# Static DHCP leases (assign a fixed IP by MAC address)
# dhcp-host=aa:bb:cc:dd:ee:ff,nas,192.168.1.10

# ── Ad / tracker blocking ─────────────────────────────────────────────────────
# Return 0.0.0.0 for these domains instead of resolving them
address=/ads.doubleclick.net/0.0.0.0
address=/tracking.example.com/0.0.0.0

# Or load a hosts-format blocklist file:
# addn-hosts=/etc/dnsmasq-blocklist.hosts

# ── Cache ─────────────────────────────────────────────────────────────────────
# Number of DNS entries to cache (default: 150; max: 10000)
cache-size=1000
```

Apply changes:

```bash
sudo systemctl restart dnsmasq
```

---

## Firewall

If other machines on your LAN should use this machine as their DNS server, open port 53:

```bash
sudo firewall-cmd --add-service=dns --permanent
sudo firewall-cmd --reload
```

> dnsmasq listens on all interfaces by default. To restrict it to a specific interface, add `interface=eth0` (or your LAN interface) to `/etc/dnsmasq.conf`.

---

## Testing

```bash
# Query dnsmasq directly
dig @127.0.0.1 nas.home

# Check a local custom address
nslookup nas.home 127.0.0.1

# Confirm dnsmasq is listening
ss -ulnp | grep 53

# Watch dnsmasq query log (enable logging first: add 'log-queries' to config)
sudo journalctl -u dnsmasq -f
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| dnsmasq won't start | Check for syntax errors: `sudo dnsmasq --test`; inspect `journalctl -u dnsmasq` |
| Port 53 already in use | Another resolver (e.g. `systemd-resolved`) is running — Shani OS does not use `systemd-resolved`, so check for stray processes: `ss -ulnp | grep :53` |
| Custom hostnames not resolving | Confirm dnsmasq is the active resolver (`cat /etc/resolv.conf` should show `127.0.0.1`); run `dig @127.0.0.1 myhost.home` to test directly |
| VPN DNS stops working after enabling dnsmasq | Ensure openresolv integration is set up (`name_servers=127.0.0.1` in `/etc/resolvconf.conf`) — dnsmasq receives upstream servers from openresolv and handles split DNS automatically |
| DHCP leases not assigned | Check that no other DHCP server is active on the same subnet (usually your router); verify `dhcp-range` is uncommented and the interface is correct |
