---
title: Gaming
section: Software & Apps
updated: 2026-08-21
---

# Gaming

Shanios pre-installs GameMode and broad controller/RGB hardware support on **every edition**. The full gaming app stack (Steam, Lutris, Heroic, RetroArch, and related tools) is a **KDE Plasma-only** Flatpak preseed — GNOME users install the same apps themselves via Flatpak in a few commands.

## What's Pre-Installed on Every Edition

- **GameMode** (`gamemoded`) — enabled globally at install time. Automatically applies a performance CPU governor, I/O priority boost, and GPU performance mode while a game is running, then reverts when it exits. No configuration needed — games that support GameMode integration (most Proton/Steam titles do automatically) just work.
- **Controller support** — `game-devices-udev` provides udev rules for 8BitDo, PlayStation (DS3/DS4/DualSense), Xbox, Nintendo Switch Pro/Joy-Cons, and most other controllers, so they're usable without manual permission fixes the moment they're plugged in.
- **RGB peripheral permissions** — udev rules (shipped via `shani-settings`) grant unprivileged device access for RGB keyboards, mice, headsets, and fans from major manufacturers. This only grants *permissions* — the RGB control app itself (OpenRGB) is not pre-installed; install it via Flatpak if you want it.
- **Racing wheel support** — `libratbag` (gaming mouse configuration backend) and kernel-level force-feedback support for Logitech, Thrustmaster, and Fanatec wheels are present; the GUI front-ends (Piper for mice, Oversteer for wheels) are part of the Plasma-only Flatpak set below.

```bash
# Check GameMode is active while a game is running
gamemoded -s

# List detected game controllers
ls /dev/input/js*
cat /proc/bus/input/devices | grep -A4 -i "joystick\|gamepad\|controller"
```

## KDE Plasma: Full Gaming Stack (Pre-Installed)

The Plasma edition preseeds a complete gaming stack as Flatpaks:

| App | Purpose |
|-----|---------|
| **Steam** | The primary game store/launcher; Proton (bundled) runs Windows games via Wine + DXVK/VKD3D |
| **Heroic Games Launcher** | Epic Games Store and GOG library management with Proton support |
| **Lutris** | Universal game launcher for Windows/Linux/emulated games from any source |
| **RetroArch** | Multi-system emulator frontend |
| **Bottles** | General-purpose Wine prefix manager for non-Steam Windows apps and games |
| **GOverlay** | GUI for MangoHud/vkBasalt performance overlay configuration |
| **Oversteer** | Racing wheel configuration GUI |
| **Piper** | Gaming mouse configuration GUI (libratbag front-end) |
| **AntiMicroX** | Map keyboard/mouse input to a virtual gamepad, or vice versa |

```bash
# Launch Steam (or from the app launcher)
flatpak run com.valvesoftware.Steam
```

## GNOME: Installing the Same Stack

None of the apps above are pre-installed on GNOME. Install what you need via Flatpak:

```bash
flatpak install flathub com.valvesoftware.Steam
flatpak install flathub com.heroicgameslauncher.hgl
flatpak install flathub net.lutris.Lutris
flatpak install flathub org.libretro.RetroArch
flatpak install flathub com.usebottles.bottles
```

GameMode, controller support, and racing wheel kernel support are already active regardless of edition — only the launcher/store apps differ.

## Proton & Windows Game Compatibility

Steam's Proton (Wine + DXVK/VKD3D-Vulkan, bundled with Steam) is the primary way to run Windows-only games. Enable it for all titles:

```
Steam → Settings → Compatibility → Enable Steam Play for all other titles
```

Check [ProtonDB](https://www.protondb.com) for per-game compatibility reports before buying a Windows-only title. For non-Steam Windows games and apps, use **Bottles** or **Lutris** instead — see [Bottles (Windows Compatibility)](bottles) for a dedicated walkthrough of Wine prefix management outside Steam.

## Performance Tools

**MangoHud** (FPS/frame-time/CPU/GPU overlay) is not pre-installed as a bare system package — on Plasma, **GOverlay** (pre-installed) is a GUI that installs and configures it for you; on GNOME, install MangoHud via Flatpak or Nix if you want it.

```bash
# Check current GPU driver and Vulkan support (both pre-installed via shani-tools-extra)
vulkaninfo --summary
glxinfo | grep "OpenGL renderer"
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Controller not detected | Check `ls /dev/input/js*`; unplug/replug; some Bluetooth controllers need pairing first — see [Bluetooth](../networking/bluetooth) |
| Game runs but GameMode isn't engaging | Confirm `gamemoded -s` shows an active client while the game runs; some games need `gamemoderun %command%` as a Steam launch option to opt in explicitly |
| Poor performance vs. Windows | Check `vulkaninfo --summary` confirms the right GPU/driver is in use, especially on hybrid (laptop) graphics — see [Hardware](../system/hardware) for `switcheroo-control` |
| Proton game won't launch | Try a different Proton version (Steam → game Properties → Compatibility); check [ProtonDB](https://www.protondb.com) for known workarounds |
| RGB lighting not controllable | The udev *permissions* are pre-installed but OpenRGB itself is not — install it via Flatpak |

## See Also

- [Bottles (Windows Compatibility)](bottles) — detailed Wine prefix management
- [Hardware](../system/hardware) — GPU drivers, hybrid graphics (`switcheroo-control`)
- [What's Included](../intro/whats-included) — full controller/RGB/wheel hardware list
