---
title: shani-health Reference
section: Updates & Config
updated: 2026-05-13
---

# shani-health Reference

`shani-health` is the system health CLI introduced in Shanios 2026.04.15. It provides a single command for checking the state of Shanios-specific components: slot integrity, Btrfs subvolume health, storage usage, and core service status. It complements `shani-deploy --storage-info` (which reports compressed OS slot sizes) by adding live system health data.

---

## Basic Usage

```bash
# Full health check
shani-health

# Check a specific component
shani-health --slots
shani-health --storage
shani-health --services
shani-health --filesystem

# Output in JSON (for scripts and monitoring)
shani-health --json

# Verbose output
shani-health -v

# Exit with non-zero status if any check fails (for scripting/CI)
shani-health --strict
```

---

## What shani-health Checks

### Slot State (`--slots`)

- **Active slot** — which subvolume (`@blue` or `@green`) is currently booted
- **Candidate slot** — the standby slot and its state (ready, updating, failed, empty)
- **Current slot file** — whether `/data/current-slot` matches the booted subvolume
- **Boot markers** — presence and age of `boot-ok`, `boot_failure`, `boot_hard_failure`
- **Pending reboot** — whether `/run/shanios/reboot-needed` is set
- **Slot versions** — OS version in each slot (read from the slot's `/etc/shani-version`)
- **UKI signatures** — whether the signed UKIs on the ESP match the current MOK key
- **Backup snapshots** — count and age of backup snapshots for each slot

### Storage (`--storage`)

- **Filesystem free space** — usable space remaining on the Btrfs volume (warns below 10 GB)
- **Per-subvolume usage** — actual (uncompressed) and compressed size of each subvolume
- **Deduplication savings** — estimated savings from `bees` deduplication
- **Download cache** — size of cached images in `/data/downloads/`
- **Backup snapshot size** — total space used by slot backup snapshots

This is more detailed than `shani-deploy --storage-info`, which only reports the compressed OS slot sizes.

### Services (`--services`)

Checks that core Shanios system services are running and healthy:

- `shani-update.timer` — user-session update check timer
- `beesd@.service` — background Btrfs deduplication daemon
- `tailscaled.service` — Tailscale (if enrolled)
- `firewalld.service` — firewall (warns if inactive)
- `nix-daemon.service` — Nix daemon (warns if inactive)
- `podman.socket` — Podman socket activation

### Filesystem (`--filesystem`)

- **Btrfs consistency** — lightweight `btrfs check --readonly` on the root volume
- **OverlayFS** — confirms `/etc` is correctly mounted as OverlayFS
- **Bind mounts** — verifies expected bind mounts (`/var/lib/NetworkManager`, `/var/lib/bluetooth`, etc.) are active
- **ESP** — confirms the EFI System Partition is mounted and both UKI files are present

---

## Reading the Output

A passing health check prints a green summary:

```
shani-health 1.0
✓ Slot state       Active: @blue (2026.04.15) | Candidate: @green (2026.04.15) | Clean
✓ Storage          42.3 GB used / 234 GB free (Btrfs compressed) | No snapshot bloat
✓ Services         All core services healthy
✓ Filesystem       OverlayFS, bind mounts, ESP — all OK
```

A warning (yellow) indicates a degraded but functional state:

```
⚠ Storage          Downloads cache: 4.2 GB — run 'sudo shani-deploy -c' to clean up
⚠ Services         beesd not running — deduplication paused
```

An error (red) requires attention:

```
✗ Slot state       boot_failure marker present — last update failed to boot
                   Run 'sudo shani-deploy -r' to restore the candidate slot
✗ Filesystem       /etc OverlayFS not mounted — system configuration may be inconsistent
```

---

## Scripting with shani-health

### JSON Output

```bash
shani-health --json
```

Output structure:

```json
{
  "version": "1.0",
  "timestamp": "2026-05-12T14:32:00Z",
  "overall": "healthy",
  "checks": {
    "slots": {
      "status": "ok",
      "active_slot": "blue",
      "active_version": "2026.04.15",
      "candidate_slot": "green",
      "candidate_version": "2026.04.15",
      "boot_failure": false,
      "pending_reboot": false
    },
    "storage": {
      "status": "warning",
      "free_gb": 234.1,
      "download_cache_gb": 4.2,
      "message": "Download cache is large — run shani-deploy -c"
    },
    "services": { "status": "ok" },
    "filesystem": { "status": "ok" }
  }
}
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All checks passed (healthy) |
| `1` | One or more warnings (degraded but functional) |
| `2` | One or more errors (action required) |

Use `--strict` to treat warnings as errors (exit code 2).

### Fleet Health Monitoring via Systemd Timer

```ini
# /etc/systemd/system/shani-health-report.service
[Unit]
Description=Shani OS Health Report

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'shani-health --json > /var/log/shani-health-$(date +%Y%m%d).json'
```

```ini
# /etc/systemd/system/shani-health-report.timer
[Unit]
Description=Daily Shani OS Health Report

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

For Prometheus/Grafana, wrap `shani-health --json` in a custom exporter. For Nagios/Zabbix, use `shani-health --strict` as a check script — non-zero exit triggers an alert. For remote fleet checks via Tailscale or SSH:

```bash
ssh admin@machine-name.tailnet.ts.net 'shani-health --json --strict'
```

---

## Relationship to shani-deploy --storage-info

| Command | Focus |
|---------|-------|
| `sudo shani-deploy --storage-info` | Compressed sizes of OS slots specifically |
| `shani-health --storage` | Full picture: all subvolumes, download cache, backup snapshots, low-space warnings |
| `shani-health -v` | Everything at once |

---

## See Also

- [Atomic Updates](../concepts/atomic-updates) — how `shani-deploy` works
- [OEM & Fleet Deployment](../enterprise/fleet) — fleet monitoring integration
- [Troubleshooting](../troubleshooting) — using shani-health for diagnostics
