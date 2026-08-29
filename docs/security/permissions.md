---
title: Permissions & Authorization
section: Security
updated: 2026-08-28
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

## Testing Your Configuration

You can verify which tier an action falls under and whether your user is authorized:

```bash
# Check if the current user can perform a Polkit action (Tier 1 / Tier 2)
pkaction --action-id org.freedesktop.packagekit.package-install --verbose

# List all registered Polkit actions
pkaction | head -20

# Check your Polkit result for a specific action
pkcheck --action-id org.freedesktop.packagekit.package-install --process $$ --enable-internal-agent

# Check which groups you belong to (relevant for Tier 2)
groups
id -nG
```

### Verifying Tier Assignments

| Action | Tier | Auth Required |
|--------|------|---------------|
| Install Flatpak app | 1 | `AUTH_SELF` (your password) |
| Mount removable media | 1 | Passwordless |
| Install Snap package | 1 | `AUTH_SELF` (your password) |
| Firmware update via fwupd | 1 | `AUTH_SELF` (your password) |
| Format a disk | 2 | `AUTH_ADMIN` (admin credential) |
| Change hostname | 2 | `AUTH_SELF` but requires `wheel` |
| Reinstall kernel/initramfs | 2 | `AUTH_ADMIN` |

## How It Works at Runtime

When you click "Install" in GNOME Software or KDE Discover:

1. The package manager requests a Polkit authorization check
2. Polkit evaluates `99-shani.rules` based on the action ID
3. If Tier 1: prompt appears asking for **your** password — success grants access
4. If Tier 2 + you're in `wheel`: prompt appears asking for **admin** credential
5. If Tier 2 + you're NOT in `wheel`: access is denied — no prompt appears

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Action requires password unexpectedly | You're in `wheel` and this is a Tier 2 action requiring `AUTH_ADMIN` | Use an admin credential or check if the action is Tier 1-compatible |
| Can't format disk, no prompt appears | You're not in the `wheel` group | Add yourself: `sudo usermod -aG wheel $USER`, then log out and back in |
| "Not authorized" error in terminal | Action is Tier 2 and you lack `wheel` membership | Same as above — join `wheel` |
| Flatpak install prompts for root password | Should only prompt for your own password | Check `99-shani.rules` is loaded: `pkaction --verbose` |
| `sudo` works but Polkit doesn't | Different auth mechanisms — Polkit uses `99-shani.rules`, sudo uses `sudoers.d/wheel` | Both are expected to be independent; sudo bypasses Polkit entirely |

## See Also

- [Security Features](../security/features.md) — full security model overview
- [Audit Framework](../security/audit.md) — auditd rules and hardening
- [User Provisioning](../updates/user-setup.md) — how wheel group membership is managed
- [`shani-settings` repo](https://github.com/shani8dev/shani-settings) — source for all rules
