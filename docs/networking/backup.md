---
title: Backup & Recovery
section: Storage
updated: 2026-04-18
---

# Backup & Recovery

Shani OS protects the OS layer via atomic updates and Btrfs snapshots. However, **user data and container state** must be backed up independently to protect against drive failure, accidental deletion, or corruption.

The recommended backup stack on Shani OS is **Restic** (encrypted, incremental, deduplicated) combined with **Rclone** (cloud storage synchronisation). Both are pre-installed.

---

## Backup Strategy

Because Shani OS uses dedicated Btrfs subvolumes, target these paths for backup:

| Path | Subvolume | Priority | Notes |
|------|-----------|----------|-------|
| `/home` | `@home` | 🔴 Critical | User files, configs, SSH/GPG keys |
| `/var/lib/containers` | `@containers` | 🟠 High | Podman/Distrobox images, volumes, layers |
| `/var/lib/waydroid` | `@waydroid` | 🟠 High | Android apps, data, system image |
| `/var/lib/lxd` | `@lxd` | 🟠 High | LXD system containers |
| `/var/lib/flatpak` | `@flatpak` | 🟡 Medium | Flatpak runtimes & apps (re-installable) |

> ⚠️ **Btrfs snapshots are not backups.** The rollback snapshots created by `shani-deploy` reside on the same physical drive. A drive failure destroys both the live data and all snapshots simultaneously. Use Restic + Rclone to copy data to an **external drive or cloud storage**.

---

## 1. Restic — Encrypted Backups

Restic is fast, cryptographically secure, and content-addressed. Every file is deduplicated across snapshots — only new or changed blocks are stored. Restic verifies checksums on every operation.

### Store the Repository Password Securely

Never use a bare environment variable for the password in production scripts. Create a password file instead:

```bash
mkdir -p ~/.config/restic
printf 'YOUR_STRONG_PASSWORD' > ~/.config/restic/password
chmod 600 ~/.config/restic/password
```

### Initialise a Local Repository (External Drive)

```bash
mkdir -p /run/media/backup-disk/restic-repo

restic init \
  --repo /run/media/backup-disk/restic-repo \
  --password-file ~/.config/restic/password
```

### Run a Backup

```bash
restic backup \
  --repo /run/media/backup-disk/restic-repo \
  --password-file ~/.config/restic/password \
  --exclude="**/.cache" \
  --exclude="**/node_modules" \
  --exclude="**/.local/share/Trash" \
  --exclude="**/Steam/steamapps" \
  /home \
  /var/lib/containers \
  /var/lib/waydroid
```

### Snapshot Management

```bash
# List all snapshots
restic snapshots \
  --repo /run/media/backup-disk/restic-repo \
  --password-file ~/.config/restic/password

# Browse files in the latest snapshot
restic ls latest \
  --repo /run/media/backup-disk/restic-repo \
  --password-file ~/.config/restic/password

# Restore everything from the latest snapshot
restic restore latest \
  --repo /run/media/backup-disk/restic-repo \
  --password-file ~/.config/restic/password \
  --target /tmp/restore-point

# Restore only a specific path
restic restore latest \
  --repo /run/media/backup-disk/restic-repo \
  --password-file ~/.config/restic/password \
  --include /home/user/Documents \
  --target /tmp/restore-point

# Prune old snapshots (keep 7 daily, 4 weekly, 6 monthly, 1 yearly)
restic forget \
  --repo /run/media/backup-disk/restic-repo \
  --password-file ~/.config/restic/password \
  --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --keep-yearly 1 \
  --prune

# Verify repository integrity
restic check \
  --repo /run/media/backup-disk/restic-repo \
  --password-file ~/.config/restic/password
```

---

## 2. Rclone — Cloud Storage Access

Rclone syncs files to 70+ cloud providers and can mount them as local filesystems.

### Configuration

```bash
rclone config
```

Follow the interactive prompts to authenticate your provider. The wizard creates a remote alias (e.g., `gdrive`, `b2`, `r2`). Config is saved at `~/.config/rclone/rclone.conf`.

### Basic Usage

```bash
# One-way sync (mirrors source → destination, deletes extra files at destination)
rclone sync ~/Documents gdrive:DocumentsBackup --progress

# Copy (one-way, never deletes at destination)
rclone copy ~/Documents gdrive:DocumentsBackup --progress

# Check integrity (compare checksums)
rclone check ~/Documents gdrive:DocumentsBackup

# Mount cloud storage as a local filesystem
rclone mount gdrive: ~/Cloud \
  --vfs-cache-mode writes \
  --daemon
```

---

## 3. Restic + Rclone — Encrypted Cloud Backups

Combine both tools: Restic handles encryption and deduplication; Rclone handles transport to the cloud. Your data is encrypted **before** it ever leaves your machine — the cloud provider sees only opaque blobs.

Works with any Rclone-supported backend: Google Drive, Backblaze B2, AWS S3, Cloudflare R2, Wasabi, SFTP, and more.

### Initialise the Remote Repository

```bash
export RESTIC_REPOSITORY="rclone:gdrive:shanios-backups"
export RESTIC_PASSWORD_FILE="$HOME/.config/restic/password"

restic init
```

### Backup Script (`~/scripts/backup.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

export RESTIC_REPOSITORY="rclone:gdrive:shanios-backups"
export RESTIC_PASSWORD_FILE="$HOME/.config/restic/password"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Signal failure to monitoring on any error
trap 'curl -fsS --retry 3 "https://hc.home.local/ping/YOUR-UUID/fail" > /dev/null 2>&1 || true' ERR

log "Starting backup"

restic backup \
  --exclude="**/.cache" \
  --exclude="**/node_modules" \
  --exclude="**/.local/share/Trash" \
  --exclude="**/Steam/steamapps" \
  /home \
  /var/lib/containers \
  /var/lib/waydroid

log "Pruning old snapshots"
restic forget \
  --keep-daily 7 --keep-weekly 4 --keep-monthly 3 \
  --prune

log "Verifying repository"
restic check

log "Backup complete"

# Ping dead man's switch (Healthchecks) on success
curl -fsS --retry 3 "https://hc.home.local/ping/YOUR-UUID" > /dev/null 2>&1 || true
```

```bash
chmod +x ~/scripts/backup.sh
```

### Backblaze B2

```bash
# Run 'rclone config', choose type 'b2', enter your Account ID and Application Key
export RESTIC_REPOSITORY="rclone:b2:your-bucket-name/restic"
export RESTIC_PASSWORD_FILE="$HOME/.config/restic/password"
restic init
```

### AWS S3 / Cloudflare R2 (native S3 backend — no Rclone layer needed)

```bash
export RESTIC_REPOSITORY="s3:https://s3.amazonaws.com/your-bucket/restic"
export AWS_ACCESS_KEY_ID="your-key-id"
export AWS_SECRET_ACCESS_KEY="your-secret"
export RESTIC_PASSWORD_FILE="$HOME/.config/restic/password"
restic init
```

---

## 4. Automation (Systemd Timer)

Run backups automatically using a user-level systemd timer — no root required. Requires `loginctl enable-linger $USER` so the timer fires even when you are not logged in.

```bash
loginctl enable-linger $USER
```

**`~/.config/systemd/user/backup.service`**
```ini
[Unit]
Description=Restic Encrypted Backup
After=network-online.target

[Service]
Type=oneshot
ExecStart=%h/scripts/backup.sh
StandardOutput=journal
StandardError=journal
```

**`~/.config/systemd/user/backup.timer`**
```ini
[Unit]
Description=Run Backup Daily at 3 AM

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
RandomizedDelaySec=15min

[Install]
WantedBy=timers.target
```

**Enable:**
```bash
systemctl --user daemon-reload
systemctl --user enable --now backup.timer

# Confirm the timer is scheduled
systemctl --user list-timers backup.timer

# Run once immediately to test
systemctl --user start backup.service

# Watch output
journalctl --user -u backup.service -f
```

---

## 5. Monitoring Backup Health

A backup that runs silently and fails is worse than no backup at all. Wire your timer to a **dead man's switch**: a monitoring service that alerts you when the expected ping does not arrive on schedule.

The self-hosted option is **Healthchecks** — see the [Monitoring wiki](https://docs.shani.dev/doc/servers/monitoring#healthchecksio-cron-monitoring). For a no-setup option, [healthchecks.io](https://healthchecks.io) offers a free tier.

The `trap ... ERR` and final `curl` lines in the backup script above handle both failure and success pings automatically.

---

## Best Practices

1. **Password file, not env vars** — Use `RESTIC_PASSWORD_FILE` pointing to a `chmod 600` file. Never hardcode passwords in scripts committed to Git.
2. **Test restores regularly** — Run `restic restore latest --target /tmp/test-restore` monthly. A backup you have never restored from is a backup you do not know works.
3. **Follow the 3-2-1 rule** — Three copies, on two different media, with one offsite. Restic + Rclone to a cloud remote satisfies this natively.
4. **Exclude large re-downloadable data** — Steam library, node_modules, `.cache`, and Trash add size without protecting irreplaceable data.
5. **Back up container volumes, not images** — Images are re-pullable. Podman named volumes under `/var/lib/containers/storage/volumes` contain your actual application data.
6. **Verify after prune** — Always run `restic check` after a `forget --prune` to confirm the repository is consistent.
7. **Enable linger** — Run `loginctl enable-linger $USER` so user systemd timers fire at boot even without an active login session.
