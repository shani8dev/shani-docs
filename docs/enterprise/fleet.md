---
title: OEM & Fleet Deployment
section: Enterprise
updated: 2026-04-27
---

# OEM & Fleet Deployment

Shanios is designed for fleet-scale management. Every machine pulls from the same GPG-verified image. Updates are atomic and all-or-nothing. Rollback requires no reimaging. The fleet stays uniform because the OS is replaced wholesale on each update — never patched in place.

Enterprise contact and OEM enquiries: [shani.dev — Enterprise & Vendors](https://shani.dev#enterprise).

## Why Immutability Solves Fleet Management

Traditional fleet management tooling (Ansible, Puppet, Chef, Salt) solves a problem Shanios makes unnecessary: reconciling the actual state of a mutable system with the desired state. You write playbooks to install packages, configure files, enable services, and fix drift. You run them on a schedule.

On Shanios, the root filesystem is physically read-only. A machine cannot drift from the OS image it booted. The only way the OS changes is through `shani-deploy`, which replaces it atomically. Configuration lives in the `/etc` OverlayFS overlay (in `@data`) — tracked separately from the OS image and surviving every update.

The result is a fleet model that looks more like container orchestration than traditional desktop management: the OS is an image, deployments are image swaps, and per-machine state is limited and explicit.

| Concern | Traditional Mutable Linux | Shanios |
|---|---|---|
| Fleet uniformity | Drifts over time; requires reconciliation tools | Every machine on same channel runs identical verified image |
| Bad update recovery | Reimage or manual rollback; often on-site | One SSH command (`shani-deploy -r`); automatic if unattended |
| Security audit | Hardening guide + config management | Secure by default; auditable public codebase |
| Software inventory | `dpkg -l`, `rpm -qa` varies per machine | OS image version + Flatpak list — identical across fleet |
| Remote management | MDM + SSH + config management stack | SSH or Tailscale; no drift to manage |
| Encryption | Configure LUKS separately | LUKS2 + TPM2 at install; no foreign key escrow |

---

## OEM Deployment

### Pre-installation Customisation

**Plymouth branding:** The Plymouth boot theme uses BGRT — it reads the OEM logo directly from UEFI firmware. A machine whose logo is in the UEFI BGRT table automatically displays it during boot without any image customisation. For custom logos beyond BGRT, the Plymouth theme configuration lives in `/usr/share/plymouth/themes/`.

**Pre-installed Flatpaks:** To ship machines with specific applications pre-installed, add Flatpak refs to the OEM configuration layer. Flatpaks install to `@flatpak` and are fully independent of the OS image.

**Custom Flatpak remotes:** Organisations can run private Flatpak repositories for internal applications:

```bash
# Add a private Flatpak repository
flatpak remote-add --if-not-exists myorg https://flatpak.myorg.com/repo

# Install an internal app
flatpak install myorg com.myorg.InternalApp
```

### Image Signing

Every Shanios release is signed with key `7B927BFFD4A9EAAA8B666B77DE217F3DA8014792`. For organisations deploying a custom build, the signing key is configurable in `shani-deploy`. Machines enrolled with your key only accept images signed by your key — a tampered or unofficial image fails verification before it is written.

---

## Fleet Update Management

### Centralised Update Delivery

For fleet deployments, mirror the update CDN internally and point machines at your internal mirror by configuring the update URL in `shani-deploy`'s configuration. Updates are downloaded from your network, not the public CDN. This controls bandwidth and allows offline or air-gapped deployments.

### Release Channels and Staged Rollouts

`shani-deploy` supports two release channels: `stable` (default, monthly) and `latest` (more frequent). For staged rollouts, run a canary group on `latest` before pushing the full fleet on `stable`:

```bash
# Check current channel
cat /etc/shani-channel

# Switch channel (persisted to /etc/shani-channel)
sudo shani-deploy --set-channel stable
sudo shani-deploy --set-channel latest

# Use a channel for a single run without changing the default
sudo shani-deploy -t latest
```

### Automated Unattended Updates

For unattended fleet updates, a systemd timer can trigger `shani-deploy` on a schedule. The update stages the new image and writes `/run/shanios/reboot-needed`; the reboot can be scheduled separately in a maintenance window:

```ini
# /etc/systemd/system/shani-autoupdate.timer
[Unit]
Description=Automatic Shani OS update check

[Timer]
OnCalendar=weekly
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/shani-autoupdate.service
[Unit]
Description=Automatic Shani OS update

[Service]
Type=oneshot
ExecStart=/usr/local/bin/shani-deploy
```

```bash
sudo systemctl enable shani-autoupdate.timer
```

For managed fleets, disable the `shani-update` interactive prompt so it does not surface to users:

```bash
sudo rm /etc/xdg/autostart/shani-update.desktop
```

---

## Remote Rollback Without Reimaging

**Automatic rollback (no intervention):** systemd-boot's boot-counting mechanism detects a slot that fails to reach `multi-user.target` within three boot attempts and automatically falls back to the previous slot.

**Manual rollback (one command, remotely):**

```bash
sudo shani-deploy -r
# Then reboot — via SSH, MDM, or remote management console
```

No reimaging cycle. No USB drive. No on-site visit. The previous OS slot is always kept on disk until the next update cycle.

---

## Configuration Management

For configuration that must be consistent across a fleet — SSH hardening, service enablement, custom `/etc` settings — use the OverlayFS upper layer in `@data`:

```bash
# Deploy a managed configuration to the persistent overlay
sudo cp /path/to/managed/sshd_config /data/overlay/etc/upper/ssh/sshd_config

# Enable a managed service (symlink persists in the overlay)
sudo systemctl enable --now myservice
```

Changes to `/etc` via OverlayFS survive every OS update and rollback. When the OS updates, new defaults in the lower layer are visible to files you have not customised; files you have customised retain your version.

### Auditing Customisations

```bash
# See all machine-specific /etc customisations
find /data/overlay/etc/upper -type f | sort

# Compare a customised file to the OS default
diff /data/overlay/etc/upper/ssh/sshd_config /etc/ssh/sshd_config
```

---

## School Labs and Shared Computing

Shanios is particularly well-suited to environments where users cannot be trusted to preserve the OS — school labs, library terminals, shared workstations, kiosks.

A user cannot persistently corrupt the immutable root. Changes to system files are impossible. Changes to `/etc` via OverlayFS are per-machine and auditable.

**Reset between sessions:** For kiosk or lab scenarios where each session should start fresh:

```bash
# Example: reset a lab user's home directory on logout
# /etc/gdm/PostSession/Default (GNOME) or equivalent
rsync -a --delete /etc/skel/ /home/labuser/
```

**OS reset between terms:** `shani-reset` wipes all persistent system state in `/data` (the `/etc` overlay, service state, enabled units, etc.) without touching the OS image or user home directories:

```bash
# Preview what would be wiped (dry run)
sudo shani-reset --dry-run

# Wipe all /data state and reboot (system starts fresh from the same OS image)
sudo shani-reset

# Wipe /data AND /home to also reset user files
sudo shani-reset --home
```

No reimaging cycle needed between semesters.

**Indian language support:** Devanagari, Tamil, Telugu, and other Indian scripts are configured from first boot. IBus multi-language input is pre-configured. The software is free, the codebase is auditable, and there is no subscription, licence fee, or vendor lock-in.

---

## Monitoring and Observability

### shani-health

`shani-health` is the diagnostic tool for fleet monitoring. It covers boot state, security configuration, storage, hardware, and package status:

```bash
# Full system status report
shani-health

# Boot report: slots, UKI state, deployment status
shani-health --boot

# Security report: boot chain, encryption, LSM, users
shani-health --security

# Btrfs storage analysis
shani-health --storage-info

# Deep integrity check: UKI signatures + Btrfs scrub
shani-health --verify

# Last 50 deploy/rollback events
shani-health --history

# systemd journal entries at error level and above
shani-health --journal err
```

### Remote Monitoring via Tailscale or SSH

Each machine is accessible via SSH over Tailscale without requiring a VPN server or port forwarding. Tailscale state persists across OS updates at `/data/varlib/tailscale`:

```bash
# Check a remote machine's active slot and boot state
ssh admin@machine-name.tailnet.ts.net 'cat /data/current-slot && shani-health --boot'

# Remote rollback
ssh admin@machine-name.tailnet.ts.net 'sudo shani-deploy -r && sudo reboot'
```

---

## Security Posture for Enterprise Compliance

Shanios's default security configuration is designed to pass enterprise security audits without additional hardening steps:

- Six simultaneous Linux Security Modules (AppArmor, Landlock, Lockdown, Yama, IMA/EVM, BPF LSM)
- Immutable root filesystem — even root cannot write to system paths at runtime
- LUKS2 argon2id full-disk encryption (opt-in at install)
- TPM2 auto-unlock — disk locked against physical removal to another machine
- Secure Boot via Shim + MOK-signed UKIs — bootloader editor disabled
- Signed OS images — SHA256 + GPG verified before every deployment
- Intel ME kernel modules blacklisted by default
- firewalld active from first boot — default-deny inbound
- fail2ban active — automated banning of repeated authentication failures
- Zero telemetry — no usage data, crash reports, or analytics

LUKS2 keys never leave the device. TPM2 sealing binds to PCRs 0 and 7 — the firmware state and the Secure Boot policy. For government and institutional deployments requiring no foreign key escrow: the encryption key is on the device, sealed in the TPM2 chip, verifiable via the public `gen-efi` source code.

---

## See Also

- [Security Features](../security/features) — full security model
- [Atomic Updates](../concepts/atomic-updates) — update and rollback pipeline
- [Overlay Filesystem](../arch/overlay) — `/etc` customisation persistence
- [TPM2 Enrollment](../security/tpm2) — passwordless disk unlock
