---
title: User Configuration
section: Introduction
updated: 2026-08-20
---

# User Configuration

The primary user is automatically configured with appropriate permissions during installation. Shanios also watches for newly created users: the `shani-user-setup.path` unit watches the `/etc` overlay's upper-layer `passwd` file and the `/data/user-setup-needed` marker (written by `shani-deploy` after every OS update and by the first-run wizard on a fresh install), and triggers `shani-user-setup.service` whenever either changes. That service processes every regular user (UID 1000–59999) on the system, adding any missing required groups and setting the default shell to Zsh (falling back to Bash if Zsh isn't installed) — it is idempotent, so re-running it is always safe.

This means any user created post-installation — via the desktop first-run wizard, or with `useradd`/`adduser` on the command line — gets the same setup automatically, and the same run also re-syncs existing users after an OS update.

For the full list of groups provisioned to each user, the mechanism that controls them, and how to customise group membership, see [User Provisioning](../updates/user-setup).

For pre-configured firewall rules (KDE Connect, Waydroid, and other system-level rules applied at installation), see [Security Features](../security/features).
