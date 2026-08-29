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

If you need to add it manually:

```bash
# Install the keyring first
sudo pacman -S shani-keyring

# Add the repository to /etc/pacman.conf
echo -e '\n[shani]\nSigLevel = Required DatabaseOptional\nServer = https://repo.shani.dev/$arch' | sudo tee -a /etc/pacman.conf

# Refresh the database
sudo pacman -Sy
```

## Building Packages

Packages are built by the `shani-pkgbuilds` repo inside a reproducible Docker container. See the [shani-pkgbuilds](https://github.com/shani8dev/shani-pkgbuilds) repo for details.

## Known Issues

- **Unsigned package database.** `shani.db` and `shani.files` currently have no `.sig` files, while every individual package is signed. A tampered database is undetectable by clients.

## See Also

- [Pacman Keyring](../security/keyring.md) — Trust root and key verification
- [Build Pipeline](../arch/build-pipeline.md) — How packages are built
- [System Updates](../updates/system.md) — How updates are delivered
