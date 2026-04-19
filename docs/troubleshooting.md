---
title: Troubleshooting Guide
section: System Management
updated: 2026-05-13
---

# Troubleshooting Guide

The most important thing to know about troubleshooting Shanios is that the worst case is almost always **"rollback and reboot."** The architecture is built to make recovery fast, reliable, and non-destructive.

> **The Golden Rule:** Before debugging anything after a system update, try rolling back first. It is always safe, always reversible, and takes under a minute:
> ```bash
> sudo shani-deploy --rollback
> sudo reboot
> ```
> Your home directory, Flatpak apps, Nix packages, and containers are completely unaffected. Only the OS slot changes.

To check which slot you are currently running:

```bash
cat /data/current-slot   # prints: blue  or  green
```

---

## Boot Problems

### System Won't Boot — Automatic Fallback

If your system fails to reach the login prompt three times after an update, systemd-boot's boot-counting mechanism activates and falls back to the previous slot automatically. On the next successful login, `shani-update` detects the fallback and offers to clean the failed slot.

To check what happened:

```bash
# Which slot are you actually running?
cat /proc/cmdline | grep -o 'subvol=@[a-z]*'

# What does the slot tracker say?
cat /data/current-slot

# Were there boot failures?
ls /data/boot_failure /data/boot_hard_failure 2>/dev/null

# Check the boot journal for errors
journalctl -b 0 -p err --no-pager | head -40

# Check the startup check output
journalctl -b -1 -u startup-check.service
```

To restore the failed slot and try again:

```bash
sudo shani-deploy -r
sudo reboot
```

### System Boots to the Wrong Slot

After an update, the bootloader entry may not have updated correctly.

1. Press `Space` or `Enter` at the systemd-boot splash screen to bring up the boot menu.
2. Select the correct slot and boot.
3. Repair the boot entry from the running system:

```bash
cat /data/current-slot
sudo shani-deploy --repair-boot
```

### Black Screen After Update (GPU / NVIDIA)

A black screen after a kernel or driver update usually means the NVIDIA module failed to load, or Secure Boot is rejecting the new UKI.

```bash
# Switch to a TTY (Ctrl+Alt+F2 or F3) and log in

# Check if NVIDIA module loaded
lsmod | grep nvidia
dmesg | grep -i "nvidia\|NVRM" | tail -20

# Check Secure Boot status
mokutil --sb-state
mokutil --list-enrolled | grep -i shani

# If the MOK key isn't enrolled:
sudo gen-efi enroll-mok
sudo reboot
# Accept the key in MokManager, then enable Secure Boot
```

If the display manager failed:

```bash
journalctl -u gdm -b 0 -n 50    # GNOME
journalctl -u sddm -b 0 -n 50   # KDE
```

### Black Screen After LUKS Passphrase (TPM2 Enrolled)

The TPM2-sealed key may have been invalidated by a firmware or Secure Boot state change. The system should fall back to passphrase entry automatically — type your LUKS passphrase manually. After booting:

```bash
sudo gen-efi cleanup-tpm2
sudo gen-efi enroll-tpm2
```

If TPM2 enrollment fails repeatedly after a firmware update, confirm Secure Boot is still enabled and the MOK is intact:

```bash
mokutil --sb-state
sbctl status
```

### Drops to Emergency Shell at Boot

Usually a filesystem mount failure. The most common cause is a stale `/etc/fstab` or `/etc/crypttab` entry.

```bash
# From the emergency shell:
journalctl -b 0 -p err | grep -i "mount\|fstab\|crypttab"

# Check crypttab UUID (get the correct one)
blkid | grep crypto_LUKS

# Fix if needed
sudo nano /etc/crypttab
```

### Emergency USB Recovery

Boot from a Shanios USB and select the recovery option. From there:

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

---

## Update Problems

### shani-deploy Fails Mid-Download

`shani-deploy` uses `aria2c` with resume support. Simply re-run the command — it resumes automatically. If the partial file is corrupted:

```bash
sudo shani-deploy -c    # clean download cache
sudo shani-deploy       # re-download fresh
```

### "Not Enough Space" Error

```bash
# Check available space
df -h /
sudo btrfs filesystem usage /
sudo compsize /              # compressed + deduplicated sizes

# Clean up
sudo shani-deploy -c         # remove slot backup snapshots and download cache
flatpak uninstall --unused   # remove unused Flatpak runtimes
podman system prune -af      # remove unused container images
nix-collect-garbage -d       # remove old Nix generations

# Fix Btrfs space imbalance
sudo btrfs balance start -dusage=50 /
```

### GPG Verification Fails

```bash
gpg --keyserver keys.openpgp.org --recv-keys 7B927BFFD4A9EAAA8B666B77DE217F3DA8014792
sudo shani-deploy
```

### Update Downloaded but Slot Won't Activate

```bash
shani-deploy --status

# Check if the UKI was generated
ls /boot/efi/EFI/shanios/

# Manually regenerate UKI for a slot
sudo gen-efi configure green   # or blue
```

---

## Application Problems

### Can't Install a Package with `pacman`

This is by design — the OS root is read-only. Use the appropriate layer:

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

### A Flatpak App Fails to Launch or Behaves Unexpectedly

```bash
# Run from terminal to see the error
flatpak run com.example.App

# Check for sandbox violations
flatpak run --log-session-bus com.example.App 2>&1 | grep -i "deny\|error"

# Uninstall and reinstall cleanly
flatpak remove com.example.App
flatpak install flathub com.example.App
```

### Flatpak App Can't Access Files

Flatpak apps are sandboxed. Open **Flatseal** (pre-installed) to manage permissions, or from the terminal:

```bash
# Grant access to home directory
flatpak override --user --filesystem=home com.example.App

# Grant access to a specific path
flatpak override --user --filesystem=/home/user/Documents com.example.App
```

### Flatpak Update Breaks an App

```bash
# Pin the app to its current version
flatpak mask com.example.App

# Unpin when the issue is resolved
flatpak mask --remove com.example.App
```

### Microphone Not Working in Flatpak Apps

```bash
# Grant microphone permission
flatpak override --user --device=all com.example.App
# Or use Flatseal (pre-installed) for graphical permission management
```

---

## Audio Problems

### No Audio at Boot

```bash
# Restart the full PipeWire stack
systemctl --user restart pipewire pipewire-pulse wireplumber

# Check that sinks exist
pactl list sinks short
wpctl status

# Check status
systemctl --user status pipewire pipewire-pulse wireplumber
```

### Audio Works But Sounds Distorted

Usually a sample rate mismatch:

```bash
# Check current sample rate
pactl list sinks | grep "Sample Spec"

# Reset PipeWire config to defaults
rm ~/.config/pipewire/pipewire.conf 2>/dev/null
systemctl --user restart pipewire wireplumber
```

### No Audio on New Intel Laptop (SOF)

```bash
# Check if SOF firmware loaded
dmesg | grep -i "sof\|sound open"
cat /proc/asound/cards

# Check WirePlumber logs
journalctl --user -u wireplumber -n 50
```

---

## Bluetooth Problems

### Adapter Not Found

```bash
hciconfig -a
rfkill list bluetooth

# Unblock if soft-blocked
rfkill unblock bluetooth
sudo systemctl restart bluetooth
```

### Device Pairs But Won't Connect

```bash
bluetoothctl remove XX:XX:XX:XX:XX:XX
bluetoothctl scan on
bluetoothctl pair XX:XX:XX:XX:XX:XX
bluetoothctl trust XX:XX:XX:XX:XX:XX
journalctl -u bluetooth -n 30
```

### Headphones Connected But No Audio

```bash
pactl list cards | grep -i bluetooth
systemctl --user restart pipewire pipewire-pulse wireplumber
pactl set-default-sink bluez_output.XX_XX_XX_XX_XX_XX.1
```

---

## Encryption / TPM2 Problems

### TPM2 Won't Unlock After Firmware Update

PCR 0 changes when firmware is updated. You'll be prompted for your passphrase. After booting:

```bash
sudo gen-efi cleanup-tpm2
sudo gen-efi enroll-tpm2
```

### TPM2 Won't Unlock After Secure Boot Change

PCR 7 changes when Secure Boot settings change. Same fix:

```bash
sudo gen-efi cleanup-tpm2
sudo gen-efi enroll-tpm2
```

### Forgot LUKS Passphrase

If you have no backup passphrase, no keyfile, and no TPM2 enrollment, the data is **unrecoverable** — this is the intended LUKS2 security guarantee. Boot from the Shanios USB, reinstall, and restore from backups.

If you have a backup keyfile:

```bash
# Boot from Shanios USB
sudo cryptsetup open /dev/nvme0n1p2 shani_root --key-file /path/to/luks-keyfile
sudo mount -o subvol=@home /dev/mapper/shani_root /mnt/home
```

See [LUKS Management](security/luks) for full recovery procedures.

---

## Display / GPU Problems

### NVIDIA GPU Not Detected

```bash
nvidia-smi
lsmod | grep nvidia
dmesg | grep -i nvidia | head -20

# Verify MOK enrollment
mokutil --list-enrolled | grep -i shani

# If MOK not enrolled:
sudo gen-efi enroll-mok
sudo reboot
```

### Hybrid GPU (Optimus) — Wrong GPU Used

```bash
# Force discrete GPU for a specific application
prime-run application-name

# In Steam launch options:
# __NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia %command%

# Check which GPU is active
glxinfo | grep "OpenGL renderer"
```

### External Monitor Not Detected

```bash
kscreen-doctor --outputs   # KDE
xrandr --listmonitors      # under XWayland
cat /sys/class/drm/*/status
```

### Display Tearing (AMD/Intel)

Verify Wayland is active: `echo $XDG_SESSION_TYPE` (should print `wayland`). On KDE: System Settings → Display → Compositor → enable Tear-free rendering.

---

## Networking Problems

### Wi-Fi Connection Not Remembered After Update

Wi-Fi configurations persist in `/data/varlib/NetworkManager`. If they disappeared:

```bash
ls /data/varlib/NetworkManager/
nmcli connection show

# Check bind mount is active
mount | grep NetworkManager

sudo systemctl restart NetworkManager
```

### Wi-Fi Disconnects Frequently

```bash
journalctl -u NetworkManager -n 100

# Disable power management on the Wi-Fi adapter
nmcli connection modify "Your Connection Name" wifi.powersave 2
```

### Tailscale Disconnects After Update

Tailscale state persists in `/data/varlib/tailscale` across OS updates. If it disconnects:

```bash
sudo tailscale up
```

### firewalld Blocks an Application Unexpectedly

```bash
sudo firewall-cmd --list-all
sudo firewall-cmd --get-active-zones

# Allow a service
sudo firewall-cmd --permanent --add-service=service-name
sudo firewall-cmd --reload

# Allow a specific port
sudo firewall-cmd --permanent --add-port=PORT/tcp
sudo firewall-cmd --reload
```

---

## Storage Problems

### Disk Filling Up Unexpectedly

```bash
df -h
sudo compsize /    # compressed + deduplicated sizes

# Find large directories
du -sh /home/* --max-depth=1

# Clean up
flatpak uninstall --unused
nix-collect-garbage -d
podman system prune -af
distrobox list   # remove unused containers: distrobox rm container-name
```

### Btrfs Errors in dmesg

```bash
sudo btrfs scrub start /
sudo btrfs scrub status /

# Fix space imbalance
sudo btrfs balance start -dusage=85 -musage=85 /

# Read-only consistency check
sudo btrfs check --readonly /dev/nvme0n1p2
```

---

## Waydroid Problems

### Waydroid Session Fails to Start

```bash
systemctl status waydroid-container.service
journalctl -u waydroid-container.service -n 50
lsmod | grep binder

# Re-initialise
sudo waydroid-helper init
```

### Play Store Says Device Not Certified

After installing GApps, Google requires device registration:

```bash
adb shell settings get secure android_id
```

Visit `google.com/android/uncertified` in a browser and register the Android ID. Wait 15 minutes, then retry the Play Store.

### App Crashes Immediately (ARM Translation)

Most crashes are ARM-to-x86 translation failures via `libhoudini`. Check if an x86 APK is available from the developer. If not, a PWA (web app) is often a practical alternative.

---

## OverlayFS / `/etc` Customisations

To see what `/etc` files you have customised:

```bash
find /data/overlay/etc/upper/ -type f | sort
```

### Revert a Specific File to OS Default

```bash
sudo rm /data/overlay/etc/upper/path/to/file
# The OS default (lower layer) becomes active again immediately
```

### Revert All `/etc` Customisations

```bash
sudo rm -rf /data/overlay/etc/upper/*
sudo reboot
```

---

## General Diagnostics

### Reading the System Journal

```bash
# All errors from the current boot
journalctl -b 0 -p err --no-pager

# All errors from the previous boot (useful after a crash or rollback)
journalctl -b -1 -p err --no-pager

# Follow logs in real time
journalctl -f

# Logs for a specific service
journalctl -u service-name -b 0 -n 100

# Filter by time
journalctl --since "10 minutes ago"
```

### Checking What Changed

```bash
# What /etc files have you customised?
find /data/overlay/etc/upper/ -type f | sort

# What services are enabled?
systemctl list-unit-files --state=enabled

# What Flatpak overrides are active?
flatpak override --user --show
```

### System Health Summary

```bash
# Full health check
shani-health

# Verbose with all details
shani-health -v

# Storage summary
sudo shani-deploy --storage-info
```

---

## Gathering Logs for Bug Reports

When reporting a bug, include:

```bash
cat /etc/shani-version
cat /data/current-slot
shani-deploy --version
shani-health --json
journalctl -b 0 -p err --no-pager | tail -30
lspci | grep -E "VGA|Audio|Network"
```

Report bugs at [github.com/shani8dev/shani-os/issues](https://github.com/shani8dev/shani-os/issues) or ask in the [Telegram community](https://t.me/shani8dev).
