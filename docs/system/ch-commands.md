---
title: ch* Commands
section: System
updated: 2026-04-25
---

# ch* Commands

The `ch*` family covers the core "change" utilities — tools that modify permissions, ownership, file attributes, and user account properties. All are pre-installed on Shani OS.

---

## chmod — Change File Permissions

`chmod` sets read, write, and execute permissions for the owner, group, and others.

### Symbolic mode

```bash
chmod u+x script.sh          # Add execute for owner
chmod go-w file.txt           # Remove write for group and others
chmod a+r file.txt            # Add read for everyone
chmod u=rw,go=r file.txt      # Set exact permissions per class
```

| Symbol | Meaning |
|--------|---------|
| `u` | Owner (user) |
| `g` | Group |
| `o` | Others |
| `a` | All (u+g+o) |
| `+` | Add permission |
| `-` | Remove permission |
| `=` | Set exactly (overwrites) |

### Octal mode

Each permission class is a 3-bit value: read=4, write=2, execute=1.

```bash
chmod 755 script.sh           # rwxr-xr-x  (owner: rwx, group: r-x, others: r-x)
chmod 644 file.txt            # rw-r--r--  (owner: rw, group: r, others: r)
chmod 600 ~/.ssh/id_ed25519   # rw-------  (private key — others must have no access)
chmod 700 ~/.ssh              # rwx------  (SSH directory)
chmod 000 locked.txt          # ---------- (no access for anyone)
```

Common permission patterns:

| Octal | Symbolic | Typical use |
|-------|----------|-------------|
| `755` | `rwxr-xr-x` | Executable scripts, directories |
| `644` | `rw-r--r--` | Regular files |
| `600` | `rw-------` | Private keys, secrets |
| `700` | `rwx------` | Private directories |
| `664` | `rw-rw-r--` | Shared group files |
| `775` | `rwxrwxr-x` | Shared group directories |

### Recursive and special bits

```bash
chmod -R 755 /var/www/html    # Recursive (applies to all files and subdirs)

chmod u+s /usr/bin/myapp      # Setuid — runs as file owner, not caller
chmod g+s /shared/dir         # Setgid — new files inherit group; useful for shared dirs
chmod +t /tmp                 # Sticky bit — only owner can delete their own files
```

> ⚠️ Avoid `chmod -R 777`. It grants world-write to everything, including config files and scripts.

---

## chown — Change Ownership

`chown` sets the owner and optionally the group of a file or directory.

```bash
chown alice file.txt              # Change owner to alice
chown alice:developers file.txt   # Change owner and group
chown :developers file.txt        # Change group only (note leading colon)
chown -R alice:alice /home/alice  # Recursive ownership change
chown --reference=ref.txt file.txt # Copy ownership from another file
```

> 💡 `chgrp` is a shorthand for changing only the group: `chgrp developers file.txt` is equivalent to `chown :developers file.txt`.

---

## chattr — Change Extended File Attributes

`chattr` sets low-level filesystem attributes on ext2/ext4/Btrfs. These attributes are enforced by the kernel — even root cannot modify or delete a file with the immutable flag set without first removing the attribute.

```bash
sudo chattr +i important.conf     # Immutable — no writes, renames, or deletes
sudo chattr -i important.conf     # Remove immutable flag
sudo chattr +a logfile.log        # Append-only — can only append, not overwrite
sudo chattr +u file.txt           # Undeletable (save data on deletion for recovery)
sudo chattr +c archive.tar        # Enable transparent compression (ext4)
sudo chattr -R +i /etc/           # Recursive — use with caution
```

Check attributes with `lsattr`:

```bash
lsattr important.conf
# ----i--------e-- important.conf

lsattr -R /etc/               # Recursive listing
```

Common attribute flags:

| Flag | Meaning |
|------|---------|
| `i` | Immutable — no modifications, no deletion, even by root |
| `a` | Append-only — data can be added but not overwritten |
| `u` | Undeletable — kernel keeps data recoverable after deletion |
| `c` | Transparent compression |
| `e` | Extents in use (set automatically, do not modify) |

> ⚠️ The `+i` flag is useful for protecting config files from accidental changes, but remember to remove it before package updates that modify the file.

---

## chage — Change Password Aging Policy

`chage` manages password expiry and account aging for local users. Useful for enforcing security policies without a directory service.

```bash
sudo chage -l alice               # List current aging settings
sudo chage -M 90 alice            # Password expires after 90 days
sudo chage -m 7 alice             # Minimum 7 days between password changes
sudo chage -W 14 alice            # Warn user 14 days before expiry
sudo chage -I 30 alice            # Lock account 30 days after expiry
sudo chage -E 2026-12-31 alice    # Account expires on a specific date
sudo chage -E -1 alice            # Remove account expiry
sudo chage -d 0 alice             # Force password change on next login
```

View aging info:

```bash
sudo chage -l alice
# Last password change                        : Apr 01, 2026
# Password expires                            : Jun 30, 2026
# Password inactive                           : Jul 30, 2026
# Account expires                             : never
# Minimum number of days between changes      : 7
# Maximum number of days between changes      : 90
# Number of days of warning before expiry     : 14
```

---

## chsh — Change Login Shell

`chsh` changes a user's default login shell.

```bash
chsh                              # Interactive prompt for current user
chsh -s /bin/zsh                  # Set shell to zsh for current user
chsh -s /bin/bash alice           # Set shell for another user (root only)
chsh -l                           # List valid shells (reads /etc/shells)
```

Shells must be listed in `/etc/shells` to be accepted. To add a custom shell:

```bash
which fish                        # e.g. /usr/bin/fish
echo /usr/bin/fish | sudo tee -a /etc/shells
chsh -s /usr/bin/fish
```

The change takes effect on the next login. Running `echo $SHELL` in an existing session still shows the old shell.

---

## chfn — Change Finger (GECOS) Information

`chfn` updates the GECOS field in `/etc/passwd` — the display name and contact info shown by `finger` and some system tools.

```bash
chfn                              # Interactive prompts for current user
chfn -f "Alice Smith" alice       # Set full name (root only for other users)
chfn -r "Ops Team" alice          # Set room/location
chfn -w "555-1234" alice          # Set work phone
chfn -h "555-5678" alice          # Set home phone
```

The GECOS string is cosmetic and not security-sensitive, but it is displayed in `finger`, `w`, `who`, and some email clients.

---

## chpasswd — Batch Password Changes

`chpasswd` reads `username:password` pairs from stdin and updates passwords in bulk. It is intended for provisioning scripts, not interactive use.

```bash
echo "alice:NewP@ssw0rd" | sudo chpasswd
echo "bob:AnotherSecure1" | sudo chpasswd

# Batch from a file (delete the file immediately after use)
sudo chpasswd < /tmp/passwords.txt
sudo shred -u /tmp/passwords.txt
```

> ⚠️ Avoid embedding plain-text passwords in scripts. Use `chpasswd` only in controlled provisioning environments, and always shred the input file after use.

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `chmod` | File/directory permissions (rwx) |
| `chown` | File owner and group |
| `chgrp` | File group only |
| `chattr` | Kernel-level file attributes (immutable, append-only) |
| `lsattr` | List extended file attributes |
| `chage` | Password aging and account expiry |
| `chsh` | Login shell |
| `chfn` | GECOS / display name fields |
| `chpasswd` | Batch password updates |

---

## See Also

- [Users & Groups](../system/users) — account management, `useradd`, `usermod`
- [Filesystem Structure](../arch/filesystem) — subvolume layout and permissions
- [SSH Hardening](../network/ssh) — key permissions (`chmod 600`)
