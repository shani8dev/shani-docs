---
title: Kernel Modules
section: System
updated: 2026-04-28
---

# Kernel Modules

Kernel modules are loadable drivers and extensions that the Linux kernel can load and unload at runtime without rebooting. On Shani OS, module configuration files placed in `/etc/modules-load.d/` and `/etc/modprobe.d/` live in the `/etc` overlay and persist across all OS updates and rollbacks.

---

## Listing and Inspecting Modules

```bash
# List all currently loaded modules
lsmod

# Show information about a module (description, parameters, dependencies)
modinfo kvm
modinfo iwlwifi
modinfo nvidia

# Show only specific fields
modinfo -F filename kvm        # path to the .ko file
modinfo -F parm kvm            # available parameters
modinfo -F depends kvm         # dependencies

# Check if a module is loaded
lsmod | grep kvm
```

---

## Loading and Unloading Modules

```bash
# Load a module (for the current session only)
sudo modprobe kvm
sudo modprobe kvm_intel          # or kvm_amd depending on CPU

# Load with parameters
sudo modprobe iwlwifi 11n_disable=1
sudo modprobe usbcore autosuspend=1

# Unload a module
sudo modprobe -r kvm_intel
sudo rmmod kvm_intel             # alternative, does not handle dependencies

# Unload a module and all its dependents
sudo modprobe -r --remove-dependencies kvm_intel

# Dry run — show what would be loaded/unloaded
sudo modprobe --dry-run kvm
```

> ⚠️ `rmmod` fails if the module is in use. Use `modprobe -r` which handles the dependency chain, or check what is using it with `lsmod | grep <module>` and look at the "Used by" column.

---

## Persistent Module Loading

To load a module automatically at boot, create a file in `/etc/modules-load.d/`. Files here are processed by `systemd-modules-load.service` early in the boot sequence.

```bash
# Load a single module at boot
echo "kvm_intel" | sudo tee /etc/modules-load.d/kvm.conf

# Load multiple modules
sudo tee /etc/modules-load.d/virtualisation.conf << 'EOF'
kvm
kvm_intel
vhost_net
EOF
```

Each file should contain one module name per line. Comments starting with `#` are ignored.

```bash
# Verify the service loaded all modules correctly
systemctl status systemd-modules-load.service
journalctl -u systemd-modules-load.service
```

---

## Module Parameters

Module parameters can be set persistently in `/etc/modprobe.d/`.

```bash
# Disable 802.11n (workaround for some Wi-Fi issues)
echo "options iwlwifi 11n_disable=1" | sudo tee /etc/modprobe.d/iwlwifi.conf

# Set KVM nested virtualisation
echo "options kvm_intel nested=1" | sudo tee /etc/modprobe.d/kvm.conf
echo "options kvm_amd nested=1"   | sudo tee /etc/modprobe.d/kvm.conf   # AMD

# Set USB autosuspend delay
echo "options usbcore autosuspend=5" | sudo tee /etc/modprobe.d/usb.conf

# Verify active parameters for a loaded module
cat /sys/module/kvm_intel/parameters/nested
cat /sys/module/iwlwifi/parameters/11n_disable
```

Changes to `/etc/modprobe.d/` take effect on the next module load. To apply immediately: unload and reload the module with `modprobe -r` then `modprobe`.

---

## Blacklisting Modules

Blacklisting prevents a module from loading automatically. Useful for disabling a buggy driver, forcing a different driver, or preventing a conflicting module from loading alongside another.

```bash
# Blacklist a module
echo "blacklist nouveau" | sudo tee /etc/modprobe.d/blacklist-nouveau.conf

# Blacklist and also prevent loading as a dependency
sudo tee /etc/modprobe.d/blacklist-nouveau.conf << 'EOF'
blacklist nouveau
install nouveau /bin/false
EOF
```

The `install <module> /bin/false` directive is stronger — it replaces the module's install command with `/bin/false`, preventing it from loading even as a dependency of another module.

```bash
# Verify a module is blacklisted
cat /etc/modprobe.d/*.conf | grep blacklist
```

> 💡 Common blacklisting use cases on Shani OS: disabling `nouveau` when using the NVIDIA proprietary driver, blacklisting `pcspkr` to silence the PC speaker beep, or blacklisting `iTCO_wdt` to prevent false watchdog triggers.

---

## Module Aliases

Aliases let you refer to a module by a friendly name or map a hardware ID to a driver.

```bash
# Show all aliases for a module
modinfo -F alias kvm_intel

# Show which module would handle a specific hardware ID
modprobe --show-depends pci:v00008086d00001234sv...

# List all alias mappings (from modules.alias in the kernel)
cat /lib/modules/$(uname -r)/modules.alias | grep iwlwifi
```

---

## Dracut and the Initramfs

On Shani OS, the initramfs is built with **dracut**. Modules that must be available before the root filesystem is mounted (e.g. storage controllers, crypto drivers) need to be included in the initramfs.

```bash
# Force-include a module in the initramfs
echo "add_drivers+=\" virtio_blk virtio_scsi \"" | sudo tee /etc/dracut.conf.d/virtio.conf

# Regenerate the initramfs after changes
sudo dracut --force

# Verify a module is present in the initramfs
lsinitrd | grep virtio
lsinitrd /boot/initramfs-linux.img | grep <module>
```

> ⚠️ After adding or changing module configuration that affects early boot (storage, crypto, firmware), always regenerate the initramfs with `sudo dracut --force` and reboot to verify the new initramfs works before removing the previous boot slot.

---

## Firmware

Many modules require firmware blobs that are loaded from `/lib/firmware/`. Shani OS ships a comprehensive `linux-firmware` package split by vendor. If a module reports a missing firmware file:

```bash
# Check dmesg for firmware load failures
dmesg | grep -i firmware
dmesg | grep "Direct firmware load"

# List available firmware files for a driver
ls /lib/firmware/iwlwifi*         # Intel Wi-Fi firmware
ls /lib/firmware/amdgpu/          # AMD GPU firmware

# Check which firmware package provides a file
pacman -F /lib/firmware/iwlwifi-8265-36.ucode
```

If a firmware file is genuinely missing, the relevant `linux-firmware-<vendor>` package may not be installed. On Shani OS these are split packages (e.g. `linux-firmware-intel`, `linux-firmware-amdgpu`).

---

## Useful Diagnostics

```bash
# Show kernel messages related to module loading since boot
dmesg | grep -E "module|driver|firmware" | head -40

# Show all modules and their memory usage
lsmod | sort -k2 -rh

# Find which module handles a device (by PCI ID)
lspci -k | grep -A3 "VGA\|Network\|Audio"

# Find which module handles a USB device
lsusb -v 2>/dev/null | grep -E "idVendor|idProduct|Kernel driver"

# Check for module load errors at boot
journalctl -b | grep -i "module\|modprobe\|failed to load"

# Show all loaded modules with their sysfs paths
ls /sys/module/
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `modprobe: FATAL: Module not found` | Module name may differ — check `modinfo` or search: `find /lib/modules/$(uname -r) -name "*name*"` |
| Module loads but device doesn't work | Check `dmesg` for firmware errors; verify firmware package is installed |
| `rmmod: ERROR: Module is in use` | Check the "Used by" column in `lsmod`; unload dependent modules first, or use `modprobe -r` |
| Module loads but wrong driver is used | Blacklist the competing module in `/etc/modprobe.d/` |
| Changes to `/etc/modprobe.d/` not taking effect | Unload and reload the module; or reboot; if it's an initramfs module, run `sudo dracut --force` |
| Missing firmware after OS update | Run `sudo pacman -S linux-firmware` or the specific vendor firmware package |
| Module not loading at boot despite `/etc/modules-load.d/` entry | Check `systemctl status systemd-modules-load`; verify the module name is correct with `modinfo` |

---

## See Also

- [Systemd](systemd) — `systemd-modules-load.service`, unit dependencies
- [Hardware](hardware) — `lspci`, `lsusb`, device identification
- [Storage](storage) — storage controller modules, NVMe
- [Architecture: Dracut Initramfs Module](../arch/dracut-module) — Shani OS initramfs build
