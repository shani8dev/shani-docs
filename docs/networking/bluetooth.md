---
title: Bluetooth
section: Networking
updated: 2026-08-28
---

# Bluetooth

Shanios pre-installs the full BlueZ stack (`shani-bluetooth`) and enables the Bluetooth daemon by default on every edition — pairing works out of the box with no setup.

## What's Pre-Installed

- **bluez** / **bluez-utils** — the core Bluetooth protocol stack and CLI tools (`bluetoothctl`)
- **bluez-obex** — OBEX file transfer support (sending/receiving files over Bluetooth)
- **bluez-mesh** — Bluetooth Mesh networking support
- **bluez-hid2hci** — HID-to-HCI mode switching for some older Bluetooth mice/keyboards that boot in a legacy USB-HID compatibility mode
- **bluez-cups** — lets Bluetooth-connected printers register with CUPS (see [Printing & Scanning](../system/printing.md))
- **bluez-tools** — additional CLI utilities (`bt-adapter`, `bt-agent`, `bt-obex`)

`bluetooth.service` is enabled and running from first boot.

## Pairing a Device — GUI

**GNOME:** Settings → Bluetooth → toggle on, select the device, click **Pair**.
**KDE Plasma:** System Settings → Bluetooth → select the device → **Pair**. Plasma's Bluetooth applet (`bluedevil`) also shows a pairing notification automatically when a device is discoverable nearby.

## Pairing a Device — CLI

```bash
# Enter the interactive bluetoothctl shell
bluetoothctl

# Inside bluetoothctl:
power on
agent on
default-agent
scan on
# Wait for your device to appear, then note its MAC address
pair XX:XX:XX:XX:XX:XX
trust XX:XX:XX:XX:XX:XX
connect XX:XX:XX:XX:XX:XX
scan off
exit
```

```bash
# Non-interactive one-liners (same effect)
bluetoothctl power on
bluetoothctl scan on &
bluetoothctl pair XX:XX:XX:XX:XX:XX
bluetoothctl trust XX:XX:XX:XX:XX:XX
bluetoothctl connect XX:XX:XX:XX:XX:XX
```

## Managing Devices

```bash
# List paired devices
bluetoothctl devices

# List currently connected devices
bluetoothctl devices Connected

# Check adapter and device info
bluetoothctl show
bluetoothctl info XX:XX:XX:XX:XX:XX

# Disconnect without unpairing
bluetoothctl disconnect XX:XX:XX:XX:XX:XX

# Remove a paired device entirely
bluetoothctl remove XX:XX:XX:XX:XX:XX

# Enable/disable the adapter
bluetoothctl power off
bluetoothctl power on
```

## Audio Devices

Bluetooth headphones/speakers route through PipeWire once paired — see [Audio (PipeWire)](../system/audio.md) for switching the default output device and troubleshooting sound quality. Most modern Bluetooth audio codecs (aptX, LDAC, LC3) are supported out of the box via the pre-installed `libldac`/`liblc3`/`libfreeaptx` libraries.

```bash
# Confirm the Bluetooth device appears as an audio sink
pactl list sinks short | grep -i bluez

# Set it as the default output
pactl set-default-sink bluez_output.XX_XX_XX_XX_XX_XX.1
```

## File Transfer (OBEX)

```bash
# Send a file to a paired phone
bluetoothctl connect XX:XX:XX:XX:XX:XX
obexftp -b XX:XX:XX:XX:XX:XX -B 10 -p file.jpg   # requires obexftp, not pre-installed
```

Most desktop environments also support drag-and-drop file sending directly from the Bluetooth settings panel once a device is paired and marked as trusted.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Adapter not found | `rfkill list` — check Bluetooth isn't blocked; `rfkill unblock bluetooth` if it is |
| Device won't pair | Remove any stale pairing first: `bluetoothctl remove XX:XX:XX:XX:XX:XX`, then retry; make sure the device is in pairing/discoverable mode |
| Paired but won't connect | `sudo systemctl restart bluetooth`; check `journalctl -u bluetooth -n 30` for the actual error |
| Headphones connected but no audio | See [Audio (PipeWire)](../system/audio.md)'s Bluetooth section — usually a default-sink or codec negotiation issue |
| Mouse/keyboard connects but doesn't work | Some older HID devices need `bluez-hid2hci` mode switching — confirmed pre-installed; try re-pairing after a fresh boot |
| Bluetooth works then disappears after suspend | `sudo systemctl restart bluetooth` after resume; check for a known adapter-specific suspend bug via `dmesg \| grep -i bluetooth` |

## See Also

- [Audio (PipeWire)](../system/audio.md) — Bluetooth audio device switching and codec issues
- [Hardware](../system/hardware.md) — general USB/wireless device detection
- [Printing & Scanning](../system/printing.md) — Bluetooth-connected printers via `bluez-cups`
