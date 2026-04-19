---
title: Backup & Recovery
section: Networking
updated: 2026-05-13
---

# Backup & Recovery

Shanios protects the OS layer via atomic updates and Btrfs slot snapshots. **User data and container state must be backed up independently** to protect against drive failure, accidental deletion, or corruption.

The recommended backup stack is **restic** (encrypted, incremental, deduplicated) combined with **rclone** (cloud storage transport). Both are pre-installed. restic configuration persists in `/data/varlib/restic` and rclone configuration in `/data/varlib/rclone` — both survive OS updates.

---

## Snapshots vs Backups: The Critical Distinction

A **Btrfs snapshot** is a point-in-time copy stored on the **same disk**. If your disk fails, you lose both the data and its snapshots. Snapshots protect against accidental deletion and corruption — not hardware failure.

A **backup** is a copy stored **somewhere else** — an external drive, a NAS, a cloud service. Backups protect against hardware failure, theft, fire, and anything that destroys the primary disk.

> You need both. Snapshots for quick local recovery; off-device backups for disaster recovery.

---

## What to Back Up

| Path | Subvolume | Priority | Notes |
|------|-----------|----------|-------|
| `/home` | `@home` | 🔴 Critical | User files, configs, SSH/GPG keys |
| `/var/lib/containers` | `@containers` | 🟠 High | Podman/Distrobox images, volumes, layers |
| `/var/lib/waydroid` | `@waydroid` | 🟠 High | Android apps, data, system image |
| `/var/lib/lxd` | `@lxd` | 🟠 High | LXD system containers |
| `/var/lib/flatpak` | `@flatpak` | 🟡 Medium | Flatpak runtimes & apps (re-installable) |

The OS itself does not need to be backed up — `shani-deploy` downloads a fresh verified image when needed, and the previous slot is always available for rollback.

> ⚠️ **Btrfs snapshots are not backups.** The rollback snapshots created by `shani-deploy` reside on the same physical drive. A drive failure destroys both the live data and all snapshots simultaneously.

---

## 1. Btrfs Snapshots (Local, Instant Recovery)

Btrfs snapshots are near-instantaneous and use minimal space — only files that change after the snapshot consume new space.

### Taking a Snapshot

```bash
sudo mkdir -p /data/snapshots/home

# Read-only snapshot (preferred — immutable reference point)
sudo btrfs subvolume snapshot -r /home /data/snapshots/home/home-$(date +%Y%m%d-%H%M)

# Writable snapshot (for testing — experiment, then delete)
sudo btrfs subvolume snapshot /home /data/snapshots/home/home-writable-$(date +%Y%m%d)
```

### Restoring from a Snapshot

**Restoring a specific file:**

```bash
cp /data/snapshots/home/home-20260427-1430/Documents/important.pdf ~/Documents/
```

**Restoring the entire home directory** (boot from the other slot or a live USB):

```bash
sudo btrfs subvolume delete /home
sudo btrfs subvolume snapshot /data/snapshots/home/home-20260427-1430 /home
```

### Deleting Old Snapshots

```bash
sudo btrfs subvolume delete /data/snapshots/home/home-20260420-0900
```

### Automating Daily Snapshots

```bash
sudo tee /etc/systemd/system/home-snapshot.service << 'EOF'
[Unit]
Description=Daily home directory snapshot

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'mkdir -p /data/snapshots/home && btrfs subvolume snapshot -r /home /data/snapshots/home/home-$(date +%Y%m%d-%H%M)'
ExecStart=/bin/bash -c 'find /data/snapshots/home -name "home-*" -mtime +30 -exec btrfs subvolume delete {} \;'
EOF

sudo tee /etc/systemd/system/home-snapshot.timer << 'EOF'
[Unit]
Description=Daily home snapshot timer

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl enable --now home-snapshot.timer
```

---

## 2. restic — Encrypted Off-Device Backups

restic is fast, cryptographically secure, and content-addressed. Every file is deduplicated across snapshots — only new or changed blocks are stored. restic verifies checksums on every operation.

### Store the Repository Password Securely

```bash
mkdir -p ~/.config/restic
printf 'YOUR_STRONG_PASSWORD' > ~/.config/restic/password
chmod 600 ~/.config/restic/password
```

Never hardcode passwords in scripts or environment variables. Always use `RESTIC_PASSWORD_FILE`.

### Initialise a Repository

**Local / external drive:**

```bash
mkdir -p /run/media/backup-disk/restic-repo

restic init \
  --repo /run/media/backup-disk/restic-repo \
  --password-file ~/.config/restic/password
```

**S3-compatible storage (AWS S3, Cloudflare R2, Wasabi — native backend, no rclone needed):**

```bash
export RESTIC_REPOSITORY="s3:https://s3.amazonaws.com/your-bucket/restic"
export AWS_ACCESS_KEY_ID="your-key-id"
export AWS_SECRET_ACCESS_KEY="your-secret"
export RESTIC_PASSWORD_FILE="$HOME/.config/restic/password"
restic init
```

**Any rclone-supported backend (Google Drive, OneDrive, Backblaze B2, SFTP, and 70+ others):**

```bash
# Configure rclone remote first: rclone config
export RESTIC_REPOSITORY="rclone:gdrive:shanios-backups"
export RESTIC_PASSWORD_FILE="$HOME/.config/restic/password"
restic init
```

Using restic over rclone means your data is encrypted **before it ever leaves your machine** — the cloud provider sees only opaque blobs.

### Running a Backup

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
restic snapshots --repo ... --password-file ...

# Browse files in the latest snapshot
restic ls latest --repo ... --password-file ...

# Restore from latest snapshot to a target directory
restic restore latest --repo ... --password-file ... --target /tmp/restore-point

# Restore only a specific path
restic restore latest --repo ... --password-file ... \
  --include /home/user/Documents --target /tmp/restore-point

# Browse backup contents interactively (FUSE mount)
restic mount /mnt/restic-backup --repo ... --password-file ...
# Ctrl+C to unmount

# Prune old snapshots (keep 7 daily, 4 weekly, 6 monthly, 1 yearly)
restic forget --repo ... --password-file ... \
  --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --keep-yearly 1 \
  --prune

# Verify repository integrity (always run after --prune)
restic check --repo ... --password-file ...
```

### Backup Script

```bash
#!/usr/bin/env bash
set -euo pipefail

export RESTIC_REPOSITORY="rclone:gdrive:shanios-backups"
export RESTIC_PASSWORD_FILE="$HOME/.config/restic/password"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Ping dead man's switch on failure
trap 'curl -fsS --retry 3 "https://hc.home.local/ping/YOUR-UUID/fail" > /dev/null 2>&1 || true' ERR

log "Starting backup"
restic backup \
  --exclude="**/.cache" \
  --exclude="**/node_modules" \
  --exclude="**/.local/share/Trash" \
  --exclude="**/Steam/steamapps" \
  /home /var/lib/containers /var/lib/waydroid

log "Pruning old snapshots"
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 3 --prune

log "Verifying repository"
restic check

log "Backup complete"
# Ping dead man's switch on success
curl -fsS --retry 3 "https://hc.home.local/ping/YOUR-UUID" > /dev/null 2>&1 || true
```

```bash
chmod +x ~/scripts/backup.sh
```

---

## 3. rclone — Cloud Sync

rclone syncs files directly to 70+ cloud providers. Use it for cloud mirroring of specific directories.

```bash
# Interactive setup wizard
rclone config

# One-way sync (mirrors source → destination, deletes extra files at destination)
rclone sync ~/Documents gdrive:DocumentsBackup --progress

# Copy (one-way, never deletes at destination)
rclone copy ~/Pictures gdrive:PicturesBackup --progress

# Check integrity (compare checksums)
rclone check ~/Documents gdrive:DocumentsBackup

# Mount cloud storage as a local filesystem
rclone mount gdrive: ~/Cloud --vfs-cache-mode writes --daemon

# Unmount
fusermount -u ~/Cloud
```

---

## 4. Automation (Systemd User Timer)

Run backups automatically without root. Requires `loginctl enable-linger $USER` so the timer fires even when you are not logged in.

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

```bash
systemctl --user daemon-reload
systemctl --user enable --now backup.timer

# Confirm the timer is scheduled
systemctl --user list-timers backup.timer

# Run immediately to test
systemctl --user start backup.service

# Watch output
journalctl --user -u backup.service -f
```

---

## 5. Monitoring Backup Health

A backup that runs silently and fails is worse than no backup at all. Wire your timer to a dead man's switch: a monitoring service that alerts you when the expected ping does not arrive on schedule.

The self-hosted option is **Healthchecks** — see the [Monitoring wiki](https://docs.shani.dev/doc/servers/monitoring). For a no-setup option, [healthchecks.io](https://healthchecks.io) offers a free tier. The `trap ... ERR` and final `curl` lines in the backup script above handle both failure and success pings automatically.

---

## Best Practices

1. **Password file, not env vars** — Use `RESTIC_PASSWORD_FILE` pointing to a `chmod 600` file. Never hardcode passwords in scripts.
2. **Test restores regularly** — Run `restic restore latest --target /tmp/test-restore` monthly. A backup you have never restored from is a backup you do not know works.
3. **Follow the 3-2-1 rule** — Three copies, on two different media, with one offsite. restic + rclone to a cloud remote satisfies this natively.
4. **Exclude large re-downloadable data** — Steam library, `node_modules`, `.cache`, and Trash add size without protecting irreplaceable data.
5. **Back up container volumes, not images** — Images are re-pullable. Podman named volumes under `/var/lib/containers/storage/volumes` contain your actual application data.
6. **Verify after prune** — Always run `restic check` after `forget --prune` to confirm the repository is consistent.
7. **Enable linger** — Run `loginctl enable-linger $USER` so user systemd timers fire at boot even without an active login session.

---

## The Complete Strategy

**Layer 1 — Daily Btrfs snapshots** of `@home` to `/data/snapshots/home/`. Fast local recovery from accidental deletion.

**Layer 2 — Daily/weekly restic backups** to an external drive or NAS. Off-disk, encrypted, versioned protection against hardware failure.

**Layer 3 — Cloud sync via rclone (or restic over rclone)** to Google Drive, S3, Backblaze, etc. Off-site protection against fire, theft, or local disaster.

---

## See Also

- [Btrfs Deep Dive](../arch/btrfs) — snapshots, send/receive, maintenance
- [Filesystem Structure](../arch/filesystem) — subvolume layout
- [Atomic Updates](../concepts/atomic-updates) — OS update and rollback
