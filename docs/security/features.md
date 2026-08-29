---
title: Security Features
section: Security
updated: 2026-08-28
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

The installer runs `cryptsetup luksFormat --pbkdf argon2id` and nothing else — it doesn't pin a cipher, key size, or PBKDF cost, so the rest come from cryptsetup 2.x's own LUKS2 defaults:

```
Cipher:          aes-xts-plain64
Key size:        512 bits (256-bit key doubled by XTS mode)
PBKDF:           argon2id
Memory cost:     1048576 KB (1 GB)
Parallel threads: 4
Iteration time:  2000 ms (benchmarked per-machine, not a fixed iteration count)
```

After enabling encryption, enroll TPM2 for passwordless unlock:

```bash
sudo gen-efi enroll-tpm2
```

This seals the LUKS key into the TPM2 chip with PCR policy chosen automatically: **PCR 0+7** when Secure Boot is enabled (firmware + Secure Boot certificate state), or **PCR 0 only** when disabled. The disk unlocks silently on your own hardware; if physically moved to another machine or if firmware is tampered with, the TPM withholds the key.

See [TPM2 Enrollment](tpm2) for setup and [LUKS Management](luks) for keyslot management.

## Secure Boot

Shanios uses Shim for Secure Boot — the same mechanism used by mainstream Linux distributions. The MOK (Machine Owner Key) is baked into the system image at build time — every machine installed from the same signed ISO shares the same key. A fresh keypair is only generated on the spot as a fallback, if keys are missing or invalid on a given image. Every UKI that `gen-efi` generates is signed with this key.

The full boot chain:

```
UEFI Firmware (verifies Shim via Microsoft CA)
  → Shim (verifies systemd-boot via MOK)
    → systemd-boot (verifies the UKI via MOK)
      → Unified Kernel Image (kernel + initramfs + cmdline, all signed together)
```

The bootloader editor is disabled and the kernel command line is embedded in the UKI at build time — it cannot be modified from the boot menu, preventing attacks that inject `init=/bin/bash` or `single` to bypass authentication.

See [Secure Boot](secure-boot) for enrollment.

## Module and Protocol Blacklisting

Several kernel modules and rarely-used network protocols are blacklisted by default, via `modprobe.d` drop-ins shipped in `shani-settings`:

| Module(s) | File | Reason |
|-----------|------|--------|
| `mei`, `mei_me` | `modprobe.d/noime.conf` | Intel Management Engine / vPro remote-access interface — disabled by default. This does not remove ME from the hardware (not possible in software), but removes the kernel's interface to it, reducing the attack surface from the OS side. |
| `pcspkr` | `modprobe.d/nobeep.conf` | PC speaker blacklisted to stop the console beep; incidentally also removes it as a data-exfiltration side channel |
| `firewire-core`, `firewire-ohci`, `firewire-sbp2`, `firewire-net` | `modprobe.d/blacklist-firewire.conf` | FireWire storage/DMA blocked outright (`install ... /bin/false`) — addresses Lynis `STRG-1846`, preventing unauthorized memory access via FireWire DMA |
| `dccp`, `sctp`, `rds`, `tipc` | `modprobe.d/disable-unused-protocols.conf` | Uncommon network protocols disabled — addresses Lynis `NETW-3200`, reducing kernel attack surface from protocols the desktop doesn't use |

## Kernel Hardening Parameters

The real values, from `usr/lib/sysctl.d/90-security-hardening.conf` in `shani-settings` (addresses Lynis `KRNL-6000`), tuned to stay compatible with Podman, Distrobox, LXC/LXD, systemd-nspawn, Flatpak, Snap, and Waydroid:

```
kernel.kptr_restrict = 2            # hide kernel pointers (requires CAP_SYSLOG)
kernel.dmesg_restrict = 1           # dmesg root-only
kernel.perf_event_paranoid = 2      # restrict perf_event_open to privileged users
kernel.randomize_va_space = 2       # full ASLR
kernel.sysrq = 0                    # SysRq disabled (set to 1 temporarily for emergency recovery)
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
fs.suid_dumpable = 0                # no core dumps from setuid processes
net.core.bpf_jit_harden = 2         # hardens the BPF JIT against Spectre/info-leak attacks
```

A few upstream Lynis recommendations were deliberately relaxed rather than applied at full strength, with the reasoning kept inline in the file itself:

- **`kernel.unprivileged_bpf_disabled = 0`** (Lynis recommends `1`) — the stricter setting breaks rootless Podman's Netavark network backend, which needs unprivileged eBPF for port forwarding and traffic-control hooks; without it, rootless pod port mappings silently fail. `bpf_jit_harden = 2` is kept on regardless, which mitigates the main Spectre risk from unprivileged eBPF.
- **`fs.protected_fifos` / `fs.protected_regular` stay at `2`** rather than a stricter mode — `systemd-nspawn` bind-mounts run as root, so the unprivileged-only restriction doesn't affect them either way.
- **`net.ipv4.conf.all.rp_filter = 2`** (loose) rather than strict `1` — strict mode silently drops traffic on container bridges (`waydroid0`, `podman0`, `lxdbr0`, `cni-podman0`) because return traffic legitimately arrives on a different interface than it left on.
- **`kernel.modules_disabled` is intentionally not set** — locking it to `1` permanently blocks all future module loading until reboot, which breaks GPU drivers, USB hot-plug, and gaming peripherals.

`kernel.unprivileged_userns_clone = 1` (needed for rootless containers) and `kernel.nmi_watchdog = 0` (faster boot/shutdown, lower power draw) are also set, in the separate performance-tuning file `usr/lib/sysctl.d/99-sysctl-shani.conf`.

## Firewall (firewalld)

Active from first boot. Default policy: deny inbound, allow outbound.

Pre-configured rules applied at installation time:

- **KDE Connect/GSConnect:** Ports opened in the public zone for device pairing, file transfer, notifications, and remote control
- **Waydroid:** DNS (53/udp, 67/udp), packet forwarding enabled, `waydroid0` interface added to the trusted zone

`fail2ban` runs to ban repeated authentication failures.

All major VPN protocols are pre-installed: OpenVPN, WireGuard, L2TP, IKEv2/strongSwan, Cisco AnyConnect, Fortinet SSL, VPNC, SSTP. Tailscale and `cloudflared` are also pre-installed with state persisted across OS updates.

## Authentication

Pre-installed via the `shani-peripherals` package, working at first boot without driver installation:

- **Fingerprint** — `fprintd` (pulls in `libfprint`) for supported hardware
- **Smart card / PIV** — `opensc`, `ccid`, `acsccid` (these pull in `pcscd`/`pcsc-lite` as a dependency)
- **YubiKey and FIDO2/U2F** — `libfido2`, `pam-u2f`
- **NFC** — `libnfc`, riding on the same `pcscd`/`pcsc-lite` stack as smart cards

Not part of the default image — and because the host is immutable, they cannot be added with `pacman` at runtime. Install them via Nix (`nix-env -iA nixpkgs.<pkg>`) or run them inside a Distrobox container:

- **YubiKey Manager** (`ykman`) — `nix-env -iA nixpkgs.yubikey-manager`
- **PC/SC diagnostics** (`pcsc_scan`) — `nix-env -iA nixpkgs.pcsc-tools`
- **TOTP/HOTP two-factor** (`oathtool`) — `nix-env -iA nixpkgs.oath-toolkit`

See [Hardware Authentication](hardware-auth) for the full breakdown of what ships by default, the exact install commands, and the Distrobox alternative.

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

## See Also

- [TPM2 Enrollment](tpm2) — automatic LUKS unlock setup
- [LUKS Management](luks) — encryption key management and recovery
- [Secure Boot](secure-boot) — MOK enrollment and firmware setup
- [AppArmor](apparmor) — mandatory access control profiles
- [Audit Framework](audit) — auditd rules and log analysis
- [Firmware Updates (fwupd)](fwupd) — firmware upgrade workflow
- [Hardware Authentication](hardware-auth) — fingerprint, smart card, YubiKey, NFC
- [Lynis Audit](lynis) — CIS benchmark scanning and hardening
- [Keyring & Secrets](keyring) — GNOME Keyring and credential storage
- [Permissions & Authorization](../security/permissions.md) — Polkit tier system
- [System Updates](../updates/system.md) — how signed images are deployed
- [Security & Identity](../servers/security/policies) — Vaultwarden, Authelia, Keycloak, CrowdSec, secrets management
- [Troubleshooting](../troubleshooting.md) — diagnosing security-related issues
