---
title: Android (Waydroid)
section: Software & Apps
updated: 2026-04-01
---

# Android (Waydroid)

Waydroid runs a full Android system in a container on Shanios. It integrates with the Wayland compositor so Android apps appear as native windows. Waydroid is pre-installed and pre-configured — you just need to initialise it.

## What's Pre-installed

- `waydroid` — the container runtime
- `waydroid-helper` — automated setup and management tool
- `waydroid-container.service` — enabled at boot
- `python-pyclip` — clipboard integration between Android and host
- `android-tools` — `adb` and `fastboot`
- `android-udev` — udev rules for Android device access
- Firewall rules pre-configured (DNS 53/udp, DHCP 67/udp, `waydroid0` in trusted zone)

## Initial Setup

```bash
# One-command setup using the pre-installed helper
sudo waydroid-helper init

# Waydroid will download the Android system image automatically.
# This requires an internet connection and takes a few minutes.
```

After `init` completes, Waydroid appears in your app launcher. Android apps can be launched from there or via the terminal.

## Google Play Store and ARM Apps

The default Waydroid image is AOSP without Google services. For Play Store access, install GApps after initialisation:

```bash
pip install waydroid-script --break-system-packages
sudo waydroid-script install gapps
```

After installing GApps, open the Play Store and sign in with your Google account. You may need to register your device ID at `google.com/android/uncertified` if the Play Store blocks downloads.

**ARM app compatibility** is handled by `libhoudini` (Intel's ARM-to-x86 translation), included in the Shanios Waydroid setup. Most ARM-compiled Android apps run transparently.

## Basic Usage

```bash
# Start the Waydroid session
waydroid session start

# Launch the Android app drawer (full Android UI)
waydroid show-full-ui

# Stop the session
waydroid session stop

# Check status
waydroid status
```

## Installing Android Apps

### From APK files

```bash
# Install an APK
waydroid app install /path/to/app.apk

# List installed apps
waydroid app list

# Launch a specific app by package name
waydroid app launch com.example.app

# Remove an app
waydroid app remove com.example.app
```

### Via ADB

```bash
# Connect ADB to the running Waydroid instance
adb connect 192.168.250.1:5555

# Install an APK via ADB
adb install app.apk

# Open a shell inside Android
adb shell
```

## Clipboard Integration

The `python-pyclip` package enables clipboard sharing between Android apps and your Linux desktop. Copy text in an Android app and paste it in a Linux app, and vice versa — automatically.

## File Sharing

```bash
# Android's shared storage is accessible on the host at:
ls ~/waydroid/data/media/0/

# Copy files into Android
cp myfile.pdf ~/waydroid/data/media/0/Downloads/
```

## Performance Tips

```bash
# Check if hardware acceleration is working
waydroid prop get persist.waydroid.width

# Force a specific resolution (useful for HiDPI displays)
waydroid prop set persist.waydroid.width 1920
waydroid prop set persist.waydroid.height 1080

# Reset display settings to default
waydroid prop set persist.waydroid.width ""
waydroid prop set persist.waydroid.height ""
```

## Managing the Service

```bash
# The container service is enabled at boot — check its status
systemctl status waydroid-container

# Restart the container
sudo systemctl restart waydroid-container

# Stop the container (frees memory when not in use)
sudo systemctl stop waydroid-container

# View Waydroid logs
journalctl -u waydroid-container -f
```

## Storage

Waydroid data lives in the `@waydroid` Btrfs subvolume mounted at `/var/lib/waydroid`. It persists across all system updates and rollbacks. The Android system image, installed apps, and user data all reside here.

## Firewall

Firewall rules are pre-configured during installation:
- Port 53/udp (DNS) and 67/udp (DHCP) are open for the `waydroid0` interface
- The `waydroid0` interface is in the trusted firewall zone
- Packet forwarding is enabled

No manual firewall configuration is needed.

## Troubleshooting

```bash
# Re-initialise Waydroid if something goes wrong
sudo waydroid-helper init --force

# Check for missing kernel modules
sudo modprobe binder_linux
sudo modprobe ashmem_linux   # older kernels only; not needed on 6.x+

# Verify binder is available
ls /dev/binder /dev/anbox-binder 2>/dev/null || echo "binder not found"

# Full reset (removes all Android data and apps)
sudo waydroid init -f
```

## Tips
- Waydroid requires a Wayland session — it does not work under XWayland or on X11-only desktops
- For Google Play Store support, use a community GApps package (not included by default)
- Battery and suspend management: stop the `waydroid-container` service when not in use to save power
- Android apps are sandboxed inside the Waydroid container and cannot access your Linux files unless you explicitly share them via the `~/.local/share/waydroid/data/media/0/` path
