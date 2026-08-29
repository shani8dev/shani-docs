---
title: Command Cheatsheet
section: System
updated: 2026-08-28
---

# Command Cheatsheet

One-line-per-task reference for daily Shanios operation. Printable. Full detail lives in the pages linked at the bottom.

| Task | Go-to command |
|------|---------------|
| Update the OS | `sudo shani-deploy` |
| Check system health | `shani-health` |
| Undo a bad update | `sudo shani-deploy -r` |
| Install an app | `flatpak install <app>` |

## OS Updates

```bash
sudo shani-deploy                          # Deploy the latest verified image
sudo shani-deploy --dry-run                # Simulate; no changes made
sudo shani-deploy --download-only          # Fetch + verify image, exit before deploy
sudo shani-deploy -r                       # Roll back to the inactive slot (run from kept slot)
sudo shani-deploy --verify-existing        # Re-verify an already-downloaded image
sudo shani-deploy --list-backups           # List stored image backups
sudo shani-deploy -t latest                # Use 'latest' channel for this run only
sudo shani-deploy -t stable                # Use 'stable' channel for this run only
sudo shani-deploy --set-channel stable     # Persist channel choice to /etc/shani-channel
sudo shani-deploy --channel-status         # Show current channel and available versions
AUTO_REBOOT=yes sudo shani-deploy          # Auto-reboot into new slot after success
sudo shani-deploy -c                       # Clean up old backups and cached downloads
sudo shani-deploy -o                       # Btrfs dedup pass (optimize)
```

## Health Checks

```bash
shani-health                    # Overall system report
shani-health --security         # Secure Boot, LUKS, TPM2, users, LSMs
shani-health --boot             # Boot chain, slots, UKI, deployment state
shani-health --network          # NetworkManager, DNS, VPN, firewall
shani-health --hardware         # CPU, GPU, disk, SMART, battery, firmware
shani-health --packages         # Flatpak, Nix, containers, virtualisation
shani-health --verify           # Deep integrity check (Btrfs scrub)
shani-health --verify --json    # Machine-readable output (only with --verify)
shani-health --journal err      # Journal errors and above
shani-health --history 20       # Last 20 deploy/rollback events
shani-health --storage-info     # Btrfs subvolume sizes, compression, snapshots
shani-health --export-logs ~/logs   # Bundle diagnostics to ~/logs
shani-health --clean-logs 14    # Delete logs older than 14 days
shani-health --clear-boot-failure   # Clear stale boot failure marker
```

## Recovery

```bash
sudo shani-deploy -r            # Roll back — boot the slot you want to KEEP first, then run this
sudo shani-reset --dry-run      # Preview what a factory reset would wipe
sudo shani-reset                # Interactive reset (prompts before any action)
```

Boot-failure fallback is automatic: if the freshly deployed slot fails to boot, the bootloader falls back to the previous slot on its own. You can also pick the previous slot manually at power-on via the systemd-boot menu.

```text
power on -> systemd-boot menu -> select previous slot -> boot -> sudo shani-deploy -r
```

## Secure Boot / TPM2

```bash
sudo gen-efi configure blue     # Build + sign UKI for the @blue slot (must match booted slot)
sudo gen-efi configure green    # Build + sign UKI for the @green slot (must match booted slot)
sudo gen-efi enroll-mok         # Stage MOK key enrollment for Secure Boot
sudo gen-efi enroll-tpm2        # Enroll TPM2 for automatic LUKS unlock
sudo gen-efi cleanup-mok        # Delete old MOK keys after rotation
sudo gen-efi cleanup-tpm2       # Remove stale TPM2 LUKS keyslots after re-enrollment
sudo gen-efi remove-tpm2        # Fully remove TPM2 unlock; passphrase required at boot
```

## Packages

Flatpak is the primary application layer:

```bash
flatpak search <app>            # Find an application
flatpak install <app>           # Install
flatpak update                  # Update all Flatpaks
flatpak uninstall <app>         # Remove
```

Use **Flatseal** to adjust per-app permissions graphically.

Nix for CLI/user packages:

```bash
nix-env -iA nixpkgs.<pkg>       # Install a package
nix-env -e <pkg>                # Remove a package
nix-collect-garbage -d          # Garbage-collect old generations
```

Podman containers:

```bash
podman run <image>              # Run a container in the foreground
podman run -d <image>           # Run detached in the background
podman ps                       # List running containers
podman images                   # List local images
```

Distrobox for integrated container environments:

```bash
distrobox create --name dev     # Create a box
distrobox enter dev             # Enter it
distrobox-export --app <app>    # Export an app to the host menu
```

AppImage files run directly; use **GearLever** to manage them (integrate into menu, keep updated).

## Slots & Boot Inspection

```bash
cat /data/current-slot          # Which slot is booted (@blue or @green)
findmnt /                       # Root mount — shows the active subvolume/slot
findmnt /home                   # Home subvolume mount details
bootctl list                    # systemd-boot entries across slots
journalctl -b -p err            # This boot's error-level logs
systemctl --failed              # Failed units this boot
```

## Maintenance Timers

```bash
systemctl list-timers 'btrfs-*' 'flatpak-*' 'shani-*'
```

Lists scrub, Flatpak auto-update, and Shanios maintenance timers with next-fire times.

## See Also

- [System Updates](updates/system) — full `shani-deploy` reference
- [Health Checks](updates/shani-health) — every `shani-health` flag explained
- [Factory Reset](updates/shani-reset) — what `shani-reset` wipes and keeps
- [Secure Boot](security/gen-efi) — full `gen-efi` reference
