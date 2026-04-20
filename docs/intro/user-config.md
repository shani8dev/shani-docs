---
title: User Configuration
section: Introduction
updated: 2026-04-01
---

# User Configuration

The primary user is automatically configured with appropriate permissions during installation. Shanios also watches for newly created users: the `shani-user-setup.path` unit monitors `/etc/passwd` for changes and triggers `shani-user-setup.service` whenever a new regular user (UID 1000–59999) is detected. That service automatically adds the user to all required groups and sets their default shell to `/bin/zsh`.

This means any user created post-installation — via the desktop first-run wizard, or with `useradd`/`adduser` on the command line — gets the same setup automatically.

For the full list of groups provisioned to each user, the mechanism that controls them, and how to customise group membership, see [User Provisioning](../updates/user-setup).

For pre-configured firewall rules (KDE Connect, Waydroid, and other system-level rules applied at installation), see [Security Features](../security/features).
