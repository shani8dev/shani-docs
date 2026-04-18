---
title: Bottles (Windows Compatibility)
section: Software & Apps
updated: 2026-05-08
---

# Bottles (Windows Compatibility)

**Bottles** is the recommended tool for running non-gaming Windows software on Shanios. It manages Wine environments ("bottles"), handles runtime dependencies, and keeps each application's Windows registry and files isolated in its own prefix.

> **Installation**: Pre-installed on the KDE Plasma edition. On the GNOME edition:
> ```bash
> flatpak install flathub com.usebottles.bottles
> ```

For gaming, use Steam + Proton or Heroic Games Launcher instead — Bottles is for productivity tools, creative software, business applications, utilities, and legacy apps.

## How Wine Works

Wine reimplements the Windows API as native Linux calls — it is not an emulator. DXVK (DirectX 9/10/11) and VKD3D (DirectX 12) translate DirectX calls to Vulkan. Most Windows applications run at near-native speed.

Wine cannot run applications that rely on Windows kernel drivers, hardware dongles tied to Windows, or kernel-level anti-cheat. Use a Windows VM for those cases.

## Creating a Bottle

Open Bottles from your application launcher → **Create a new bottle**:

- **Application** — for productivity tools, utilities, and most Windows software.
- **Gaming** — pre-configured with DXVK and VKD3D for DirectX games.
- **Custom** — full manual control.

## Installing Windows Software

1. Open your bottle → **Run Executable** → select the `.exe` installer
2. Follow the installer as you would on Windows
3. The installed app appears under **Programs**
4. Click **Add Desktop Entry** (three-dot menu) to add it to your Linux launcher

Your Linux home directory is accessible from inside Wine at `Z:\home\username`.

## Runtime Dependencies

Go to your bottle → **Dependencies** → search and install as needed:

| Dependency | Required by |
|---|---|
| `vcredist2019` | Most modern Windows apps (Visual C++ 2019) |
| `vcredist2015` | Older apps (Visual C++ 2015) |
| `dotnet48` | .NET Framework 4.8 — business software, installers |
| `dotnet6` | .NET 6 — newer cross-platform apps |
| `d3dx9` | DirectX 9 components |
| `d3dcompiler_47` | DirectX shader compiler |
| `corefonts` | Microsoft Core Fonts — improves text rendering |
| `liberation` | Liberation fonts — metrically compatible with Arial/Times |

## Wine Runners

Change the runner in **Settings → Runner**:

| Runner | Best for |
|---|---|
| **Caffe** | Default — stable, good general-purpose choice |
| **Vaniglia** | Upstream Wine, minimal patches — use when patched runners misbehave |
| **Wine Staging** | Wine + Staging patchset — good for productivity apps |
| **Wine-GE** | Valve's Wine backported for non-Steam use — best for DirectX games and media software |

## Advanced Configuration

**DXVK and VKD3D**: In bottle **Settings**, enable DXVK (DirectX 9/10/11 → Vulkan) and VKD3D (DirectX 12 → Vulkan). Both are enabled by default in the Gaming template. Some creative and 3D tools also benefit.

**Virtual Desktop Mode**: Enable in bottle Settings if an app has window management or full-screen rendering issues. Wine creates a fake Windows desktop at a fixed resolution inside a single Linux window.

**DLL Overrides**: In bottle **Settings → DLL Overrides**, set `native,builtin` to prefer a winetricks-installed DLL, or `builtin,native` to prefer Wine's built-in. Common fix: install `d3dx9` via Dependencies, then set `d3d9` override to `native`.

**Environment Variables**: In bottle **Settings → Environment Variables**:
- `WINE_LARGE_ADDRESS_AWARE=1` — allows 32-bit apps to use more than 2 GB RAM
- `WINEDEBUG=-all` — suppress debug output (speeds up some apps)

## Storage

Bottles runs as a Flatpak. Data lives in `~/.var/app/com.usebottles.bottles/data/bottles/bottles/` — inside the `@home` subvolume, surviving all OS updates and rollbacks.

## Checking Compatibility

- **[WineHQ AppDB](https://appdb.winehq.org)** — compatibility database. Platinum/Gold = works well; Bronze = workarounds needed; Garbage = consider a Windows VM.
- **[ProtonDB](https://www.protondb.com)** — for Windows games under Proton/Steam.

## When to Use a Windows VM Instead

Wine cannot handle:
- Applications requiring a **kernel driver** (hardware dongles, some DRM, security software)
- **Kernel-level anti-cheat** systems
- The **full Microsoft Office suite** with macros, COM add-ins, and MDM integration
- **Enterprise software** with hardware-locked licensing

For these, use a Windows VM via virt-manager (pre-installed on the KDE Plasma edition). See [Virtual Machines](vms.md).

## Troubleshooting

- **App won't start**: Check the **Logs** tab. Install `vcredist2019` or `dotnet48` first.
- **Graphics glitches**: Switch runner (e.g. Caffe → Wine-GE). Toggle DXVK on or off.
- **App needs other drives**: **Settings → Sandbox** — add paths or disable sandboxing.
- **Crashes on startup**: Check WineHQ AppDB for known workarounds.
