---
title: apcupsd (UPS Daemon)
section: Networking
updated: 2026-04-20
---

# apcupsd — APC UPS Daemon

apcupsd monitors APC Uninterruptible Power Supplies and triggers a graceful system shutdown when battery runs low. It is pre-installed on Shani OS. Connect your APC UPS via USB — most models are detected automatically with no additional drivers.

**Not active by default.** Enable it only if a UPS is connected.

---

## Enable

```bash
sudo systemctl enable --now apcupsd

systemctl status apcupsd
```

---

## Configuration

Edit `/etc/apcupsd/apcupsd.conf`:

```bash
# UPS name (label only — for log messages)
UPSNAME myups

# Communication device — USB is most common for desktop APC units
UPSCABLE usb
UPSTYPE usb
DEVICE                    # leave blank for USB; apcupsd auto-detects

# Shutdown thresholds
BATTERYLEVEL 10           # shut down when battery drops to 10%
MINUTES 5                 # or when < 5 minutes runtime remains

# How long to wait on battery before shutdown (0 = immediate)
TIMEOUT 0

# Where to write the status file
STATFILE /var/log/apcupsd.status

# Event scripts directory
SCRIPTDIR /etc/apcupsd

# Network Information Server — allows remote status queries
NISIP 127.0.0.1           # 0.0.0.0 to allow LAN access
NISPORT 3551
```

After editing:

```bash
sudo systemctl restart apcupsd
```

---

## Status & Monitoring

```bash
# Live UPS status (battery level, load, runtime estimate, events)
apcaccess status

# Watch status continuously
watch -n 5 apcaccess status

# View event log (power failures, battery tests, shutdowns)
sudo tail -f /var/log/apcupsd.events

# Run a battery self-test
apctest
```

Key fields in `apcaccess status`:

| Field | Meaning |
|-------|---------|
| `STATUS` | `ONLINE`, `ONBATT`, `LOWBATT` |
| `BCHARGE` | Battery charge percentage |
| `TIMELEFT` | Estimated runtime on battery |
| `LOADPCT` | Load on the UPS as percentage of capacity |
| `LINEV` | Input mains voltage |
| `BATTV` | Battery voltage |

---

## Event Scripts

apcupsd runs scripts from `/etc/apcupsd/` when power events occur. The key events and their script names:

| Event | Script | Triggered when |
|-------|--------|----------------|
| Power failure | `onbattery` | Mains power lost |
| Power restored | `offbattery` | Mains power returns |
| Low battery | `doshutdown` | Battery/runtime threshold reached |
| Battery test done | `endapctest` | Self-test completes |

Edit `/etc/apcupsd/onbattery` to send a notification when power fails:

```bash
#!/bin/sh
echo "Power failure at $(date)" | mail -s "UPS: On Battery" root
```

Make scripts executable:

```bash
sudo chmod +x /etc/apcupsd/onbattery
```

---

## Network Status Server

apcupsd includes a small status server (NIS) on port 3551. Query a remote apcupsd instance from another machine:

```bash
# Query local daemon
apcaccess status localhost

# Query a remote machine (must have NISIP 0.0.0.0 in config)
apcaccess status 192.168.1.10:3551
```

Open the firewall if you need LAN access to the status server:

```bash
sudo firewall-cmd --add-port=3551/tcp --permanent
sudo firewall-cmd --reload
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `apcupsd` won't start | Check `journalctl -u apcupsd`; common cause is wrong `UPSCABLE`/`UPSTYPE` — use `usb` for USB-connected APC units |
| `apcaccess` returns `NETWORK ERROR` | Daemon isn't running or NIS is disabled — check `systemctl status apcupsd` |
| UPS not detected | Run `lsusb` to confirm the UPS appears; APC USB devices use the standard HID UPS class — no extra driver needed |
| Shutdown not triggering on low battery | Check `BATTERYLEVEL` and `MINUTES` thresholds in the config; test with `apctest` → option 7 (simulate power failure) |
| `STATFLAG` shows `0x060000` (communication lost) | Cable issue or wrong port — unplug/replug USB; check `DEVICE` is blank for USB |
