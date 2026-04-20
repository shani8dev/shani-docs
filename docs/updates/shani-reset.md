---
title: Factory Reset (shani-reset)
section: Updates & Config
updated: 2026-05-13
---

# Factory Reset

`shani-reset` wipes all persistent system state stored in `/data` and reboots the machine. On the next boot, `systemd-tmpfiles` recreates the `/data` structure, the `/etc` overlay starts fresh from the read-only root, and all services start as if this were a first-run.

---

## What Gets Wiped

| What | Location | Notes |
|------|----------|-------|
| All `/etc` modifications | `/data/overlay/etc/upper/` | **Includes user accounts** (`/etc/passwd`, `/etc/shadow`, `/etc/group`), hostname, locale, sshd config, enabled units, `subuid`/`subgid` |
| All `/var` overlay changes | `/data/overlay/var/upper/` | Only if `/var` overlay is in use |
| All persistent service state | `/data/varlib/*/` | Wi-Fi passwords, Bluetooth pairings, Tailscale key, TPM2 state, printer configs, etc. |
| Job scheduler spools | `/data/varspool/*/` | Cron jobs, at jobs, mail queue |
| Cached OS downloads | `/data/downloads/` | Skipped with `--keep-downloads` |
| Boot state markers | `/data/boot_*` | All failure and success markers |
| Deployment flag | `/data/deployment_pending` | Any in-flight deployment |

## What Is NOT Wiped

| What | Notes |
|------|-------|
| `/home` | User files in the `@home` subvolume — separate from `/data` |
| `/root` | Root home in the `@root` subvolume |
| `@blue` / `@green` | OS root subvolumes — system still boots the same slot |
| ESP / UKI boot images | System still boots correctly after reset |
| `/data/current-slot` | Preserved so the system boots into the correct slot |

---

## Usage

```bash
# Default: selective wipe of /data state directories, then reboot
sudo shani-reset

# Preview what would be wiped without making changes
sudo shani-reset --dry-run

# Hard wipe: remove everything under /data, let tmpfiles recreate
sudo shani-reset --hard

# Preserve cached OS images (can be several GB)
sudo shani-reset --keep-downloads

# Also wipe /home (all user files — irreversible, asks twice)
sudo shani-reset --home

# Skip the confirmation prompt (for scripted use)
sudo shani-reset --yes
```

---

## Soft Wipe vs Hard Wipe

Both modes produce the same end state after reboot. Choose based on your situation:

**Soft wipe (default):** Selectively clears the state directories. The bind-mount targets (e.g. `/data/varlib/NetworkManager`) are preserved as empty directories, which is required for the bind mounts to work immediately after reboot without a `systemd-tmpfiles` run.

**Hard wipe (`--hard`):** Removes everything under `/data` in one pass, including any files that accumulated outside the expected structure. `systemd-tmpfiles` recreates the full directory tree on the next boot. This is cleaner but requires tmpfiles to run before services can bind-mount their state.

---

## User Accounts After Reset

> **Important:** User accounts are stored in `/etc/passwd`, `/etc/shadow`, and `/etc/group` — which live in the `/etc` overlay (`/data/overlay/etc/upper/`). Resetting the overlay wipes all user accounts created after installation.

**What happens after reboot:**

1. The system boots into the reset state with only the default accounts from the read-only root
2. On a desktop system, the KDE (plasma-welcome) or GNOME (gnome-initial-setup) first-run wizard starts automatically and creates a new user account
3. The `shani-user-setup` service provisions the new user with the correct groups, shell, Flatpak remotes, and Nix channels
4. Files in `/home` are intact — once the account is re-created with the same username, all personal files are immediately accessible again

If you run the reset on a headless server without a first-run wizard, create the user manually after reboot:

```bash
# Create the user (the adduser wrapper ensures correct group membership)
sudo adduser myuser

# Or manually with usermod after useradd
sudo useradd -m myuser
sudo usermod -aG wheel,video,input,audio myuser
sudo passwd myuser
```

---

## What Happens After Reboot

1. `systemd-tmpfiles` recreates `/data` structure from `shanios-data-structure.conf`
2. `/etc` overlay starts fresh from the `@blue` or `@green` read-only root
3. All services start in their initial state (first-time setup)
4. `shani-update` runs automatically and offers to update to the latest version
5. Desktop first-run wizard guides through locale, timezone, and user account creation

---

## Examples

### Reset a misconfigured system

```bash
# Preview what would be wiped
sudo shani-reset --dry-run

# Perform the reset
sudo shani-reset
```

### Reset while preserving large OS downloads

```bash
sudo shani-reset --keep-downloads
```

### Complete factory reset including user files

```bash
# This is irreversible — all personal files in /home will be deleted
sudo shani-reset --home
```

### Scripted reset (no prompts)

```bash
sudo shani-reset --yes --keep-downloads
```

---

## See Also

- [System Config](config) — editing `/etc` files and managing the overlay
- [Overlay Filesystem](../arch/overlay) — how the `/etc` overlay works
- [System Updates](system) — rolling back an update without a full reset
