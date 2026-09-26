---
title: Fingerprint Login
section: Security
updated: 2026-09-26
---

# Fingerprint Login

Shanios installs `fprintd` and `libfprint` on every edition through the
`shani-peripherals` package, and `fprintd` is enabled at boot, so supported
readers are detected without installing anything. **Whether a fingerprint can
actually unlock your machine depends on the edition**, and it is worth being
precise about why: PAM services are shipped by the *display manager*, not by
`fprintd`. `fprintd` only provides the module (`pam_fprintd.so`) and the
daemon; something has to reference the module in a PAM stack.

libpam searches both `/etc/pam.d` **and** `/usr/lib/pam.d`, so a PAM service
shipped inside a package's payload works without being copied into `/etc`.

## What works, per edition

| Edition | Login screen | Lock screen | `sudo` |
| --- | --- | --- | --- |
| GNOME | **Yes** | Yes | No |
| KDE Plasma | **No** | Yes, when enabled | No |
| COSMIC | **No** | Yes | No |

### GNOME — works out of the box

The `gdm` package ships `/etc/pam.d/gdm-fingerprint`, whose auth stack
contains `pam_fprintd.so`. GDM offers that service once you have enrolled a
finger, and falls back to `gdm-password` for the password prompt, so a failed
or absent finger never locks you out.

```bash
# Enroll (run as your normal user; polkit will ask for your password)
fprintd-enroll

# What is enrolled
fprintd-list "$USER"

# Prove the sensor and the match work
fprintd-verify

# Remove enrollments
fprintd-delete "$USER"
```

The same operations are available graphically in **Settings → Users →
Fingerprint Login**.

### KDE Plasma — the lock screen only, and it is opt-in

`kscreenlocker` ships `/usr/lib/pam.d/kde-fingerprint` with `pam_fprintd.so`
in its auth stack, so the lock screen can use a fingerprint. It is not offered
by default: kscreenlocker reads an `Authenticators/Fingerprint` key from
`~/.config/kscreenlockerrc` and only presents the option when that is enabled.

```bash
# Enable the lock-screen fingerprint option for your user
mkdir -p ~/.config
kwriteconfig6 --file kscreenlockerrc --group Authenticators --key Fingerprint true
```

Enroll graphically in **System Settings → Users → Fingerprint**, or with
`fprintd-enroll` as above.

**The KDE login screen does not support fingerprints.** SDDM ships
`/etc/pam.d/sddm`, `sddm-autologin` and `sddm-greeter`, and none of them
reference `pam_fprintd` — the string does not appear anywhere in the package.
Enabling the lock screen does not change this; they are separate PAM services.

### COSMIC — no login-screen support

`cosmic-greeter` ships no PAM service of its own, so there is no fingerprint
path at the greeter. Fingerprint unlock still works once you are logged in.

## Why `sudo` never accepts a fingerprint

`sudo` is its own PAM service. `/etc/pam.d/sudo` pulls in `system-auth` for the
auth stack, and `system-auth` does not reference `pam_fprintd`:

```
auth       include                      system-auth
```

So even with fingerprints enrolled, `sudo` prompts for a password. Enabling it
means adding `auth sufficient pam_fprintd.so` to a stack that `sudo` actually
uses — this is a deliberate policy choice, not a missing package, so it is not
enabled by default.

## Why a missing fingerprint module fails silently

This matters when reading PAM logs. With no reader attached,
`pam_fprintd.so` returns `PAM_AUTHINFO_UNAVAIL` (9). What happens next depends
entirely on the control flag:

- `auth sufficient pam_fprintd.so` — the failure is **ignored** and the stack
  continues to the next module, so the password prompt still appears.
- `auth required pam_fprintd.so` — the stack **fails**.

Both behaviours were confirmed against `pam_fprintd.so` 1.7.2 with no sensor
present. It is why a `sufficient` line is the safe way to add fingerprint
support to a stack that already has a working fallback, and why shipping it as
`required` without a password fallback would lock users out.

## Troubleshooting

```bash
# Is a reader detected at all? (an empty list means no supported sensor)
fprintd-list "$USER"

# Is the daemon actually running?
systemctl status fprintd

# What does the sensor enumerate as?
lsusb | grep -i -E 'finger|goodix|synaptic|valuestree'

# What do the PAM stacks currently say?
grep -r pam_fprintd /etc/pam.d/ /usr/lib/pam.d/
```

If your reader is a laptop embedded sensor bound to the wrong kernel driver,
`libfprint` ships `/usr/lib/udev/rules.d/70-libfprint-2.rules` to correct the
SPI driver binding; confirm the rule is present before suspecting hardware.

See also: [Hardware Authentication](hardware-auth), which covers FIDO2/U2F
keys, smart cards and NFC tokens.
