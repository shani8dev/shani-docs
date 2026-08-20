---
title: Permissions & Authorization
section: Security
updated: 2026-08-20
---

# Permissions & Authorization

Shanios controls what a logged-in user can do — install software, format a disk, change the hostname — through a deliberate two-tier Polkit policy, defined in [`shani-settings`](https://github.com/shani8dev/shani-settings)'s `usr/share/polkit-1/rules.d/99-shani.rules` and shipped on every image.

## Why two tiers

Most desktop distros gate privileged actions on membership in a `wheel` (or `sudo`) group. Shanios doesn't assume that group is provisioned or that every account should need it just to use the desktop normally — so the policy splits into two tiers instead of one:

- **Tier 1 — any active local session.** Covers full day-to-day desktop use: package management, firmware updates, Flatpak, Snap, and OS updates. This works whether or not a `wheel` group exists on the system, so a single-user install with no group management still gets a complete desktop. Most Tier 1 actions require the user's own password (`AUTH_SELF`); routine, low-risk actions (power management, mounting removable media, network configuration) are passwordless.
- **Tier 2 — `wheel` group membership, on top of an active local session.** Reserved for destructive or system-structural operations: disk formatting, hostname changes (`AUTH_SELF`), and anything irreversible (`AUTH_ADMIN`, requiring an administrator credential rather than just the acting user's own password).

If a system has no `wheel` group provisioned, Tier 1 already covers everything a normal user needs — Tier 2 operations simply stay unavailable until a `wheel` group exists and the user is added to it.

## The tradeoff

This is a deliberate choice, not an oversight: it weighs the convenience of a group-optional desktop against the risk that a compromised (but non-`wheel`) local account can still reach genuine system actions under Tier 1, and accepts that risk in exchange for not requiring group setup on every install. `99-shani.rules` documents this reasoning inline for each rule, alongside `sudoers.d` entries (in the same repo) that separately grant the `wheel` group broader `sudo` access for administrative work outside the desktop session.

## Where this lives

| Layer | File |
|---|---|
| Polkit policy (Tier 1 / Tier 2 rules) | `usr/share/polkit-1/rules.d/99-shani.rules` |
| `sudo` access for `wheel` | `etc/sudoers.d/wheel` |
| Kernel/auditd hardening that backs this model | `usr/lib/sysctl.d/90-security-hardening.conf`, `etc/audit/rules.d/10-shani-base.rules` |

All three ship from [`shani-settings`](https://github.com/shani8dev/shani-settings) and overlay onto the live system through the `shani-settings` package — see that repo's README for how the overlay is built and applied.
