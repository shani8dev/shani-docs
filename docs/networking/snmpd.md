---
title: snmpd (SNMP)
section: Networking
updated: 2026-04-18
---

# SNMP Daemon (snmpd)

The Simple Network Management Protocol daemon allows your Shani OS machine to be monitored by external systems such as Zabbix, Nagios, LibreNMS, or PRTG. It is pre-installed.

> ⚠️ **Security:** SNMPv2c transmits the community string in plaintext — anyone on the network can read it with a packet capture. Use SNMPv3 with authentication and privacy for any network that is not fully trusted.

---

## Configuration

Edit `/etc/snmp/snmpd.conf`:

### SNMPv2c (LAN / trusted networks only)

```ini
# Listen on all interfaces (UDP)
agentAddress udp:161,udp6:[::1]:161

# Read-only access for the LAN using community string "public"
# Replace "public" with something less guessable
rocommunity mycommstring 192.168.1.0/24

# System identification
sysContact  admin@example.com
sysLocation Server Room A
sysName     shanios-server

# Extend monitoring: expose CPU, memory, disk
extend .1.3.6.1.4.1.2021.10 cpu /bin/cat /proc/loadavg
```

### SNMPv3 (recommended for any non-trivial deployment)

```bash
# Stop snmpd before adding users
sudo systemctl stop snmpd

# Create an SNMPv3 user with authentication (SHA) and privacy (AES)
sudo net-snmp-create-v3-user \
  -ro \
  -A "MyAuthPassword" \
  -a SHA \
  -X "MyPrivPassword" \
  -x AES \
  monitoruser

# Start snmpd again
sudo systemctl start snmpd
```

Then restrict community access in `/etc/snmp/snmpd.conf`:

```ini
# Disable v2c community access (comment out or remove rocommunity lines)
# rocommunity public ...

# SNMPv3 user is added automatically by net-snmp-create-v3-user
# Optionally restrict which OIDs the user can access:
view systemview included .1.3.6.1.2.1.1
view systemview included .1.3.6.1.2.1.25
rouser monitoruser priv -V systemview
```

---

## Enable & Firewall

```bash
# Enable and start snmpd
sudo systemctl enable --now snmpd

# Open UDP 161 — restrict to your LAN or monitoring host
sudo firewall-cmd --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" port port="161" protocol="udp" accept' --permanent
sudo firewall-cmd --reload
```

---

## Testing

```bash
# Test SNMPv2c from the local machine
snmpwalk -v2c -c mycommstring localhost sysDescr

# Query a specific OID (uptime)
snmpget -v2c -c mycommstring localhost .1.3.6.1.2.1.1.3.0

# Test SNMPv3 from a remote machine
snmpwalk -v3 -l authPriv \
  -u monitoruser \
  -A "MyAuthPassword" -a SHA \
  -X "MyPrivPassword" -x AES \
  192.168.1.100 sysDescr

# Walk the entire MIB tree (verbose — good for verifying what's exposed)
snmpwalk -v2c -c mycommstring localhost .1
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Timeout: No Response from localhost` | Check `systemctl status snmpd`; confirm it's listening: `ss -ulnp | grep 161` |
| `No Such Object` for an OID | The MIB or extension for that OID may not be loaded; check that `snmpd.conf` includes the relevant `extend` or `pass` directive |
| Remote monitoring host can't reach snmpd | Check the firewall rule allows the monitoring host's IP; verify with `sudo firewall-cmd --list-all` |
| `authorizationError` with SNMPv3 | Auth or privacy password mismatch — recreate the user with `net-snmp-create-v3-user` after stopping snmpd |
| View snmpd logs | `journalctl -u snmpd -f` |
