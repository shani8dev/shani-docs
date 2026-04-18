---
title: Secure Boot
section: Security
updated: 2026-04-30
---

# Secure Boot

Shanios ships with its own MOK (Machine Owner Key) and signs all UKI images at install time. Secure Boot can be enabled after installation to ensure only verified OS images can boot.

## How It Works

The full boot chain:

```
UEFI Firmware (verifies Shim via Microsoft CA)
  → Shim (verifies systemd-boot via MOK)
    → systemd-boot (verifies the UKI via MOK)
      → Unified Kernel Image (kernel + initramfs + cmdline, all signed together)
```

1. The Shanios installer generates a unique MOK key pair on your machine
2. Both UKIs (`shanios-blue.efi`, `shanios-green.efi`) are signed with this key
3. You enroll the public MOK in your firmware's MOK database
4. Enable Secure Boot in UEFI settings
5. Your firmware now verifies every Shanios UKI before booting it — unsigned or tampered images are rejected

The bootloader editor is disabled and the kernel command line is embedded in the UKI at build time, so it cannot be modified from the boot menu.

Each time `shani-deploy` runs an update, `gen-efi` rebuilds and re-signs the new slot's UKI before updating the boot entry.

## Enrolling the MOK Key

### Method 1: From the Live USB (Recommended)

On the first boot from the Shani OS USB, MokManager launches automatically:

1. Select "Enroll key from disk"
2. Navigate to the EFI partition and select `EFI/BOOT/MOK.der`
3. Confirm enrollment
4. Reboot and enable Secure Boot in BIOS

### Method 2: From the Installed System

```bash
# Re-signs all EFI binaries, copies MOK.der to ESP, stages enrollment via mokutil
sudo gen-efi enroll-mok

# Reboot — MokManager appears automatically
# Confirm with password: shanios
sudo reboot
```

After MokManager completes, enable Secure Boot in BIOS. Then clean up any stale keys from previous installations:

```bash
sudo gen-efi cleanup-mok
```

## Verifying Secure Boot Status

```bash
# Check if Secure Boot is currently active
mokutil --sb-state

# List enrolled MOK keys
mokutil --list-enrolled | grep -i shani

# Verify a UKI is signed with the local MOK cert
sbverify --cert /etc/secureboot/keys/MOK.crt /boot/efi/EFI/shanios/shanios-blue.efi
sbverify --cert /etc/secureboot/keys/MOK.crt /boot/efi/EFI/shanios/shanios-green.efi
```

## Key Files

| File | Purpose |
|------|---------|
| `/etc/secureboot/keys/MOK.key` | Private key — used by `gen-efi` to sign new UKIs (never leaves the device) |
| `/etc/secureboot/keys/MOK.crt` | PEM certificate — used by sbsign |
| `/etc/secureboot/keys/MOK.der` | DER-encoded public key — enrolled in firmware MOK database |

Keys are stored in the `/etc` OverlayFS upper layer (inside `@data`) and persist across all updates and rollbacks.

## Re-generating Keys

If `gen-efi` detects a missing or mismatched keypair, it regenerates the full pair automatically. To force re-enrollment after regeneration:

```bash
sudo gen-efi enroll-mok
# Reboot → complete MokManager enrollment → re-enable Secure Boot
```

## Troubleshooting

**Boot fails after enabling Secure Boot:**
- Reboot and disable Secure Boot temporarily
- Verify MOK was enrolled: `mokutil --list-enrolled | grep -i shani`
- Check UKI signature: `sbverify --cert /etc/secureboot/keys/MOK.crt /boot/efi/EFI/shanios/shanios-blue.efi`
- Run `sudo gen-efi configure blue` to rebuild and re-sign, then retry enrollment

**MokManager doesn't appear on reboot:**
- The firmware may have cleared the pending enrollment after timeout
- Re-run `sudo gen-efi enroll-mok` and reboot again promptly

**"Verification failed: (0x1A) Security Violation":**
- The UKI was not signed with an enrolled key
- Disable Secure Boot, run `sudo gen-efi configure blue`, re-enroll with `sudo gen-efi enroll-mok`, and retry

**TPM2 fails after Secure Boot change:**
- When you change Secure Boot settings, PCR 7 changes — re-enroll TPM2:
  ```bash
  sudo gen-efi cleanup-tpm2
  sudo gen-efi enroll-tpm2
  ```
