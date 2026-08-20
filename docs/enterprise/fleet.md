---
title: OEM & Fleet Deployment
section: Enterprise
updated: 2026-08-20
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

### Unattended and Low-Interaction Installs

The graphical installer (`os-installer`) is driven entirely by `/etc/os-installer/config.yaml`, plus a set of shell scripts (`scripts/prepare.sh`, `scripts/install.sh`, `scripts/configure.sh`) that `os-installer` invokes with the user's choices exported as `OSI_*` environment variables (`OSI_DEVICE_PATH`, `OSI_USE_ENCRYPTION`, `OSI_ENCRYPTION_PIN`, `OSI_USER_AUTOLOGIN`, etc.). Two configs ship in `os-installer-config`: `config.yaml` (general/USB media) and `config-git.yaml` (used for the git-built variant). Both are real, working configs, not templates — an OEM builds a custom image profile with its own `config.yaml` to control the install flow:

```yaml
# os-installer-config/config.yaml — keys relevant to a low-touch OEM install

internet:
  connection_required: no        # allow install without a network connection

fixed_language: en_US            # skip the language-selection page entirely

welcome_page:
  logo: '/usr/share/pixmaps/shanios-logo.png'
  text: |
    Welcome to Shani OS!
    ...

disk:
  partition_ok: no
  min_size: 28                   # minimum target size in GB

disk_encryption:
  offered: yes
  forced: no
  min_length: 1
  confirmation: yes

user:
  request_username: no
  provide_autologin: yes         # offer autologin (kiosk / shared-machine friendly)
  min_password_length: 1
  password_confirmation: yes

# gnome-initial-setup handles first-boot region/user pages — these can be
# skipped so a freshly imaged machine boots straight to a usable desktop
skip_region: yes
skip_user: yes
```

`configure.sh` reads `OSI_USER_AUTOLOGIN` and configures autologin for whichever display manager is present on the image — GDM, SDDM, greetd, LightDM, LXDM, or plain `agetty` on a TTY (`os-installer-config/scripts/configure.sh:505`, `setup_autologin_target`). Combined with `skip_region`/`skip_user`, an OEM image can go from first boot to a logged-in desktop with no first-run wizard at all.

Because the install/configure scripts only read `OSI_*` environment variables — they have no hard dependency on the GTK front-end — an OEM building a factory-imaging pipeline can call `install.sh`/`configure.sh` directly with those variables pre-set, skipping the interactive UI entirely for mass provisioning. This is scripting the same code path the GUI installer uses, not a separate "headless mode" — there is no bundled kickstart/autoyast-style single-answer-file format.

`failure_help_url` can point at an internal support desk instead of the public one, and `commands.reboot`/`commands.browser` can be repointed at OEM-specific tooling.

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

Every Shanios release is signed with key `7B927BFFD4A9EAAA8B666B77DE217F3DA8014792`, and `shani-deploy` hardcodes that fingerprint (`GPG_KEY_ID`) plus the CDN endpoint (`R2_BASE_URL="https://downloads.shani.dev"`) as `readonly` constants — there is no runtime flag or config file that repoints a stock `shani-deploy` binary at a different signing key or a private mirror. Machines running the stock tool always verify against, and download from, the public Shanios infrastructure (R2, with SourceForge-mirror auto-discovery as fallback).

An OEM that needs its own signing key does so at the **image-build layer**, not at runtime on deployed machines — see [Custom & Cloud Image Building](#custom--cloud-image-building) below, where the Packer AMI pipeline accepts `PKR_VAR_gpg_public_key` to bake in an organisation's own key at build time. Redirecting the *ongoing* update pipeline (the `shani-deploy` running on already-deployed machines) to a private CDN or a different signing key requires forking `shani-deploy` (GPLv3, source available) and rebuilding the image with the patched constants — this is not a supported runtime configuration surface today.

---

## Custom & Cloud Image Building

[shani-install-media](https://github.com/shani8dev/shani-install-media) builds the actual OS images and ISOs from four profiles, each with its own `package-list.txt` under `image_profiles/<profile>/`:

| Profile | Desktop | Notes |
|---|---|---|
| `gnome` | GNOME | Default desktop image |
| `plasma` | KDE Plasma | Adds Kvantum Flatpak filesystem override |
| `cosmic` | COSMIC | Desktop image |
| `server` | None (headless) | Cloud/AMI-oriented, no GUI stack |

### The Server Profile

`image_profiles/server/package-list.txt` is explicitly built for headless/cloud deployment — its header states the meta-package policy: it deliberately excludes `shani-core`, `shani-network`, and `shani-desktop-*` (which would pull in NetworkManager, Waydroid, snapd-for-desktop, and GUI stacks) and instead installs `shani-tools-network` plus an explicit package list. Concretely, the server profile differs from the desktop profiles in:

- **Networking:** `systemd-networkd`/`systemd-resolved` instead of NetworkManager (`etc/systemd/network/20-cloud-dhcp.network`)
- **Cloud integration:** `cloud-init`, `amazon-ssm-agent`, `amazon-ec2-utils` — configured for AWS EC2 out of the box
- **Serial console:** `serial-getty@ttyS0.service` enabled for EC2-style serial access, kernel cmdline set via `etc/kernel/install_cmdline`
- **Security baseline enabled by default:** `sshd`, `firewalld`, `fail2ban`, `apparmor`, `auditd`, `fwupd`, `cronie` (`server-customization.sh` enables each)
- **Containers, not desktop apps:** `podman`, `buildah`, `skopeo`, `distrobox`, `podman-compose`
- **GUI dependencies disabled:** `server-customization.sh` masks the `shani-deploy-notify` GUI dialog service so `yad` never tries to open a display on a headless box
- **Optional-until-configured services disabled:** `tailscaled`, `cloudflared`, and `caddy` are installed but disabled until an admin configures them

The bundled cloud-init datasource config (`etc/cloud/cloud.cfg.d/10-shanios-aws.cfg`) targets AWS EC2 specifically: IMDSv2 is enforced (`strict_id: true`), SSH host keys are regenerated per-instance (`ssh_deletekeys`/`ssh_genkeytypes`) so cloned AMI instances don't share host keys, root SSH login is disabled, and the default `shanios` user is created with passwordless sudo and cloud-init-managed key injection — comparable to what AL2023/RHEL9/Ubuntu cloud images do.

### Building an AWS AMI Directly

`shani-install-media/packer/` contains a working Packer template (`shanios-ami.pkr.hcl`, using the `amazon-ebssurrogate` builder) that turns a pre-built `.zst` base image into a bootable AWS AMI with the same blue/green Btrfs layout as physical installs:

```bash
cd packer/
cp templates/variables.pkrvars.hcl local.pkrvars.hcl
$EDITOR local.pkrvars.hcl        # set r2_base_url and aws_region at minimum

make init
make validate
make build                       # default profile: server
make build PROFILE=gnome         # or gnome / plasma / cosmic
```

The build runs a three-stage provisioner (`00-bootstrap-shanios.sh` partitions the target volume and receives the Btrfs send-stream; `01-configure-aws.sh` writes fstab, cloud-init, and the bootloader; `02-verify.sh` fails the build if anything critical is missing) and takes roughly 15–25 minutes. Key variables an OEM/cloud team would set:

| Variable | Purpose |
|---|---|
| `r2_base_url` / `s3_base_url` | Where the base `.zst` image is pulled from during the *build* |
| `gpg_public_key` | Pass your own signing key via `PKR_VAR_gpg_public_key` — never stored in the vars file |
| `shanios_profile` | `gnome` \| `plasma` \| `cosmic` (server is the default) |
| `root_volume_size_gb` / `efi_volume_size_mb` | AMI volume sizing |

A GitHub Actions workflow (`.github/workflows/build-ami.yml`) builds the AMI via AWS OIDC (no long-lived keys) on every relevant push.

### The Underlying Package Build Pipeline

[shani-builder](https://github.com/shani8dev/shani-builder) is the shared build infrastructure an OEM would need if customising further:

- **`docker/`** — the privileged Arch-based container (`shrinivasvkumbhar/shani-builder`) that `shani-install-media` uses to assemble images/ISOs; it pre-imports the Shanios signing key and adds the `[shani]` pacman repo
- **`pkg/pkg-builder.sh`** — a fully automated pipeline that builds, GPG-signs, and publishes custom Arch packages to a `repo-add`-managed package repository, driven entirely by environment variables (`SSH_PRIVATE_KEY`, `GPG_PRIVATE_KEY`, `GPG_PASSPHRASE`) rather than positional CLI args, so credentials never show up in `ps aux`

Building a fully custom OEM/AMI image is therefore a real, documented pipeline (profile → `pacstrap` package list → overlay → customisation script → sign → publish), not a manual respin process.

---

## Fleet Update Management

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

For unattended fleet updates, a systemd timer can trigger `shani-deploy` on a schedule:

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

`shani-deploy` takes an `flock`-based lock on `/run/shanios-deploy.lock` before doing anything (`acquire_deploy_lock()`), so if a timer-triggered run overlaps with an admin manually running `shani-deploy` — or a second timer fires before the first finishes — the second invocation exits immediately with "Another shani-deploy is already running" instead of racing the first. This makes scheduled fleet timers safe to layer on top of manual/ad-hoc updates without extra locking of your own.

The update stages the new image and, once staged, arms a **60-second automatic reboot by default** (`AUTO_REBOOT=yes`) via a separate one-shot systemd timer. For fleets that want to control the reboot moment precisely (a maintenance window rather than 60 seconds after staging), disable that and drive it yourself off the reboot marker:

```bash
# Stage the update but don't let it auto-reboot in 60s
sudo AUTO_REBOOT=no shani-deploy

# Check the marker in your maintenance-window logic (tmpfs, cleared on reboot)
if [ -f /run/shanios/reboot-needed ]; then
    systemctl reboot
fi
```

`--download-only` splits fetch from deploy — useful for pre-staging an update to many machines over a slow or metered link ahead of the actual maintenance window:

```bash
sudo shani-deploy --download-only     # fetch + verify now, cached under /data/downloads
# ... later, in the maintenance window:
sudo shani-deploy                     # deploys the already-verified image
```

For managed fleets, disable the `shani-update` interactive prompt so it does not surface to users:

```bash
sudo rm /etc/xdg/autostart/shani-update.desktop
```

### Centralised Update Delivery — What Is (and Isn't) Configurable

Update images are served from Cloudflare R2 (`https://downloads.shani.dev`) with automatic SourceForge-mirror discovery as fallback, and every image is GPG-verified against the fixed key above. Both the CDN base URL and the signing key are `readonly` constants baked into `shani-deploy.sh` and `shani-update.sh` — **there is currently no config file or flag that points a stock installation at an internal mirror or a private signing key for its ongoing updates.** For air-gapped or bandwidth-controlled fleets, the practical options today are:

- `--download-only` on a machine with network access, then distributing the verified image tarball for offline deployment (manual, not automated by the tool)
- Forking `shani-deploy` to change `R2_BASE_URL`/`GPG_KEY_ID` and shipping that build to the fleet instead of the stock tool

A fully self-hosted "private update CDN" pointed to by an unmodified `shani-deploy` is not an existing feature — see [Gaps and Roadmap](#gaps-and-roadmap).

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

# Bundle logs + state for centralised triage
shani-health --export-logs /var/tmp/diag
```

Most modes (`--boot`, `--security`, `--storage-info`, `--network`, `--hardware`, `--packages`) print a formatted, human-readable report — there is no `--json`/machine-readable output mode today, so scraping structured data out of them for a monitoring dashboard would mean parsing text.

`--verify` is the exception worth building fleet automation around: it runs UKI signature checks, a Btrfs scrub of both slots, slot-marker consistency, boot-entry consistency, and immutability checks, then **returns a real exit code** — `0` if everything passed, `1` if it found any issue — which is exactly what a cron job or fleet health-check runner needs:

```bash
# Cron-friendly health gate — non-zero exit means alert
if ! shani-health --verify >/tmp/verify.log 2>&1; then
    mail -s "shani-health --verify FAILED on $(hostname)" ops@example.com < /tmp/verify.log
fi
```

`--export-logs` bundles diagnostics into a directory for centralized collection (e.g. rsync'd back to a fleet-management box) when a deeper look is needed than the exit code alone provides.

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

## Gaps and Roadmap

To keep this page honest about what exists versus what a larger enterprise deployment might expect, the following are **not** currently implemented anywhere in the Shanios codebase, and should not be assumed:

- **No centralised fleet dashboard.** There is no web console or MDM-style server for viewing fleet-wide status, pushing configuration, or triggering updates across machines. Fleet coordination today means SSH/Tailscale plus your own scripting (cron + `shani-deploy` + `shani-health --verify`), as described above.
- **No runtime-configurable private update mirror or signing key.** As covered above, `R2_BASE_URL` and `GPG_KEY_ID` are compile-time constants in `shani-deploy`/`shani-update`. A private CDN or OEM signing key for *ongoing* updates requires forking the tool, not a config setting.
- **No machine-readable `shani-health` output.** Reports are formatted text; only `--verify`'s exit code is designed for automation.
- **No remote push/enrollment mechanism.** Machines pull updates on their own schedule (timer or user-triggered); there's no server-initiated "deploy to these 200 machines now" push.

If your organisation needs one of these, [contact the project](https://shani.dev#enterprise) — enterprise/OEM engagement is exactly the context in which contributing this kind of tooling upstream is on the table.

---

## See Also

- [Security Features](../security/features) — full security model
- [Atomic Updates](../concepts/atomic-updates) — update and rollback pipeline
- [Overlay Filesystem](../arch/overlay) — `/etc` customisation persistence
- [TPM2 Enrollment](../security/tpm2) — passwordless disk unlock
