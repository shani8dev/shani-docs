---
title: Firmware Updates (fwupd)
section: Security
updated: 2026-04-20
---

# Firmware Updates — fwupd

`fwupd` is the Linux Vendor Firmware Service client. It downloads firmware updates for BIOS/UEFI, drives, controllers, and other hardware components directly from hardware vendors, verifies them cryptographically, and installs them. Keeping firmware current is a security requirement — firmware vulnerabilities (e.g. Spectre, MDS, firmware-level rootkits) are patched through firmware updates.

`fwupd` is pre-installed on Shani OS.

> **Important:** After a firmware update, the TPM2 PCR 0 value changes. If you use TPM2-sealed LUKS, you will need to re-enroll after the firmware update. See [TPM2 Enrollment](tpm2).

---

## Checking for Updates

```bash
# Refresh the firmware metadata from LVFS
sudo fwupdmgr refresh

# Check for available firmware updates
sudo fwupdmgr get-updates
```

If no updates appear, either your hardware is already current or the vendor hasn't published firmware to LVFS for your device.

---

## Installing Updates

```bash
# Download and install all available firmware updates
sudo fwupdmgr update

# Some updates require a reboot to apply (BIOS/UEFI updates are applied during POST)
```

After a BIOS/UEFI update, if you use TPM2-sealed disk encryption:

```bash
# Boot, enter your LUKS passphrase when prompted, then re-enroll TPM2
sudo gen-efi cleanup-tpm2
sudo gen-efi enroll-tpm2
```

---

## Listing Devices

```bash
# List all devices fwupd can manage
fwupdmgr get-devices

# List devices with firmware version info
fwupdmgr get-devices --show-all-devices
```

---

## History and Verification

```bash
# Show firmware update history
fwupdmgr get-history

# Verify installed firmware against LVFS checksums
sudo fwupdmgr verify
sudo fwupdmgr verify-update
```

---

## Disabling fwupd

If you prefer to manage firmware manually or do not want automatic metadata refreshes:

```bash
sudo systemctl disable --now fwupd
sudo systemctl disable --now fwupd-refresh.timer
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `get-updates` shows nothing | Device may not be in the LVFS database; check `fwupdmgr get-devices` for "Update Error" or "No firmware" |
| BIOS update fails to apply after reboot | Ensure Secure Boot is not blocking the fwupd EFI capsule; check UEFI event log |
| Disk not unlocking after firmware update | Expected — PCR 0 changed; enter passphrase, then `sudo gen-efi cleanup-tpm2 && sudo gen-efi enroll-tpm2` |
| `fwupdmgr refresh` fails | Check network; corporate proxies may block LVFS CDN |

---

## See Also

- [TPM2 Enrollment](tpm2) — re-enrollment required after firmware updates
- [Secure Boot](secure-boot) — firmware update interaction with Secure Boot
- [Security Features](features) — security stack overview
