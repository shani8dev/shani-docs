---
title: Security Features
section: Security
updated: 2026-04-01
---

# Security Features

Shanios implements defence-in-depth security across every layer — from firmware to userspace. All features are active from first boot with no manual configuration required.

## Security Stack Overview

| Layer | Technology | Status |
|-------|-----------|--------|
| Firmware | Secure Boot (MOK), TPM 2.0 | Optional (recommended) |
| Bootloader | systemd-boot, signed UKIs | Always active |
| Full-disk encryption | LUKS2 argon2id | Optional (recommended) |
| Kernel LSMs | Landlock, Lockdown, Yama, Integrity, AppArmor, BPF | Always active |
| Runtime integrity | IMA/EVM | Always active |
| Firewall | firewalld | Always active |
| Intrusion prevention | fail2ban | Always active |
| Hardware key support | FIDO2/U2F, smart cards | Ready, configure as needed |

## Linux Security Modules

Six LSMs run simultaneously, loaded in order:

```
lsm=landlock,lockdown,yama,integrity,apparmor,bpf
```

- **Landlock** — unprivileged sandboxing; applications can restrict their own filesystem access
- **Lockdown** — prevents kernel tampering from userspace (e.g., `/dev/mem` access, unsigned modules)
- **Yama** — restricts `ptrace` to parent processes (prevents process injection)
- **Integrity (IMA/EVM)** — measures and verifies file integrity at runtime
- **AppArmor** — mandatory access control; system daemons are confined by policy
- **BPF** — restricts BPF program loading to privileged users

## Immutability as Security

The read-only root filesystem is itself a security boundary:

- No process — even running as root — can modify `/usr`, `/bin`, `/lib`, or `/sbin` at runtime
- Malware that achieves code execution cannot persist across reboots by modifying system binaries
- The only path to modifying the OS is through `shani-deploy`, which verifies SHA256 + GPG signatures before applying any image

## Image Verification

Every OS update is verified before deployment:

1. **SHA256 checksum** — confirms file integrity after download
2. **GPG signature** — confirms the image was signed by the Shanios project key (`7B927BFFD4A9EAAA8B666B77DE217F3DA8014792`)
3. **Btrfs snapshot** — taken of the current active slot before overwriting the inactive slot, providing an additional rollback point

`shani-deploy` will refuse to deploy any image that fails either check.

## Kernel Hardening Parameters

```
# Unprivileged user namespaces (needed for containers — allow-listed)
kernel.unprivileged_userns_clone = 1

# NMI watchdog disabled (reduces attack surface)
kernel.nmi_watchdog = 0

# Magic SysRq (emergency recovery only)
kernel.sysrq = 1

# Restrict BPF
kernel.unprivileged_bpf_disabled = 1
```

## Blacklisted Kernel Modules

Loaded at boot via `/etc/modprobe.d/`:

| Module | Reason |
|--------|--------|
| `pcspkr` | Eliminates covert timing channel via PC speaker |
| `mei`, `mei_me` | Intel Management Engine interface — disabled by default |

## Firewall (firewalld)

Active from first boot. Default policy: deny inbound, allow outbound.

Pre-configured rules:
- **KDE Connect / GSConnect** — device pairing, file transfer, notifications
- **Waydroid** — DNS and packet forwarding for the Android container

See [Firewall (firewalld)](../networking/firewall) for full configuration details.

## Audit & Monitoring

```bash
# AppArmor status
sudo aa-status

# IMA measurement log
sudo cat /sys/kernel/security/ima/ascii_runtime_measurements | head -20

# firewalld active rules
sudo firewall-cmd --list-all

# fail2ban status
sudo fail2ban-client status
sudo fail2ban-client status sshd
```
