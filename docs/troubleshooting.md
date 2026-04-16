---
title: Troubleshooting Guide
section: System Management
updated: 2026-04-16
---

# Troubleshooting Guide

The most important thing to know about troubleshooting Shani OS is that the worst case is almost always **"rollback and reboot."** The architecture is built to make recovery fast, reliable, and non-destructive. This guide walks through common issues across boot, updates, applications, audio, display, networking, storage, and container layers.

> 🔍 **The Golden Rule**: Before debugging anything after a system update, try rolling back first. It is always safe, always reversible, and takes under a minute:
> ```bash
> sudo shani-deploy --rollback
> # Then reboot
> ```
> Your home directory, Flatpak apps, Nix packages, and containers are completely unaffected. Only the OS slot changes.

To check which slot you are currently running:
```bash
cat /data/current-slot
# prints: blue  or  green
```

---

## 🖥️ Boot Issues

### System boots to the wrong slot
After an update, the bootloader entry may not have updated correctly.
1. Press `Space` or `Enter` at the systemd-boot splash screen to bring up the boot menu.
2. Select the correct slot and boot.
3. Repair the boot entry from the running system:
```bash
cat /data/current-slot
sudo shani-deploy --repair-boot
```

### systemd-boot shows "Boot Failed" and reverts automatically
This is the **boot-counting safety mechanism** working as designed. The new slot failed its startup check three times; systemd-boot fell back to the previous slot automatically.
```bash
# See boot journal from the previous failed attempt
journalctl -b -1 --priority=err

# Check the startup check output
journalctl -b -1 -u startup-check.service
```
If the issue persists, explicitly roll back to ensure the bootloader is fully reset:
```bash
sudo shani-deploy --rollback
```

### Black screen after LUKS passphrase (with TPM2 enrolled)
The TPM2-sealed key may have been invalidated by a firmware or Secure Boot state change. The system should fall back to passphrase entry — type your LUKS passphrase manually. After booting:
```bash
# Re-enroll TPM2 with the current firmware state
sudo gen-efi enroll-tpm2
```
If TPM2 enrollment fails repeatedly after a firmware update, check that Secure Boot is still enabled and the MOK is intact:
```bash
mokutil --sb-state
sbctl status
```
> 📘 Full encryption recovery: [wiki.shani.dev — Encryption Issues](https://wiki.shani.dev#ts-luks)

### System won't boot at all — emergency USB recovery
Boot from a Shani OS USB drive and select the recovery option. From there:
```bash
# Mount the Btrfs root
mount -o subvol=@data /dev/nvme0n1p2 /mnt/data

# Check which slot was active
cat /mnt/data/current-slot

# Mount the active slot and inspect it
mount -o subvol=@blue,ro /dev/nvme0n1p2 /mnt/blue

# Examine boot logs from the failed system
journalctl --directory=/mnt/data/journal
```
> 📘 Full boot recovery walkthrough: [wiki.shani.dev — Boot Issues](https://wiki.shani.dev#ts-boot)

---

## 🔄 Update Issues

### Update fails: "Download interrupted" or "Checksum mismatch"
`shani-deploy` uses `aria2c` for downloads with resume support. An interrupted download will resume automatically. A checksum mismatch means the download was corrupted — the tool will refuse to apply it and retry:
```bash
sudo shani-deploy update  # resumes or re-downloads as needed

# Check storage before updating
shani-deploy --storage-info
```
If the checksum continues to fail, clear the download cache:
```bash
sudo rm -rf /tmp/shani-deploy-cache/
sudo shani-deploy update
```

### "Not enough space" during update
```bash
df -h
sudo compsize /

# Run garbage collection on Btrfs
sudo btrfs balance start -dusage=50 /

# Delete old snapshots if they exist
sudo btrfs subvolume list / | grep snapshot
# sudo btrfs subvolume delete /path/to/old-snapshot

# Trim the filesystem
sudo fstrim -av
```

### Update downloaded but slot won't activate
```bash
shani-deploy --status

# Check if the UKI was generated
ls /boot/efi/EFI/shanios/

# Manually regenerate UKI for a slot
sudo gen-efi generate --slot green
sudo gen-efi list  # confirm both entries exist
```
> 📘 Full update troubleshooting: [wiki.shani.dev — Update Issues](https://wiki.shani.dev#ts-updates)

---

## 📦 Application Issues

### "I can't install a package with `pacman`"
This is by design. The OS root is read-only — `pacman -S` to the base system is not supported and would be overwritten on the next update anyway. Use the appropriate layer:
```bash
# GUI apps → Flatpak
flatpak install flathub app.name

# CLI tools and dev runtimes → Nix
nix-env -iA nixpkgs.tool-name

# Full mutable environment → Distrobox
distrobox create --name mydev --image archlinux:latest
distrobox enter mydev
# Full pacman, yay, everything works here
```
> 📘 Migration table for every traditional workflow: [wiki.shani.dev — Migrating from Traditional Linux](https://wiki.shani.dev#key-concepts)

### A Flatpak app fails to launch or behaves unexpectedly
```bash
# Check Flatpak logs
flatpak run --verbose com.example.App 2>&1 | head -50

# Check if the app needs a portal permission
flatpak permission-list

# Reset an app's data (nuclear option)
flatpak run --command=sh com.example.App  # inspect inside sandbox

# Uninstall and reinstall cleanly
flatpak remove com.example.App
flatpak install flathub com.example.App
```

### A Flatpak app can't access files outside `~/Downloads`
Flatpak apps are sandboxed. Use the Files portal (the GUI file picker) to grant access, or use **Flatseal** (available on Flathub) to manage permissions:
```bash
# Flatseal is pre-installed — launch it from your app menu
```
> 📘 Full Flatpak guide: [wiki.shani.dev — Flatpak](https://wiki.shani.dev#flatpak)

---

## 🔊 Audio Issues

### No audio after boot
```bash
# Check if PipeWire is running
systemctl --user status pipewire pipewire-pulse wireplumber

# Restart the audio stack
systemctl --user restart pipewire pipewire-pulse wireplumber

# Check available audio devices
pactl list sinks short
aplay -l

# Check WirePlumber device status
wpctl status
```

### Audio device not detected (Intel DSP laptops)
Some Intel laptops use Intel SOF (Sound Open Firmware) DSP. The `sof-firmware` package is included in Shani OS. If audio is still not detected:
```bash
# Check if SOF firmware loaded
dmesg | grep -i sof

# Check available soundcards
cat /proc/asound/cards

# Check PipeWire configuration
systemctl --user status wireplumber
journalctl --user -u wireplumber -n 50
```
> 📘 Device-specific solutions: [wiki.shani.dev — Audio Issues](https://wiki.shani.dev#ts-audio)

### Microphone not working in Flatpak apps
```bash
# Check if the app has microphone permission
flatpak info --show-permissions com.example.App | grep -i mic

# Grant microphone access via Flatseal or:
flatpak override --user --device=all com.example.App
```

---

## 🖼️ Display & Monitor Issues

### External monitor not detected
```bash
# Check connected outputs
kscreen-doctor --outputs   # KDE
gnome-randr                # GNOME (if installed via flatpak)

# Check detected displays at kernel level
xrandr --listmonitors      # under XWayland
wlr-randr                  # Wayland (install via nix-env)

# Check DRM/connector status
cat /sys/class/drm/*/status
```

### Fractional scaling looks blurry
On Wayland, fractional scaling requires per-app support. For apps that look blurry:
- **KDE**: System Settings → Display → Fractional Scaling → set rendering scale
- **GNOME**: Settings → Displays → Scale
- For XWayland apps, enable fractional scaling support in display settings (KDE Plasma 6.x: configured per-display)

### Display tearing or poor frame pacing (AMD/Intel)
- Check compositor VSync:
  - **KDE**: System Settings → Display → Compositor → Tear-free rendering (enabled)
  - **GNOME**: Verify Wayland is active: `echo $XDG_SESSION_TYPE` (should print: `wayland`)
> 📘 Full display guide: [wiki.shani.dev — Display & Monitors](https://wiki.shani.dev#ts-display)

---

## 🌐 Networking Issues

### Wi-Fi disconnects frequently
```bash
# Check NetworkManager logs
journalctl -u NetworkManager -n 100

# Disable power management on the Wi-Fi adapter (common fix)
nmcli connection modify "Your Connection Name" wifi.powersave 2
# 2 = disable, 3 = enable

# Check adapter firmware
dmesg | grep -i firmware | grep -i wifi
```

### VPN connects but no traffic routes
```bash
# Check routing table
ip route show table main
ip route show table 220

# Check DNS after VPN connection
resolvectl status
cat /etc/resolv.conf

# For split-tunnel VPNs, check route metrics
ip route show | grep -v dev lo
```

### firewalld blocks an application unexpectedly
```bash
# Check current rules
sudo firewall-cmd --list-all

# Check which zone is active
sudo firewall-cmd --get-active-zones

# Allow a service
sudo firewall-cmd --permanent --add-service=service-name
sudo firewall-cmd --reload

# Allow a specific port
sudo firewall-cmd --permanent --add-port=PORT/tcp
sudo firewall-cmd --reload
```
> 📘 Full networking guide: [Networking on Shani OS](/post/shani-os-networking-guide)

---

## 💾 Storage Issues

### Disk filling up unexpectedly
```bash
# Check overall disk usage
df -h
sudo compsize /    # compressed + deduplicated size

# Find large files and directories
du -sh /home/* --max-depth=1
du -sh /var/log/* 2>/dev/null

# Check Btrfs subvolume sizes
sudo btrfs subvolume list /
sudo btrfs filesystem show

# Clean Flatpak unused runtimes
flatpak uninstall --unused

# Clean Nix store
nix-collect-garbage -d
nix-store --gc

# Clean Podman images
podman system prune -af

# Clean Distrobox containers you no longer use
distrobox list
distrobox rm container-name
```

### Btrfs errors in dmesg
```bash
# Check filesystem health
sudo btrfs scrub start /
sudo btrfs scrub status /

# Run balance to fix space imbalance
sudo btrfs balance start -dusage=85 -musage=85 /

# Check for errors
sudo btrfs check --readonly /dev/nvme0n1p2
```
> 📘 Full storage guide: [wiki.shani.dev — Storage & Btrfs](https://wiki.shani.dev#ts-storage)

---

## 📱 Waydroid Issues

### Waydroid fails to start
```bash
# Check container service
systemctl status waydroid-container.service
journalctl -u waydroid-container.service -n 50

# Check binder module is loaded
lsmod | grep binder

# Reinitialise
sudo waydroid-helper init
```

### Play Store won't allow downloads after GApps install
Google requires device certification for new Waydroid installs. Register your device:
```bash
# Get your Android ID
adb connect $(waydroid status | grep IP | awk '{print $NF}')
adb shell settings get secure android_id
```
Then visit `google.com/android/uncertified` in a browser inside Waydroid and enter the Android ID. Wait 15 minutes before retrying the Play Store.

### ARM apps crash immediately
Most crashes are ARM-to-x86 translation failures via `libhoudini`. Check if an x86 APK is available from the developer. For apps that must run ARM-native, there is currently no workaround other than a physical device or a QEMU-based emulator.
> 📘 Full Waydroid guide: [wiki.shani.dev — Android (Waydroid)](https://wiki.shani.dev#android)

---

## ⚙️ OverlayFS `/etc` Customisations

Configuration changes in `/etc` persist via OverlayFS in `@data`. To see what you have changed:
```bash
ls -la /data/overlay/etc/upper/
```

### Revert a specific file to OS default
```bash
# Remove your override — the OS default (lower layer) becomes active again
sudo rm /data/overlay/etc/upper/path/to/file
```

### Revert all `/etc` customisations (nuclear option)
```bash
sudo rm -rf /data/overlay/etc/upper/*
sudo reboot
```
> 📘 OverlayFS explanation: [The Architecture Behind Shani OS](/post/shani-os-architecture-deep-dive#how-etc-stays-writable)

---

## 📝 Gathering Logs for Bug Reports

When reporting a bug, include:
```bash
# System information
uname -r                            # kernel version
cat /data/current-slot              # active slot
shani-deploy --version              # shani-deploy version
cat /etc/os-release                 # OS release info

# Recent logs (replace -b 0 with -b -1 for previous boot)
journalctl -b 0 --priority=err -n 100

# For a specific service
journalctl -b 0 -u service-name.service -n 200

# Hardware info
lspci | grep -E "VGA|Audio|Network"
lsusb

# Btrfs state
sudo btrfs filesystem df /
sudo btrfs subvolume list /
```

Report bugs at [github.com/shani8dev/shani-os/issues](https://github.com/shani8dev/shani-os/issues) or ask in the [Telegram community](https://t.me/shani8dev).

---

> 🇮🇳 **Built in India** · **Immutable** · **Atomic** · **Zero Telemetry**
