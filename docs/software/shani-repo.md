---
title: Shani Package Repository
section: Software & Apps
updated: 2026-08-28
---

# Shani Package Repository

The `[shani]` repository contains custom packages built for Shanios. It is served at `repo.shani.dev` and is configured on every Shanios install.

## Repository Structure

```
repo.shani.dev/x86_64/
├── shani.db          # Package database (metadata)
├── shani.files       # File listing database
├── shani.db.tar.gz   # Compressed database
├── shani.files.tar.gz
├── *.pkg.tar.zst     # Package archives
└── *.sig             # GPG signatures for each package
```

## Adding the Repository

The `[shani]` repository is pre-configured on every Shanios install. The pacman configuration is in `/etc/pacman.conf`:

```ini
[shani]
SigLevel = Required DatabaseOptional
Server = https://repo.shani.dev/$arch
```

**No action needed on Shani OS:** the `[shani]` repository is already configured on every install, and the OS root is immutable — host-level `pacman -S` or edits to `/etc/pacman.conf` cannot persist and are not supported. (The manual `pacman` instructions above apply only to **non-ShaniOS** Arch-based systems that want to pull individual Shanios tools — see [Fleet Deployment](../enterprise/fleet.md) for that setup.)

## Building Packages

Packages are built by the `shani-pkgbuilds` repo inside a reproducible Docker container. See the [shani-pkgbuilds](https://github.com/shani8dev/shani-pkgbuilds) repo for details.

## Known Issues

- **Unsigned package database.** `shani.db` and `shani.files` currently have no `.sig` files, while every individual package is signed. A tampered database is undetectable by clients.

## See Also

- [Pacman Keyring](../security/keyring.md) — Trust root and key verification
- [Build Pipeline](../arch/build-pipeline.md) — How packages are built
- [System Updates](../updates/system.md) — How updates are delivered
