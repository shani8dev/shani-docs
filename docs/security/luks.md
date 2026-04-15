---
title: LUKS After Install
section: Security
updated: 2026-04-01
---

# LUKS After Install

Full-disk encryption with LUKS2 is best enabled during installation. However, if you skipped it, this page covers adding a passphrase to an existing LUKS container, managing keyslots, and changing your passphrase.

> **Note:** Adding LUKS encryption to an already-installed, unencrypted system requires repartitioning and reinstalling. If your system was not installed with encryption, re-run the installer and choose encryption. What this page covers is managing an **already-encrypted** Shanios install.

## Checking Encryption Status

```bash
# Is the root partition encrypted?
lsblk -f | grep -E "crypt|luks"

# View LUKS header details
sudo cryptsetup luksDump /dev/sdX2   # replace with your root partition
```

Look for `Version: 2` and `cipher: aes-xts-plain64` with `PBKDF: argon2id`.

## Adding a Second Passphrase (Backup Key)

LUKS supports up to 32 keyslots. Adding a second passphrase gives you a backup if you forget the first:

```bash
sudo cryptsetup luksAddKey /dev/sdX2
# Enter any existing passphrase when prompted, then set the new one
```

## Changing Your Passphrase

```bash
# Add the new passphrase first (adds a new keyslot)
sudo cryptsetup luksAddKey /dev/sdX2

# Then remove the old keyslot (find its number first)
sudo cryptsetup luksDump /dev/sdX2 | grep "Keyslot"
sudo cryptsetup luksKillSlot /dev/sdX2 <keyslot-number>
```

## Adding a Key File (for Automated Scenarios)

```bash
# Generate a random 512-byte key file
sudo dd if=/dev/urandom of=/root/luks-keyfile bs=512 count=1
sudo chmod 400 /root/luks-keyfile

# Add the key file as an additional LUKS keyslot
sudo cryptsetup luksAddKey /dev/sdX2 /root/luks-keyfile

# Store securely — losing this file doesn't lock you out as long as you still have your passphrase
```

## Backing Up the LUKS Header

The LUKS header holds the keyslots. If it gets corrupted, the encrypted data is permanently lost. Back it up:

```bash
sudo cryptsetup luksHeaderBackup /dev/sdX2 \
  --header-backup-file ~/luks-header-backup-$(date +%Y%m%d).img

# Store this file off-device (external drive, encrypted cloud storage)
```

Restoring a header backup:
```bash
sudo cryptsetup luksHeaderRestore /dev/sdX2 \
  --header-backup-file luks-header-backup-20260401.img
```

## Rekeying (Changing the Master Key)

Rekeying is not possible in-place with LUKS — it requires data migration. If you believe the master key is compromised, the correct procedure is to back up your data and reinstall with a fresh LUKS container.

## Encryption Parameters

Shanios uses argon2id as the PBKDF — the strongest available in LUKS2. Default parameters:

```
Cipher:      aes-xts-plain64
Key size:    512 bits
PBKDF:       argon2id
Memory cost: 1048576 KB (1 GB)
Time cost:   4 iterations
Parallelism: 4 threads
```

These settings make brute-force attacks computationally expensive even with modern hardware.

## Emergency Recovery

If you forget your passphrase and have no backup key:
- The data is **unrecoverable** — this is the intended security guarantee of LUKS2
- Boot from a Shanios USB, reinstall, and restore from your data backups

If you have a backup key file or header backup:
```bash
# Boot from USB, open the device manually
sudo cryptsetup open /dev/sdX2 shani_root --key-file /path/to/luks-keyfile

# Mount and access data
sudo mount -o subvol=@home /dev/mapper/shani_root /mnt/home
```
