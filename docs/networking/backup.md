---
title: Backup & Recovery
section: Networking
updated: 2026-04-01
---

# Backup & Recovery

Shanios protects the OS layer via atomic updates and Btrfs snapshots. However, **user data and container state** must be backed up independently to protect against drive failure, accidental deletion, or corruption.

The recommended backup stack on Shanios is **Restic** (encrypted, incremental, deduplicated) combined with **Rclone** (cloud storage synchronization).

---

## 📦 Backup Strategy

Because Shanios uses dedicated Btrfs subvolumes, target these paths for backup:

| Path | Subvolume | Priority | Notes |
|------|-----------|----------|-------|
| `/home` | `@home` | 🔴 Critical | User files, configs, SSH/GPG keys |
| `/var/lib/containers` | `@containers` | 🟠 High | Podman/Distrobox images, volumes, layers |
| `/var/lib/waydroid` | `@waydroid` | 🟠 High | Android apps, data, system image |
| `/var/lib/lxd` | `@lxd` | 🟠 High | LXD system containers |
| `/var/lib/flatpak` | `@flatpak` | 🟡 Medium | Flatpak runtimes & apps |

> ⚠️ **Important**: Btrfs snapshots (`shani-deploy` rollbacks) are **not backups**. They reside on the same physical drive. Use Restic/Rclone to copy data to an **external drive or cloud**.

---

## 🔐 1. Restic — Encrypted Backups

Restic is fast, secure, and cryptographically verifies all data. It deduplicates content, making backups highly space-efficient.

### Installation
```bash
sudo pacman -S restic
```

### Initialize Repository
Create a local repository (e.g., on an external USB drive):
```bash
mkdir -p /run/media/backup-disk/restic-repo
restic init --repo /run/media/backup-disk/restic-repo
# Set a strong password when prompted
```

### Backup Command
```bash
export RESTIC_REPOSITORY="/run/media/backup-disk/restic-repo"
export RESTIC_PASSWORD="YOUR_STRONG_PASSWORD"

restic backup \
  --exclude="**/.cache" \
  --exclude="**/node_modules" \
  --exclude="**/.local/share/Trash" \
  /home \
  /var/lib/containers \
  /var/lib/waydroid
```

### Snapshot Management
```bash
# List snapshots
restic snapshots

# Show files in a snapshot
restic ls <snapshot-id>

# Restore data
restic restore latest --target /tmp/restore-point

# Clean up old backups (keep 7d, 4w, 6m, 1y)
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --keep-yearly 1 --prune
```

---

## ☁️ 2. Rclone — Cloud Storage Access

Rclone syncs files to cloud providers (Google Drive, Backblaze B2, AWS S3, Dropbox, etc.) and can mount them as local filesystems.

### Installation
```bash
sudo pacman -S rclone
```

### Configuration
```bash
rclone config
```
Follow the interactive prompts to authenticate your provider. It creates a remote alias (e.g., `gdrive`, `b2`).

### Basic Usage
```bash
# Sync local folder to cloud
rclone sync ~/Documents gdrive:DocumentsBackup --progress

# Mount cloud as local drive
rclone mount gdrive: ~/Cloud --vfs-cache-mode writes --daemon
```

---

## 🔗 3. Restic + Rclone (Cloud Backups)

Combine both tools for **encrypted, deduplicated cloud backups**. Restic handles encryption & dedup; Rclone handles cloud transport.

### Setup
```bash
# Initialize Restic on top of Rclone remote
export RESTIC_REPOSITORY="rclone:mycloud:shanios-backups"
export RESTIC_PASSWORD="YOUR_ENCRYPTION_PASSWORD"

restic init
```

### Automated Backup Script (`~/scripts/backup.sh`)
```bash
#!/usr/bin/env bash
set -euo pipefail

export RESTIC_REPOSITORY="rclone:mycloud:shanios-backups"
export RESTIC_PASSWORD_FILE="$HOME/.config/restic/password"

echo "🔒 Starting backup at $(date)"

restic backup \
  --exclude="**/.cache" \
  --exclude="**/node_modules" \
  /home /var/lib/containers /var/lib/waydroid

echo "🧹 Pruning old snapshots..."
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 3 --prune

echo "✅ Backup complete at $(date)"
```

Make executable: `chmod +x ~/scripts/backup.sh`

---

## ⏱ 4. Automation (Systemd Timer)

Run backups automatically in the background using a user systemd timer.

**`~/.config/systemd/user/backup.service`**
```ini
[Unit]
Description=Restic Encrypted Backup
Requires=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=%h/scripts/backup.sh
Environment="RESTIC_PASSWORD_FILE=%h/.config/restic/password"
StandardOutput=journal
StandardError=journal
```

**`~/.config/systemd/user/backup.timer`**
```ini
[Unit]
Description=Run Backup Daily
[Timer]
OnCalendar=daily
Persistent=true
RandomizedDelaySec=30min

[Install]
WantedBy=timers.target
```

**Enable & Start:**
```bash
systemctl --user daemon-reload
systemctl --user enable --now backup.timer
```

---

## 🛡 Best Practices for Shanios

1. **Store passwords securely**: Use `RESTIC_PASSWORD_FILE` or a password manager instead of plaintext variables.
2. **Test restores periodically**: Run `restic restore latest --target /tmp/test` to verify backup integrity.
3. **Monitor journal logs**: `journalctl --user -u backup.service -f`
4. **Exclude large caches**: `--exclude="**/.cache"` and `--exclude="**/node_modules"` drastically reduce backup size.
5. **Container persistence**: Backing up `/var/lib/containers` preserves your Distrobox/Podman environments across hardware migrations.
6. **3-2-1 Rule**: Keep 3 copies, on 2 different media, with 1 offsite (Restic+Rclone satisfies this natively).
