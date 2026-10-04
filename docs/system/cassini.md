---
title: Shani Cassini (System Manager)
section: System
updated: 2026-09-25
---

# Shani Cassini

Shani Cassini is the Shanios system manager — named after the spacecraft that
orbited and watched over Saturn. It is part of the GNOME, KDE Plasma and COSMIC
editions from the images built after 25 September 2026; open it from the app grid (**Shani Cassini**) or run
`shani-cassini`. It shows what the system tools report and nothing else:
every page is backed by `shani-deploy`, `shani-health`, `gen-efi` or systemd
itself, so what you see is what the command line would tell you.

Open a page directly with `shani-cassini --section=<name>` (for example
`--section=updates`), where the name is one of the 42 page ids in
`notebook.py`'s `SECTIONS`:

| Group | Page ids |
|-------|----------|
| **System** | `overview`, `health`, `storage`, `smart`, `system`, `drivers`, `btrfs`, `persistence`, `timers`, `cron` |
| **Security** | `secureboot`, `encryption`, `lsm`, `audit`, `firewall`, `biometrics`, `smartcard`, `securitykeys`, `sshkeys`, `kerberos`, `directory`, `access`, `remoteaccess`, `apparmor` |
| **Updates** | `boot`, `updates` |
| **Manage** | `services`, `containers`, `virtualization`, `sharing`, `backup`, `maintenance`, `modules`, `firmware`, `graphics`, `audio`, `journal` |
| **Apps** | `chronoa`, `fleet` |

The same is available over D-Bus as
`gapplication action dev.shani.cassini show-section "'btrfs'"`.

## Pages

| Page | What it does | Under the hood |
|------|--------------|----------------|
| **Overview** | Version, edition, slot, whether an update is waiting | `shani-deploy --status --check --json` |
| **Health** | Runs the integrity check and the security audit on request; lists this boot's error messages and recent crashes | `shani-health --verify --json`, `--security --json`, `journalctl -b -p err`, `coredumpctl` |
| **System Info** | Model, firmware, OS, clock sync, boot time, hardware, kernel | `hostnamectl`, `timedatectl`, `systemd-analyze` |
| **Drivers** | PCI devices and their kernel drivers | `lspci`, loaded modules |
| **Secure Boot** | Secure Boot state and MOK keys | `mokutil`, `gen-efi enroll-mok` |
| **Encryption** | Whether the disk is encrypted; set up or turn off TPM2 automatic unlock (optionally with a PIN) | `gen-efi tpm2-status`, `enroll-tpm2`, `remove-tpm2` |
| **Updates & Rollback** | Update channel (Stable/Latest), install an update, go back to the previous system | `shani-deploy`, `--set-channel`, `--rollback` |
| **Services** | Switch system services on or off, start/stop/restart, read a service's log | `systemctl`, `journalctl -u` |
| **Backup** | Backup location and tools; opens Shani Backup | `org.shani.backup` settings |
| **Maintenance** | Disk space, clean up old downloads, deduplicate, create a diagnostic report, reset the computer | `shani-deploy --cleanup/--optimize`, `shani-health --export-logs`, `shani-reset` |
| **Chronoa** | The assistant's engines and main switches; opens Chronoa | `org.shani.chronoa` settings |
| **Fleet** | Enrollment status, and enrolling or removing this device (only when the fleet agent is installed) | `shani-fleet-agent status`, `enroll`, `uninstall --yes` |

That table is a summary. Cassini has **60 pages**; these are the ones that do
something you would go looking for. The rest are grouped here because they
report rather than act.

### Pages that report a subsystem nothing else has a panel for

Neither GNOME Control Center nor KDE System Settings has one of these. All are
read-only: they show what the tool says and change nothing.

| Page | What it reports | Under the hood |
|------|-----------------|----------------|
| **Cron** | The machine's own scheduled jobs — `crontab -l` shows only your own | reads `/etc/crontab`, `/etc/cron.d` and `/etc/cron.{hourly,daily,weekly,monthly}` |
| **AppArmor** | The confinement profiles loaded, and which are enforcing rather than complaining | `aa-status` (needs your password, so it runs when you press the button) |
| **Kernel Modules** | Every loaded module, its dependencies, and each parameter's current value | `/proc/modules`, `/sys/module` |
| **Firmware** | The hardware firmware installed, and what LVFS is offering | `fwupdmgr get-devices --json`, `get-updates --json` |
| **Graphics** | Graphics hardware, the driver bound to each, whether each card is powered, the render nodes, and hybrid-graphics state | `lspci -k`, `/sys/bus/pci/devices/*/power/runtime_status`, `/dev/dri/render*`, `switcheroo-control` |
| **Audio** | The PipeWire graph: devices, outputs, inputs, which is default, which programs are connected | `wpctl status` |
| **Journal** | Every boot still on disk, a search across their entries, whether logs survive a reboot, and the cap actually in force | `journalctl`, `/var/log/journal`, `/usr/lib/systemd/journald.conf.d/` |
| **DNS** | Which of the four installed resolvers actually answers, whether `resolv.conf` is a stub symlink or a plain file, and whether the global `DNS=` is set | `/etc/resolv.conf`, `/etc/systemd/resolved.conf` and its drop-ins, `systemctl is-active` |
| **UPS** | Whether a UPS is configured, whether the daemon is running, and what apcupsd itself reports | `/etc/apcupsd/apcupsd.conf`, `systemctl is-active apcupsd`, `apcaccess status` |
| **Outbound Mail** | Whether mail this machine sends will leave it: the relay setup, and anything stuck in the queue | `exim -bP transports`, `exim -bp` |
| **Inbound Access** | Which sharing services are installed, which are enabled, and what they are bound to — and the rule that nothing here may change your network | `ss -tulpn`, `systemctl is-enabled` |
| **Disk Health** | Whether smartd is scheduled and what its scan settings are, plus the overall health of each disk | `smartd.conf`, `smartctl -H` |
| **Btrfs** | Scrub and balance timers, and the result of the last run of each | `btrfs scrub status`, `btrfs balance status`, `systemctl` timers |
| **Software RAID** | Arrays and their members, their state and sync progress. Note the `Personalities :` line lists kernel drivers, not arrays — it is not a count | `/proc/mdstat` |
| **TOTP Tokens** | Whether oathtool is installed, whether a PAM stack actually uses it, and the stored accounts. Unlocking is `pam_oath`; **Shanios has none of it installed** | `/var/lib/oath/users.oath`, `/etc/pam.d` |
| **Boot Entries** | What the firmware will boot, and which slot is really in charge — EFI order is decided at install time and is *not* rewritten per slot | `efibootmgr -v` |
| **Acceleration** | Whether KVM is usable: CPU virtualisation flags, the `kvm` module, and IOMMU groups. Refuses any firmware change it cannot verify — on this machine all 154 EFI variables are protected and the CPU exposes no `vmx`, so enabling KVM through NVRAM is not offered | `/proc/cpuinfo`, `/sys/kernel/iommu_groups`, `efivarfs` |
| **Password Policy** | What `pam_pwquality` is set to. **Shanios installs it but does not wire it into any PAM stack**, so this shows the configuration, not live enforcement | `/etc/security/pwquality.conf` |
| **Userspace Encryption** | fscrypt, gocryptfs and ecryptfs, per file and per mountpoint. **fscrypt cannot work on Shanios:** the kernel requires it on a filesystem with encryption support, and btrfs does not provide it | `/etc/fstab`, `/proc/filesystems` |
| **App Versions** | The installed and available version of each Shanios component, and whether a newer one is already sitting in the cache | `pacman -Q`, `pacman -Si` |
| **Printers** | Queues, jobs and scan hardware. Read-only: the daemon is socket-activated and usually not running. **KDE Plasma 6.7 has no printer panel at all** | `lpstat`, `/etc/cups` |
| **Camera** | Capture devices, their formats and controls. Read-only: neither the PipeWire nor the legacy V4L stack runs as a service | `v4l2-ctl`, `pw-cli` |
| **SMB** | The shares `testparm` validates, the passdb accounts, and what holds ports 445 and 139. **`testparm -s` hides defaults and does not list usershares** — `map to guest` and friends are in the shipped file and absent from the dump | `testparm -s`, `pdbedit -L -v` |
| **Service Discovery** | mDNS and DNS-SD state. The **socket** is the switch: the service is D-Bus activated and never needs enabling | `systemctl is-enabled avahi-daemon.socket`, `ss -ulpn` |
| **Compression** | What each btrfs filesystem is set to compress, and what `compsize` measures is already compressed. **Needs root and refuses outright, so it never asks for a password.** `compsize` is a separate package from btrfsprogs | `compsize -b -x`, `findmnt` |
| **irqbalance** | Whether the daemon runs, and where the kernel has pinned each interrupt. A single-CPU `smp_affinity_list` is a driver default, **not** evidence irqbalance ran | `smp_affinity_list`, `irqbalance.env` |
| **ananicy-cpp** | The priority daemon: unit state, its privilege set, and the rules it loads. `/etc/ananicy.d` ships **empty**, so zero rules is a real state, not a fault | `ananicy-cpp`, `/etc/ananicy.d/` |
| **Kernel Lockdown** | Whether the kernel offers lockdown, what mode is in force, and what the boot requested. **sbctl itself reports no lockdown state**, and Shanios's Secure Boot system of record is gen-efi/mokutil, not sbctl | `/sys/kernel/security/lockdown` |
| **TPM2 Boot Unlock** | The second factor offered **at boot**. Available in the repos but **not installed by Shanios**, and it ships **no PAM module** — so this is boot unlock, not login 2FA | `tpm2-totp`, `dracut/modules.d/70tpm2-totp` |
| **Privileges** | The **system's** polkit rules and admin groups — not Cassini's own, which installs none. `.pkla` is dead upstream; every real rule here is JavaScript from a package under `/usr/share`. Present-but-unreadable is reported apart from empty | `/usr/share/polkit-1/rules.d`, `pkaction --version` |

Three of these are worth knowing about because the answer is not where you
would look. **Cron** cannot use `crontab -l` — that only ever means the calling
user's table, and no tool lists the system crontabs — including `/etc/crontab`
itself, whose lines carry an extra username field. **Graphics** reports the
`DRI_PRIME` value that addresses each GPU and whether that card is currently
awake, neither of which either settings app shows; it does **not** switch the
session default, because `switcheroo-control` is a read-only property service
with no call that changes anything, so per-app selection is
`switcherooctl launch -g N APP` or `prime-run`, named on the page. A GPU with no
driver bound is listed with an empty driver rather than hidden — that is what
"present but unusable" looks like from underneath.

**Encryption** reads `gen-efi pcrlock-status --json` behind the same Check button, which answers the one question the page could previously only reason about: whether the TPM key is pinned to fixed PCR values (it is — gen-efi enrols with `--tpm2-pcrs`, the policy `systemd-cryptenroll` calls brittle) or bound to a policy hash. A firmware update strands a pinned key, and the page now says so from the machine rather than by inference.

**Firmware** deliberately installs nothing, and says why — a firmware update
changes the machine's TPM2 PCR 0 and invalidates a disk set up for automatic
unlock, so if you apply one, re-run **Set Up** on the Encryption page
afterwards.

## Passwords

Reading the system state needs no password. Anything that changes the system
(an update, a rollback, a channel change, a health check, TPM or Secure Boot
changes, a reset) asks for an administrator password first, through the
desktop's normal polkit dialog. Updates and rollbacks keep the computer from
sleeping until they finish.

## Updating and going back

**Updates & Rollback** shows the version you run and the newest one on your
channel. **Update** installs it into the other system slot; restart when
asked. **Roll Back…** switches to the previous system (after a restart) — your
files and settings are not affected. See [Blue-Green Deployment](../concepts/blue-green)
and [Update Channels](../updates/channels).

## Update and Boot Notifications

After you log in, the per-user `shani-cassini-agent.timer` checks the system two minutes later and then every two hours. It runs `shani-cassini --agent`, which reads `shani-deploy --status --check --json` and sends a notification when an update is available, a staged update needs a restart, or a boot failure was recorded.

Choose **Open** in a notification to start Shani Cassini on **Updates & Rollback**. The agent only checks and notifies. Installing an update, changing channels, and rolling back remain actions on that page.

To inspect the user service:

```bash
systemctl --user status shani-cassini-agent.timer
journalctl --user -u shani-cassini-agent.service -n 50
```

## Reset

**Maintenance → Reset this computer** runs [`shani-reset`](../updates/shani-reset): it
erases settings, user accounts and service data, keeps both system slots and
(unless you choose otherwise) everything in `/home`, then restarts. You type
`reset` to confirm — and `wipe home` as well if you chose to erase files.

## See Also

- [shani-health](../updates/shani-health)
- [TPM2 Auto-Unlock](../security/tpm2)
- [Backup](backup)
