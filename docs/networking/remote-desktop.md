---
title: Remote Desktop
section: Networking
updated: 2026-04-01
---

# Remote Desktop — FreeRDP, kRDP, kRFB, gnome-remote-desktop

Shanios includes both client and server tools for remote desktop access.

## FreeRDP — Connect to a Windows/RDP Server

FreeRDP is pre-installed.

```bash
# Basic RDP connection
xfreerdp /v:192.168.1.100 /u:username /p:password /dynamic-resolution /gfx /rfx

# Full-screen, multi-monitor
xfreerdp /v:server.example.com /u:me /f /multimon

# RDP over SSH tunnel (recommended for security)
ssh -L 3389:192.168.1.100:3389 jumphost
xfreerdp /v:localhost /u:username
```

## kRDP — KDE RDP Server

Pre-installed on the KDE edition. Enable in **Settings → System → Remote Desktop → Enable Remote Desktop**.

```bash
# Enable via systemd
systemctl --user enable --now plasma-remotedesktop
```

Accessible from Windows "Remote Desktop Connection".

## kRFB / krfb — KDE VNC Server

Pre-installed on the KDE edition.

```bash
# Enable VNC server
systemctl --user enable --now krfb

# Connect from any VNC viewer
vncviewer hostname:5900
```

## gnome-remote-desktop — GNOME Edition

Pre-installed on the GNOME edition. Enable in **Settings → Sharing → Remote Desktop**. Supports both RDP and VNC.

```bash
grdctl rdp enable
grdctl rdp set-credentials username password
grdctl status
```

## SSH with X Forwarding

```bash
# Run GUI apps remotely over SSH
ssh -X user@host
ssh -Y user@host  # trusted (faster, less secure)
```
