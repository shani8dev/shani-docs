---
title: Avahi (mDNS)
section: Networking
updated: 2026-04-18
---

# Avahi — Zero-Config mDNS/DNS-SD (Bonjour)

Avahi is **active by default** — your machine is immediately reachable as `hostname.local` on the LAN. It is used by CUPS (printers), KDE Connect, DLNA media servers, and SSH discovery tools.

## Discovering Services

```bash
# Discover all services on the network (live view, Ctrl-C to stop)
avahi-browse -a

# One-shot (exit after listing all found services)
avahi-browse -at

# Filter by service type
avahi-browse _http._tcp    # HTTP services
avahi-browse _ssh._tcp     # SSH servers
avahi-browse _smb._tcp     # Samba shares
avahi-browse _ipp._tcp     # Printers

# Resolve hostnames alongside service discovery
avahi-browse -at -r
```

## Name Resolution

```bash
# Resolve a .local hostname to IP
avahi-resolve --name myhostname.local

# Reverse lookup (IP → hostname)
avahi-resolve --address 192.168.1.50

# Check daemon status
sudo systemctl status avahi-daemon

# Restart after config changes
sudo systemctl restart avahi-daemon
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

Avahi auto-reloads service files from `/etc/avahi/services/` — no daemon restart is needed after adding or editing a file.

## Disabling Avahi (Reduce Attack Surface)

If you do not need `.local` discovery on a given machine:

```bash
sudo systemctl disable --now avahi-daemon
```

> **Note:** Disabling Avahi will prevent CUPS printer auto-discovery and KDE Connect device detection on the LAN.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `hostname.local` not resolving from another machine | Ensure `avahi-daemon` is running; check that your firewall allows UDP 5353 (mDNS) — the `mdns` firewalld service covers this |
| Services not appearing in `avahi-browse -a` | Confirm the remote service publishes via mDNS; some services require explicit Avahi service files |
| Name collision (`hostname-2.local`) | Two devices share the same hostname — rename one via `hostnamectl set-hostname newname` |
| Avahi flooding logs with errors | Check `/etc/nsswitch.conf` — `mdns4_minimal` should appear before `dns` in the `hosts:` line |
