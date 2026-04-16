---
title: KDE Connect
section: Networking
updated: 2026-04-01
---

# KDE Connect — Link Desktop and Mobile Devices

Integrate your phone (Android/iOS) with your desktop over the local network. Pre-installed on Shanios KDE Plasma. Firewall rules for KDE Connect are pre-configured in the `public` zone.

## Pairing a Device

Install the KDE Connect app on your phone:

- **Android:** [Google Play](https://play.google.com/store/apps/details?id=org.kde.kdeconnect_tp) or [F-Droid](https://f-droid.org/packages/org.kde.kdeconnect_tp/)
- **iOS:** [App Store](https://apps.apple.com/app/kde-connect/id1580245991)

Both devices must be on the same Wi-Fi network. Open **KDE Connect** from the system tray or app launcher — your phone should appear automatically. Click **Pair** and accept the request on the phone.

## Command-Line Usage

```bash
# List discovered devices
kdeconnect-cli --list-devices

# List only reachable (paired) devices
kdeconnect-cli --list-available

# Pair a device by ID
kdeconnect-cli --pair --device <device_id>

# Send a file
kdeconnect-cli --share /path/to/file --device <device_id>

# Send a URL or text
kdeconnect-cli --share https://example.com --device <device_id>

# Ping a device
kdeconnect-cli --ping --device <device_id>

# Ring the phone (to find it)
kdeconnect-cli --ring --device <device_id>

# Lock the phone screen
kdeconnect-cli --lock --device <device_id>

# Run a predefined remote command
kdeconnect-cli --execute-command <command_name> --device <device_id>
```

## Firewall

Shanios pre-configures firewalld rules for KDE Connect at install time. If you need to re-apply them manually:

```bash
# Add KDE Connect service to the public zone
sudo firewall-cmd --permanent --zone=public --add-service=kdeconnect
sudo firewall-cmd --reload

# Or open ports manually (TCP + UDP 1714–1764)
sudo firewall-cmd --permanent --zone=public --add-port=1714-1764/tcp
sudo firewall-cmd --permanent --zone=public --add-port=1714-1764/udp
sudo firewall-cmd --reload
```

## Manual Device Discovery (Same Network, Not Auto-Detected)

```bash
# Add a device by IP address
kdeconnect-cli --refresh

# From the Android app: Menu → Add Device by IP → enter desktop IP
```

## Troubleshooting

```bash
# Check the KDE Connect daemon is running
systemctl --user status kdeconnect

# Restart the daemon
systemctl --user restart kdeconnect

# Reset configuration (fixes corrupt pairing state)
killall kdeconnectd
mv ~/.config/kdeconnect ~/.config/kdeconnect.bak

# View logs
journalctl --user -u kdeconnect -f
```
