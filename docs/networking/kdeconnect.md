---
title: KDE Connect
section: Networking
updated: 2026-08-28
---

# KDE Connect — Link Desktop and Mobile Devices

KDE Connect integrates your phone (Android/iOS) with your Shani OS desktop over the local network. It's pre-installed on the **KDE Plasma** edition natively (`kdeconnect`) and on the **GNOME** edition via **GSConnect** (a GNOME Shell extension implementing the same KDE Connect protocol). COSMIC users can run KDE Connect inside Distrobox or via `nix-env -iA nixpkgs.kdeconnect`. Firewall rules are pre-configured in the `public` zone on all desktop editions — no manual firewall setup is needed after a fresh install.

Features include: shared clipboard, file transfer, remote input (use your phone as a touchpad/keyboard), notification mirroring, media controls, and running pre-defined remote commands. GSConnect's feature set closely mirrors native KDE Connect, though a few advanced features (custom remote commands, some plugin settings) are more limited in its GNOME Extensions preferences UI than in KDE's System Settings module.

---

## Pairing a Device

Install the KDE Connect app on your phone:

- **Android:** [Google Play](https://play.google.com/store/apps/details?id=org.kde.kdeconnect_tp) or [F-Droid](https://f-droid.org/packages/org.kde.kdeconnect_tp/)
- **iOS:** [App Store](https://apps.apple.com/app/kde-connect/id1580245991)

Both devices must be on the same Wi-Fi network.

**KDE Plasma:** Open **KDE Connect** from the system tray or app launcher — your phone should appear automatically. Click **Pair** and accept the request on the phone.

**GNOME (GSConnect):** Open the **GSConnect** icon from the top bar (or Settings → GSConnect if you don't see it), enable it if prompted, and your phone should appear automatically. Click on the device, then **Pair**, and accept the request on the phone. If the icon isn't visible, check that the extension is enabled in the **Extensions** app (pre-installed).

---

## Command-Line Usage

`kdeconnect-cli` is part of the native `kdeconnect` package (KDE Plasma only) — GSConnect on GNOME does not provide this or any equivalent CLI; use its GUI (top bar icon, or Settings → GSConnect) for all device management.

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

**KDE Plasma** runs KDE Connect as a user service:

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

**GNOME (GSConnect)** runs inside the GNOME Shell process itself — there's no separate systemd unit to restart. Instead:

```bash
# Restart GNOME Shell (X11 only — logs you out on Wayland)
# On Wayland, log out and back in instead
Alt+F2, type 'r', Enter

# Reset configuration (fixes corrupt pairing state)
rm -rf ~/.cache/gsconnect
gsettings reset-recursively org.gnome.shell.extensions.gsconnect

# View live logs
journalctl --user -f | grep -i gsconnect
```

| Issue | Solution |
|-------|----------|
| Phone not appearing | Both devices must be on the same subnet; check firewall rules with `sudo firewall-cmd --list-all` — the `kdeconnect` service must appear |
| Pairing request not showing on phone | Dismiss and retry — tap the device name on the desktop to re-send the request |
| File transfer failing | Ensure both devices are paired (not just discovered); check available storage on the phone |
| Clipboard sync not working | The plugin must be enabled on both the desktop (KDE Connect settings, or GSConnect's device preferences) and in the phone app |
| GSConnect icon missing from top bar (GNOME) | Open the **Extensions** app and confirm GSConnect is toggled on |

## See Also

- [Bluetooth](bluetooth)
- [KDE Connect blog guide](https://blog.shani.dev/post/shani-os-kde-connect)
