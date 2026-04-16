---
title: snmpd
section: Networking
updated: 2026-04-16
---

# SNMP Daemon (snmpd)

The Simple Network Management Protocol (SNMP) daemon allows your Shanios machine to be monitored by external systems like Zabbix, Nagios, or PRTG.

## Setup

### Configuration
Edit `/etc/snmp/snmpd.conf`:
```bash
# Listen on all interfaces
agentAddress udp:161,udp6:[::1]:161

# Access Control
# rocommunity <community_string> <source_network>
rocommunity public 192.168.1.0/24

# System Info
sysContact admin@example.com
sysLocation Server Room A
```

### Management
```bash
# Enable service
sudo systemctl enable --now snmpd

# Firewall (UDP 161)
sudo firewall-cmd --add-port=161/udp --permanent
sudo firewall-cmd --reload
```

## Testing
From the server or a monitoring tool:
```bash
snmpwalk -v2c -c public localhost sysDescr
```
> ⚠️ **Security:** SNMP v2c sends the "community string" in plaintext. For production environments, configure SNMPv3 with authentication and encryption in `/etc/snmp/snmpd.conf`.
