---
title: Homebrew
section: Software & Apps
updated: 2026-04-01
---

# Homebrew

Homebrew is an optional, user-space package manager that installs software under `/home/linuxbrew/`. It is useful if you are familiar with macOS tooling, need a package that is not in Nix, or want cross-platform consistency between macOS and Linux environments.

Homebrew is **not pre-installed** on Shanios — use Nix or Distrobox first. Install Homebrew only if you have a specific reason to.

## Installing Homebrew

```bash
# Install Homebrew (user-space, no root required)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Follow the post-install instructions to add brew to your PATH.
# For Zsh (default shell on Shanios), add to ~/.zshrc:
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"

# Reload shell
source ~/.zshrc
```

## Basic Usage

```bash
# Search for a package
brew search keyword

# Install a package
brew install package-name

# Install a GUI application (cask — limited on Linux)
brew install --cask app-name

# List installed packages
brew list

# Update Homebrew and all formulae definitions
brew update

# Upgrade installed packages
brew upgrade

# Upgrade a specific package
brew upgrade package-name

# Remove a package
brew uninstall package-name

# Check for issues with your Homebrew installation
brew doctor
```

## Storage

Homebrew installs everything under `/home/linuxbrew/`, which lives on the `@home` Btrfs subvolume. Installed packages persist across all system updates and rollbacks automatically.

## Homebrew vs Nix

| Consideration | Homebrew | Nix |
|---|---|---|
| Pre-installed | No | Yes |
| Package count | Large | Very large |
| Reproducibility | Lower | High |
| Multiple versions | Limited | Excellent |
| Rollback | Limited | Built-in |
| Recommended for | macOS familiarity | General CLI use |

For most cases on Shanios, **Nix is preferred** — it is pre-installed, supports multiple package versions simultaneously, and has built-in rollback. Use Homebrew only when a specific tool is not available in Nix or when cross-platform `brew` scripts are a requirement.
