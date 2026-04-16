---
title: Firewall (firewalld)
section: Networking
updated: 2026-04-01
---

# Firewall (firewalld)

Active by default with restrictive rules. Manages nftables under the hood using a zone-based model. Pre-configured zones for KDE Connect and Waydroid are included.

## Status & Inspection

```bash
# Check firewall state
sudo firewall-cmd --state

# List rules for the active zone
sudo firewall-cmd --list-all

# List all zones
sudo firewall-cmd --list-all-zones
```

## Opening Services & Ports

```bash
# Open a named service
sudo firewall-cmd --add-service=http --permanent
sudo firewall-cmd --add-service=https --permanent
sudo firewall-cmd --add-service=ssh --permanent
sudo firewall-cmd --reload

# Open a specific port
sudo firewall-cmd --add-port=8080/tcp --permanent
sudo firewall-cmd --add-port=41641/udp --permanent  # Tailscale
sudo firewall-cmd --reload

# Remove a rule
sudo firewall-cmd --remove-service=http --permanent
sudo firewall-cmd --remove-port=8080/tcp --permanent
sudo firewall-cmd --reload
```

## Rich Rules (Advanced)

```bash
# Allow SSH only from LAN
sudo firewall-cmd --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" service name="ssh" accept' --permanent
sudo firewall-cmd --reload

# Block a specific IP
sudo firewall-cmd --add-rich-rule='rule family="ipv4" source address="1.2.3.4" reject' --permanent
sudo firewall-cmd --reload
```

## GUI

```bash
# Open the graphical firewall manager (pre-installed)
sudo firewall-config
```
