---
title: KDE Connect
section: Networking
updated: 2026-04-18
---

# KDE Connect — Link Desktop and Mobile Devices

KDE Connect integrates your phone (Android/iOS) with your Shani OS desktop over the local network. It is pre-installed on the KDE Plasma edition. Firewall rules are pre-configured in the `public` zone — no manual firewall setup is needed after a fresh install.

Features include: shared clipboard, file transfer, remote input (use your phone as a touchpad/keyboard), notification mirroring, media controls, and running pre-defined remote commands.

---

## Pairing a Device

Install the KDE Connect app on your phone:

- **Android:** [Google Play](https://play.google.com/store/apps/details?id=org.kde.kdeconnect_tp) or [F-Droid](https://f-droid.org/packages/org.kde.kdeconnect_tp/)
- **iOS:** [App Store](https://apps.apple.com/app/kde-connect/id1580245991)

Both devices must be on the same Wi-Fi network. Open **KDE Connect** from the system tray or app launcher — your phone should appear automatically. Click **Pair** and accept the request on the phone.

---

## Command-Line Usage

```bash
# List all discovered devices (paired and unpaired)
kdeconnect-cli --list-devices

# List only reachable paired devices
kdeconnect-cli --list-available

# Pair a device by ID
kdeconnect-cli --pair --device <device_id>

# Send a file to the phone
kdeconnect-cli --share /path/to/file --device <device_id>

# Send a URL or text (opens in default browser/app on phone)
kdeconnect-cli --share https://example.com --device <device_id>

# Ping a device (tests connectivity)
kdeconnect-cli --ping --device <device_id>

# Ring the phone (to find it)
kdeconnect-cli --ring --device <device_id>

# Lock the phone screen
kdeconnect-cli --lock --device <device_id>

# Run a predefined remote command (configured in KDE Connect settings)
kdeconnect-cli --execute-command <command_name> --device <device_id>
```

---

## Manual Device Discovery

If your phone does not appear automatically (e.g., guest Wi-Fi with client isolation):

```bash
# Trigger a refresh scan on the desktop
kdeconnect-cli --refresh
```

On Android: open the KDE Connect app → ⋮ menu → **Add Device by IP** → enter your desktop's IP address.

---

## Firewall

Shani OS pre-configures firewalld rules for KDE Connect at install time. If you need to re-apply them manually:

```bash
# Add KDE Connect service to the public zone
sudo firewall-cmd --permanent --zone=public --add-service=kdeconnect
sudo firewall-cmd --reload

# Or open the raw port range (TCP + UDP 1714–1764)
sudo firewall-cmd --permanent --zone=public --add-port=1714-1764/tcp
sudo firewall-cmd --permanent --zone=public --add-port=1714-1764/udp
sudo firewall-cmd --reload
```

---

## Troubleshooting

```bash
# Check the KDE Connect daemon is running
systemctl --user status kdeconnectd

# Restart the daemon
systemctl --user restart kdeconnectd

# Reset configuration (fixes corrupt pairing state)
systemctl --user stop kdeconnectd
mv ~/.config/kdeconnect ~/.config/kdeconnect.bak
systemctl --user start kdeconnectd

# View live logs
journalctl --user -u kdeconnectd -f
```

| Issue | Solution |
|-------|----------|
| Phone not appearing | Both devices must be on the same subnet; check firewall rules with `sudo firewall-cmd --list-all` — the `kdeconnect` service must appear |
| Pairing request not showing on phone | Dismiss and retry — tap the device name on the desktop to re-send the request |
| File transfer failing | Ensure both devices are paired (not just discovered); check available storage on the phone |
| Clipboard sync not working | The plugin must be enabled on both the desktop (KDE Connect settings) and in the phone app |
