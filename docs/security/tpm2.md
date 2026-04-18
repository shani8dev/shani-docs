---
title: TPM2 Enrollment
section: Security
updated: 2026-04-30
---

# TPM2 Enrollment

TPM2 enrollment seals your LUKS2 disk encryption key into your machine's Trusted Platform Module. Once enrolled, the disk unlocks automatically at boot — no passphrase prompt — as long as the boot chain is unmodified. Any tampering causes the TPM to withhold the key, and Plymouth falls back to asking for your passphrase. Your LUKS passphrase always remains valid as a fallback.

## Prerequisites

- LUKS2 full-disk encryption enabled at installation
- TPM 2.0 chip present and enabled in UEFI firmware
- Secure Boot enrolled (recommended — enables PCR 7 binding)

Check TPM availability:

```bash
sudo systemd-cryptenroll --tpm2-device=list
# Should show your TPM device, e.g. /dev/tpmrm0
```

## Enrolling the TPM2 Key

Use `gen-efi enroll-tpm2` — it handles PCR policy selection, KDF validation, and optional PIN setup automatically:

```bash
sudo gen-efi enroll-tpm2
```

You will be prompted for your LUKS passphrase. You can also opt in to a TPM2 PIN for a second factor.

**PCR policy is chosen automatically based on Secure Boot state:**

| Secure Boot state | PCR policy | Protection level |
|-------------------|-----------|-----------------|
| Enabled | PCR 0 + PCR 7 | Firmware measurements + Secure Boot certificate state |
| Disabled | PCR 0 only | Firmware measurements only (weaker — physical-access attack possible) |

`gen-efi enroll-tpm2` also checks the LUKS KDF and warns if it is `pbkdf2` instead of `argon2id`. You can convert with:

```bash
sudo cryptsetup luksConvertKey --pbkdf argon2id /dev/nvme0n1p2
```

## Verifying Enrollment

```bash
# List LUKS keyslots and tokens including TPM2 entries
sudo cryptsetup luksDump /dev/nvme0n1p2 | grep -A5 "Token"

# Confirm TPM2 enrollment
sudo cryptsetup luksDump /dev/nvme0n1p2 | grep systemd-tpm2

# List available TPM2 devices
sudo systemd-cryptenroll --tpm2-device=list
```

## Updating After Firmware or Boot Changes

If `fwupdmgr update` updated your BIOS or platform firmware, PCR 0 changes. The TPM will not release the key with the old binding, so you will be prompted for your LUKS passphrase on the next boot. This is expected.

After booting with your passphrase, clean up the stale slot and re-enroll:

```bash
sudo gen-efi cleanup-tpm2
sudo gen-efi enroll-tpm2
```

`cleanup-tpm2` collects all TPM2-type keyslots from the LUKS header, keeps the highest-numbered (most recently written), and wipes the rest. It prompts for your LUKS passphrase to authorise each removal.

## After Secure Boot Changes

When you change Secure Boot settings (enable, disable, or change enrolled keys), PCR 7 changes. Re-enroll:

```bash
sudo gen-efi cleanup-tpm2
sudo gen-efi enroll-tpm2
```

## Removing TPM2 Enrollment

```bash
# Wipe only the TPM2 keyslots — passphrase keyslot is untouched
sudo gen-efi cleanup-tpm2
```

After this, the disk requires a passphrase at every boot.

## Troubleshooting

**TPM falls back to passphrase prompt at boot:**
- A PCR value changed (firmware update, Secure Boot toggle)
- Clean up the old slot and re-enroll: `sudo gen-efi cleanup-tpm2 && sudo gen-efi enroll-tpm2`

**"No TPM2 device found":**
- Check UEFI → Security → TPM — ensure it is enabled
- Verify: `ls /dev/tpm*` and `sudo systemd-cryptenroll --tpm2-device=list`

**Locked out (no passphrase, TPM won't unlock):**
- Boot from Shanios USB
- `sudo cryptsetup open /dev/nvme0n1p2 shani_root` — enter your recovery passphrase
- Mount and access data, then re-enroll TPM2 with corrected PCR bindings
