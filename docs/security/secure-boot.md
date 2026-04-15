---
title: Secure Boot
section: Security
updated: 2026-04-01
---

# Secure Boot

Shanios ships with its own MOK (Machine Owner Key) and signs all UKI images at install time. Secure Boot can be enabled after installation to ensure only verified OS images can boot.

## How It Works

1. The Shanios installer generates a unique MOK key pair on your machine
2. Both UKIs (`shanios-blue.efi`, `shanios-green.efi`) are signed with this key
3. You enroll the public MOK in your firmware's MOK database
4. Enable Secure Boot in UEFI settings
5. Your firmware now verifies every Shanios UKI before booting it — unsigned or tampered images are rejected

Each time `shani-deploy` runs an update, `gen-efi` rebuilds and re-signs the new slot's UKI with the same key before updating the boot entry.

## Enrolling the MOK Key

After installation, with Secure Boot still disabled:

```bash
# Import the MOK key into the firmware database
sudo mokutil --import /etc/secureboot/MOK.cer
```

You will be prompted to set a one-time enrollment password. On the next reboot, the MokManager EFI utility appears and asks for that password — enter it to complete enrollment.

After enrollment, enable Secure Boot in your UEFI settings and reboot. The system should boot normally.

## Verifying Secure Boot Status

```bash
# Check if Secure Boot is currently active
mokutil --sb-state

# List enrolled MOK keys
mokutil --list-enrolled

# Verify a UKI is signed with the enrolled key
sudo pesign -S -i /boot/efi/EFI/Linux/shanios-blue.efi

# Check sbctl status (if installed)
sudo sbctl status
sudo sbctl verify
```

## Key Files

| File | Purpose |
|------|---------|
| `/etc/secureboot/MOK.key` | Private key — used by `gen-efi` to sign new UKIs |
| `/etc/secureboot/MOK.cer` | Public certificate — enrolled in firmware MOK database |
| `/etc/secureboot/MOK.pem` | PEM format of the certificate |

> **Keep the private key safe.** It is stored in `/etc/secureboot/` which is in the `/etc` OverlayFS upper layer (i.e., in `@data`). It persists across all updates and rollbacks. Do not share or export it.

## Re-generating Keys

If you need to generate a fresh key pair (e.g., after a hardware change or key compromise):

```bash
# Generate new key pair
sudo gen-efi --regen-keys

# Re-enroll the new public key
sudo mokutil --import /etc/secureboot/MOK.cer

# Reboot → complete MokManager enrollment → re-enable Secure Boot
```

## Troubleshooting

**Boot fails after enabling Secure Boot:**
- Reboot and disable Secure Boot temporarily
- Verify MOK was enrolled: `mokutil --list-enrolled`
- Check UKI signature: `sudo pesign -S -i /boot/efi/EFI/Linux/shanios-blue.efi`
- Re-run `sudo gen-efi` to rebuild and re-sign, then retry enrollment

**MokManager doesn't appear on reboot:**
- The firmware may clear the pending enrollment after timeout
- Re-run `sudo mokutil --import /etc/secureboot/MOK.cer` and reboot again promptly

**"Verification failed: (0x1A) Security Violation":**
- The UKI was not signed with an enrolled key
- Disable Secure Boot, run `sudo gen-efi`, re-enroll, and retry
