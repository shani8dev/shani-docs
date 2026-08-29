---
title: iptables and nftables Basics
section: Networking
updated: 2026-08-28
---

> **Part of the Networking & Infrastructure series:** See [all networking docs](../networking)

## iptables and nftables Basics

Firewalld (used throughout this wiki) is a high-level interface over `nftables` on modern Linux. Understanding the underlying layer helps when debugging unexpected traffic behaviour.

```bash
# List all current nft rules (the native tool on modern systems)
sudo nft list ruleset

# List iptables rules with packet/byte counts (legacy view of nftables)
sudo iptables -L -n -v
sudo iptables -t nat -L -n -v    # NAT rules — important for container port forwarding

# Show firewalld zones and their services
sudo firewall-cmd --list-all
sudo firewall-cmd --list-all-zones

# Temporarily allow a port (lost on next firewalld reload)
sudo firewall-cmd --add-port=8080/tcp

# Permanently allow a port
sudo firewall-cmd --permanent --add-port=8080/tcp && sudo firewall-cmd --reload

# Trace a packet through iptables (debug mode)
sudo iptables -t raw -A PREROUTING -p tcp --dport 8080 -j TRACE
sudo journalctl -k | grep TRACE   # see which rules the packet hits
sudo iptables -t raw -D PREROUTING -p tcp --dport 8080 -j TRACE  # remove when done
```

---



---

## See Also

- [Networking & Infrastructure](networking) — overview
