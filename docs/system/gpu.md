---
title: GPU & Graphics Drivers
section: System
updated: 2026-08-28
---

# GPU & Graphics Drivers

Every graphics driver on Shanios ships inside the signed OS image. There is no DKMS, no post-install driver script, and nothing to download after setup — the kernel modules, Mesa userspace, NVIDIA userland, and GPU firmware all move together as one atomic unit when you deploy a new image.

This eliminates the most common failure mode on traditional Linux desktops: a driver that no longer matches the running kernel. On Shanios that mismatch cannot happen, because the module tree in `/usr/lib/modules` and the kernel it belongs to are built, signed, and deployed as a pair.

```bash
# Drivers update with the OS — never separately
sudo shani-deploy

# A rollback restores the driver AND the kernel it was built for
sudo shani-deploy --rollback
```

---

## Driver Matrix

| Vendor | Kernel driver | Userspace | Source |
|--------|--------------|-----------|--------|
| AMD | `amdgpu` (Radeon/AMDGPU) | Mesa 25.x OpenGL, RADV Vulkan, VAAPI/VDPAU | In image |
| Intel | `i915` / `xe` | Mesa 25.x OpenGL, ANV Vulkan, `intel-media-driver` (iHD), VAAPI/VDPAU | In image |
| NVIDIA | proprietary open kernel module series | NVIDIA GLX/Vulkan/EGL userland, VAAPI via `libva-nvidia-driver` | In image |
| NVIDIA (nouveau) | `nouveau` | Mesa 25.x (fallback path) | In image |
| VMs / virtual GPU | `virtio-gpu`, others | Mesa vmwgfx/venus paths | In image |
| No native driver | `simpledrm` | llvmpipe software rendering | In image |

GPU firmware ships in the image too — `linux-firmware` split by vendor (AMD GPU, Radeon, NVIDIA, Intel, and others), so firmware files always match the drivers beside them.

---

## Verify Your Stack

```bash
# Which GPU is present and which kernel driver claimed it
lspci -k | grep -A3 VGA

# Expected: "Kernel driver in use: amdgpu" / "i915" / "nvidia"

# Render nodes exist and are owned by root
ls -l /dev/dri
# Expected: card0 + renderD128 entries

# NVIDIA-specific check (driver version, GPU, running processes)
nvidia-smi

# Kernel messages from your GPU driver this boot
journalctl -b | grep -iE 'nvidia|amdgpu|i915' | head

# Confirm which display protocol your session uses
echo $XDG_SESSION_TYPE
```

If `lspci -k` shows a driver in use and `/dev/dri/renderD128` exists, hardware acceleration is active. Software rendering (llvmpipe) means no kernel driver matched — see Troubleshooting.

---

## Hybrid Graphics (Optimus)

Laptops with an integrated GPU plus an NVIDIA discrete GPU use PRIME render offload. The iGPU handles the desktop; demanding apps can be pointed at the dGPU.

```bash
# Run an application on the NVIDIA GPU
prime-run glxgears
prime-run blender

# Equivalent without prime-run:
__NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia <app>
```

GNOME integration via `switcheroo-control` (pre-installed): right-click any app icon and choose **Launch using dedicated GPU**.

Check which GPU rendered something:

```bash
# While the app runs — processes using the NVIDIA GPU appear here
nvidia-smi
```

If an app appears in `nvidia-smi`, it used the dGPU. No entry means it ran on the iGPU.

---

## Wayland Notes

Wayland is the default session on every Shanios edition.

- The NVIDIA open kernel module series handles Wayland well on modern setups, including explicit sync, which removes the long-standing flicker and corruption class of bugs.
- AMD and Intel have first-class Wayland support through Mesa.
- If a specific workload misbehaves, an X11 session remains available as a fallback choice at the login screen — pick it under the session selector before entering your password. This is per-login, not a system change.

---

## External Displays

```bash
# See connected outputs and their status
# GNOME/KDE settings handle arrangement; verify wiring at the kernel level:
journalctl -b | grep -iE 'drm|hdmi|dp|displayport' | tail -20
```

- USB-C ports carry DisplayPort alt-mode on supported hardware — a USB-C dock or cable must explicitly support DP alt-mode for video out.
- Mixed refresh rates across monitors are handled by the compositor; set each panel's rate individually in display settings.
- Fractional scaling is available in GNOME and KDE Plasma editions.
- If an external monitor stays blank: try another port/cable, confirm alt-mode support, then check the journal output above.

---

## Between Releases: Needing a Newer Driver

Drivers arrive with OS images. When a new NVIDIA, Mesa, or kernel release lands upstream, it reaches you through the next image deployment:

```bash
# Check what you are running now
nvidia-smi                     # NVIDIA driver version
cat /data/current-slot         # which slot you booted

# Move to the newest image (kernel + drivers atomically)
sudo shani-deploy
```

**Need a newer driver than the current image ships?**

- File an issue at [github.com/shani8dev](https://github.com/shani8dev) — requests directly influence what the next image pins.
- Be honest about the limits: a kernel-side driver cannot be updated independently. Distrobox or Nix userspace stacks will not help — the kernel module must match the image kernel exactly.
- CUDA and other compute userspace CAN be layered today via containers — see [GPU Containers](../software/gpu-containers.md).

**What does not work, by design:**

- No DKMS — DKMS builds modules against the running kernel at package-install time, which breaks the guarantee that image contents are tested, signed, and internally consistent.
- No NVIDIA `.run` installer — it writes into `/usr` and would break the image signature and atomicity guarantees that make rollback trustworthy.

These are not limitations to work around; they are the mechanism that keeps your GPU stack coherent.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Black screen on boot | Reboot and pick the previous slot in the systemd-boot menu — cmdline is immutable, so do not try `nomodeset`; the previous slot boots the known-good kernel+driver pair |
| `nvidia-smi` fails after an update | Check which slot actually booted: `cat /data/current-slot`; if it differs from expectation, reboot and select the intended slot, or run `sudo shani-deploy --rollback` |
| External monitor blank | Try another port/cable; confirm USB-C alt-mode support; check `journalctl -b \| grep -i drm` |
| Hybrid laptop app ignores dGPU | Prefix with `prime-run` or use the env-var method above; confirm with `nvidia-smi` while running |
| Suspend/resume GPU hang | Kernel and driver versions are already matched pairs in each slot; capture logs (`journalctl -b -1 \| grep -iE 'nvidia\|amdgpu\|i915'`) and report the bug |
| Everything renders on CPU (llvmpipe) | `lspci -k` shows no "Kernel driver in use" for your GPU — file an issue with full `lspci -nnk` output |

When filing bugs, include: `uname -r`, `cat /data/current-slot`, `lspci -nnk | grep -A3 VGA`, and relevant journal output.

---

## Compute and ML

The host ships drivers, not compute toolchains. Heavy stacks stay in containers:

- NVIDIA CUDA, AMD ROCm, Intel oneAPI via containers: [GPU Acceleration & HPC Containers](../software/gpu-containers.md)
- Dedicate a whole GPU to a VM via VFIO passthrough: [Virtual Machines](../software/vms.md)

---

## See Also

- [Hardware](hardware) — inspecting GPUs, sensors, PCI devices
- [Kernel Modules](kernel-modules) — module listing, blacklisting, parameters
- [Optimizations](../intro/optimizations.md) — performance tuning
- [GPU Containers](../software/gpu-containers.md) — CUDA/ROCm/oneAPI workloads
- [Virtual Machines](../software/vms.md) — GPU passthrough
- Blog: [GPU Compute on Shani OS](https://blog.shani.dev/post/gpu-compute-on-shani-os)
- Blog: [Gaming on Shani OS](https://blog.shani.dev/post/shani-os-gaming-deep-dive)
