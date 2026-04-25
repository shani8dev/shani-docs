---
title: Users & Groups
section: System
updated: 2026-04-25
---

# Users & Groups

User accounts on Shani OS follow standard Linux conventions — accounts are stored in `/etc/passwd`, `/etc/shadow`, and `/etc/group`, which live in the `/etc` overlay and persist across all OS updates and rollbacks.

The key difference from a traditional distro is that **you should use `adduser` (not `useradd`) for interactive accounts**. The `adduser` wrapper on Shani OS reads `/etc/shani-extra-groups` and automatically adds new users to all the groups they need (wheel, video, input, kvm, etc.) in one step. See [User Provisioning](user-setup) for the full group reference.

---

## On Shani OS: adduser vs useradd

| Command | Use when |
|---------|----------|
| `sudo adduser <name>` | Creating a human user — reads `/etc/shani-extra-groups`, sets Zsh shell, prompts for password |
| `sudo useradd` | Scripted/service account creation where you need fine-grained control |

```bash
# Preferred: creates account, sets groups, prompts for password interactively
sudo adduser alice

# After adding, trigger shani-user-setup to provision Flatpak/Nix/subuid ranges
sudo touch /data/user-setup-needed
```

---

## Creating Users

### Interactive user (preferred)

```bash
sudo adduser alice
# Prompts for password and GECOS info
# Automatically adds to groups from /etc/shani-extra-groups
```

### Scripted user creation

```bash
# Create account with home directory, set shell explicitly
sudo useradd -m -s /bin/zsh -c "Alice Smith" alice

# Set password
sudo passwd alice

# Add to all required groups
sudo usermod -aG wheel,video,input,audio,kvm,storage,network,realtime alice

# Trigger shani-user-setup for Flatpak/Nix/subuid provisioning
sudo touch /data/user-setup-needed
```

### Service/system account (no login)

```bash
# System account: UID < 1000, no home, no shell, no password
sudo useradd --system --no-create-home --shell /usr/sbin/nologin myservice

# With a dedicated home directory (for service data)
sudo useradd --system --create-home --home-dir /var/lib/myservice \
  --shell /usr/sbin/nologin myservice
```

---

## Modifying Users

```bash
# Change display name (GECOS)
sudo usermod -c "Alice Smith" alice

# Change login shell
sudo usermod -s /bin/bash alice
# or interactively:
chsh -s /bin/bash alice

# Change home directory (use -m to move contents)
sudo usermod -m -d /home/newhome alice

# Lock an account (prepends ! to the password hash — SSH keys still work)
sudo usermod -L alice

# Unlock
sudo usermod -U alice

# Rename a user (also rename the home directory manually)
sudo usermod -l newname alice
sudo mv /home/alice /home/newname
sudo usermod -d /home/newname newname

# Expire an account on a specific date (format: YYYY-MM-DD)
sudo usermod -e 2026-12-31 alice

# Remove expiry
sudo usermod -e "" alice
```

---

## Deleting Users

```bash
# Remove account but keep home directory (recommended — avoids accidental data loss)
sudo userdel alice

# Remove account AND home directory
sudo userdel -r alice

# Also remove the user's mail spool
sudo userdel -r -f alice
```

> ⚠️ On Shani OS, `/home` is a separate Btrfs subvolume (`@home`). Even `userdel -r` only removes the directory — the subvolume itself remains. If you want to fully remove a user's data, delete the subvolume manually:
> ```bash
> sudo btrfs subvolume delete /home/alice
> ```

---

## Passwords

```bash
# Set or change your own password
passwd

# Set another user's password (root/wheel only)
sudo passwd alice

# Force password change on next login
sudo passwd -e alice

# Lock password login (SSH key auth still works)
sudo passwd -l alice

# Unlock
sudo passwd -u alice

# Check password status
sudo passwd -S alice
# Output: alice PS 2026-01-15 0 99999 7 -1
# Fields: username  status  last-change  min-days  max-days  warn-days  inactive-days
# status: PS=password set, LK=locked, NP=no password
```

### Password aging with chage

```bash
# View aging settings
sudo chage -l alice

# Set maximum password age (days)
sudo chage -M 90 alice

# Force change on next login
sudo chage -d 0 alice

# Set account expiry
sudo chage -E 2026-12-31 alice
```

See [ch* Commands](ch-commands) for the full `chage` reference.

---

## Groups

### Creating and modifying groups

```bash
# Create a new group
sudo groupadd developers

# Create with a specific GID
sudo groupadd -g 2000 developers

# Rename a group
sudo groupmod -n devs developers

# Delete a group (does not affect users who were members)
sudo groupdel developers
```

### Managing group membership

```bash
# Add a user to one or more groups (append — does not remove from existing groups)
sudo usermod -aG developers,docker alice

# Remove a user from a group
sudo gpasswd -d alice developers

# Set exact group list (replaces existing supplementary groups — use with care)
sudo usermod -G wheel,video,input alice

# Make a user the group administrator
sudo gpasswd -A alice developers
```

### Inspecting group membership

```bash
# Show all groups the current user belongs to
groups

# Show groups for a specific user
groups alice
id alice

# List all members of a group
getent group wheel

# List all groups
getent group

# Check if a user is in a specific group
id alice | grep -w wheel
```

---

## sudo & Privileges

On Shani OS, `wheel` group members have full sudo access. The configuration lives in `/etc/sudoers` (managed by the OS) and `/etc/sudoers.d/` (your custom rules, captured by the overlay).

```bash
# Edit sudoers safely (validates syntax before saving — never edit /etc/sudoers directly)
sudo visudo

# Add a drop-in rule (preferred — less risk of locking yourself out)
sudo nano /etc/sudoers.d/my-rules
```

### Common sudoers patterns

```text
# Full sudo without password (convenient for a personal machine)
alice ALL=(ALL) NOPASSWD: ALL

# Allow a specific command without password
alice ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart caddy

# Allow a group to run a command without password
%developers ALL=(ALL) NOPASSWD: /usr/bin/podman

# Run commands as a specific user (not root)
alice ALL=(deploy) NOPASSWD: /usr/local/bin/deploy.sh

# Restrict to specific hosts
alice workstation=(ALL) ALL
```

> ⚠️ Always use `sudo visudo` or `sudo visudo -f /etc/sudoers.d/myrule` — it validates syntax before writing. A syntax error in sudoers locks out all sudo access. If this happens, boot to the other slot and fix the file via the `/etc` overlay.

### Running commands as another user

```bash
# Run as root
sudo command

# Run as a specific user
sudo -u alice command

# Open a root shell (full environment)
sudo -i

# Open a shell as another user
sudo -u alice -s

# Check what sudo permissions the current user has
sudo -l
```

---

## Inspecting Accounts

```bash
# Current user and UID
whoami
id

# Who is logged in right now
who
w

# Login history (reads /var/log/wtmp)
last
last alice             # filtered by user
last -n 20             # last 20 entries
last reboot            # reboot history

# Failed login attempts (reads /var/log/btmp)
sudo lastb
sudo lastb -n 20

# Last login time per user
lastlog
lastlog -u alice

# List all user accounts (UID >= 1000 = human users)
getent passwd | awk -F: '$3 >= 1000 {print $1, $3, $6, $7}'

# Currently active login sessions
loginctl list-sessions
loginctl show-session 1
loginctl show-user alice
```

---

## Linger (User Services Without Login)

By default, user systemd services stop when the last session for that user ends. Enable linger to keep user services running at all times — required for user-level backup timers, containers, and any service that should run without an active login:

```bash
# Enable linger for a user
sudo loginctl enable-linger alice

# Disable
sudo loginctl disable-linger alice

# Check linger status
loginctl show-user alice | grep Linger
```

This is required for the `backup.timer` and any other `systemctl --user` timer that should fire even when the user is not logged in. See [Backup & Recovery](backup) for the full example.

---

## /etc/passwd and /etc/shadow

These files live in the `/etc` overlay and are preserved across every OS update. You rarely need to edit them directly — use the commands above. For reference:

```
/etc/passwd  — username:x:UID:GID:GECOS:home:shell
/etc/shadow  — username:hashed-password:last-change:min:max:warn:inactive:expire
/etc/group   — groupname:x:GID:member1,member2
/etc/subuid  — username:start:count  (rootless container UID ranges)
/etc/subgid  — username:start:count  (rootless container GID ranges)
```

```bash
# Read entries for a specific user (uses NSS — works with LDAP too)
getent passwd alice
getent shadow alice    # requires root
getent group developers
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| New user missing groups (kvm, video, etc.) | Run `sudo touch /data/user-setup-needed` to trigger `shani-user-setup`; or `sudo FORCE_SETUP=1 shani-user-setup` |
| `sudo: alice is not in the sudoers file` | Add alice to the wheel group: `sudo usermod -aG wheel alice`; log out and back in |
| Group membership not taking effect | Log out and back in — supplementary groups are read at login. To apply immediately: `newgrp developers` (opens a subshell in that group) |
| `userdel: user alice is currently used by process` | Kill active sessions first: `sudo loginctl kill-user alice`; then retry |
| User can't run rootless Podman | Check `cat /etc/subuid` — if alice has no entry, run `sudo touch /data/user-setup-needed` |
| Locked out of sudo (syntax error in sudoers) | Boot into the other slot from systemd-boot; mount the `/etc` overlay and remove the broken file from `/data/overlay/etc/upper/sudoers.d/` |
| Account exists but home directory is missing | `sudo mkhomedir_helper alice` or `sudo cp -a /etc/skel /home/alice && sudo chown -R alice:alice /home/alice` |

---

## See Also

- [User Provisioning](user-setup) — `shani-user-setup`, `/etc/shani-extra-groups`, subuid allocation
- [ch* Commands](ch-commands) — `chmod`, `chown`, `chage`, `chsh`, `chpasswd`
- [System Config](config) — how `/etc` overlay preserves account changes across updates
- [Factory Reset](shani-reset) — what happens to user accounts after a reset
- [Shell & Environment](shell) — Zsh, Starship, and per-user shell config
