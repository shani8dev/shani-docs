---
title: FAQ
section: FAQ
updated: 2026-05-13
---

# Frequently Asked Questions

Answers to the most common questions about Shanios — software installation, updates, hardware, security, and the immutable architecture in plain terms.

---

## Installation & Requirements

**Does Shanios require UEFI?**

Yes. Legacy/CSM BIOS boot is not supported. Most PCs made after 2012 have UEFI. If you see options like Secure Boot and UEFI boot mode in your firmware settings, you're fine.

**Does it work on my hardware?**

Shanios runs on any 64-bit x86 CPU (Intel or AMD) with UEFI firmware. 4 GB RAM and 32 GB storage minimum; 8 GB RAM and 64 GB recommended. NVIDIA, AMD, and Intel graphics all work at first boot — no post-install driver setup. ARM (Apple Silicon, Raspberry Pi) is not supported.

**Do I need to disable Secure Boot to install?**

Yes, temporarily. Disable Secure Boot before installing, then re-enable it after installation and enroll your MOK key. See [Secure Boot](security/secure-boot).

**Can I dual boot with Windows?**

Technically possible but not recommended — Windows may overwrite the bootloader on updates. The cleaner setup is to run Windows in a virtual machine via virt-manager (pre-installed on KDE Plasma). Your Windows install lives in `@libvirt` and is unaffected by OS updates.

**Can I install it on a VM to try it out?**

Yes. Shanios includes guest tools for QEMU/KVM, VirtualBox, and VMware that activate automatically. Give the VM at least 4 GB RAM and 40 GB disk.

---

## Software & Packages

**Can I use `pacman -S` to install packages?**

No — and you don't need to. The OS root is physically read-only; `pacman` writes to `/usr`, which the kernel refuses at runtime. More importantly, anything installed to the OS root would be overwritten on the next update. Use the right layer for each type of software:

- **GUI apps** → `flatpak install flathub app.name`
- **CLI tools and dev runtimes** → `nix-env -iA nixpkgs.tool-name`
- **Full mutable environment (full `apt`, `pacman`, `yay`)** → `distrobox create --name mybox --image archlinux:latest`
- **Services and databases** → `podman run ...`

**How do I install a `.deb` or `.rpm` package?**

Create a Distrobox container matching the target distribution:

```bash
distrobox create --name ubuntu-dev --image ubuntu:24.04
distrobox enter ubuntu-dev
sudo dpkg -i package.deb
distrobox-export --app app-name   # adds to host launcher
```

**I need a tool that only exists in the AUR. How do I get it?**

```bash
distrobox create --name arch-aur --image archlinux:latest
distrobox enter arch-aur
sudo pacman -S --needed base-devel git
git clone https://aur.archlinux.org/yay.git && cd yay && makepkg -si
yay -S aur-package-name
distrobox-export --bin /usr/bin/tool-name
```

The exported binary is available on your host PATH from that point on.

**Does Flatpak work exactly like on other distros?**

Yes. Flathub is pre-configured. GNOME Software and KDE Discover both use Flathub by default. `flatpak install`, `update`, and `remove` work identically. Apps auto-update every 12 hours.

**Can I install development tools like Node, Python, Rust, Go?**

Yes, via Nix. Add a channel once, then install:

```bash
nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs
nix-channel --update
nix-env -iA nixpkgs.nodejs_22
nix-env -iA nixpkgs.rustup
nix-env -iA nixpkgs.python312
nix-env -iA nixpkgs.go
```

Nix packages survive every OS update and rollback. Multiple versions coexist without conflict.

**Can I install VS Code?**

```bash
flatpak install flathub com.visualstudio.code
```

For workflows requiring direct system access (custom language servers, specific extension requirements), install via Distrobox and export to host — or use Snap: `snap install code --classic`.

**Can I run Windows applications?**

Yes. Bottles (pre-installed on KDE Plasma; available on Flathub for GNOME) provides a Wine-based compatibility layer. Steam's Proton (pre-installed on KDE Plasma) runs Windows games. Does Homebrew work? Yes, identically to macOS — it installs to `/home/linuxbrew/.linuxbrew`, completely outside the read-only root, and packages survive every OS update.

**What about Android apps?**

Waydroid runs a full hardware-accelerated Android 11 stack, pre-installed on both editions. Set up with `sudo waydroid-helper init`. See the [Android (Waydroid)](software/waydroid) guide.

---

## Updates & Rollback

**How does updating work?**

```bash
sudo shani-deploy update
```

This downloads a new OS image, verifies SHA256 + GPG signature, snapshots the inactive slot, extracts the new image, generates a signed UKI, and updates the bootloader. Your running system is never touched. Reboot when ready.

**How often do updates come out?**

The `stable` channel releases approximately monthly. The `latest` channel is more frequent. Check your channel: `cat /etc/shani-channel`.

**What happens to my files during an update?**

Nothing. `shani-deploy` only writes to the inactive OS slot. It never touches `@home`, `@flatpak`, `@nix`, `@containers`, or any other user data subvolume.

**How do I roll back?**

```bash
sudo shani-deploy --rollback
sudo reboot
```

Or select the **(Candidate)** entry from the boot menu at startup.

**Can I roll back multiple times?**

Yes. Each update creates a timestamped Btrfs snapshot of the slot it replaces. `shani-deploy -r` restores from the most recent snapshot. To go further back, use `btrfs subvolume list /` to find older backup snapshots and restore manually.

**What if the new OS can't boot at all?**

systemd-boot's boot-counting mechanism detects repeated boot failures and automatically falls back to the previous slot — without any user intervention. The new slot gets three attempts before automatic fallback triggers.

**Will my `/etc` configuration survive an update?**

Yes. Your `/etc` changes are stored in the OverlayFS upper layer at `/data/overlay/etc/upper/`, completely separate from the OS image. They survive every update and rollback. New OS defaults appear for files you have never touched; your customised files remain yours.

**Can I update Flatpak apps and the OS independently?**

Yes. `flatpak update` and `sudo shani-deploy update` are completely independent. You can update apps without touching the OS, update the OS without touching apps, or update both in any order. An OS rollback does not roll back your apps.

**How much disk space do two OS copies take?**

Less than you might expect. `@blue` and `@green` share unchanged data blocks via Btrfs CoW — only changed files consume additional space, typically around 18% overhead. Btrfs zstd compression reduces the effective size by 30–50%. Run `sudo shani-deploy --storage-info` to see accurate compressed sizes.

**What if I run out of disk space?**

```bash
sudo shani-deploy -c          # remove slot backup snapshots and download cache
flatpak uninstall --unused    # remove unused Flatpak runtimes (can reclaim several GB)
podman system prune -af       # remove unused container images
nix-collect-garbage -d        # remove old Nix generations
```

---

## Hardware & Gaming

**Does NVIDIA work?**

Yes. The `nvidia-open` driver is pre-installed and configured on the KDE Plasma edition. On the GNOME edition, the driver is available and configured during installation. `nvidia-smi` and all standard NVIDIA tools work. Secure Boot is supported via MOK-signed kernel modules. On Optimus laptops, use `prime-run application-name` to run on the discrete GPU.

**Does gaming work without the KDE Plasma edition?**

Steam is available as a Flatpak on GNOME. The KDE Plasma edition ships the full pre-configured gaming stack (MangoHud, GameScope, GameMode, Heroic, Lutris, etc.) but nothing prevents gaming on GNOME — you install the same Flatpaks manually.

**Do gaming controllers work?**

Yes. `game-devices-udev` rules are pre-installed covering PlayStation (DS3, DS4, DualSense, DualSense Edge), Xbox (360, One, Series), Nintendo Switch Pro, Joy-Cons, GameCube adapter, 8BitDo, and many more. Plug in and play — Steam Input handles configuration.

**Do racing wheels work?**

Yes. Logitech (G25, G27, G29, G920, G923), Thrustmaster (T150, T300RS, T500RS), and Fanatec wheels are supported with full force feedback. Oversteer (pre-installed on KDE Plasma) provides graphical configuration.

**Does VR work?**

HTC Vive, Valve Index, and PSVR are supported via SteamVR. udev rules are pre-configured.

**Does my fingerprint sensor work?**

Supported fingerprint sensors work at first boot via `fprintd` and `libfprint`. GDM (GNOME) and SDDM (KDE) both support fingerprint authentication at the login screen. Enroll via Settings → Users → Fingerprint Login.

**Does it work on a laptop?**

Yes. Hibernation is configured automatically at install (swapfile sized to RAM, correct offset embedded in UKI). TPM2 auto-unlock handles LUKS decryption at resume. `power-profiles-daemon` manages battery/performance profiles.

---

## Storage & Encryption

**Should I enable LUKS2 encryption?**

Yes, especially for laptops and portable devices. Enable it in the installer (one checkbox), then run:

```bash
sudo gen-efi enroll-tpm2
```

This enables TPM2 auto-unlock — the disk unlocks silently on your hardware and stays locked on any other machine.

**What if I forgot to enable encryption during install?**

You need to reinstall — there is no in-place conversion. Back up your data first with restic, reinstall with encryption enabled, then restore. See [LUKS Management](security/luks).

**Does full-disk encryption slow down the system?**

Negligibly. Modern CPUs (Intel Skylake+, AMD Zen+) have AES hardware acceleration (AES-NI). The encryption overhead is typically under 1% of disk throughput.

**What happens to my LUKS key if I update the BIOS firmware?**

After a firmware update, PCR 0 changes. The TPM will not release the LUKS key — you will be prompted for your passphrase on the next boot. This is correct security behaviour. After booting:

```bash
sudo gen-efi cleanup-tpm2
sudo gen-efi enroll-tpm2
```

**Does hibernation work with encryption?**

Yes. Hibernation is configured automatically at installation. TPM2 auto-unlock handles the decryption at resume without a passphrase prompt.

---

## Switching from Windows or macOS

**What replaces my Windows apps?**

Most have direct replacements on Flatpak: Firefox or Vivaldi (browser, both pre-installed), OnlyOffice (office suite, pre-installed, opens `.docx`/`.xlsx`/`.pptx`), GIMP (Photoshop equivalent), Kdenlive (video editor), OBS Studio (streaming/recording), VLC (media player), Telegram, Discord — all on Flathub. Windows apps with no Linux equivalent can run via Bottles (Wine-based).

**What about `.docx` and `.xlsx` files?**

OnlyOffice Desktop Editors is pre-installed on both editions and has excellent compatibility with Microsoft Office formats.

**I use Homebrew on macOS. Do I need to learn something new?**

No. Homebrew can be installed on Shanios and works identically to macOS. That said, Nix is pre-installed and handles the same use cases with more power — worth exploring after settling in.

**Will iCloud/OneDrive/Google Drive work?**

Google Drive is accessible in the GNOME file manager (Nautilus) via `gvfs-google`. OneDrive via `gvfs-onedrive`. For KDE, `rclone` provides access to all three plus 70+ other providers.

---

## Privacy & Telemetry

**Does Shanios collect any data?**

No. Zero telemetry means zero. No usage data, no hardware reports, no crash reports, no analytics, no identifiers. `shani-deploy` connects to download servers to fetch images (standard HTTP — your IP, nothing else).

**How can I verify there is no telemetry?**

The entire codebase is public at [github.com/shani8dev](https://github.com/shani8dev). Every script, every systemd unit, every service that runs on your machine is readable. Every claim is independently verifiable.

---

## Security

**Is the immutable root actually secure?**

Yes, in a meaningful way. The OS root is physically read-only at the kernel VFS layer — not a permission, not a policy. Root processes cannot write persistent backdoors to `/usr/bin` or any other system path. Malware that gains a root session has that session — it does not have persistence across reboots. Combined with six simultaneous Linux Security Modules active from first boot, the security posture is significantly stronger than a traditional mutable Linux system. See [Security Features](security/features).

**Does Secure Boot actually work?**

Yes. The full boot chain is UEFI firmware → Shim (Microsoft-signed) → systemd-boot (MOK-signed) → Unified Kernel Image (MOK-signed, contains kernel + initramfs + cmdline). The bootloader editor is disabled and the kernel cmdline is embedded in the UKI — it cannot be modified from the boot menu. See [Secure Boot](security/secure-boot).

---

## Community & Support

**Where do I report bugs?**

[github.com/shani8dev/shani-os/issues](https://github.com/shani8dev/shani-os/issues) — include the output of `uname -r`, `cat /data/current-slot`, `shani-deploy --version`, and relevant `journalctl` logs.

**Where do I ask questions?**

[Telegram community](https://t.me/shani8dev) — the primary support channel for questions, feature requests, and general discussion.

**Is Shanios free?**

Yes, fully free and open source. No accounts, no subscriptions, no paid tiers.

**Is there a commercial support option?**

Enterprise and OEM enquiries: [shani.dev — Enterprise & Vendors](https://shani.dev#enterprise).

**Can I contribute?**

Yes. Source code, build scripts, and documentation are all public at [github.com/shani8dev](https://github.com/shani8dev). Pull requests and issue reports are welcome.
