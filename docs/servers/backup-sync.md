---
title: Backups & Sync
section: Self-Hosting & Servers
updated: 2026-04-16
---

# Backups & Sync

Reliable, encrypted backup solutions and cloud synchronization tools.

## Restic / Borgmatic / Duplicati
**Purpose**: Restic is fast, secure, deduplicated backup. Borgmatic automates Borg Backup creation/pruning. Duplicati provides a web UI for incremental cloud backups.
```bash
podman run -d \
  --name restic \
  -v /home/user/backups:/backups:Z \
  -v /etc/restic-repo:/repo:Z \
  -e RESTIC_PASSWORD=changeme \
  -e RESTIC_REPOSITORY=/repo \
  --restart unless-stopped \
  restic/restic:latest backup /backups

podman run -d \
  --name duplicati \
  -p 127.0.0.1:8200:8200 \
  -v /home/user/duplicati/config:/config:Z \
  -v /home/user/backups:/backups:Z \
  -e PUID=1000 -e PGID=1000 \
  --restart unless-stopped \
  lscr.io/linuxserver/duplicati
```

## Rclone
**Purpose**: Swiss-knife for cloud storage sync. Mounts, syncs, and transfers to 70+ cloud providers with caching and encryption.
```bash
podman run -d \
  --name rclone \
  -v /home/user/rclone/config:/config:Z \
  -v /home/user/backups:/backups:Z \
  --restart unless-stopped \
  rclone/rclone:latest sync /backups remote:backup --log-level INFO
```

## MinIO (Backup Target)
**Purpose**: High-performance, S3-compatible object storage server. Ideal as a centralized, encrypted backup destination.
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
