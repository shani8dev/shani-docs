---
title: Remote Desktop
section: Networking
updated: 2026-04-18
---

# Remote Desktop — RDP & VNC

Shani OS includes both client and server tools for graphical remote desktop access. All tools are pre-installed.

---

## Client — Connect to a Remote Desktop

### FreeRDP (RDP Client)

Connect to Windows machines or any RDP-capable server:

```bash
# Basic RDP connection
xfreerdp /v:192.168.1.100 /u:username /p:password /dynamic-resolution /gfx /rfx

# Full-screen, multi-monitor
xfreerdp /v:server.example.com /u:me /f /multimon

# RDP over SSH tunnel (recommended for untrusted networks)
ssh -L 3389:192.168.1.100:3389 jumphost &
xfreerdp /v:localhost /u:username
```

### VNC Client

Any VNC viewer can connect to a VNC server:

```bash
vncviewer hostname:5900
```

---

## Server — Share Your Desktop

### KDE Edition: kRDP (RDP Server)

Enable in **Settings → System → Remote Desktop → Enable Remote Desktop**.

```bash
# Or enable via systemd
systemctl --user enable --now plasma-remotedesktop
```

Once enabled, your desktop is accessible from Windows **Remote Desktop Connection** or any RDP client using your machine's IP address.

### KDE Edition: krfb (VNC Server)

```bash
# Enable the VNC server
systemctl --user enable --now krfb

# Connect from any VNC viewer
vncviewer hostname:5900
```

krfb can also be configured to prompt for permission each time someone connects — enable this in **System Settings → Remote Desktop → Ask for confirmation**.

### GNOME Edition: gnome-remote-desktop

Pre-installed on the GNOME edition. Enable in **Settings → Sharing → Remote Desktop**.

```bash
# Enable RDP and set credentials
grdctl rdp enable
grdctl rdp set-credentials username password

# Check status
grdctl status
```

Supports both RDP and VNC protocols simultaneously.

---

## Firewall

Open the required ports if you are accepting remote desktop connections:

```bash
# RDP (port 3389)
sudo firewall-cmd --add-service=rdp --permanent

# VNC (port 5900; adjust if using a different display number)
sudo firewall-cmd --add-port=5900/tcp --permanent

sudo firewall-cmd --reload
```

> **Security:** Avoid exposing RDP or VNC directly to the internet. Instead, connect via Tailscale or tunnel over SSH (`ssh -L 3389:localhost:3389 yourserver`). See the [OpenSSH wiki page](https://docs.shani.dev/doc/networking/openssh) for SSH tunnel details.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Cannot connect (connection refused) | Check that the server service is running: `systemctl --user status plasma-remotedesktop` or `grdctl status`; verify the firewall port is open |
| Black screen on connect | Log out of any active local session first — some RDP implementations cannot share a session that is already displayed on a local monitor |
| Poor performance / lag | Use RDP instead of VNC for LAN connections — RDP is hardware-accelerated; for VNC, enable compression in your viewer |
| Windows RDP client shows certificate warning | This is expected for self-signed certificates — accept and remember the certificate |
| krfb prompts "someone is trying to connect" every time | Disable confirmation in **System Settings → Remote Desktop → Ask for confirmation** |
