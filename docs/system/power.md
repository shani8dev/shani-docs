---
title: Power Management
section: System
updated: 2026-08-28
---

# Power Management

Shanios ships sane power defaults that are active from first boot — no post-install tuning required. This page focuses on laptops: sleep states, suspend, hibernation, battery reporting, and the tunables worth knowing about. Desktop users can ignore most of it.

What works out of the box:

- Lid-close suspend, handled by `systemd-logind`
- Battery reporting via `upower`, surfaced by every desktop's power panel
- Airplane-mode radio toggles via `rfkill`
- Correct clock across suspend/hibernate via `timedatectl` / `systemd-timesyncd` (enabled by default)

## Sleep States

Modern Linux systems support two suspend-to-RAM variants:

| State | Name | Behavior |
|-------|------|----------|
| `s2idle` | Suspend-to-idle (aka "modern standby") | CPU halted, devices put in low-power mode, RAM kept refreshed. Fastest wake, higher drain. |
| `deep` | S3 | Traditional ACPI sleep — RAM self-refreshes, everything else powered off. Slowest wake, minimal drain. |

Which states your hardware supports is firmware-dependent. Check what's available and what's currently selected:

```bash
cat /sys/power/mem_sleep
# Example output: s2idle [deep]
#                 ^^^^^^ the bracketed entry is the active default
```

If only `s2idle` appears, your firmware does not expose S3 — nothing to configure. Many recent laptops ship `s2idle`-only.

## Suspend

```bash
# Suspend immediately
systemctl suspend

# Inspect your current session (shows idle/lid-relevant state)
loginctl session-status
```

By default, closing the lid suspends the machine — on battery **and** on AC (`HandleLidSwitch=suspend` is the logind default). Wake with the power button; most firmware also wakes on keyboard input if enabled in BIOS/UEFI setup.

## Hibernation

Hibernation writes RAM to swap and powers off completely — survives a dead battery, unlike suspend.

Requirements:

- Swap at least as large as RAM. Shanios creates a swapfile sized to RAM in the dedicated `@swap` Btrfs subvolume (mounted at `/swap`) at install time.
- `resume=` on the kernel command line. **This is already baked into the image's UKI cmdline at build/deploy time** — there is nothing to configure manually.

Do **not** attempt to add or edit boot arguments yourself: the bootloader editor is disabled by design on Shanios, and any resume setup belongs in the image. If you resized or replaced the swapfile manually, see [Storage](storage) for the correct procedure first.

```bash
# Hibernate
systemctl hibernate
```

Verify a full hibernate/resume cycle works before relying on it — a failed resume falls back to a cold boot with an empty session.

## Battery & Reporting

```bash
# Full battery report: capacity, health, vendor, cycle count where exposed
upower -i $(upower -e | grep BAT)

# Just charge state and percentage
upower -i $(upower -e | grep BAT) | grep -E 'state|percentage|capacity'
```

The `capacity` field is firmware-reported health (design vs. full-charge capacity) — below ~80% usually means a worn battery. Every desktop surfaces this graphically:

- **GNOME:** Settings → Power
- **KDE Plasma:** System Settings → Energy Saving
- **COSMIC:** Settings → Power

## Tunables

### Lid Actions

Lid behavior is configured in `/etc/systemd/logind.conf`. The writable `/etc` overlay persists across updates, so edits survive redeploys.

```ini
# /etc/systemd/logind.conf
HandleLidSwitch=suspend                    # lid close on battery
HandleLidSwitchExternalMemory=ignore       # lid closed while docked/external monitor
HandleLidSwitchDocked=ignore               # docked via dock itself
```

After editing:

```bash
sudo systemctl restart systemd-logind
```

> Restarting `systemd-logind` briefly resets login sessions — running graphical sessions generally survive, but expect a short hiccup and re-authentication prompts.

### Wi-Fi Power Save

NetworkManager manages Wi-Fi power saving per connection via the `wifi.powersave` property. See [Wi-Fi & Wireless Firmware](../networking/wireless.md) for checking and changing it.

### USB Autosuspend

USB autosuspend saves power but can misbehave with some input devices (mice/keyboards stuttering or dropping after idle). If a wired input device acts up after a pause, that's autosuspend — check `/sys/bus/usb/devices/*/power/control` and consider whitelisting the device rather than disabling autosuspend globally.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Wakes immediately after suspend | Commonly a firmware ACPI issue with the active sleep state. Toggle between `deep` and `s2idle`: `echo deep > /sys/power/mem_sleep` (as root), then retry. Persist the choice with a tmpfiles entry (below) |
| Suspends fine, black screen on wake | Usually a GPU driver pairing problem. Confirm you booted the slot matching your latest deployment: `cat /data/current-slot`; reboot once to settle. If it persists across slots, report the bug with GPU model |
| Hibernation writes swap but doesn't resume | Swap smaller than RAM, or the wrong swap target — see [Storage](storage) for swap sizing and the baked-in `resume=` handling |
| Battery drains overnight while suspended | Check which state you're using: `s2idle` drains far faster than `deep` — prefer `deep` when supported. Also rule out Wake-on-LAN keeping the NIC alive (`ethtool` — see [Network Tools](../networking/network-tools.md)) |
| Lid ignored on AC | `HandleLidSwitchExternalMemory=ignore` is the logind default for external-monitor setups. Change it in `/etc/systemd/logind.conf` if you want suspend-on-AC |

Persisting a `mem_sleep` choice across reboots (tmpfiles write it early each boot):

```ini
# /etc/tmpfiles.d/mem-sleep.conf
w /sys/power/mem_sleep - - - - deep
```

Filtering the journal for sleep activity:

```bash
journalctl --grep 'suspend|sleep|resume' -b
journalctl -u systemd-suspend.service -b -1   # previous suspend attempt
```

## See Also

- [Hardware](hardware) — sensors, `powertop`, thermals
- [Storage](storage) — swap, `@swap` subvolume, hibernation prerequisites
- [Optimizations](../intro/optimizations.md) — system-wide performance and power tuning
- [GPU](gpu) — driver slots and suspend/resume hangs
- Blog: [Power Management on Shani OS](https://blog.shani.dev/post/shani-os-power-management)
