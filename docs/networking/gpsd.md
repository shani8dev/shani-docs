---
title: gpsd (GPS Daemon)
section: Networking
updated: 2026-04-20
---

# gpsd — GPS Daemon

gpsd is a service daemon that reads data from GPS/GNSS receivers and makes it available to multiple clients over a local socket. Applications such as Chrony (NTP), navigation software, and location-aware tools query gpsd rather than the device directly, allowing multiple programs to share a single GPS receiver simultaneously.

gpsd is pre-installed on Shani OS. **Not active by default** — enable it when a GPS receiver is connected.

---

## Supported Hardware

gpsd works with virtually any GPS receiver that presents as a serial device:

- **USB GPS dongles** — appear as `/dev/ttyUSB0` or `/dev/ttyACM0`
- **Serial GPS modules** — appear as `/dev/ttyS0` or `/dev/ttyAMA0`
- **NMEA-over-Bluetooth** — appear as `/dev/rfcomm0`

Identify your device after plugging it in:

```bash
# USB devices
lsusb

# New serial devices (watch for new entries after plugging in)
ls /dev/tty{USB,ACM}*

# Check kernel messages for the assigned device node
dmesg | tail -20
```

---

## Enable & Configure

### Specify the Device

Edit `/etc/default/gpsd` (or `/etc/gpsd` depending on packaging):

```bash
# Device the GPS receiver is connected to
DEVICES="/dev/ttyUSB0"

# Options passed to gpsd
GPSD_OPTIONS="-n"    # -n: don't wait for a client to poll — start reading immediately

# Start gpsd on boot
START_DAEMON="true"
```

```bash
sudo systemctl enable --now gpsd
systemctl status gpsd
```

### Socket Activation (Default)

gpsd on Arch uses socket activation — it starts on demand when a client connects. Enable the socket unit instead:

```bash
sudo systemctl enable --now gpsd.socket
```

---

## Status & Testing

```bash
# Interactive GPS monitor — shows satellite view, fix status, lat/lon/alt
gpsd -N -D 2 /dev/ttyUSB0   # run in foreground for testing

# cgps — ncurses client showing position and satellite data
cgps -s

# gpsmon — lower-level protocol monitor
gpsmon

# Raw NMEA sentences from the device
cat /dev/ttyUSB0
```

`cgps` output key fields:

| Field | Meaning |
|-------|---------|
| `Status` | `NO FIX` / `2D FIX` / `3D FIX` |
| `Latitude / Longitude` | Position in decimal degrees |
| `Altitude` | Height above sea level |
| `Speed` | Ground speed |
| `Satellites Used` | Number of satellites contributing to the fix |

A 3D fix requires at least 4 satellites. Getting a first fix (TTFF) outdoors typically takes 30–90 seconds on a cold start.

---

## Using GPS as a Time Source (Chrony)

A GPS receiver provides highly accurate time via the PPS (Pulse Per Second) signal. Pair gpsd with Chrony to use GPS as an NTP reference:

```bash
# /etc/chrony.conf — add these lines
refclock SHM 0 offset 0.5 delay 0.2 refid GPS
refclock SOCK /var/run/chrony.ttyUSB0.sock refid PPS
```

```bash
sudo systemctl restart chronyd
chronyc sources -v   # GPS should appear as a source
```

> PPS requires hardware support from the GPS module. Most consumer USB GPS dongles do not expose PPS — check your hardware specs.

---

## Firewall

gpsd listens on `localhost:2947` by default. If you need LAN access (e.g., to share one GPS across multiple machines):

```bash
# Edit /etc/default/gpsd and add -G to listen on all interfaces:
GPSD_OPTIONS="-n -G"

sudo firewall-cmd --add-port=2947/tcp --permanent
sudo firewall-cmd --reload
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `cgps` shows `NO FIX` | Move outdoors — GPS requires clear sky view; cold start takes up to 90 seconds |
| Device not found | Check `ls /dev/ttyUSB*`; add your user to the `uucp` group for non-root access: `sudo usermod -aG uucp $USER` |
| gpsd not reading device | Try running in foreground: `sudo gpsd -N -D 5 /dev/ttyUSB0` — look for permission or baud rate errors |
| ModemManager interfering | ModemManager probes serial devices and can disrupt GPS. Add a udev rule to ignore it: `sudo tee /etc/udev/rules.d/99-gpsd.rules <<< 'ATTRS{idVendor}=="XXXX", ATTRS{idProduct}=="YYYY", ENV{ID_MM_DEVICE_IGNORE}="1"'` (replace with your device's IDs from `lsusb`) |
| Multiple clients can't connect | gpsd handles multiple clients natively — no configuration needed; verify gpsd is running with `systemctl status gpsd` |
