---
title: User Configuration
section: Introduction
updated: 2026-08-28
---

# User Configuration

The primary user is automatically configured with appropriate permissions during installation. Shanios also watches for newly created users: the `shani-user-setup.path` unit watches the `/etc` overlay's upper-layer `passwd` file and the `/data/user-setup-needed` marker (written by `shani-deploy` after every OS update and by the first-run wizard on a fresh install), and triggers `shani-user-setup.service` whenever either changes. That service processes every regular user (UID 1000–59999) on the system, adding any missing required groups and setting the default shell to Zsh (falling back to Bash if Zsh isn't installed) — it is idempotent, so re-running it is always safe.

This means any user created post-installation — via the desktop first-run wizard, or with `useradd`/`adduser` on the command line — gets the same setup automatically, and the same run also re-syncs existing users after an OS update.

For the full list of groups provisioned to each user, the mechanism that controls them, and how to customise group membership, see [User Provisioning](../updates/user-setup.md).

For pre-configured firewall rules (KDE Connect, Waydroid, and other system-level rules applied at installation), see [Security Features](../security/features.md).

## Creating Users Manually

You can create additional users from the command line — they'll automatically receive the correct groups and shell:

```bash
# Add a new user (with home directory and default shell)
sudo useradd -m -G wheel -s /usr/bin/zsh newuser

# Set a password for the new user
sudo passwd newuser

# Verify groups were assigned
id newuser
# uid=1001(newuser) gid=1001(newuser) groups=1001(newuser),10(wheel)
```

Or use the `adduser` interactive wrapper:

```bash
sudo adduser newuser
sudo usermod -aG wheel newuser   # add to wheel if needed
```

After creating the user, the provisioning service (`shani-user-setup.service`) runs automatically on next login, or you can trigger it immediately:

```bash
sudo systemctl start shani-user-setup.service
```

## Checking User Configuration

```bash
# List all groups for the current user
groups

# Check which shell is configured
getent passwd $(whoami) | cut -d: -f7
# /usr/bin/zsh

# Verify the provisioning marker exists (after first boot)
ls /data/user-setup-needed
# File absent = provisioning already ran successfully
```

## Parental Controls (GNOME)

**Malcontent** is pre-installed on the GNOME edition, providing per-user app restrictions, content filtering, and screen-time limits. Configure it from Settings → Parental Controls, or the standalone **Parental Controls** app — it must be set up from an administrator account for a standard (non-admin) user account.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `id newuser` shows no extra groups | Provisioning service hasn't run yet | Run `sudo systemctl start shani-user-setup.service` |
| User's shell is `/bin/bash` instead of Zsh | Provisioning ran without Zsh available (should not happen — Zsh is pre-installed) | Re-run `sudo systemctl start shani-user-setup.service`; if a fresh account somehow lacks provisioning, re-run `shani-user-setup` or install via Nix: `nix-env -iA nixpkgs.zsh` |
| `groups` shows `wheel` is missing | User wasn't added to wheel during creation | Run `sudo usermod -aG wheel username` |
| First-run wizard didn't appear | User already exists or was created outside the wizard | Re-run with `gnome-initial-setup` (GNOME) or System Settings → Welcome (KDE) |
| Can't sudo despite being in wheel | Polkit tier may require password; check `99-shani.rules` | See [Permissions & Authorization](../security/permissions.md) |

## See Also

- [User Provisioning](../updates/user-setup.md) — full list of groups, mechanism, customisation
- [Security Features](../security/features.md) — firewall rules, Polkit tiers, default hardening
- [What's Included](../intro/whats-included.md) — pre-installed software stack
- [Migrating from Traditional Linux](../intro/migrating.md) — workflow changes and user management differences
