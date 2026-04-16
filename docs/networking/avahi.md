---
title: Avahi (mDNS)
section: Networking
updated: 2026-04-01
---

# Avahi — Zero-Config mDNS/DNS-SD (Bonjour)

Avahi is **active by default** — your machine is immediately reachable as `hostname.local` on the LAN. Used by CUPS (printers), KDE Connect, DLNA, and SSH discovery.

## Discovering Services

```bash
# Discover all services on the network
avahi-browse -a

# One-shot (no live view)
avahi-browse -at

# Filter by service type
avahi-browse _http._tcp    # HTTP services
avahi-browse _ssh._tcp     # SSH servers
avahi-browse _smb._tcp     # Samba shares
avahi-browse _ipp._tcp     # Printers
```

## Name Resolution

```bash
# Resolve a .local hostname to IP
avahi-resolve --name myhostname.local

# Reverse lookup
avahi-resolve --address 192.168.1.50

# Check daemon status
sudo systemctl status avahi-daemon
```

## Publishing a Custom Service

Create `/etc/avahi/services/myservice.service`:

```xml
<?xml version="1.0" standalone='no'?>
<service-group>
  <name>My Web Server</name>
  <service>
    <type>_http._tcp</type>
    <port>8080</port>
  </service>
</service-group>
```

Avahi auto-reloads service files — no restart needed.
