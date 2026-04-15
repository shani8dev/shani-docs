---
title: System Config
section: Updates & Config
updated: 2026-04-01
---

# System Config

All system configuration in Shanios follows standard Linux conventions — edit files in `/etc`, manage services with `systemctl`. Your changes are captured by the OverlayFS upper layer and survive every OS update.

## Editing /etc Files

```bash
# Edit any config file as normal — changes persist via OverlayFS
sudo nano /etc/hostname
sudo nano /etc/hosts
sudo nano /etc/locale.conf
sudo nano /etc/environment

# Edit systemd service overrides
sudo systemctl edit sshd.service     # creates /etc/systemd/system/sshd.service.d/override.conf
sudo systemctl edit --full sshd.service  # full copy you can modify freely
```

## Viewing Your Customisations

Because changes are in the OverlayFS upper layer, you can audit everything you've changed:

```bash
# Every /etc file you've modified
find /data/overlay/etc/upper -not -type d | sort

# Show diff for a specific file
diff /data/overlay/etc/upper/hosts \
     /run/rootfsbase/etc/hosts
```

## Locale & Timezone

```bash
# Set system locale
sudo localectl set-locale LANG=en_IN.UTF-8

# Set keyboard layout
sudo localectl set-keymap us
sudo localectl set-x11-keymap us

# Set timezone
sudo timedatectl set-timezone Asia/Kolkata

# Check current settings
localectl status
timedatectl status
```

## Hostname

```bash
# Change hostname
sudo hostnamectl set-hostname my-machine

# View
hostnamectl
```

## Managing Services

```bash
# Enable/disable a service (persists across reboots)
sudo systemctl enable --now tailscaled
sudo systemctl disable tailscaled

# Check service status
systemctl status NetworkManager

# View service logs
journalctl -u sshd.service -f

# List all running services
systemctl list-units --type=service --state=running
```

## Adding Custom systemd Units

Place unit files in `/etc/systemd/system/` — they are captured by the OverlayFS overlay and persist across updates:

```bash
# Create a custom service
sudo nano /etc/systemd/system/my-script.service

# Reload systemd and start
sudo systemctl daemon-reload
sudo systemctl enable --now my-script.service
```

## sysctl Tuning

```bash
# Temporary (lost on reboot)
sudo sysctl vm.swappiness=10

# Persistent — place in /etc/sysctl.d/
sudo nano /etc/sysctl.d/99-my-tuning.conf
# vm.swappiness = 10
# net.core.rmem_max = 26214400

sudo sysctl --system   # apply without reboot
```

## PAM & sudo

```bash
# Edit sudoers safely
sudo visudo

# Add a sudoers drop-in (safer than editing /etc/sudoers directly)
sudo nano /etc/sudoers.d/my-rules
# username ALL=(ALL) NOPASSWD: /usr/bin/specific-command
```

## Time Synchronisation

systemd-timesyncd is enabled by default. To use a custom NTP server:

```bash
sudo nano /etc/systemd/timesyncd.conf
# [Time]
# NTP=time.cloudflare.com
# FallbackNTP=pool.ntp.org

sudo systemctl restart systemd-timesyncd
timedatectl timesync-status
```

## Kernel Parameters

Permanent kernel parameter changes go through `gen-efi` (embedded in the UKI), not `/etc/default/grub`:

```bash
# Edit cmdline for a slot
sudo nano /etc/gen-efi/cmdline-blue

# Rebuild the UKI
sudo gen-efi --slot blue

# Reboot to use new parameters
```

See [gen-efi Reference](../security/gen-efi) for details.
