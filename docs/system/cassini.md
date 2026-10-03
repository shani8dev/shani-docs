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
`--section=updates`), where the name is one of the 41 page ids in
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

That table is a summary. Cassini has **41 pages**; these are the ones that do
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
| **UPS** | Whether a UPS is configured, whether the daemon is running, and what apcupsd itself reports | `/etc/apcupsd/apcupsd.conf`, `systemctl is-active apcupsd`, `apcaccess status` |
| **Outbound Mail** | Whether mail this machine sends will leave it: the relay setup, and anything stuck in the queue | `exim -bP transports`, `exim -bp` |

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
