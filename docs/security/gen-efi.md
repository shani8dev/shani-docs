---
title: gen-efi Reference
section: Security
updated: 2026-05-13
---

# gen-efi Reference

`gen-efi` is the Shanios UKI (Unified Kernel Image) builder and Secure Boot key manager. It wraps `dracut --uefi` and `sbsign`/`sbverify` to produce signed EFI binaries placed in `/boot/efi/EFI/shanios/`, and manages the full lifecycle of MOK (Machine Owner Key) keys and TPM2 enrollment.

`shani-deploy` calls `gen-efi configure <slot>` automatically inside a chroot of the new slot after every update. You only need to run `gen-efi` directly when managing security keys, rebuilding a UKI manually, troubleshooting boot issues, or diagnosing a corrupt UKI.

---

## Commands

```bash
gen-efi configure <slot>   # Build and sign UKI for a slot (blue or green)
gen-efi enroll-mok         # Stage MOK key enrollment (re-signs EFI binaries, no UKI rebuild)
gen-efi enroll-tpm2        # Enroll TPM2 chip for automatic LUKS unlock
gen-efi cleanup-mok        # Delete old enrolled MOK keys after key rotation
gen-efi cleanup-tpm2       # Remove stale TPM2 LUKS keyslots after re-enrollment
```

> **Important:** `gen-efi configure` enforces that the target slot matches the currently booted slot when run directly on the live system. Running it for the inactive slot is only permitted inside a chroot, which `shani-deploy` does automatically.

---

## gen-efi configure

Builds, signs, and installs the UKI for a slot.

```bash
sudo gen-efi configure blue
sudo gen-efi configure green
```

**What it does:**

1. Validates the target slot matches the currently booted slot (prevents building a wrong-slot UKI from the live system)
2. Ensures MOK keys exist — generates a new keypair if missing, and validates that `MOK.key` and `MOK.crt` are a matching keypair
3. Mounts the ESP at `/boot/efi` temporarily if not already mounted
4. Updates shim (`BOOTX64.EFI`), MokManager (`mmx64.efi`), and systemd-boot (`grubx64.efi`) on the ESP if source binaries are newer
5. Detects the LUKS UUID from the live mapper device, with fallback to `/etc/crypttab` for chroot environments
6. Updates `/etc/crypttab` and the dracut crypt config to keep them consistent
7. Regenerates the kernel cmdline and writes it to `/etc/kernel/install_cmdline_<slot>`
8. Runs `dracut --force --uefi` to build the UKI
9. Signs the UKI with `sbsign` using the MOK private key and verifies it with `sbverify`
10. Installs the signed UKI to `$ESP/EFI/shanios/shanios-<slot>.efi`
11. Stages MOK enrollment automatically if the current key is not yet enrolled in firmware

### Slot Validation

`gen-efi configure` checks that `<slot>` matches the currently booted slot. Rebuilding the inactive slot from the live system would embed the wrong kernel version in the UKI.

```
ERROR: Cannot generate UKI for inactive slot from live system!
ERROR: You are booted in: @blue
ERROR: You are trying to generate for: @green
```

To rebuild the inactive slot's UKI, use `shani-deploy` (which runs `gen-efi` inside a chroot of that slot).

### Kernel Cmdline Generation

The cmdline is always regenerated from scratch — it cannot be manually pre-edited. `gen-efi` embeds:

- `root=`, `rootflags=` — device and Btrfs subvolume for the slot
- `systemd.volatile=state` — volatile `/var`
- `lsm=landlock,lockdown,yama,integrity,apparmor,bpf` — LSM stack
- `rd.luks.*` — LUKS device and TPM2 auto-unlock hint (encrypted systems)
- `rd.vconsole.keymap=` — keyboard layout from `/etc/vconsole.conf`
- `resume=`, `resume_offset=` — hibernation parameters (when swapfile exists)

### Output Files

| File | Description |
|------|-------------|
| `/boot/efi/EFI/shanios/shanios-blue.efi` | Signed UKI for the `@blue` slot |
| `/boot/efi/EFI/shanios/shanios-green.efi` | Signed UKI for the `@green` slot |

Each UKI bundles the Linux kernel, an initramfs built by dracut, an embedded kernel command line, and is signed with the MOK key from `/etc/secureboot/keys/MOK.key`.

---

## gen-efi enroll-mok

Stages MOK key enrollment without rebuilding the UKI. Use this when the MOK key needs to be (re-)enrolled in firmware but the UKIs are otherwise valid.

```bash
sudo gen-efi enroll-mok
```

**What it does:**

1. Verifies MOK keys exist — if they don't, aborts and instructs you to run `gen-efi configure <slot>` first
2. Mounts the ESP
3. Re-signs all EFI binaries on the ESP with the current MOK key (shim is not re-signed — it is Microsoft-signed)
4. Copies `MOK.der` to `$ESP/EFI/BOOT/MOK.der` for MokManager fallback
5. Stages enrollment via `mokutil --import --hash-file`

**After running:** reboot and confirm MOK enrollment in the MokManager UEFI prompt. The MokManager password is `shanios`.

### MOK Enrollment States

`gen-efi` handles all enrollment states automatically:

| State | Action |
|-------|--------|
| Current key already enrolled | Silent — nothing to do |
| Current key not enrolled, none pending | Stages enrollment via `mokutil --import` |
| Current key not enrolled, same key already pending | Reminds to reboot and confirm |
| Current key not enrolled, different key pending | Clears pending queue, re-stages |
| Old keys enrolled alongside current key | Warns — run `gen-efi cleanup-mok` after confirming new key |

---

## gen-efi enroll-tpm2

Enrolls the TPM2 chip into the LUKS2 volume for automatic disk unlock at boot.

```bash
sudo gen-efi enroll-tpm2
```

**Requirements:** LUKS encryption must be active (`/dev/mapper/shani_root` must exist), and a TPM 2.0 device must be present and enabled in BIOS/UEFI.

### PCR Policy

| Secure Boot State | PCR Policy | Protection |
|---|---|---|
| Enabled | PCR 0+7 | Firmware measurements + Secure Boot state |
| Disabled | PCR 0 only | Firmware measurements only |

With Secure Boot enabled, an attacker cannot unseal the LUKS key with a different bootloader or modified UKI.

### TPM2 PIN

The enrollment prompts whether to require a PIN at boot. With a PIN, the TPM requires user input even when PCRs match — providing a second factor. Without it, the disk unlocks automatically on matching hardware.

**Your LUKS passphrase remains valid at all times** as a fallback.

**Re-enrollment is required after:**
- Firmware/BIOS updates (changes PCR 0)
- Enabling or disabling Secure Boot (changes PCR 7)
- MOK key changes (changes PCR 7)

```bash
# Re-enroll after firmware update
sudo gen-efi cleanup-tpm2   # remove stale slots
sudo gen-efi enroll-tpm2    # enroll with new PCR values
```

---

## gen-efi cleanup-mok

Removes MOK keys enrolled in firmware that do not match the current `MOK.der`. Run this after a key rotation has been confirmed.

```bash
sudo gen-efi cleanup-mok
```

**Safety:** Verifies the current key is enrolled before deleting anything. If the current key is not yet confirmed, the command aborts with an error.

Each deletion is staged via `mokutil --delete` and confirmed in MokManager on the next reboot — same one-time prompt as enrollment.

---

## gen-efi cleanup-tpm2

Removes stale TPM2 LUKS keyslots left over after re-enrollment.

```bash
sudo gen-efi cleanup-tpm2
```

Keeps the highest-numbered (most recently written) TPM2 slot and wipes all others. Prompts for the LUKS passphrase to authorise each wipe.

---

## Signing Keys

| File | Purpose |
|------|---------|
| `/etc/secureboot/keys/MOK.key` | RSA-2048 private signing key (mode 0600) — signs UKIs, never leaves the device |
| `/etc/secureboot/keys/MOK.crt` | PEM certificate — used by sbsign |
| `/etc/secureboot/keys/MOK.der` | DER-encoded public key — enrolled in firmware MOK database |

Keys are generated by `gen-efi configure` if missing. They are stored in the `/etc` overlay upper layer (inside `@data`) and persist across all OS updates and rollbacks. If `MOK.key` and `MOK.crt` are missing or mismatched, `gen-efi` automatically regenerates the full keypair.

> **Never share `MOK.key`.** It is the private key used to sign all boot components. If compromised, an attacker can sign malicious UKIs that Secure Boot will accept.

---

## ESP Layout

```
/boot/efi/
├── EFI/
│   ├── BOOT/
│   │   ├── BOOTX64.EFI       ← shim (Microsoft-signed first-stage loader)
│   │   ├── grubx64.efi       ← systemd-boot (MOK-signed second-stage)
│   │   ├── mmx64.efi         ← MokManager
│   │   └── MOK.der           ← local MOK public cert (for manual enrollment)
│   └── shanios/
│       ├── shanios-blue.efi  ← UKI for @blue slot
│       └── shanios-green.efi ← UKI for @green slot
└── loader/
    ├── loader.conf           ← default entry and timeout
    └── entries/
        ├── shanios-blue+3-0.conf
        └── shanios-green.conf
```

---

## Common Operations

### After a kernel update (no shani-deploy)

`shani-deploy` handles this automatically. If you need to do it manually, run from the currently booted slot:

```bash
sudo gen-efi configure blue   # if booted into @blue
sudo gen-efi configure green  # if booted into @green
```

### After LUKS UUID change or enabling encryption

```bash
sudo gen-efi configure blue
```

### After Secure Boot key regeneration

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

### Recover from missing MOK keys

```bash
# gen-efi will generate new keys, rebuild the UKI, and re-sign everything
sudo gen-efi configure blue

# Then enroll the new key
sudo gen-efi enroll-mok
# Reboot and confirm in MokManager
```

### Fix a stale keymap in the UKI

```bash
# Set the correct keymap
sudo localectl set-keymap us

# Rebuild the UKI — gen-efi reads /etc/vconsole.conf
sudo gen-efi configure blue
```

### Rebuild after recovery

If a UKI is missing or corrupted:

```bash
sudo gen-efi configure blue
```

### Re-enrolling TPM2 after firmware or Secure Boot changes

```bash
sudo gen-efi cleanup-tpm2
sudo gen-efi enroll-tpm2
```

---

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

---

## See Also

- [Secure Boot](secure-boot) — enrolling keys and enabling Secure Boot
- [TPM2 Enrollment](tpm2) — detailed TPM2 setup guide
- [Boot Process](../arch/boot) — how UKIs fit into the boot chain
- [System Updates](../updates/system) — how `shani-deploy` uses `gen-efi`
