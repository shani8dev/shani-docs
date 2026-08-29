---
title: Build Pipeline
section: Architecture
updated: 2026-08-28
---

# Build Pipeline

Shanios images are produced by a multi-stage build pipeline that takes a package list, an overlay filesystem, and a profile-specific customization script, and outputs a compressed Btrfs send-stream (`.zst`), an ISO, or both. The entire pipeline runs inside a privileged Docker container so the host system is never modified.

## Overview

The pipeline is driven by `build.sh` in [shani-install-media](https://github.com/shani8dev/shani-install-media). It dispatches to specialized sub-scripts for each stage:

```
build.sh <command> -p <profile>
```

### Commands

| Command | What it does | Output |
|---|---|---|
| `image` | Pacstraps packages, applies overlay, runs customization, snapshots to `.zst` | `<date>/<os>-<date>-<profile>.zst` + `.sha256` + `.asc` |
| `flatpak` | Builds a Flatpak image from `flatpak-packages.txt` | `flatpakfs.zst` |
| `snap` | Builds a Snap seed image from `snap-packages.txt` | `snapfs.zst` |
| `iso` | Runs `mkarchiso` with base + optional Flatpak/Snap images | `<date>/<os>-<date>-<profile>.iso` |
| `repack` | Signs the ISO for Secure Boot and generates torrent | `signed_<os>-<date>-<profile>.iso` + `.torrent` |
| `upload` | Uploads artifacts to SourceForge and Cloudflare R2 | Remote artifacts |
| `release` | Creates `latest.txt` or `stable.txt` channel manifests | Channel files |
| `promote-stable` | Promotes current `latest` to `stable` after verification | Updated channel files |
| `verify` | Checks remote artifacts against local checksums | Pass/fail |
| `test` | Installs/boots/updates/rolls back on loop-mounted disks | Test report |

### Compound Commands

| Command | Pipeline |
|---|---|
| `all` | image → release latest → upload image |
| `full` | image → flatpak → snap → iso → repack → release latest → upload all |
| `iso-only` | Download from R2 → build ISO → repack → upload iso |
| `publish` | release → upload (for promoting pre-released artifacts) |

## Build Stages

### 1. Base Image (`build-base-image.sh`)

The core stage. Creates a Btrfs subvolume, pacstraps the package list from `image_profiles/<profile>/package-list.txt`, applies the shared overlay (base configs, systemd units), then runs the profile-specific customization script:

- `gnome-customization.sh` — enables GNOME services, installs GNOME-specific Flatpaks
- `plasma-customization.sh` — enables KDE services, Kvantum theme override
- `cosmic-customization.sh` — enables COSMIC services
- `kiosk-customization.sh` — enables Cage + labwc, configures unattended GDM autologin, mounts tmpfs home
- `server-customization.sh` — enables cloud-init, sshd, firewalld, disables GUI services

The result is snapshotted as a Btrfs send-stream and compressed with Zstandard.

### 2. Flatpak Image (`build-flatpak-image.sh`)

If `flatpak-packages.txt` exists for the profile, this stage creates a separate Btrfs subvolume, installs all listed Flatpaks, and produces a `flatpakfs.zst` that is bundled into the ISO.

### 3. Snap Image (`build-snap-image.sh`)

Same pattern as Flatpak — if `snap-packages.txt` exists, builds a `snapfs.zst` with pre-installed snaps.

### 4. ISO (`build-iso.sh`)

Runs `mkarchiso` using the base image and optional Flatpak/Snap images as source. The `--from-r2` flag allows building the ISO without the base image locally — it downloads from Cloudflare R2 instead.

### 5. Repack (`repack-iso.sh`)

Signs the ISO with `sbsign` for Secure Boot, generates `.sha256` and `.asc` files, and creates a BitTorrent file for distribution.

### 6. Upload (`upload.sh`)

Pushes artifacts to SourceForge (primary download) and Cloudflare R2 (build cache and CDN). Uses `rclone` for R2 and `lftp` for SourceForge.

## Image Profiles

Each profile has its own directory under `image_profiles/`:

| Profile | Directory | Desktop | Package count |
|---|---|---|---|
| `gnome` | `image_profiles/gnome/` | GNOME | 25 meta-packages + Flatpaks |
| `plasma` | `image_profiles/plasma/` | KDE Plasma | 25 meta-packages + Flatpaks |
| `cosmic` | `image_profiles/cosmic/` | COSMIC | 25 meta-packages + Flatpaks |
| `kiosk` | `image_profiles/kiosk/` | Cage + labwc (Firefox) | 17 packages |
| `server` | `image_profiles/server/` | None (headless) | 170 explicit packages |

> **Note:** The "25 meta-packages" for gnome/plasma/cosmic are defined in `image_profiles/<profile>/package-list.txt`. Each meta-package (e.g., `shani-core`, `shani-desktop-gnome`) pulls in many transitive dependencies via `shani-pkgbuilds` PKGBUILDs and `.install` scripts, resulting in hundreds of total packages installed on the final image.

Shared packages across all profiles are in `image_profiles/shared/`.

## Docker Environment

All build steps run inside the `shrinivasvkumbhar/shani-builder` Docker image (built from `shani-builder/docker/`). The container is privileged because image assembly requires Btrfs operations, loop mounts, and chroot — all of which need host-level access.

See [Fleet Deployment](../enterprise/fleet.md) for how OEMs use this pipeline to build custom images.

## CI/CD

Two GitHub Actions workflows in `shani-builder` automate the pipeline:

- **`build-image.yml`** — builds the OS image on push to `main` or manual dispatch
- **`promote-stable.yml`** — promotes `latest` to `stable` after verification

Both use AWS OIDC for authentication (no long-lived keys).

## See Also

- [Fleet Deployment (OEM image building)](../enterprise/fleet.md)
- [Package Repo on other distros](../software/shani-repo.md)
- [Build pipeline blog walkthrough](https://blog.shani.dev/post/shani-os-build-pipeline)
- [Keyring & Signing](../security/keyring.md)
