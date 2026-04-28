---
title: Hardware
section: System
updated: 2026-04-28
---

# Hardware

This page covers inspecting and diagnosing hardware on Shani OS: CPUs, memory, GPUs, storage controllers, USB devices, sensors, and firmware. All tools listed here are pre-installed unless noted.

---

## System Overview

```bash
# Quick full system summary (CPU, RAM, GPU, storage, network, OS)
inxi -Fz

# Shorter summary — CPU, RAM, and uptime
inxi -b

# Hardware summary without network info
inxi -Fxz --no-host

# DMI/BIOS info (manufacturer, serial, chassis type)
sudo dmidecode -t system
sudo dmidecode -t bios
sudo dmidecode -t baseboard

# Kernel and OS info
uname -a
hostnamectl
```

---

## CPU

```bash
# CPU model, cores, threads, cache
lscpu

# Per-core info from /proc
cat /proc/cpuinfo

# Current frequency of all cores
cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq

# CPU governor (performance, powersave, schedutil, etc.)
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor

# Set governor for all cores
echo "performance" | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# Available governors
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors

# CPU microcode version
grep -m1 "microcode" /proc/cpuinfo

# Hardware vulnerabilities and mitigations
grep -r . /sys/devices/system/cpu/vulnerabilities/

# CPU topology (sockets, dies, cores, threads)
lscpu -e
```

---

## Memory

```bash
# Overview: total, used, free, buffers, swap
free -h

# Detailed memory info from kernel
cat /proc/meminfo

# Physical RAM slots, size, speed, type (DDR4/DDR5)
sudo dmidecode -t memory

# Memory usage per process (sorted by RSS)
ps aux --sort=-%rss | head -20

# Huge pages
cat /proc/sys/vm/nr_hugepages
grep -i huge /proc/meminfo

# ZRAM (compressed swap) usage
zramctl

# Memory bandwidth test (requires memtester — not pre-installed)
# sudo pacman -S memtester && sudo memtester 1G 1
```

---

## PCI Devices

```bash
# List all PCI devices
lspci

# Verbose — includes subsystem IDs and driver info
lspci -v

# Show kernel driver in use for each device
lspci -k

# Filter by class (VGA, Network, Audio, USB, etc.)
lspci -k | grep -A3 "VGA\|3D"
lspci -k | grep -A3 "Network\|Ethernet"
lspci -k | grep -A3 "Audio"

# Show device IDs (vendor:device) — useful for finding drivers
lspci -n

# Tree view
lspci -tv

# Detailed info for a specific device
lspci -v -s 00:02.0
```

---

## USB Devices

```bash
# List all USB devices
lsusb

# Verbose (includes device class, subclass, driver)
lsusb -v 2>/dev/null | less

# Tree view showing hub topology
lsusb -t

# Monitor USB events in real time (plug/unplug)
sudo udevadm monitor --udev --subsystem-match=usb

# Show udev info for a specific device
udevadm info /dev/sdb
udevadm info -a /dev/sdb        # full attribute chain

# USB device power management
cat /sys/bus/usb/devices/*/power/control
```

---

## GPU

```bash
# GPU model and driver
lspci -k | grep -A3 -i "vga\|3d\|display"

# OpenCL platforms and devices
clinfo

# Vulkan info (pre-installed)
vulkaninfo --summary

# Mesa GPU info (AMD/Intel open source)
glxinfo -B                      # requires X11/XWayland session
DISPLAY=:0 glxinfo -B

# NVIDIA (if using proprietary driver)
nvidia-smi
nvidia-smi -q                   # full detail
watch -n 1 nvidia-smi           # live monitor

# AMD GPU usage and temperature (via sysfs)
cat /sys/class/drm/card0/device/gpu_busy_percent
cat /sys/class/drm/card0/device/hwmon/hwmon*/temp1_input   # in millidegrees

# Intel GPU usage
cat /sys/class/drm/card0/gt/gt0/rc6_enable
intel_gpu_top                   # requires intel-gpu-tools (not pre-installed)

# Switcheroo (multi-GPU / hybrid graphics)
switcherooctl list
switcherooctl switch             # switch active GPU
```

---

## Temperature and Sensors

`lm_sensors` is pre-installed. Run `sudo sensors-detect` once to configure it, then use `sensors` for readings.

```bash
# Initial sensor detection (run once, answer yes to auto-load modules)
sudo sensors-detect --auto

# Read all sensor values (CPU temp, fan speeds, voltages)
sensors

# Watch sensors live
watch -n 1 sensors

# JSON output for scripting
sensors -j

# Hard disk temperature
sudo hddtemp /dev/sda            # requires hddtemp (not pre-installed)
sudo smartctl -A /dev/sda | grep Temp   # via SMART

# NVMe temperature
sudo nvme smart-log /dev/nvme0 | grep "temperature"
cat /sys/class/nvme/nvme0/hwmon*/temp1_input   # in millidegrees

# Thermal zones (kernel thermal framework)
paste /sys/class/thermal/thermal_zone*/type /sys/class/thermal/thermal_zone*/temp
```

---

## Fan Control

```bash
# View fan speeds (from sensors)
sensors | grep -i fan

# Automatic fan control daemon — fancontrol (part of lm_sensors)
# Configure with:
sudo pwmconfig                   # interactive wizard
sudo systemctl enable --now fancontrol

# Manual PWM control (use with caution)
cat /sys/class/hwmon/hwmon0/pwm1_enable    # 0=full speed, 1=manual, 2=auto
echo 1 | sudo tee /sys/class/hwmon/hwmon0/pwm1_enable  # manual mode
echo 180 | sudo tee /sys/class/hwmon/hwmon0/pwm1        # 0–255
```

---

## Power Management

```bash
# Current power profile
powerprofilesctl get

# Set power profile
powerprofilesctl set performance    # performance / balanced / power-saver

# List available profiles
powerprofilesctl list

# Battery status (laptops)
upower -i /org/freedesktop/UPower/devices/battery_BAT0
upower -e | xargs -I{} upower -i {}   # all power devices

# Suspend / hibernate / shutdown
systemctl suspend
systemctl hibernate
systemctl poweroff
systemctl reboot

# Wake-on-LAN
sudo ethtool -s eth0 wol g       # enable WoL (magic packet)
sudo ethtool eth0 | grep Wake    # check current setting
```

---

## Firmware Updates

Firmware updates for supported devices are managed by **fwupd**. See [Firmware Updates](../security/fwupd) for full documentation.

```bash
# Quick reference
sudo fwupdmgr get-devices
sudo fwupdmgr refresh
sudo fwupdmgr get-updates
sudo fwupdmgr update
```

---

## Hardware Errors and Events

```bash
# Kernel hardware messages since boot
dmesg | grep -iE "error|fail|warn|hardware" | head -40

# ACPI events (power button, lid, AC adapter)
journalctl -u acpid -n 50

# PCIe errors (AER — Advanced Error Reporting)
dmesg | grep -i "aer\|pcie error"

# Memory errors (MCE — Machine Check Exception)
dmesg | grep -i mce
sudo mcelog                      # requires mcelog (not pre-installed)

# USB errors
dmesg | grep -i "usb.*error\|unable to enumerate"

# NVMe errors
sudo nvme error-log /dev/nvme0

# Hardware event log via IPMI (servers)
sudo ipmitool sel list           # requires ipmitool
```

---

## Identifying Unknown Hardware

```bash
# Look up a PCI vendor:device ID on the internet
lspci -n | awk '{print $3}'      # list raw IDs
# Then search: https://pci-ids.ucw.cz/

# Look up a USB vendor:product ID
lsusb | awk '{print $6}'
# Then search: https://usb-ids.gowdy.us/

# Find which package provides a driver for a device
lspci -k | grep "Kernel driver"  # find the driver name
pacman -F /lib/modules/$(uname -r)/kernel/drivers/**/drivername.ko.zst

# udev rule for a device
udevadm info --query=all --name=/dev/sdb | grep -E "ID_VENDOR|ID_MODEL|DRIVER"
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Device not detected | Check `dmesg | tail -30` after plugging in; verify with `lspci -k` or `lsusb`; try a different port |
| Wrong driver loaded | Blacklist the competing module — see [Kernel Modules](kernel-modules) |
| `sensors` shows no data | Run `sudo sensors-detect --auto` to detect and load the correct modules |
| GPU not accelerating | Check `lspci -k` to confirm the right driver is in use; check for firmware errors in `dmesg` |
| High CPU temperature | Check `sensors`; verify thermal paste is applied; check fan speed; check `powerprofilesctl` |
| Battery draining fast | Install and check `powertop` (not pre-installed); verify `power-saver` profile is active |
| `dmidecode` returns empty | System firmware may not populate DMI tables — try `inxi -Fz` for alternative sources |

---

## See Also

- [Kernel Modules](kernel-modules) — loading drivers, blacklisting, parameters
- [Storage](storage) — SMART, NVMe, disk health
- [Firmware Updates](../security/fwupd) — fwupd for device firmware
- [Process Management](process-management) — CPU load, memory usage per process
- [Systemd](systemd) — `CPUQuota=`, `MemoryMax=`, resource limits
