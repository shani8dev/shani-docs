title: Bottles
section: Software & Apps
updated: 2026-04-01
---

# Bottles (Windows Compatibility)

**Bottles** is a powerful graphical tool for managing Windows applications on Linux using Wine. It provides a sandboxed environment ("Bottle") for each app, managing dependencies (DirectX, .NET, Fonts) automatically.

> **Installation**: Bottles is available via Flatpak.
> ```bash
> flatpak install flathub com.usebottles.bottles
> ```

## 🚀 Why Use Bottles?

- **Sandboxed**: Keeps Windows registry and files isolated from your system.
- **Dependency Management**: One-click installation of `dxvk`, `vcredist`, `dotnet`, etc.
- **Runners**: Supports multiple versions of Wine (Vanilla, GE-Proton, Soda) for maximum compatibility.
- **Gaming Ready**: Built-in support for FSR, DXVK, and VKD3D.

## 🛠 Creating a Bottle

1. Open **Bottles**.
2. Click **+ Create New Bottle**.
3. **Name** your bottle (e.g., "Office", "Games").
4. **Environment**:
   - **Application**: Optimized for productivity tools.
   - **Gaming**: Pre-configures DXVK and performance tweaks.
   - **Custom**: Blank slate.
5. Click **Create**.

## 📥 Installing Windows Software

### Method 1: Run Executable
1. Open your Bottle.
2. Click **Run Executable**.
3. Select your `setup.exe`.
4. Follow the Windows installer wizard.

### Method 2: Steam Integration
- If you have Steam installed, you can add "Non-Steam Games" and point them to the executable inside your Bottle for a unified gaming library.

## 🧩 Managing Dependencies

Inside a Bottle, go to the **Dependencies** tab.
- **Install**: `all`, `dotnet48`, `vcredist2019`, `corefonts`.
- This is the first step to fix crashes in Windows apps.

## 🎮 Gaming Tweaks

For best gaming performance:
1. Go to **Settings** → **Graphics**.
2. Enable **DXVK** (DirectX 9/10/11 to Vulkan).
3. Enable **VKD3D** (DirectX 12 to Vulkan).
4. Enable **FSR** for upscaling if your GPU supports it.

## 📂 Storage

Bottles run as a Flatpak.
- **Data Location**: `~/.var/app/com.usebottles.bottles/`
- **Bottle Drives**: Inside `data/bottles/bottles/`
- **Persistence**: This data resides in the user home subvolume and persists across OS updates and rollbacks.

## 🔧 Troubleshooting

- **App won't start**: Check the **Logs** tab. Often indicates a missing dependency (like .NET).
- **Graphics Glitches**: Try switching the **Runner** in Settings (e.g., from `Soda` to `GE-Proton`).
- **Sandboxing**: If an app needs access to other drives, go to **Settings** → **Sandbox** and disable it or add paths.
