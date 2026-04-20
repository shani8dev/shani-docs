---
title: arpwatch (ARP Monitor)
section: Networking
updated: 2026-04-20
---

# arpwatch — ARP Activity Monitor

arpwatch monitors Ethernet ARP traffic and maintains a database of IP-to-MAC address mappings. It sends an email alert (via the local MTA) when a new device appears on the network, when a known device changes its MAC address, or when an IP address flips between two MAC addresses — all indicators of network changes that may warrant attention (new devices, DHCP lease changes, or potential ARP spoofing).

arpwatch is pre-installed on Shani OS. **Not active by default.**

---

## Enable

```bash
# Enable monitoring on your primary LAN interface (replace eth0 with yours)
sudo systemctl enable --now arpwatch@eth0

# If you have multiple interfaces
sudo systemctl enable --now arpwatch@wlan0

# Check status
systemctl status arpwatch@eth0

# Watch logs
journalctl -u arpwatch@eth0 -f
```

---

## Configuration

Default behaviour is to send email reports to `root`. Forward root's mail to a real address via `/etc/aliases` (see the [Exim page](https://docs.shani.dev/doc/networking/exim)).

The ARP database for each interface is stored at `/var/lib/arpwatch/<interface>.dat`.

### Customise Per-Interface Options

Create a drop-in override for the interface unit:

```bash
sudo systemctl edit arpwatch@eth0
```

Add options via `ARPWATCH_ARGS`:

```ini
[Service]
Environment=ARPWATCH_ARGS="-m admin@example.com -n 192.168.1.0/24"
```

Common flags:

| Flag | Effect |
|------|--------|
| `-m address` | Send reports to this email address instead of root |
| `-n network/prefix` | Only watch this subnet (ignore others) |
| `-N` | Disable email entirely (log-only mode) |
| `-p` | Disable promiscuous mode (only watch traffic to/from this machine) |
| `-u user` | Drop privileges to this user after starting |

---

## Database Management

```bash
# View the current IP→MAC database
sudo cat /var/lib/arpwatch/eth0.dat

# Format: MAC  IP  timestamp  hostname
# Example:
# aa:bb:cc:dd:ee:ff  192.168.1.50  1713600000  desktop.home.local

# Clear the database (triggers "new activity" alerts for all devices on next run)
sudo truncate -s 0 /var/lib/arpwatch/eth0.dat
sudo systemctl restart arpwatch@eth0
```

---

## Log Events

arpwatch logs to syslog and via the systemd journal. Event types:

| Event | Meaning |
|-------|---------|
| `new activity` | First time this IP+MAC pair is seen |
| `new station` | New MAC address never seen before |
| `changed ethernet address` | A known IP now has a different MAC — possible ARP spoof or DHCP change |
| `flip flop` | An IP is alternating between two MACs |
| `reused old ethernet address` | A MAC that was previously associated with a different IP is back |

```bash
# See all arpwatch events
journalctl -u arpwatch@eth0 --no-pager | grep -E "new|changed|flip"
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No events appearing | Confirm the correct interface name — run `ip link` to list interfaces; arpwatch only processes traffic it can see |
| Email alerts not arriving | Ensure Exim (or another MTA) is running and root's mail is forwarded — see the [Exim page](https://docs.shani.dev/doc/networking/exim) |
| Too many "new activity" alerts on first run | Normal — arpwatch builds its database from scratch; alerts settle after all known devices have been seen once |
| `changed ethernet address` for a trusted device | Mobile devices use MAC randomisation by default — disable randomisation for that device on your router/AP, or accept the alerts |
