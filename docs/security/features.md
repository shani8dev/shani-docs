---
title: Security Features
section: Security
updated: 2026-04-14
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

## Immutability as a Security Primitive

The root filesystem is mounted read-only at the VFS layer — enforced by the kernel, not by DAC/MAC policy. A process running as root cannot write to `/usr/bin`, `/lib`, `/etc/systemd/system`, or any other system path. Most persistent malware works by writing a backdoor to a system path that survives reboot. On Shanios, there is nowhere to write it.

The `/etc` OverlayFS and the `@data` subvolume are writable, but they are user-visible and auditable. The OS binaries are not.

## Linux Security Modules

Six LSMs run simultaneously, loaded in order:

```
lsm=landlock,lockdown,yama,integrity,apparmor,bpf
```

| LSM | What it does |
|-----|-------------|
| **Landlock** | Unprivileged sandboxing — applications can restrict their own filesystem access without requiring root to write a policy |
| **Lockdown** | Prevents kernel tampering from userspace (e.g. `/dev/mem` access, loading unsigned modules, PCI BAR access) |
| **Yama** | Restricts `ptrace` scope — a process can only be ptraced by its own children or explicitly permitted processes, blocking process injection attacks |
| **Integrity (IMA/EVM)** | Measures file integrity at runtime; EVM protects file metadata using HMAC |
| **AppArmor** | Per-process capability profiles enforced by the kernel; system daemons and Snap packages are confined |
| **BPF** | Restricts BPF program loading to privileged users; container runtimes use BPF LSM hooks for isolation |

`auditd` logs kernel security events to a persistent audit trail.

## Signed OS Images

Every OS update is verified before deployment:

1. **SHA256 checksum** — confirms file integrity after download
2. **GPG signature** — confirms the image was signed by the Shanios project key (`7B927BFFD4A9EAAA8B666B77DE217F3DA8014792`)
3. **Btrfs snapshot** — taken of the inactive slot before overwriting, providing an additional rollback point

`shani-deploy` refuses to deploy any image that fails either check. The key is on public keyservers at `keys.openpgp.org`.

## Full-Disk Encryption (LUKS2 + TPM2)

LUKS2 full-disk encryption with `argon2id` KDF is available at install time. After enabling encryption, run:

```bash
sudo gen-efi enroll-tpm2
```

This seals the LUKS key into the TPM2 chip with PCR policy chosen automatically: **PCR 0+7** when Secure Boot is enabled (firmware + Secure Boot certificate state), or **PCR 0 only** when disabled. The disk unlocks silently on your own hardware; if physically moved to another machine or if firmware is tampered with, the TPM withholds the key.

See [TPM2 Enrollment](../security/tpm2) for setup.

## Secure Boot

Shanios uses Shim for Secure Boot — the same mechanism used by mainstream Linux distributions. The MOK is generated during installation. Every UKI that `gen-efi` generates is signed with this key. The bootloader editor is disabled and the kernel command line is embedded in the UKI at build time and cannot be modified from the boot menu.

See [Secure Boot](../security/secure-boot) for enrollment.

## Kernel Hardening Parameters

```
kernel.unprivileged_userns_clone = 1   # needed for containers
kernel.nmi_watchdog = 0                # reduces attack surface
kernel.sysrq = 1                       # emergency recovery only
kernel.unprivileged_bpf_disabled = 1   # restrict BPF
```

## Blacklisted Kernel Modules

| Module | Reason |
|--------|--------|
| `pcspkr` | Eliminates covert timing channel via PC speaker |
| `mei`, `mei_me` | Intel Management Engine interface — disabled by default |

## Firewall (firewalld)

Active from first boot. Default policy: deny inbound, allow outbound.

Pre-configured rules for KDE Connect/GSConnect (device pairing, file transfer, notifications) and Waydroid (DNS, packet forwarding).

`fail2ban` runs to ban repeated authentication failures.

All major VPN protocols are pre-installed: OpenVPN, WireGuard, L2TP, IKEv2/strongSwan, Cisco AnyConnect, Fortinet SSL, VPNC, SSTP. Tailscale and `cloudflared` are also pre-installed.

## Zero Telemetry

No background services report hardware, software usage, or system behaviour to any external server. No identifiers are generated or transmitted. No crash reports are collected.

`shani-deploy` connects to the CDN to download updates and to the GPG keyserver to verify signatures — standard HTTP downloads that send only what any HTTP client sends. Nothing else leaves the machine.

The entire codebase is public at [github.com/shani8dev](https://github.com/shani8dev). Every claim is independently verifiable.

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
