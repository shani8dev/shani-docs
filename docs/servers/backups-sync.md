---
title: Backups & Sync
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Backups & Sync

Reliable, encrypted backup solutions and cloud synchronisation tools.

> **Follow the 3-2-1 rule:** Three copies of your data, on two different storage media, with one copy offsite. A home server running without offsite backups is one hardware failure away from total data loss.

---

## Restic

**Purpose:** Fast, encrypted, deduplicated backups to any destination — local disk, SFTP, S3, Backblaze B2, REST server, and more. Each backup is a snapshot; you can restore any point in time. Restic verifies integrity on every backup run.

```bash
podman run -d \
  --name restic \
  -v /home/user/data:/data:ro,Z \
  -v /home/user/backups:/backups:Z \
  -e RESTIC_PASSWORD=changeme \
  -e RESTIC_REPOSITORY=/backups \
  --restart unless-stopped \
  restic/restic:latest
```

**Common operations:**
```bash
# Initialise a new repository
podman exec restic restic init

# Run a backup
podman exec restic restic backup /data

# List snapshots
podman exec restic restic snapshots

# Restore the latest snapshot
podman exec restic restic restore latest --target /restore

# Restore a specific path from the latest snapshot
podman exec restic restic restore latest --target /restore --include /data/important

# Prune old snapshots (keep 7 daily, 4 weekly, 12 monthly)
podman exec restic restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune

# Verify repository integrity
podman exec restic restic check
```

**Backup to Backblaze B2 (offsite):**
```bash
-e RESTIC_REPOSITORY=b2:your-bucket-name:/backups \
-e B2_ACCOUNT_ID=your-account-id \
-e B2_ACCOUNT_KEY=your-account-key
```

**Backup to SFTP (another machine on your network):**
```bash
-e RESTIC_REPOSITORY=sftp:user@192.168.1.100:/backups
```

---

## Borgmatic

**Purpose:** Automates Borg Backup — a highly efficient, deduplicated backup tool. Borgmatic wraps Borg with a simple YAML config, handles scheduling, pruning, and health check notifications automatically.

```bash
podman run -d \
  --name borgmatic \
  -v /home/user/data:/mnt/source:ro,Z \
  -v /home/user/borgmatic/config:/etc/borgmatic.d:Z \
  -v /home/user/borgmatic/repo:/mnt/borg:Z \
  -v /home/user/borgmatic/.config/borg:/root/.config/borg:Z \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  b3vis/borgmatic
```

**Example `config.yaml`:**
```yaml
# /home/user/borgmatic/config/config.yaml
repositories:
  - path: /mnt/borg/home-server
    label: local

source_directories:
  - /mnt/source

encryption_passphrase: changeme

retention:
  keep_daily: 7
  keep_weekly: 4
  keep_monthly: 6

healthchecks:
  ping_url: https://hc-ping.com/your-uuid
```

**Manual operations:**
```bash
# Run a backup now
podman exec borgmatic borgmatic create

# List archives
podman exec borgmatic borgmatic list

# Check repository
podman exec borgmatic borgmatic check
```

---

## Duplicati

**Purpose:** Web UI-driven incremental backup with scheduling, encryption, and support for 20+ cloud providers including Google Drive, OneDrive, Dropbox, and S3.

```bash
podman run -d \
  --name duplicati \
  -p 127.0.0.1:8200:8200 \
  -v /home/user/duplicati/config:/config:Z \
  -v /home/user/data:/source:ro,Z \
  -v /home/user/backups:/backups:Z \
  -e PUID=$(id -u) \
  -e PGID=$(id -g) \
  --restart unless-stopped \
  lscr.io/linuxserver/duplicati
```

Access at `http://localhost:8200`. Configure backup jobs, schedules, and encryption via the web UI. Supports AES-256 encryption — set a passphrase on every job.

---

## Rclone

**Purpose:** Sync, copy, and mount data across 70+ cloud providers. Supports encryption, bandwidth throttling, and incremental sync. Useful for offsite replication and archiving to cold storage.

```bash
podman run -d \
  --name rclone \
  -v /home/user/rclone/config:/config/rclone:Z \
  -v /home/user/backups:/backups:Z \
  --restart unless-stopped \
  rclone/rclone:latest sync /backups remote:your-bucket --log-level INFO
```

**Configure a remote (run interactively):**
```bash
podman run --rm -it \
  -v /home/user/rclone/config:/config/rclone:Z \
  rclone/rclone:latest config
```

**Common sync commands:**
```bash
# Sync (mirror source to destination — deletes extra files at destination)
podman exec rclone rclone sync /backups remote:your-bucket

# Copy (one-way, no deletes)
podman exec rclone rclone copy /backups remote:your-bucket

# Check integrity
podman exec rclone rclone check /backups remote:your-bucket

# Mount a remote as a filesystem
podman exec rclone rclone mount remote:your-bucket /mnt/cloud --daemon
```

**Encrypt a remote** (wrap any existing remote with Rclone Crypt):
```bash
# In interactive config, choose 'crypt' type, point at your existing remote
# Results in: rclone copy /data cryptremote:
```

---

## MinIO (Self-Hosted S3 Backup Target)

**Purpose:** High-performance, S3-compatible object storage. Run it on a second machine (or external drive) as a local offsite backup target — Restic, Borgmatic, and Duplicati all support S3 natively.

```bash
podman run -d \
  --name minio \
  -p 127.0.0.1:9000:9000 \
  -p 127.0.0.1:9001:9001 \
  -v /home/user/minio/data:/data:Z \
  -e MINIO_ROOT_USER=admin \
  -e MINIO_ROOT_PASSWORD=changeme123 \
  --restart unless-stopped \
  quay.io/minio/minio server /data --console-address ":9001"
```

Access the web console at `http://localhost:9001`. Create a bucket and access keys, then point Restic or Rclone at `s3:http://localhost:9000/your-bucket`.

**Point Restic at MinIO:**
```bash
-e RESTIC_REPOSITORY=s3:http://localhost:9000/restic-backups \
-e AWS_ACCESS_KEY_ID=your-access-key \
-e AWS_SECRET_ACCESS_KEY=your-secret-key
```

---

## Kopia

**Purpose:** Modern, fast backup tool with a polished web UI, built-in deduplication, compression (zstd), and end-to-end encryption. Supports local, SFTP, S3, Backblaze B2, and Rclone as destinations. A strong alternative to Restic when you want a GUI.

```bash
podman run -d \
  --name kopia \
  -p 127.0.0.1:51515:51515 \
  -v /home/user/kopia/config:/app/config:Z \
  -v /home/user/kopia/cache:/app/cache:Z \
  -v /home/user/kopia/logs:/app/logs:Z \
  -v /home/user/data:/data:ro,Z \
  -v /home/user/backups:/backups:Z \
  -e KOPIA_PASSWORD=changeme \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  kopia/kopia:latest server start \
    --insecure \
    --address 0.0.0.0:51515 \
    --server-username=admin \
    --server-password=changeme
```

Access at `http://localhost:51515`. Connect to a repository, configure sources, and set schedules through the UI.

---

## Automated Backup with systemd

Set up a daily backup timer that runs Restic and sends a notification via Ntfy:

```bash
# ~/.config/systemd/user/backup.service
[Unit]
Description=Daily Restic Backup

[Service]
Type=oneshot
ExecStart=podman exec restic restic backup /data
ExecStartPost=curl -d "Backup complete ✅" https://ntfy.sh/your-topic
ExecStartPost=podman exec restic restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
```

```bash
# ~/.config/systemd/user/backup.timer
[Unit]
Description=Run daily backup at 3 AM

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl --user enable --now backup.timer
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `wrong password or no key found` (Restic) | Ensure `RESTIC_PASSWORD` matches the password used when the repo was initialised |
| Backup is slow | Enable compression: `restic backup --compression max /data`. Ensure the source volume is mounted `:ro` to avoid file locking |
| Rclone sync deletes files unexpectedly | Use `rclone copy` instead of `rclone sync` if you do not want destination-only files removed |
| MinIO access denied | Check that the access key and bucket policy allow read/write; create a dedicated access key per backup client |
| Duplicati job fails silently | Check the job log in the web UI under *Show Log → Stored*; also verify destination credentials haven't expired |
| Volume permissions error | Add `--userns=keep-id` to the Podman run command to preserve your UID inside the container |
| Restic `repository is locked` | Run `podman exec restic restic unlock` — happens if a previous backup was interrupted |
| Kopia web UI unreachable | Ensure `--insecure` is set (required without TLS cert); proxy through Caddy for HTTPS |

> 💡 **Tip:** Test your restores periodically. A backup you have never restored from is a backup you do not know works.
