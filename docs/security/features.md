---
title: Security Features
section: Security
updated: 2026-04-27
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
| Hardware key support | FIDO2/U2F, smart cards, fingerprint | Ready, configure as needed |

## Immutability as a Security Primitive

The root filesystem is mounted read-only at the VFS layer — enforced by the kernel, not by DAC/MAC policy. A process running as root cannot write to `/usr/bin`, `/lib`, `/etc/systemd/system`, or any other system path.

Most persistent malware works by writing a backdoor to a system path that survives reboot. On Shanios, there is nowhere to write it. The system that passed build-time GPG verification is the system that runs — byte for byte — until the next deliberate `shani-deploy` update. An attacker who compromises a running session has a session, not persistence.

The `/etc` OverlayFS and the `@data` subvolume are writable, but they are user-visible and auditable. The OS binaries are not.

## Linux Security Modules

Six LSMs run simultaneously, loaded in order:

```
lsm=landlock,lockdown,yama,integrity,apparmor,bpf
```

Most Linux distributions enable one or two LSMs. Shanios enables all six simultaneously — each layer providing independent protection that remains in effect even if another is bypassed.

| LSM | What it does |
|-----|-------------|
| **Landlock** | Unprivileged sandboxing — applications can restrict their own filesystem access without requiring root to write a policy. Works bottom-up, complementing AppArmor's top-down enforcement. |
| **Lockdown** | Prevents kernel tampering from userspace (e.g. `/dev/mem` access, loading unsigned modules, PCI BAR access). Blocks a compromised root process from escaping other LSMs via low-level hardware access. |
| **Yama** | Restricts `ptrace` scope — a process can only be ptraced by its own children or explicitly permitted processes, blocking process injection and credential theft attacks. |
| **Integrity (IMA/EVM)** | Measures file integrity at runtime. IMA records cryptographic hashes of executed files. EVM protects file metadata (ownership, permissions, xattrs) using HMAC. Provides a runtime audit trail and detects tampered files in writable filesystem areas. |
| **AppArmor** | Per-process capability profiles enforced by the kernel. System daemons and Snap packages are confined. Custom profiles loaded at boot. |
| **BPF** | Restricts BPF program loading to privileged users. Container runtimes (Podman, LXC) use BPF LSM hooks for container isolation. Enables custom eBPF security policies for decisions that cannot be expressed as static AppArmor profiles. |

`auditd` logs kernel security events to a persistent audit trail.

## Signed OS Images

Every OS update is verified before deployment:

1. **SHA256 checksum** — confirms file integrity after download
2. **GPG signature** — confirms the image was signed by the Shanios project key (`7B927BFFD4A9EAAA8B666B77DE217F3DA8014792`)
3. **Btrfs snapshot** — taken of the inactive slot before overwriting, providing an additional rollback point

`shani-deploy` refuses to deploy any image that fails either check. The key is on public keyservers at `keys.openpgp.org`. The result is a continuous chain: the image verified at download time is the image `btrfs receive` writes to the slot — byte-for-byte identical to what passed build QA.

## Full-Disk Encryption (LUKS2 + TPM2)

LUKS2 full-disk encryption with `argon2id` KDF is available at install time (single checkbox). The `argon2id` KDF is memory-hard — it requires large amounts of RAM to compute, making GPU and ASIC brute-force attacks orders of magnitude more expensive than with older PBKDF2-based setups.

Default encryption parameters used by the installer:

```
Cipher:      aes-xts-plain64
Key size:    512 bits
PBKDF:       argon2id
Memory cost: 1048576 KB (1 GB)
Time cost:   4 iterations
Parallelism: 4 threads
```

After enabling encryption, enroll TPM2 for passwordless unlock:

```bash
sudo gen-efi enroll-tpm2
```

This seals the LUKS key into the TPM2 chip with PCR policy chosen automatically: **PCR 0+7** when Secure Boot is enabled (firmware + Secure Boot certificate state), or **PCR 0 only** when disabled. The disk unlocks silently on your own hardware; if physically moved to another machine or if firmware is tampered with, the TPM withholds the key.

See [TPM2 Enrollment](tpm2) for setup and [LUKS Management](luks) for keyslot management.

## Secure Boot

Shanios uses Shim for Secure Boot — the same mechanism used by mainstream Linux distributions. The MOK is generated during installation. Every UKI that `gen-efi` generates is signed with this key.

The full boot chain:

```
UEFI Firmware (verifies Shim via Microsoft CA)
  → Shim (verifies systemd-boot via MOK)
    → systemd-boot (verifies the UKI via MOK)
      → Unified Kernel Image (kernel + initramfs + cmdline, all signed together)
```

The bootloader editor is disabled and the kernel command line is embedded in the UKI at build time — it cannot be modified from the boot menu, preventing attacks that inject `init=/bin/bash` or `single` to bypass authentication.

See [Secure Boot](secure-boot) for enrollment.

## Intel ME Disabled

The Intel Management Engine kernel modules are blacklisted by default:

| Module | Reason |
|--------|--------|
| `pcspkr` | Eliminates covert timing channel via PC speaker |
| `mei`, `mei_me` | Intel Management Engine interface — disabled by default |

This does not remove ME from the hardware (not possible in software), but removes the kernel's interface to it, reducing the attack surface from the OS side.

## Kernel Hardening Parameters

```
kernel.unprivileged_userns_clone = 1   # needed for containers
kernel.nmi_watchdog = 0                # reduces attack surface
kernel.sysrq = 1                       # emergency recovery only
kernel.unprivileged_bpf_disabled = 1   # restrict BPF
```

## Firewall (firewalld)

Active from first boot. Default policy: deny inbound, allow outbound.

Pre-configured rules applied at installation time:

- **KDE Connect/GSConnect:** Ports opened in the public zone for device pairing, file transfer, notifications, and remote control
- **Waydroid:** DNS (53/udp, 67/udp), packet forwarding enabled, `waydroid0` interface added to the trusted zone

`fail2ban` runs to ban repeated authentication failures.

All major VPN protocols are pre-installed: OpenVPN, WireGuard, L2TP, IKEv2/strongSwan, Cisco AnyConnect, Fortinet SSL, VPNC, SSTP. Tailscale and `cloudflared` are also pre-installed with state persisted across OS updates.

## Authentication

Pre-installed and working at first boot without driver installation:

- **Fingerprint** — fprintd with libfprint for supported hardware
- **Smart card / PIV** — opensc, pcscd, pcsc-tools
- **YubiKey and FIDO2** — libfido2, pam-u2f, yubikey-manager
- **NFC authentication** — libnfc, pcsc-lite
- **TOTP/HOTP two-factor** — oath-toolkit

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

## What These Layers Compose

These are not independent features — they compose into a coherent security model:

- The read-only root means attackers cannot persist to system paths
- Secure Boot means attackers cannot inject a modified kernel
- TPM2-sealed LUKS means the disk is useless on a different machine or with modified firmware
- Six LSMs mean even a root compromise is bounded in what it can do
- Signed images mean the update path cannot be poisoned
- Zero telemetry means there is no built-in data exfiltration channel

The attack surface is reduced by design, not by configuration.
