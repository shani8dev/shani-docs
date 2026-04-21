---
title: Directory Encryption (gocryptfs)
section: Security
updated: 2026-04-20
---

# Directory Encryption — gocryptfs

`gocryptfs` encrypts individual directories using FUSE. Each file is stored as a separate encrypted blob, so cloud sync tools (Nextcloud, Syncthing, rclone) can sync incrementally without re-uploading everything on each change.

This complements full-disk LUKS2 encryption — use it when you want a specific directory encrypted at rest even when the disk is unlocked, or when encrypting a synced folder before it leaves your machine.

> Shani OS uses Btrfs for the root filesystem. gocryptfs works on Btrfs without any special configuration.

---

## Basic Usage

```bash
# Create a new encrypted store
mkdir ~/vault ~/vault-plain
gocryptfs -init ~/vault
# Choose and confirm a passphrase

# Mount (decrypt into a plaintext view)
gocryptfs ~/vault ~/vault-plain

# Work normally in ~/vault-plain — reads and writes are encrypted transparently
cp secret.pdf ~/vault-plain/

# Unmount when done
fusermount -u ~/vault-plain
```

`~/vault` holds the ciphertext and can be safely synced or backed up. `~/vault-plain` is the live decrypted view — it only exists while mounted.

---

## Encrypted Cloud Sync

The per-file encryption model means your sync tool sees individual encrypted files and only uploads what changed:

```bash
# Keep vault in a synced folder (e.g. Nextcloud, rclone remote)
mkdir ~/Nextcloud/vault ~/vault-plain
gocryptfs -init ~/Nextcloud/vault
gocryptfs ~/Nextcloud/vault ~/vault-plain

# Files written to ~/vault-plain are encrypted and synced automatically
```

---

## Reverse Mode (encrypt existing data for backup)

Reverse mode presents an encrypted view of a plaintext directory without moving files. Use it to push an encrypted backup to untrusted storage:

```bash
# Mount an encrypted view of ~/documents
mkdir ~/documents-enc
gocryptfs -reverse ~/documents ~/documents-enc

# Sync the encrypted view to a remote
rclone sync ~/documents-enc remote:backup-documents

fusermount -u ~/documents-enc
```

---

## Automounting at Login

Create a systemd user service:

```bash
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/gocryptfs-vault.service << 'EOF'
[Unit]
Description=gocryptfs vault
After=network.target

[Service]
Type=forking
ExecStart=/usr/bin/gocryptfs -fg %h/vault %h/vault-plain
ExecStop=/usr/bin/fusermount -u %h/vault-plain

[Install]
WantedBy=default.target
EOF

systemctl --user enable gocryptfs-vault
```

Or use a simpler login script — `gocryptfs` will prompt for the passphrase on mount.

---

## Changing the Passphrase

```bash
gocryptfs -passwd ~/vault
# Enter current passphrase, then set the new one
```

The master key is re-wrapped with the new passphrase. No re-encryption of file content is needed.

---

## Checking Vault Info

```bash
# Show cipher, feature flags, and gocryptfs version used to create the vault
gocryptfs -info ~/vault
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Mount fails: "fusermount: fuse device not found" | Load the FUSE module: `sudo modprobe fuse` |
| Passphrase correct but mount fails | Check `~/vault/gocryptfs.conf` exists and is not corrupted |
| Files visible in sync before mounting | You are syncing the ciphertext directory — this is correct and expected |
| Forgot passphrase | Data is unrecoverable — gocryptfs has no backdoor |
| Performance feels slow on large files | gocryptfs has per-file overhead; for large media files consider LUKS on a separate partition instead |

---

## See Also

- [LUKS Management](luks) — full-disk encryption (protects everything including swap and temp files)
- [Security Features](features) — encryption in the Shani OS security model
