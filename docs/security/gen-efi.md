---
title: gen-efi Reference
section: Security
updated: 2026-04-01
---

# gen-efi Reference

`gen-efi` is the Shanios tool for rebuilding and signing Unified Kernel Images (UKIs). It wraps `dracut --uefi` and `pesign`/`sbsign`, reads configuration from `/etc/gen-efi/`, and produces the signed EFI binaries placed in `/boot/efi/EFI/Linux/`.

`gen-efi` is called automatically by `shani-deploy` during every update. You only need to invoke it manually when changing kernel parameters, regenerating Secure Boot keys, or recovering a broken boot entry.

## Usage

```bash
# Rebuild UKIs for both slots (normal use)
sudo gen-efi

# Rebuild for a specific slot only
sudo gen-efi --slot blue
sudo gen-efi --slot green

# Rebuild and regenerate MOK key pair
sudo gen-efi --regen-keys

# Rebuild with verbose output
sudo gen-efi --verbose

# Dry run — show what would be built without writing anything
sudo gen-efi --dry-run
```

## Output Files

| File | Description |
|------|-------------|
| `/boot/efi/EFI/Linux/shanios-blue.efi` | Signed UKI for the `@blue` slot |
| `/boot/efi/EFI/Linux/shanios-green.efi` | Signed UKI for the `@green` slot |

Each UKI bundles:
- Linux kernel (`/boot/vmlinuz-linux`)
- Initramfs (`/boot/initramfs-*.img` built by dracut)
- Embedded kernel command line (from `/etc/gen-efi/cmdline-<slot>`)
- Signed with MOK key from `/etc/secureboot/MOK.key`

## Configuration

`/etc/gen-efi/` contains per-slot configuration:

```
/etc/gen-efi/
├── cmdline-blue      ← kernel cmdline for @blue UKI
├── cmdline-green     ← kernel cmdline for @green UKI
└── dracut.conf.d/    ← extra dracut config snippets
```

### Example cmdline-blue

```
root=/dev/mapper/shani_root rootflags=subvol=@blue ro
systemd.volatile=state
lsm=landlock,lockdown,yama,integrity,apparmor,bpf
quiet splash
```

Edit these files to change boot parameters — then run `sudo gen-efi` to rebuild.

## Signing Keys

| File | Purpose |
|------|---------|
| `/etc/secureboot/MOK.key` | RSA-2048 private key — signs UKIs |
| `/etc/secureboot/MOK.cer` | DER certificate — enroll in firmware |
| `/etc/secureboot/MOK.pem` | PEM certificate — used by pesign |

Keys are generated at install time and stored in the `/etc` overlay upper layer (inside `@data`). They survive all updates and rollbacks.

## Verifying a UKI

```bash
# Check signature on a UKI
sudo pesign -S -i /boot/efi/EFI/Linux/shanios-blue.efi

# Verify against the enrolled MOK
sudo pesign -S -i /boot/efi/EFI/Linux/shanios-blue.efi \
  --certdir /etc/secureboot/

# List contents (kernel version, cmdline, etc.)
sudo ukify inspect /boot/efi/EFI/Linux/shanios-blue.efi
```

## Common Use Cases

### After a Kernel Update

`shani-deploy` handles this automatically. If you need to do it manually:
```bash
sudo gen-efi
sudo bootctl update
```

### Changing a Boot Parameter

```bash
sudo nano /etc/gen-efi/cmdline-blue   # edit the parameter
sudo gen-efi --slot blue              # rebuild only the affected UKI
```

### After Secure Boot Key Regeneration

```bash
sudo gen-efi --regen-keys         # generates new MOK.key + MOK.cer
sudo mokutil --import /etc/secureboot/MOK.cer
# Reboot → complete MokManager enrollment
```

### Rebuilding After Recovery

If a UKI is missing or corrupted (e.g., after filesystem repair):
```bash
sudo gen-efi --verbose
# Inspect output for errors, then reboot
```
