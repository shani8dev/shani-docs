---
title: dnsmasq (Local DNS)
section: Networking
updated: 2026-04-01
---

# dnsmasq — Local DNS, DHCP & Split DNS

Lightweight DNS forwarder and DHCP server for homelab setups. Use it for custom `.home` domains, split DNS (different resolution for LAN vs internet), or local ad-blocking. **Not active by default.**

## Enable dnsmasq

```bash
sudo systemctl enable --now dnsmasq
```

## Configuration

Edit `/etc/dnsmasq.conf`:

```bash
# Custom local hostnames
address=/nas.home/192.168.1.10
address=/printer.home/192.168.1.20
address=/desktop.home/192.168.1.50

# Upstream DNS servers
server=1.1.1.1
server=8.8.8.8

# Local DHCP range (if dnsmasq acts as DHCP server)
dhcp-range=192.168.1.100,192.168.1.200,12h
dhcp-option=3,192.168.1.1   # default gateway

# Block trackers/ads
address=/ads.doubleclick.net/0.0.0.0
```

```bash
# Apply changes
sudo systemctl restart dnsmasq

# Integrate with openresolv — dnsmasq registers itself as the resolver
# /etc/resolvconf.conf:
# name_servers=127.0.0.1
# resolvconf=YES

sudo resolvconf -u   # regenerate /etc/resolv.conf
```
