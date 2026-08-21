---
title: System Config
section: Updates & Config
updated: 2026-08-21
---

# System Config

All system configuration in Shanios follows standard Linux conventions — edit files in `/etc`, manage services with `systemctl`. Your changes are captured by the OverlayFS upper layer and survive every OS update and rollback.

## How the /etc Overlay Works

```
Lower layer (read-only): /etc from the active @blue or @green slot
Upper layer (writable):  /data/overlay/etc/upper/
Merged view:             /etc (what you see and interact with)
```

When you write to any `/etc` file, the kernel copies it from the lower layer to the upper layer and applies your change. When the OS updates (new lower layer), your upper-layer files are untouched. Files you have never modified automatically reflect the new OS defaults.

## Editing /etc Files

Nothing special is required — edit files in `/etc` exactly as on any Linux system:

```bash
sudo nano /etc/hostname
sudo nano /etc/hosts
sudo nano /etc/locale.conf
sudo nano /etc/environment
sudo nano /etc/ssh/sshd_config
sudo nano /etc/fstab

# Edit systemd service overrides
sudo systemctl edit sshd.service           # creates a drop-in override
sudo systemctl edit --full sshd.service    # full copy you can modify freely
```

Changes take effect immediately (or after service restart for daemon config) and survive every OS update.

## Viewing Your Customisations

```bash
# Every /etc file you have modified
find /data/overlay/etc/upper/ -type f | sort

# Compare a modified file to the OS default
diff /data/overlay/etc/upper/ssh/sshd_config \
     /etc/ssh/sshd_config
```

## Reverting a File to OS Default

```bash
# Remove the upper-layer version — the OS default becomes active again
sudo rm /data/overlay/etc/upper/ssh/sshd_config
```

## Resetting All /etc Customisations

Use `shani-reset` rather than raw `rm -rf` to avoid leaving the overlay work directory in an inconsistent state:

```bash
# Factory reset all persistent system state in /data (keeps /home and OS slots intact)
sudo shani-reset

# Preview what would be wiped without making changes
sudo shani-reset --dry-run

# Keep previously downloaded OS images
sudo shani-reset --keep-downloads
```

## Locale & Timezone

`glibc-locales` is pre-installed with every locale glibc supports already generated — unlike vanilla Arch, `localectl set-locale` works immediately with no `locale-gen` step first.

```bash
sudo localectl set-locale LANG=en_IN.UTF-8
sudo localectl set-keymap us
sudo localectl set-x11-keymap us
sudo timedatectl set-timezone Asia/Kolkata

# Discover available options
localectl list-locales
localectl list-keymaps
timedatectl list-timezones

localectl status
timedatectl status
```

## Hostname

```bash
sudo hostnamectl set-hostname my-machine
hostnamectl
```

Your machine is reachable as `hostname.local` on the local network via Avahi (mDNS), active by default.

## Managing Services

```bash
# Enable/disable a service (persists across reboots via overlay)
sudo systemctl enable --now sshd
sudo systemctl disable sshd

# Start/stop/restart
sudo systemctl start sshd
sudo systemctl stop sshd
sudo systemctl restart sshd
sudo systemctl reload nginx

systemctl status sshd
journalctl -u sshd -f
journalctl -u sshd --since today

systemctl list-unit-files --state=enabled
systemctl --failed
```

### User Services

```bash
systemctl --user enable --now my-service.service
systemctl --user status my-service.service
journalctl --user -u my-service.service -f
```

User service unit files live in `~/.config/systemd/user/`.

## Adding Custom systemd Units

```bash
sudo nano /etc/systemd/system/myapp.service
sudo systemctl daemon-reload
sudo systemctl enable --now myapp.service
```

Units placed in `/etc/systemd/system/` are captured by the overlay and persist across updates.

## sysctl Tuning

```bash
# Temporary (lost on reboot)
sudo sysctl vm.swappiness=10

# Persistent
echo "vm.swappiness=10" | sudo tee /etc/sysctl.d/99-custom.conf
sudo sysctl --system   # apply without reboot
```

Common customisations:

```bash
# /etc/sysctl.d/99-custom.conf
vm.swappiness=10
fs.inotify.max_user_watches=524288
fs.file-max=2097152
```

## Kernel Parameters

Permanent kernel parameter changes are embedded in the UKI via `gen-efi`, not via `/etc/default/grub`. The generated command line is written to `/etc/kernel/install_cmdline_<slot>` on each run and cannot be manually pre-edited (it is overwritten). To add a permanent parameter, contact the project or use a `dracut.conf.d` snippet — then rebuild:

```bash
sudo gen-efi configure blue   # rebuild UKI for the currently booted slot
```

See [gen-efi Reference](../security/gen-efi) for details.

## Network Configuration

NetworkManager handles all network configuration. Wi-Fi passwords, VPN profiles, and static IP configurations persist in `/data/varlib/NetworkManager` across all updates and rollbacks.

```bash
nmcli connection show
nmcli device wifi connect "SSID" password "password"
nmcli device status
```

## Time Synchronisation

`systemd-timesyncd` is enabled by default:

```bash
sudo nano /etc/systemd/timesyncd.conf
# [Time]
# NTP=time.cloudflare.com
# FallbackNTP=pool.ntp.org

sudo systemctl restart systemd-timesyncd
timedatectl timesync-status

# Toggle automatic NTP sync on/off
sudo timedatectl set-ntp false
sudo timedatectl set-ntp true

# Manually set date/time (only takes effect while NTP sync is off)
sudo timedatectl set-time '2026-08-21 14:30:00'
```

## PAM & sudo

```bash
sudo visudo

# Add a sudoers drop-in (safer than editing /etc/sudoers directly)
sudo nano /etc/sudoers.d/my-rules
# username ALL=(ALL) NOPASSWD: /usr/bin/specific-command
```

## Hiding App-Launcher Entries

Some CLI-only tools ship a `.desktop` file upstream even though they have no real GUI (`htop`, `vim`, `nvim`, `cups`, and similar packages) — without intervention these would clutter your application launcher. Shanios ships a pacman hook, `desktop-entry-hider`, that runs automatically after every package install or upgrade touching `/usr/share/applications/*.desktop`. It applies a curated list of overrides from `/etc/desktop-entry-hider/configs/` — one file per app, each appending a `NotShowIn=` line to that app's `.desktop` file so it's suppressed from the launcher without removing the file itself.

```bash
# See what desktop-entry-hider has configured
ls /etc/desktop-entry-hider/configs/

# Example: how an entry is hidden (appended to the .desktop file)
cat /etc/desktop-entry-hider/configs/htop.desktop
# contain='NotShowIn=GNOME;KDE;Pantheon;'
```

**To un-hide an app**, remove the `NotShowIn=` line the hook added from `/usr/share/applications/<name>.desktop` — it will be re-added on the next update unless you also delete or edit the corresponding file in `/etc/desktop-entry-hider/configs/`.

**To hide an additional app yourself**, add a new file there following the same pattern, then run `sudo desktop-entry-hider` to apply it immediately (it otherwise only runs on package transactions).
