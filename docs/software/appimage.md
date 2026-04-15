---
title: AppImage
section: Software & Apps
updated: 2026-04-01
---

# AppImage

AppImages are self-contained executable bundles that run on any Linux system without installation. **Gear Lever** (pre-installed) provides a GUI for managing AppImages — integrating them into your app launcher, handling updates, and organising your collection.

## Running an AppImage

```bash
# Make executable and run
chmod +x MyApp.AppImage
./MyApp.AppImage
```

Or open Gear Lever (from your app launcher) and drag the AppImage in.

## Gear Lever

Gear Lever integrates AppImages into your desktop:

- Automatically makes AppImages executable
- Extracts and installs the `.desktop` entry and icon into your launcher
- Manages a library of your AppImages in `~/Applications/`
- Checks for updates via AppImageUpdate (where supported)

Open Gear Lever from GNOME Activities / KDE Application Menu, or:
```bash
flatpak run it.mijorus.gearlever
```

## Organising AppImages

The recommended location for personal AppImages:

```bash
mkdir -p ~/Applications
mv MyApp.AppImage ~/Applications/
```

Gear Lever monitors this directory automatically.

## FUSE Requirement

AppImages use FUSE to mount their squashfs payload at runtime. FUSE is pre-installed on Shanios.

If an AppImage refuses to run with a "FUSE" error:
```bash
# Check FUSE availability
ls /dev/fuse

# Run AppImage without FUSE (extracts to temp dir)
./MyApp.AppImage --appimage-extract-and-run
```

## Extracting an AppImage

```bash
# Extract contents to a directory (no FUSE needed)
./MyApp.AppImage --appimage-extract
# Creates: squashfs-root/
```

## AppImageUpdate (CLI)

```bash
# Check for updates (if AppImage supports it)
appimageupdatetool MyApp.AppImage

# Apply update in-place
appimageupdatetool --overwrite MyApp.AppImage
```

## Persistence

AppImages and their data live entirely in your home directory — they are unaffected by OS updates and rollbacks. No special handling is needed.

## Sandboxing

Unlike Flatpak, AppImages are **not sandboxed** by default. They run with the same permissions as your user. For untrusted AppImages, consider running them inside a Distrobox container.
