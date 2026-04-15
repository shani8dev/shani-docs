---
title: System Optimizations
section: Introduction
updated: 2026-04-01
---

# System Optimizations

Shanios includes extensive performance, gaming, and reliability optimizations out of the box, eliminating the need for manual tweaking. These enterprise-grade optimizations are pre-configured and active from first boot.

## Memory & Storage Management

- **ZRAM Compression:** Automatic RAM compression using the zstd algorithm provides improved memory efficiency without requiring swap partitions.
- **Optimized Swappiness:** Tuned to 133 — encourages the kernel to use compressed ZRAM swap before evicting clean page cache, maintaining system responsiveness under memory pressure.
- **Btrfs Maintenance:** Automated filesystem maintenance runs in the background — periodic scrubbing for data integrity, balance operations, and defragmentation. Scheduled to minimize impact on system usage.
- **Profile Sync Daemon:** Browser profiles are stored in tmpfs (RAM) for dramatically faster load times and reduced disk writes, with periodic sync back to persistent storage.
- **Optimized Page Lock Unfairness:** Set to 1 to reduce lock contention and improve multi-threaded application performance, particularly for databases and high-concurrency workloads.

## Gaming & Performance

### Game Controller Hardware

- **game-devices-udev:** Comprehensive udev rules for 8BitDo, PlayStation (DualShock 3/4, DualSense, DualSense Edge), Xbox (360, One, Series), Nintendo Switch Pro, Joy-Cons, GameCube adapter, VR equipment, and more
- **OpenRGB udev rules:** RGB control for keyboards, mice, headsets, fans from ASUS Aura, Corsair, Razer, SteelSeries, Logitech G, MSI Mystic Light, Cooler Master, NZXT, and others
- **Racing Wheel Support:** Logitech (G25/G27/G29/G920/G923), Thrustmaster (T150/T300RS/T500RS), Fanatec — with full force feedback

### Kernel-Level Gaming Optimizations

- **Game Compatibility Kernel Parameters:** Increased PID limit (65535), expanded memory map areas (2147483642), enhanced inotify limits
- **Network Optimization:** TCP FIN timeout reduced to 5 seconds (Valve SteamOS optimization) — prevents "address already in use" errors in multiplayer games
- **CPU Scheduler Tuning:** CFS bandwidth slice: 3000μs; base slice: 3ms; autogroup scheduling enabled
- **MGLRU (Multi-Gen LRU):** Enabled with aggressive settings for intelligent memory reclaim
- **Transparent Hugepage:** Set to `madvise` for selective large page usage
- **GameMode Integration:** GameMode daemon enabled globally — auto-applies CPU governor, I/O priority, and GPU performance levels when games launch
- **High-Precision Timers:** HPET and RTC frequencies increased to 3072 Hz for superior timing accuracy

## Process Management & Responsiveness

- **Ananicy-cpp:** Automatic process priority management with game-aware rules — background tasks are deprioritized when games or media are active
- **systemd-oomd:** System-wide OOM daemon enabled by default to prevent system freezes
- **IRQBalance:** Optimizes interrupt distribution across CPU cores
- **Increased File & Process Limits:** Default limits raised to 1,048,576 for open files (NOFILE) and processes (NPROC)
- **Fast Shutdown:** Reduced timeout values (10s stop, 10s abort) — services that fail to stop gracefully are automatically killed

## Security Hardening

- **AppArmor:** Enabled by default to confine system services and applications
- **firewalld:** Active firewall enabled by default, denying inbound connections while allowing essential services
- **Kernel Hardening:** NMI watchdog disabled, unprivileged user namespaces enabled for containerization, Magic SysRq keys enabled for emergency recovery
- **Blacklisted Kernel Modules:** PC speaker (pcspkr) and Intel Management Engine (mei, mei_me) disabled

## Boot & System Efficiency

- **Plymouth (BGRT Theme):** Smooth graphical boot experience showing manufacturer's logo
- **Journal Size Limit:** SystemD journal capped at 50MB to prevent excessive disk usage
- **Reduced Kernel Messages:** Console printk level set to 3 (errors and critical messages only)
- **Time Synchronization:** systemd-timesyncd enabled by default for automatic NTP synchronization
- **Socket Activation:** Many services start on-demand — pcscd, lircd, gpsd, cups, avahi-daemon, saned

## Automated Maintenance (Systemd Timers)

| Timer | Action |
|-------|--------|
| `btrfs-scrub.timer` | Monthly scrubbing to detect and repair data corruption |
| `btrfs-balance.timer` | Periodic filesystem balancing for optimal performance |
| `btrfs-defrag.timer` | Automatic defragmentation on fragmented files |
| `btrfs-trim.timer` | Regular TRIM operations for SSD optimization |
| `beesd` daemon | Continuous background block-level deduplication across all Btrfs subvolumes |
| `flatpak-update-system.timer` | System Flatpak auto-updates every 12 hours |
| `flatpak-update-user.timer` | Per-user Flatpak auto-updates every 12 hours |
| `profile-sync-daemon` | Browser cache sync from RAM to disk |

All maintenance operations are scheduled during low-usage periods and use minimal system resources.

> **Note:** All these optimizations are pre-configured and active from first boot. No manual configuration, tweaking, or performance tuning required.
