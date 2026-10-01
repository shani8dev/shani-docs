---
title: Hardware Authentication
section: Security
updated: 2026-08-28
---

# Hardware Authentication


---

## Fingerprint Authentication

**Package:** `fprintd` (pulls in `libfprint` as a dependency) — pre-installed via `shani-peripherals`

Fingerprints unlock the **lock screen** on every edition, and the **login screen** on GNOME only — Plasma's login manager (`plasmalogin`) and the COSMIC greeter have no fingerprint support. `sudo` always prompts for a password, because `/etc/pam.d/sudo` does not reference `pam_fprintd`. The per-edition matrix, how to enable the KDE lock-screen option, and the CLI are in [Fingerprint Login](fingerprint-login).

```bash
# Enroll a finger (replace 'right-index-finger' with the finger you want)
fprintd-enroll -f right-index-finger

# List enrolled fingers
fprintd-list "$USER"

# Test a fingerprint
fprintd-verify

# Delete enrolled fingers
fprintd-delete "$USER"
```

Enrollment via GUI: **System Settings → Users → Fingerprint Login** (KDE) or **Settings → Users** (GNOME).

### Supported Hardware

Any fingerprint reader with a libfprint driver is supported. Check compatibility:

```bash
# Is your device recognised?
lsusb | grep -i finger
fprintd-enroll   # will fail with a clear error if the device is unsupported
```

---

## YubiKey and FIDO2/U2F

**Packages:** `libfido2`, `pam-u2f` — pre-installed via `shani-peripherals`. `yubikey-manager`, `pcsc-tools` and `oath-toolkit` are **also** pre-installed, all via `shani-peripherals`, so `oathtool` is available with nothing to install and there is no Nix step.



### Using a FIDO2/U2F Key

> ⚠️ **Before editing PAM:** keep an existing root shell open when editing PAM files, and test `sudo` in a second terminal before logging out. A broken PAM stack can lock you out of `sudo` and login entirely.

```bash
# 1. Create the U2F key mapping directory
mkdir -p ~/.config/Yubico

# 2. Register your YubiKey (touch the key when it blinks)
pamu2fcfg > ~/.config/Yubico/u2f_keys

# If you have a second key for backup, append it
pamu2fcfg -n >> ~/.config/Yubico/u2f_keys
```

Edit `/etc/pam.d/sudo` to require the YubiKey in addition to the password:

```
auth required pam_u2f.so
```

Or to allow either password or YubiKey:

```
auth sufficient pam_u2f.so
```

### YubiKey Manager

```bash
# Show YubiKey info
ykman info

# List configured applications
ykman list

# Configure FIDO2 PIN
ykman fido access change-pin

# Reset FIDO2 application (clears all credentials)
ykman fido reset
```

### FIDO2 for SSH

```bash
# Generate a FIDO2-backed SSH key (resident key stored on the YubiKey)
ssh-keygen -t ed25519-sk -O resident -O application=ssh:myserver

# Non-resident (key file required alongside the token)
ssh-keygen -t ed25519-sk
```

---

## Smart Card / PIV

**Packages:** `opensc`, `ccid`, `acsccid` — pre-installed via `shani-peripherals`; `pcscd`/`pcsc-lite` come along

> **Reading and managing certificates from a card works; using a card to log
> in does not.** Authenticating a PIV card needs the PAM module
> `pam_pkcs11.so`. **`pam_pkcs11` is already in the image** — it is a dependency
> of `shani-peripherals`, so there is nothing to install and no AUR step (an
> earlier version of this note said it was AUR-only, and that was wrong twice
> over: it is shipped, and the real blocker is below). What stops it is
> configuration, not availability. GDM's `gdm-smartcard` service loads that
> module unconditionally, so the smartcard login option cannot succeed; KDE's
> packaging disables the same line, so the feature is simply absent. To make
> card login work you must also set `slot_num` in
> `/etc/pam_pkcs11/pam_pkcs11.conf` — at its default of `-1` the module returns
> `PAM_AUTHINFO_UNAVAIL` and login still fails, which looks identical to the
> module being absent. The commands below are unaffected and work today.

`pam_pkcs11` itself **is** in the image, as a dependency of `shani-peripherals`, so nothing needs installing; `pcsc_scan` comes with `pcsc-tools`, also pre-installed via `shani-peripherals`.



```bash
# Start the PC/SC daemon
sudo systemctl enable --now pcscd

# List connected smart cards
pcsc_scan

# Show card info via OpenSC
opensc-tool --list-readers
opensc-tool --list-algorithms

# List certificates on a PIV card
pkcs11-tool --module /usr/lib/opensc-pkcs11.so --list-certificates
```

### SSH with Smart Card

```bash
# List keys visible via PKCS#11
ssh-keygen -D /usr/lib/opensc-pkcs11.so -e

# Use the card for SSH authentication
ssh -I /usr/lib/opensc-pkcs11.so user@host
```

---

## NFC Authentication

**Packages:** `libnfc`, pre-installed via `shani-peripherals`; NFC access rides on the same `pcscd`/`pcsc-lite` stack pulled in for smart cards above

NFC tokens are accessed via the PC/SC stack. Once `pcscd` is running, NFC cards compatible with pcsc-lite are accessible in the same way as contact smart cards:

```bash
sudo systemctl enable --now pcscd
pcsc_scan   # shows NFC card when tapped
```

---

## TOTP / HOTP (Two-Factor)

**Package:** `oath-toolkit` — **pre-installed via `shani-peripherals`**, so `oathtool` is available with nothing to install. (An earlier version of this page said it was absent and pointed at Nix; it is a dependency of `shani-peripherals`.)



`oathtool` generates TOTP and HOTP codes from a shared secret, compatible with Google Authenticator, Authy, and any RFC 6238/4226 implementation.

```bash
# Generate a TOTP code from a base32 secret
oathtool --totp --base32 JBSWY3DPEHPK3PXP

# Generate a HOTP code (counter-based)
oathtool --hotp --base32 JBSWY3DPEHPK3PXP 0

# Verify a TOTP code
oathtool --totp --base32 -w 1 JBSWY3DPEHPK3PXP 123456
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `fprintd-enroll` says no device found | Check `lsusb` for the reader; the sensor may not have a libfprint driver |
| YubiKey not detected | Check `lsusb`; `ykman list`; ensure `pcscd` is running for PIV/OTP modes |
| Smart card not detected | `sudo systemctl status pcscd`; run `pcsc_scan` with card inserted |
| PAM U2F not prompting for key | Check `/etc/pam.d/` config; verify `~/.config/Yubico/u2f_keys` exists and is correct |
| SSH FIDO2 key says "unsupported" | Ensure the server has `PubkeyAuthOptions verify-required` removed or set correctly for sk keys |

---

## See Also

- [Security Features](features) — full list of supported authentication methods
- [LUKS Management](luks) — using a keyfile for disk unlock
- [TPM2 Enrollment](tpm2) — TPM-based disk unlock
- [shani-health Reference](../updates/shani-health.md) — `shani-health --security` reports fprintd enrollment, pam-u2f configuration, and pcscd status per user
