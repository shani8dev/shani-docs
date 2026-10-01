---
title: Pacman Keyring & Trust Root
section: Security
updated: 2026-08-28
---

# Pacman Keyring & Trust Root

Shanios uses a custom pacman keyring to verify every package installed from the `[shani]` repository. This page explains how the trust root works and how to verify it.

## How Package Verification Works

Every package in the `[shani]` repository is GPG-signed at build time by `shani-builder`. When pacman installs a package, it verifies the signature against the trusted keys in `/usr/share/pacman/keyrings/`.

The trust chain:

```
shani-builder signs package → .pkg.tar.zst + .sig uploaded to repo
    → pacman downloads both
    → verifies .sig against shani.gpg in keyrings
    → installs only if signature is valid
```

## The Keyring Files

The keyring lives in the [`shani-keyring`](https://github.com/shani8dev/shani-keyring) repo and is packaged by `shani-pkgbuilds/shani-keyring/PKGBUILD`. It contains exactly three files:

| File | Purpose |
|------|---------|
| `shani.gpg` | Public signing key(s) in pacman-keyring format |
| `shani-trusted` | Which key(s) in `shani.gpg` are trusted and at what trust level |
| `shani-revoked` | Revoked key fingerprints (currently empty) |

## Signing Key Fingerprint

```
7B927BFFD4A9EAAA8B666B77DE217F3DA8014792
```

This same key is used everywhere in the project: OS image signing in `shani-deploy`, the `[shani]` repo import in `shani-builder`'s Docker image, and package signing.

## Verifying the Keyring

To verify the keyring is valid on an installed system:

```bash
# Check the keyring files exist
ls -la /usr/share/pacman/keyrings/shani.*

# Verify pacman can parse the keyring
sudo pacman-key --list-keys | grep shani
```

## Known Issues

- ~~**Invalid GPG header.**~~ **Fixed.** This entry used to say `shani.gpg`
  carried the header `-----shrinivas-----` instead of the standard one, and that
  this "must be fixed for the trust root to function". It is not the case any
  more: the built `shani-keyring-20241020-5-any.pkg.tar.zst` carries
  `-----BEGIN PGP PUBLIC KEY BLOCK-----`, and `shani-trusted` names
  `7B927BFFD4A9EAAA8B666B77DE217F3DA8014792`, which `pacman-key --populate
  shani` consumes via the package's scriptlet.

  **Do not re-add `gpg --list-keys` as the check.** `shani.gpg` is a **keybox**
  (`kbx`), not a legacy OpenPGP keyring, so plain `gpg --keyring shani.gpg
  --list-keys` answers `invalid packet (ctb=2d)` **and is entirely correct** —
  it is pacman-key's own keybox reader that reads the format. Reading that error
  as a broken trust root is the wrong conclusion from a working keyring.
- **Single non-expiring key.** No rotation path exists. Revocation doesn't propagate to already-installed systems. `shani-revoked` is genuinely empty (0 bytes), so there is currently nothing to revoke *into* — worth knowing before treating an empty revocation list as a gap.

## See Also

- [Secure Boot](secure-boot) — MOK key enrollment
- [LUKS Encryption](luks) — Full-disk encryption
- [Build Pipeline](../arch/build-pipeline.md) — How images are built and signed
