---
title: ModemManager (Mobile Broadband)
section: Networking
updated: 2026-04-18
---

# ModemManager — Mobile Broadband (3G/4G/5G)

ModemManager is pre-installed on Shani OS and integrates with NetworkManager to provide first-class support for USB and PCIe mobile broadband modems and SIM cards. It manages LTE/5G data connections, signal monitoring, and SMS.

When you plug in a supported modem, NetworkManager automatically detects it and creates a Mobile Broadband connection. You can configure the APN and connect entirely from **Settings → Network → Mobile Broadband** without touching the terminal.

---

## Modem Detection & Status

```bash
# List all detected modems
mmcli -L

# Detailed modem info (model, firmware, signal strength, access technology, SIM status)
mmcli -m 0

# Signal strength and quality (request a fresh measurement first)
mmcli -m 0 --signal-setup=5    # start polling every 5 seconds
mmcli -m 0 --signal-get        # read the current measurement

# Show SIM details (IMSI, operator name, phone number)
mmcli -m 0 --sim 0

# Show current bearer / active data connection details
mmcli -m 0 --list-bearers
mmcli -b 0
```

---

## Connecting & Disconnecting

NetworkManager handles connections automatically once you configure an APN. Use these commands for scripting or troubleshooting:

```bash
# List all saved connections (your modem connection appears here)
nmcli connection show

# Bring up a mobile broadband connection
nmcli connection up "Mobile Broadband"

# Bring it down
nmcli connection down "Mobile Broadband"

# Show the active connection's IP, gateway, and DNS
nmcli device show cdc-wdm0
```

### Manual APN Configuration

If auto-detection picks the wrong APN:

```bash
# List available APN profiles for your operator (requires modem to be registered on network)
mmcli -m 0 --3gpp-scan

# Or configure directly via nmcli
nmcli connection modify "Mobile Broadband" \
  gsm.apn "your.operator.apn" \
  gsm.username "" \
  gsm.password ""

nmcli connection up "Mobile Broadband"
```

---

## SMS

SMS support depends on your modem hardware and firmware. Most USB LTE dongles support it; built-in modems vary.

```bash
# Check if SMS is supported by this modem
mmcli -m 0 | grep -i messaging

# List all SMS messages stored on the modem/SIM
mmcli -m 0 --messaging-list-sms

# Read a specific message (use the index from the list above)
mmcli -s 0

# Delete a message
mmcli -s 0 --delete

# Send an SMS
mmcli -m 0 --messaging-create-sms="text=Hello&number=+911234567890"
```

---

## USSD (Carrier Self-Service)

USSD codes let you query your carrier for balance, remaining data, and plan information without calling support:

```bash
# Send a USSD code (replace *123# with your carrier's code)
mmcli -m 0 --3gpp-ussd-initiate="*123#"

# Cancel an ongoing USSD session
mmcli -m 0 --3gpp-ussd-cancel
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Modem not detected (`mmcli -L` shows nothing) | Check `lsusb` or `lspci` — if the kernel sees the hardware, try `sudo modprobe qmi_wwan` or `cdc_mbim` |
| Modem listed but no connection | Verify the APN is correct for your carrier; check `mmcli -m 0` — registration status must show `registered` |
| SIM not detected | Reseat the SIM; check `mmcli -m 0` for PIN lock status — unlock with `mmcli -m 0 --pin=XXXX` |
| Low signal / frequent disconnects | Run `mmcli -m 0 --signal-get` to check signal quality; reposition the modem or antenna |
| SMS not sending | Confirm SMS support: `mmcli -m 0 | grep -i sms`; modem must be registered on a network first |
| ModemManager interfering with a serial GPS | Create `/etc/udev/rules.d/99-mm-ignore-gps.rules` with `ATTRS{idVendor}=="XXXX", ATTRS{idProduct}=="YYYY", ENV{ID_MM_DEVICE_IGNORE}="1"` (replace XX values from `lsusb` output) |
