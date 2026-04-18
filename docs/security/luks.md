---
title: LUKS Management
section: Security
updated: 2026-05-09
---

# LUKS Management

Full-disk encryption with LUKS2 must be enabled during the Shani OS installer — it is a single checkbox on the disk setup screen. There is no in-place conversion from an unencrypted installation.

## If You Missed Encryption at Install

Reinstall. Back up your data first, then run the installer and enable encryption at the disk setup step:

```bash
# Back up your home directory before reinstalling
restic -r /media/external/backup init
restic -r /media/external/backup backup ~/
restic -r /media/external/backup backup /data/
restic -r /media/external/backup check
```

After reinstalling with encryption enabled, enroll TPM2 for passwordless unlock:

```bash
sudo gen-efi enroll-tpm2
```

---

## Checking Encryption Status

```bash
# Is the root partition encrypted?
lsblk -f | grep -E "crypt|luks"

# View LUKS header — version, cipher, KDF, all keyslots
sudo cryptsetup luksDump /dev/nvme0n1p2

# Confirm active mapper device
cat /proc/mounts | grep mapper
```

Look for `Version: 2`, `cipher: aes-xts-plain64`, and `PBKDF: argon2id`. If you see `pbkdf2`, convert it:

```bash
sudo cryptsetup luksConvertKey --pbkdf argon2id /dev/nvme0n1p2
```

---

## Managing Keyslots

LUKS2 supports up to 32 keyslots. You can have a passphrase, a backup passphrase, a keyfile, and a TPM2-sealed key all active simultaneously.

### Adding a Second Passphrase

```bash
sudo cryptsetup luksAddKey /dev/nvme0n1p2
# Enter any existing passphrase when prompted, then set the new one
```

### Changing Your Passphrase

```bash
# Add the new passphrase first (new keyslot)
sudo cryptsetup luksAddKey /dev/nvme0n1p2

# Find the old keyslot number
sudo cryptsetup luksDump /dev/nvme0n1p2 | grep -A2 "Keyslot"

# Remove the old keyslot
sudo cryptsetup luksKillSlot /dev/nvme0n1p2 <keyslot-number>
```

### Adding a Keyfile

```bash
sudo dd if=/dev/urandom of=/root/luks-keyfile bs=512 count=8
sudo chmod 400 /root/luks-keyfile
sudo cryptsetup luksAddKey /dev/nvme0n1p2 /root/luks-keyfile
```

Store the keyfile off-device. Losing it does not lock you out as long as your passphrase is intact.

### Removing a Keyslot

```bash
sudo cryptsetup luksKillSlot /dev/nvme0n1p2 <keyslot-number>
```

Never remove all keyslots — always keep your passphrase slot.

### Listing All Keyslots

```bash
sudo cryptsetup luksDump /dev/nvme0n1p2 | grep -E "Keyslot|Token"
```

---

## Backing Up the LUKS Header

The LUKS header holds all keyslots. If it is corrupted, the encrypted data is permanently unrecoverable. Back it up after any keyslot change:

```bash
sudo cryptsetup luksHeaderBackup /dev/nvme0n1p2 \
  --header-backup-file ~/luks-header-backup-$(date +%Y%m%d).img
# Store off-device — external drive or encrypted cloud storage
```

Restoring:

```bash
sudo cryptsetup luksHeaderRestore /dev/nvme0n1p2 \
  --header-backup-file luks-header-backup-20260401.img
```

---

## TPM2 Auto-Unlock

```bash
# Enroll — prompts for LUKS passphrase, optionally sets a PIN
sudo gen-efi enroll-tpm2

# After firmware updates or Secure Boot changes — re-enroll
sudo gen-efi cleanup-tpm2
sudo gen-efi enroll-tpm2

# Verify TPM2 enrollment is present
sudo cryptsetup luksDump /dev/nvme0n1p2 | grep systemd-tpm2
```

See [TPM2 Enrollment](../security/tpm2) for full details.

---

## Emergency Recovery

**Forgotten passphrase, no backup key:** the data is unrecoverable. Reinstall and restore from backups.

**Have a backup keyfile:**

```bash
# Boot from Shani OS USB
sudo cryptsetup open /dev/nvme0n1p2 shani_root \
  --key-file /path/to/luks-keyfile
sudo mount -o subvol=@home /dev/mapper/shani_root /mnt/home
```

**Corrupted header, have a header backup:**

```bash
# Boot from Shani OS USB
sudo cryptsetup luksHeaderRestore /dev/nvme0n1p2 \
  --header-backup-file luks-header-backup.img
sudo cryptsetup open /dev/nvme0n1p2 shani_root
```

**TPM2 won't unlock after firmware update:**

```bash
# Boot and enter passphrase when prompted, then re-enroll
sudo gen-efi cleanup-tpm2
sudo gen-efi enroll-tpm2
```
