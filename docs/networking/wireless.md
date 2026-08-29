---
title: Wi-Fi & Wireless Firmware
section: Networking
updated: 2026-08-28
---

# Wi-Fi & Wireless Firmware

Wi-Fi works on first boot. NetworkManager is preinstalled and enabled, and the wireless firmware for common chip families ships inside the image — there is nothing to install after deployment.

All three interfaces work day-one:

- **GUI** — the network quick settings/panel in your desktop
- **`nmtui`** — terminal UI
- **`nmcli`** — scriptable CLI (used throughout this page)

## Firmware Coverage

The image includes the `linux-firmware` set covering these vendor families:

| Family | Covers |
|--------|--------|
| AMD GPU | AMD graphics-adjacent platform firmware |
| Atheros | ath9k, ath10k, ath11k chips |
| Broadcom | brcmfmac-supported chips |
| Cirrus | Cirrus Logic audio/codecs |
| Intel | iwlwifi family (AX/BE series and older) |
| MediaTek | MT7921/MT7922 and similar |
| NVIDIA | NVIDIA platform firmware |
| Radeon | Legacy and current Radeon GPUs |
| Realtek | rtw88/rtw89 PCIe and USB adapters |

…plus others pulled in by the same set. Regulatory database (`wireless-regdb`) ships with it.

To identify your chip and confirm its driver loaded:

```bash
lspci -nnk | grep -A3 'Network controller'
```

The `Kernel driver in use:` line matters — if present, the correct in-kernel driver bound successfully. For USB dongles:

```bash
lsusb
```

## Connecting

```bash
# Scan and list available networks
nmcli device wifi list

# Connect to a WPA network
nmcli device wifi connect "SSID" password "password"

# List saved connections
nmcli con show
```

GUI paths:

- **GNOME:** top-right menu → Wi-Fi → select network
- **KDE Plasma:** network applet in the system tray
- **COSMIC:** Settings → Network → Wi-Fi

## Regulatory Domain

Check the currently applied regulatory domain:

```bash
iw reg get
```

A runtime change (until reboot):

```bash
sudo iw reg set DE
```

The persistent configuration method is region-dependent; most users never need to touch this — the shipped `wireless-regdb` defaults are correct for nearly all setups.

## Power Save

Wi-Fi power saving trades latency for battery life. Check the current state:

```bash
iw dev wlan0 get power_save
```

Disable it for a specific connection (applies whenever that connection is active):

```bash
nmcli connection modify "MyNetwork" wifi.powersave 2   # 2 = enabled, 3 = disabled
```

If you see ping spikes or stuttering on real-time traffic (calls, games) on battery, disabling power save on that connection is the first thing to try. See [Power Management](../system/power.md) for related laptop tuning.

## Known Chip-Family Notes

**Broadcom** — many chips work out of the box via the in-kernel `brcmfmac` or `b43` drivers. However, some older Broadcom chips require the proprietary **broadcom-wl** driver, which exists only in the AUR and therefore **cannot be host-installed on Shanios' immutable root**. If your chip requires it, file an image-inclusion request at [github.com/shani8dev](https://github.com/shani8dev) so a future image can carry it.

**Realtek** — some USB adapters prefer newer kernels with updated `rtw88`/`rtw89` support; these arrive automatically via OS updates since the kernel ships per-slot with each deploy.

**MediaTek / Intel / Qualcomm (QCA)** — generally trouble-free with the shipped firmware.

## rfkill

Radio kill switches (hardware keys, airplane mode) surface through `rfkill`, which is preinstalled:

```bash
# List radios and their soft/hard block state
rfkill list

# Unblock a soft-blocked radio
sudo rfkill unblock wifi

# Unblock everything
sudo rfkill unblock all
```

`hard blocked: yes` means a physical switch or BIOS setting is cutting the radio — no software can override that.

## Diagnostics

```bash
# Firmware load errors and version mismatches
dmesg | grep firmware

# Everything NetworkManager did this boot
journalctl -u NetworkManager -b

# Overall NM state
nmcli general status
```

## See Also

- [NetworkManager & VPN](networkmanager-vpn)
- [Network Tools](network-tools)
- [Bluetooth](bluetooth)
- [IP Addressing](ip-addressing)
- Blog: [Shani OS Networking Guide](https://blog.shani.dev/post/shani-os-networking-guide)
