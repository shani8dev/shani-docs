---
title: TPM2 Enrollment
section: Security
updated: 2026-04-01
---

# TPM2 Enrollment

TPM2 enrollment binds your LUKS2 disk encryption key to your machine's Trusted Platform Module. Once enrolled, the disk unlocks automatically at boot — no passphrase prompt — as long as the boot chain is unmodified. Any tampering (changed firmware, new bootloader, tampered UKI) causes the TPM to withhold the key, and Plymouth falls back to asking for your passphrase.

## Prerequisites

- LUKS2 full-disk encryption enabled at installation
- TPM 2.0 chip present and enabled in UEFI firmware
- Secure Boot enrolled (recommended — PCR 7 includes Secure Boot state)

Check TPM availability:
```bash
systemd-cryptenroll --tpm2-device=list
# Should show your TPM device, e.g. /dev/tpmrm0
```

## Enrolling the TPM2 Key

```bash
# Enroll using PCRs 0+2+7 (firmware + boot code + Secure Boot state)
sudo systemd-cryptenroll \
  --tpm2-device=auto \
  --tpm2-pcrs=0+2+7 \
  /dev/sdX2     # replace with your encrypted root partition
```

Enter your existing LUKS passphrase when prompted. The tool adds a new LUKS keyslot bound to the TPM.

**PCR selection:**

| PCR | Measures | Effect if changed |
|-----|----------|-------------------|
| 0 | Firmware (UEFI code) | Firmware update locks you out |
| 2 | Boot code (bootloader) | systemd-boot update locks you out |
| 7 | Secure Boot state/keys | Disabling Secure Boot locks you out |
| 8 | Kernel cmdline (if using `sd-encrypt`) | Cmdline change locks you out |

Using `0+7` is more flexible — survives bootloader updates. Using `0+2+7` is stricter but more tamper-evident.

## Verifying Enrollment

```bash
# List all LUKS keyslots
sudo cryptsetup luksDump /dev/sdX2 | grep -A5 "Keyslot"

# systemd-cryptenroll view
sudo systemd-cryptenroll /dev/sdX2
```

You should see a keyslot with `systemd-tpm2` token type alongside your passphrase keyslot.

## Updating After Firmware/Boot Changes

If you update your firmware or systemd-boot (which changes PCR values), you must re-enroll before the update takes effect, or the disk will prompt for passphrase on the next boot.

```bash
# Remove the old TPM2 keyslot
sudo systemd-cryptenroll --wipe-slot=tpm2 /dev/sdX2

# Re-enroll with current PCR values
sudo systemd-cryptenroll \
  --tpm2-device=auto \
  --tpm2-pcrs=0+2+7 \
  /dev/sdX2
```

`shani-deploy` reminds you to re-enroll after firmware updates when TPM2 is detected.

## Adding a PIN (TPM2 + PIN)

For stronger protection, require a short PIN in addition to TPM2:

```bash
sudo systemd-cryptenroll \
  --tpm2-device=auto \
  --tpm2-pcrs=0+2+7 \
  --tpm2-with-pin=yes \
  /dev/sdX2
```

Plymouth prompts for the PIN at boot. The disk only unlocks if both the TPM measurement matches **and** the PIN is correct.

## Removing TPM2 Enrollment

```bash
# Wipe only the TPM2 keyslot — passphrase keyslot is untouched
sudo systemd-cryptenroll --wipe-slot=tpm2 /dev/sdX2
```

After this, the disk requires a passphrase at every boot.

## Troubleshooting

**"TPM2 operation failed" at boot → falls back to passphrase:**
- A PCR value changed (firmware update, Secure Boot toggle, bootloader update)
- Remove the old TPM2 keyslot and re-enroll as above

**"No TPM2 device found":**
- Check UEFI → Security → TPM → ensure it is enabled and not in "Firmware TPM" disabled mode
- Verify: `ls /dev/tpm*` and `systemd-cryptenroll --tpm2-device=list`

**Locked out (no passphrase, TPM won't unlock):**
- Boot from Shanios USB
- `cryptsetup open /dev/sdX2 shani_root` — enter your recovery passphrase
- Mount, access data, re-enroll TPM2 with corrected PCR bindings
