---
title: gen-efi Reference
section: Security
updated: 2026-04-30
---

# gen-efi Reference

`gen-efi` is the Shanios tool for building and signing Unified Kernel Images (UKIs), managing MOK (Machine Owner Key) Secure Boot keys, and enrolling LUKS2 decryption keys into the TPM2 chip. It wraps `dracut --uefi` and `sbsign`/`sbverify`, and produces the signed EFI binaries placed in `/boot/efi/EFI/shanios/`.

`gen-efi` is called automatically by `shani-deploy` during every update. You only need to invoke it manually when troubleshooting boot issues, re-enrolling Secure Boot or TPM2 after firmware changes, or diagnosing a corrupt UKI.

## Usage

```bash
# Generate UKI for a specific slot (must match the currently booted slot when run directly)
sudo gen-efi configure blue
sudo gen-efi configure green

# Enroll MOK key into UEFI firmware (re-signs EFI binaries, stages mokutil enrollment)
sudo gen-efi enroll-mok

# Clean up stale MOK keys from previous installations
sudo gen-efi cleanup-mok

# Enroll LUKS key into TPM2 (for passwordless disk unlock)
sudo gen-efi enroll-tpm2

# Remove stale TPM2 LUKS keyslots after re-enrollment
sudo gen-efi cleanup-tpm2
```

> **Important:** `gen-efi configure` enforces that the target slot matches the currently booted slot when run directly on the live system. Running it for the inactive slot is only permitted inside a chroot, which `shani-deploy` does automatically.

## Output Files

| File | Description |
|------|-------------|
| `/boot/efi/EFI/shanios/shanios-blue.efi` | Signed UKI for the `@blue` slot |
| `/boot/efi/EFI/shanios/shanios-green.efi` | Signed UKI for the `@green` slot |

Each UKI bundles:
- Linux kernel
- Initramfs (built by dracut)
- Embedded kernel command line (generated from live system state and written to `/etc/kernel/install_cmdline_<slot>`)
- Signed with MOK key from `/etc/secureboot/keys/MOK.key`

## What `gen-efi configure` Does

`gen-efi configure <slot>` rebuilds the UKI for a slot by:

1. Validating that `<slot>` matches the currently booted subvolume (unless running inside a chroot)
2. Ensuring the MOK keypair exists — generating a new one if missing, and validating that `MOK.key` and `MOK.crt` are a matching keypair
3. Mounting the ESP at `/boot/efi` temporarily if not already mounted
4. Updating shim (`BOOTX64.EFI`) and systemd-boot (`grubx64.efi`) on the ESP if newer source binaries are available
5. Reading the current kernel version from `/usr/lib/modules/`
6. Detecting the LUKS UUID from the live mapper device, with fallback to `/etc/crypttab` for chroot environments
7. Updating `/etc/crypttab` and the dracut crypt config to keep them consistent
8. Generating the complete kernel command line and writing it to `/etc/kernel/install_cmdline_<slot>`
9. Running `dracut --force --uefi` to build the UKI
10. Signing the binary with `sbsign` and verifying it with `sbverify`
11. Staging MOK enrollment automatically if the current key is not yet enrolled in firmware

## Signing Keys

| File | Purpose |
|------|---------|
| `/etc/secureboot/keys/MOK.key` | RSA-2048 private key — signs UKIs (never leaves the device) |
| `/etc/secureboot/keys/MOK.crt` | PEM certificate — used by sbsign |
| `/etc/secureboot/keys/MOK.der` | DER-encoded public key — enrolled in firmware MOK database |

Keys are generated at install time and stored in the `/etc` overlay upper layer (inside `@data`). They survive all updates and rollbacks. If `MOK.key` and `MOK.crt` are missing or mismatched, `gen-efi` automatically regenerates the full keypair.

## Verifying a UKI

```bash
# Verify signature against the local MOK cert
sbverify --cert /etc/secureboot/keys/MOK.crt /boot/efi/EFI/shanios/shanios-blue.efi
sbverify --cert /etc/secureboot/keys/MOK.crt /boot/efi/EFI/shanios/shanios-green.efi

# Inspect UKI contents (kernel version, cmdline, etc.)
sudo ukify inspect /boot/efi/EFI/shanios/shanios-blue.efi

# Extract the embedded kernel command line
sudo objcopy -O binary --only-section=.cmdline \
    /boot/efi/EFI/shanios/shanios-blue.efi /dev/stdout | strings
```

## Common Use Cases

### After a Kernel Update

`shani-deploy` handles this automatically. If you need to do it manually (run from the currently booted slot):

```bash
sudo gen-efi configure blue   # if booted into @blue
sudo gen-efi configure green  # if booted into @green
```

### After LUKS UUID Change or Enabling Encryption

```bash
sudo gen-efi configure blue
```

### After Secure Boot Key Regeneration

If `gen-efi` regenerates the MOK keypair automatically, or you need to force re-enrollment:

```bash
sudo gen-efi enroll-mok
# Reboot — MokManager appears automatically
# Confirm with password: shanios
sudo reboot
```

After confirming the new key is enrolled, clean up stale keys from previous installations:

```bash
sudo gen-efi cleanup-mok
mokutil --list-enrolled | grep -i shani
```

### Rebuilding After Recovery

If a UKI is missing or corrupted:

```bash
sudo gen-efi configure blue
```

### Re-enrolling TPM2 After Firmware or Secure Boot Changes

```bash
sudo gen-efi cleanup-tpm2
sudo gen-efi enroll-tpm2
```

See [TPM2 Enrollment](../security/tpm2) for full details.
