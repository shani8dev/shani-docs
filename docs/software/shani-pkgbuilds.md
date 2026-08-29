---
title: Building & Adding Packages
section: Software & Apps
updated: 2026-08-28
---

# Building & Adding Packages

Shanios uses a reproducible Docker-based build pipeline to compile Arch Linux packages for the `[shani]` repository. This page explains how to build existing packages and add new ones.

## Build Infrastructure

All package builds run inside the `shrinivasvkumbhar/shani-builder` Docker container. The container is based on `archlinux:base-devel` and pre-installs every tool needed to build Shanios packages:

- `pacman`, `btrfs-progs`, `zstd`, `squashfs-tools`
- `archiso`, `dracut`, `systemd-ukify`, `sbsigntools`
- The Shanios signing keyring (`shani-keyring`)
- The `[shani]` pacman repository

The container runs as privileged because image assembly requires `btrfs receive`, loop mounts, and chroot operations.

## Package Directory Structure

Each package lives under `shani-pkgbuilds/` in its own directory:

```
shani-pkgbuilds/
├── shani-core/
│   └── PKGBUILD          # Package build definition
├── shani-desktop-gnome/
│   └── PKGBUILD
├── shani-keyring/
│   └── PKGBUILD          # Also pins sha256sums from shani-keyring repo
├── shani-tools/
│   └── PKGBUILD
├── gen-efi/
│   └── PKGBUILD
└── ... (50+ packages)
```

## PKGBUILD Conventions

All Shanios PKGBUILDs follow Arch Linux packaging standards with these project-specific conventions:

- **Flags:** `make_pkg.sh` accepts `--debug` (verbose build), `--no-sign` (skip GPG signing), and `--no-upload` (build only, don't publish).
- **Signing:** Every package is GPG-signed at build time using the key `7B927BFFD4A9EAAA8B666B77DE217F3DA8014792`.
- **Publishing:** Signed packages are uploaded to `repo.shani.dev` via `repo-add`.

## Adding a New Package

1. Create a new directory under `shani-pkgbuilds/`:

```bash
cd shani-pkgbuilds/
mkdir my-new-package
```

2. Write a `PKGBUILD` following Arch Linux standards:

```bash
# Maintainer: Your Name <you@example.com>
pkgname=my-new-package
pkgver=1.0.0
pkgrel=1
pkgdesc="Description of the package"
arch=('x86_64')
url="https://example.com"
license=('GPL3')
depends=('dependency1' 'dependency2')
makedepends=('git')
source=("$pkgname-$pkgver.tar.gz::https://github.com/user/repo/archive/v$pkgver.tar.gz")
sha256sums=('SKIP')

build() {
    cd "$pkgname-$pkgver"
    make
}

package() {
    cd "$pkgname-$pkgver"
    make DESTDIR="$pkgdir" install
}
```

3. Test the build locally:

```bash
cd shani-pkgbuilds/my-new-package
../../make_pkg.sh
```

4. Submit a pull request to the `shani-pkgbuilds` repository.

## Adding a Package to an Image Profile

To include your new package in a Shanios image:

1. Edit `shani-install-media/image_profiles/<profile>/package-list.txt`
2. Add your package name (must match `pkgname` in PKGBUILD)
3. Rebuild the image: `build.sh full -p <profile>`

## Checksum Pinning

Some packages pin checksums from external repos. For example, `shani-keyring/PKGBUILD` pins `sha256sums` on the three files from the `shani-keyring` repo:

```bash
sha256sums=('abc123...'  # shani.gpg
            'def456...'  # shani-trusted
            'ghi789...') # shani-revoked
```

When the `shani-keyring` repo changes, these checksums must be manually bumped. The `check-skip-checksums.sh` linter flags packages that use `SKIP` instead of real checksums — but note that it has a known false negative: it treats any `git+` URL as pinned even with mutable `#tag=$pkgver`.

## Known Issues

- **`check-skip-checksums` false negative:** `check-skip-checksums.sh:80` treats any `git+` URL as pinned even with mutable `#tag=$pkgver`.
- **`foo2zjs-nightly` HTTP firmware:** `foo2zjs-nightly/PKGBUILD:34-60` uses 26 HTTP sources (no HTTPS, no checksum verification).
- **`pkg_name` interpolation:** `make_pkg.sh:96` uses unquoted variable in `bash -c` — safe in practice but worth noting.

## See Also

- [Pacman Keyring](../security/keyring.md) — Trust root and key verification
- [Shani Package Repository](shani-repo) — How the published repo works
- [Build Pipeline](../arch/build-pipeline.md) — How images are assembled from packages
- [Arch Linux PKGBUILD Guide](https://wiki.archlinux.org/title/PKGBUILD) — Official packaging reference
