---
title: ModemManager (Mobile)
section: Networking
updated: 2026-04-01
---

# ModemManager — Mobile Broadband (3G/4G/5G)

ModemManager is pre-installed and integrates with NetworkManager for USB/PCIe mobile broadband modems and SIM cards. Manages LTE/5G connections, SMS, and signal monitoring.

## Modem Status

```bash
# List detected modems
mmcli -L

# Detailed modem info (signal, tech, SIM)
mmcli -m 0

# Signal strength
mmcli -m 0 --signal-get
```

## Connecting

NetworkManager auto-detects the modem. Configure the APN in **Settings → Network → Mobile Broadband**, then:

```bash
# List all connections (modem connection will appear here)
nmcli connection show

# Connect
nmcli connection up "Mobile Broadband"
```

## SMS (if supported by modem)

```bash
# List SMS messages
mmcli -m 0 --messaging-list-sms

# Read a message
mmcli -s 0

# Send an SMS
mmcli -m 0 --messaging-create-sms="text=Hello&number=+1234567890"
```
