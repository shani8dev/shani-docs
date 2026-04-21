---
title: Backups & Sync
section: Self-Hosting & Servers
updated: 2026-04-21
---

# Backups & Sync

Reliable, encrypted backup solutions and cloud synchronisation tools.

> **Follow the 3-2-1 rule:** Three copies of your data, on two different storage media, with one copy offsite. A home server running without offsite backups is one hardware failure away from total data loss.

---

## Restic

**Purpose:** Fast, encrypted, deduplicated backups to any destination — local disk, SFTP, S3, Backblaze B2, REST server, and more. Each backup is a snapshot; you can restore any point in time. Restic verifies integrity on every backup run. Current stable release: **0.18.1** (September 2025).

> **Note on the Docker image:** The official `restic/restic` image does not include a scheduler or cron daemon — it is a bare binary image intended for one-shot use. For scheduled, unattended backups in a container, use `mazzolino/restic` (a.k.a. [resticker](https://github.com/djmaze/resticker)) which wraps Restic with a built-in cron runner. The compose file below uses the bare image for manual/scripted use; see the systemd timer section for scheduling.

```yaml
# ~/restic/compose.yaml
services:
  restic:
    image: restic/restic:latest
    container_name: restic
    volumes:
      - /home/user/data:/data:ro,Z
      - /home/user/backups:/backups:Z
    environment:
      RESTIC_PASSWORD: changeme
      RESTIC_REPOSITORY: /backups
    entrypoint: /bin/sh
    command: -c "tail -f /dev/null"
    restart: unless-stopped
```

```bash
cd ~/restic && podman-compose up -d
```

**Common operations:**
```bash
# Initialise a new repository
podman exec restic restic init

# Run a backup
podman exec restic restic backup /data

# Run a backup with max compression (0.15+)
podman exec restic restic backup --compression max /data

# List snapshots
podman exec restic restic snapshots

# Restore the latest snapshot
podman exec restic restic restore latest --target /restore

# Restore a specific path from the latest snapshot
podman exec restic restic restore latest --target /restore --include /data/important

# Prune old snapshots (keep 7 daily, 4 weekly, 12 monthly)
# Note: --prune flag added to forget so it runs in one pass
podman exec restic restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune

# Repack small pack files to reclaim space (0.18+)
podman exec restic restic prune --repack-smaller-than 128M

# Verify repository integrity
podman exec restic restic check

# Full integrity check — downloads and verifies all data (slow but thorough)
podman exec restic restic check --read-data
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

> **0.18.x deprecation notice:** The legacy index format and S3 legacy layout are always enabled for removal in a future 0.19.0 release. Run `restic migrate` on older repositories to upgrade them to the current format.

---

## Borgmatic

**Purpose:** Automates Borg Backup — a highly efficient, deduplicated backup tool. Borgmatic wraps Borg with a simple YAML config, handles scheduling, pruning, and health check notifications automatically.

```yaml
# ~/borgmatic/compose.yaml
services:
  borgmatic:
    image: b3vis/borgmatic
    volumes:
      - /home/user/data:/mnt/source:ro,Z
      - /home/user/borgmatic/config:/etc/borgmatic.d:Z
      - /home/user/borgmatic/repo:/mnt/borg:Z
      - /home/user/borgmatic/.config/borg:/root/.config/borg:Z
    environment:
      TZ: Asia/Kolkata
    restart: unless-stopped
```

```bash
cd ~/borgmatic && podman-compose up -d
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

```yaml
# ~/duplicati/compose.yaml
services:
  duplicati:
    image: lscr.io/linuxserver/duplicati
    ports:
      - 127.0.0.1:8200:8200
    volumes:
      - /home/user/duplicati/config:/config:Z
      - /home/user/data:/source:ro,Z
      - /home/user/backups:/backups:Z
    environment:
      PUID: "1000"
      PGID: "1000"
    restart: unless-stopped
```

```bash
cd ~/duplicati && podman-compose up -d
```

Access at `http://localhost:8200`. Configure backup jobs, schedules, and encryption via the web UI. Supports AES-256 encryption — set a passphrase on every job.

---

## Rclone

**Purpose:** Sync, copy, and mount data across 70+ cloud providers. Supports encryption, bandwidth throttling, and incremental sync. Useful for offsite replication and archiving to cold storage.

```yaml
# ~/rclone/compose.yaml
services:
  rclone:
    image: rclone/rclone:latest
    volumes:
      - /home/user/rclone/config:/config/rclone:Z
      - /home/user/backups:/backups:Z
    command: sync /backups remote:your-bucket --log-level INFO
    restart: unless-stopped
```

```bash
cd ~/rclone && podman-compose up -d
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

```yaml
# ~/minio/compose.yaml
services:
  minio:
    image: quay.io/minio/minio
    ports:
      - 127.0.0.1:9000:9000
      - 127.0.0.1:9001:9001
    volumes:
      - /home/user/minio/data:/data:Z
    environment:
      MINIO_ROOT_USER: admin
      MINIO_ROOT_PASSWORD: changeme123
    command: server /data --console-address :9001
    restart: unless-stopped
```

```bash
cd ~/minio && podman-compose up -d
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

**Purpose:** Modern, fast backup tool with a polished web UI, built-in deduplication, compression (zstd), and end-to-end encryption. Supports local, SFTP, S3, Backblaze B2, and Rclone as destinations. A strong alternative to Restic when you want a GUI. Current stable release: **0.22.3** (December 2025).

> **CSRF note:** The `--disable-csrf-token-checks` flag is required when accessing the Kopia UI through a reverse proxy. Omit it for direct local access.

```yaml
# ~/kopia/compose.yaml
services:
  kopia:
    image: kopia/kopia:latest
    container_name: kopia
    hostname: kopia
    ports:
      - 127.0.0.1:51515:51515
    volumes:
      - /home/user/kopia/config:/app/config:Z
      - /home/user/kopia/cache:/app/cache:Z
      - /home/user/kopia/logs:/app/logs:Z
      - /home/user/data:/data:ro,Z
      - /home/user/backups:/repository:Z
    environment:
      KOPIA_PASSWORD: changeme
      TZ: Asia/Kolkata
    command:
      - server
      - start
      - --insecure
      - --address=0.0.0.0:51515
      - --server-username=admin
      - --server-password=changeme
    restart: unless-stopped
```

```bash
cd ~/kopia && podman-compose up -d
```

Access at `http://localhost:51515`. Connect to a repository, configure sources, and set schedules through the UI.

---

## Garage (Distributed S3-Compatible Storage)

**Purpose:** Lightweight, self-hosted distributed object storage. Designed to run on a cluster of modest machines or drives across multiple physical locations — a true geo-distributed MinIO alternative that runs well on low-power hardware. S3-compatible API means Restic, Rclone, and any other S3-aware tool works with it out of the box.

```yaml
# ~/garage/compose.yaml
services:
  garage:
    image: dxflrs/garage:latest
    ports:
      - 127.0.0.1:3900:3900
      - 127.0.0.1:3901:3901
      - 127.0.0.1:3902:3902
    volumes:
      - /home/user/garage/data:/var/lib/garage/data:Z
      - /home/user/garage/meta:/var/lib/garage/meta:Z
      - /home/user/garage/config.toml:/etc/garage.toml:ro,Z
    restart: unless-stopped
```

```bash
cd ~/garage && podman-compose up -d
```

**Minimal `config.toml`:**
```toml
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "lmdb"
replication_factor = 1

[s3_api]
s3_region = "garage"
api_bind_addr = "0.0.0.0:3900"

[admin]
api_bind_addr = "0.0.0.0:3903"
```

> Garage is ideal when you want to spread backup storage across two home machines (e.g., a mini PC and an old laptop) for local redundancy without cloud costs.

---

## Litestream (SQLite Continuous Replication)

**Purpose:** Streams SQLite changes to S3-compatible object storage in real time — effectively giving SQLite continuous off-site replication with sub-second RPO. Any app using SQLite (including many lightweight self-hosted tools) gets disaster recovery without changing a line of code. Litestream runs as a sidecar: it watches the SQLite file and asynchronously replicates every write to your backup destination. Current stable release: **0.5.x** (active development resumed October 2025).

> **⚠️ Breaking changes in 0.5.x vs 0.3.x:**
> - The backup file format changed — 0.5.x **cannot restore from 0.3.x WAL backups**. Start fresh or keep a 0.3.x instance until old backups expire.
> - The config key `replicas` (array) is replaced by `replica` (single object). Only one replica destination per database is supported.
> - The `litestream wal` command is now `litestream ltx`.
> - Age encryption was removed in 0.5.0 and will return in a future release. Do not upgrade if you rely on Age encryption.
> - Upgrade directly to **0.5.2+** — 0.5.0 had several bugs fixed in 0.5.1 and 0.5.2.

```yaml
# ~/litestream/compose.yaml
services:
  litestream:
    image: litestream/litestream:latest
    volumes:
      - /home/user/app/data:/data:Z
      - /home/user/litestream/litestream.yml:/etc/litestream.yml:ro,Z
    command: replicate
    restart: unless-stopped
```

```bash
cd ~/litestream && podman-compose up -d
```

**Example `litestream.yml` (v0.5.x format):**
```yaml
dbs:
  - path: /data/app.db
    replica:                          # singular key — not "replicas"
      type: s3
      bucket: my-litestream-backups
      path: app
      region: us-east-1
      access-key-id: your-access-key
      secret-access-key: your-secret-key
      endpoint: http://host.containers.internal:9000  # MinIO
```

**Restore from replica:**
```bash
podman run --rm \
  -v /home/user/app/data:/data:Z \
  -v /home/user/litestream/litestream.yml:/etc/litestream.yml:ro,Z \
  litestream/litestream:latest restore -o /data/app.db s3://my-litestream-backups/app
```

**List available restore points:**
```bash
podman exec litestream litestream snapshots s3://my-litestream-backups/app
```

> Pair Litestream with Restic for defence in depth: Litestream gives you near-zero RPO for SQLite apps; Restic gives you encrypted, point-in-time snapshots for everything else.

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
| Kopia web UI unreachable | Ensure `--insecure` is set (required without TLS cert); if behind a reverse proxy, also add `--disable-csrf-token-checks`; proxy through Caddy for HTTPS |
| Litestream replication lag | Check `podman logs litestream` for errors; in 0.5.x, look for LTX compaction errors rather than WAL checkpoint errors |
| Litestream restore returns empty DB | Verify the S3 bucket and path in `litestream.yml` match exactly; use `litestream snapshots` to list available restore points (note: `litestream wal` command is `litestream ltx` in 0.5.x) |
| Litestream: `yaml: unmarshal errors` after upgrade | Config format changed in 0.5.x — rename `replicas:` (array) to `replica:` (single object) per database |
| Litestream S3 upload errors (`MalformedTrailerError`) | Upgrade to 0.5.4+ — earlier 0.5.x releases had an incompatibility with some S3-compatible providers (MinIO, B2, Spaces) due to aws-chunked encoding |
| Restic `--compression` flag not recognised | Requires Restic 0.14+; update the image to `restic/restic:latest` |

> 💡 **Tip:** Test your restores periodically. A backup you have never restored from is a backup you do not know works.

---

## Caddy Configuration

```caddyfile
kopia.home.local { tls internal; reverse_proxy localhost:51515 }
duplicati.home.local { tls internal; reverse_proxy localhost:8200 }
minio.home.local { tls internal; reverse_proxy localhost:9001 }
```
