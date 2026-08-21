---
title: Printing & Scanning
section: System
updated: 2026-08-21
---

# Printing & Scanning

Shanios ships a complete printing and scanning stack out of the box — CUPS, a wide range of vendor drivers, and driverless IPP/network scanning support are all pre-installed and active from first boot. No package installation is needed to add most printers or scanners.

## What's Pre-Installed

- **Print system:** CUPS 2.4 with `cups-filters`, `cups-pdf` (print-to-PDF), `cups-browsed` (automatic network printer discovery), `cups-pk-helper` (Polkit integration for GUI printer management), `ipp-usb` (driverless IPP-over-USB for AirPrint-capable printers)
- **Drivers:** `hplip-minimal` (HP), `cnijfilter2` (Canon), `brlaser` (Brother laser), `foo2zjs-nightly` (various ZjStream-based printers), `gutenprint` and `splix` (broad generic/open-source coverage), the full Foomatic database (`foomatic-db`, `foomatic-db-engine`, `foomatic-db-ppds`, `foomatic-db-gutenprint-ppds`) for wide legacy driver coverage, plus `ghostscript`, `gsfonts`, and `a2ps` for PostScript/text rendering
- **Scanning:** SANE-based, with `sane-airscan` for driverless network scanning (eSCL/AirScan and WSD), plus `colord-sane` and `argyllcms` for scanner colour profiles
- **GUI apps:** GNOME Simple Scan / KDE Skanlite for scanning; both desktops' Settings apps for printer management; `system-config-printer` is also available for advanced CUPS configuration

`cups.socket`, `cups-browsed.service`, `saned.socket`, and `ipp-usb.service` are all enabled by default — nothing to turn on manually.

## Adding a Printer

**GUI (recommended):**
- GNOME: Settings → Printers → Add Printer
- KDE Plasma: System Settings → Printers → Add a New Printer

Both auto-discover printers on the local network via `cups-browsed` (mDNS/DNS-SD through [Avahi](avahi)) and USB-connected printers via `ipp-usb`. For most modern printers, discovery and driver selection happen automatically.

**CLI / advanced:** CUPS also exposes a local web UI at [http://localhost:631](http://localhost:631) for adding printers, managing queues, and tweaking driver options — useful when you need PPD-level control the GUI doesn't expose. `system-config-printer` provides a more traditional standalone GUI for the same tasks.

```bash
# List configured printers
lpstat -p -d

# Add a printer manually with a specific driver (rarely needed — GUI/auto-discovery covers most cases)
sudo lpadmin -p MyPrinter -E -v ipp://192.168.1.50/ipp/print -m everywhere
```

## Managing Print Jobs

```bash
# Print a file
lp document.pdf
lp -d MyPrinter -o sides=two-sided-long-edge document.pdf

# View the print queue
lpq
lpstat -o

# Cancel a job
lprm <job-id>
cancel <job-id>

# Pause / resume a printer
cupsdisable MyPrinter
cupsenable MyPrinter
```

## Scanning

**GUI:** Simple Scan (GNOME) or Skanlite (KDE) — both detect USB and network scanners automatically via SANE and `sane-airscan`.

```bash
# List detected scanners
scanimage -L

# Scan from the command line
scanimage --format=png -o scan.png --resolution=300

# Driverless network scanner discovery (eSCL/AirScan) is handled by sane-airscan automatically
```

If a network scanner doesn't appear, confirm it's on the same subnet and that Avahi/mDNS traffic isn't being blocked — see [Firewall (firewalld)](../networking/firewalld) if you've added custom rules.

## Groups & Permissions

New users are automatically added to the `cups`, `lp`, and `scanner` groups at creation time via `/etc/shani-extra-groups` — see [User Provisioning](../updates/user-setup) for the full mechanism. No manual group changes are needed for printing or scanning to work for a normal user account.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Printer not discovered | Confirm it's on the same network/subnet; check `cups-browsed` is running (`systemctl status cups-browsed`); check the CUPS web UI at `localhost:631` |
| USB printer not detected | Check `lsusb`; confirm `ipp-usb.service` is running for AirPrint-capable USB printers |
| Wrong or missing driver | Check the CUPS web UI's driver search — the Foomatic/Gutenprint databases cover most non-vendor-specific printers; some vendor drivers (e.g. Epson) are not pre-installed and must be added manually |
| Print jobs stuck in queue | `cupsenable <printer>` if paused; check `journalctl -u cups` for filter errors |
| Scanner not detected | Run `scanimage -L`; for network scanners, confirm `sane-airscan` supports the device's protocol (eSCL/AirScan or WSD) |
| Can't manage printers without a password prompt every time | This is expected — `cups-pk-helper` gates printer administration via Polkit; see [Permissions & Authorization](../security/permissions) |

## See Also

- [Hardware](hardware) — general device detection and troubleshooting
- [Avahi (mDNS)](../networking/avahi) — the discovery mechanism behind network printer/scanner auto-detection
- [Firewall (firewalld)](../networking/firewalld) — if custom firewall rules block discovery traffic
- [User Provisioning](../updates/user-setup) — how the `cups`/`lp`/`scanner` groups are assigned
- [Printing and Scanning on Shani OS](https://blog.shani.dev/post/shani-os-printing-and-scanning) — extended walkthrough with per-manufacturer driver notes
