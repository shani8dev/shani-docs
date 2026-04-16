---
title: Nix Package Manager
section: Software & Apps
updated: 2026-04-01
---

# Nix Package Manager

Nix is pre-installed on Shanios and is the recommended way to install CLI tools, language runtimes, and developer libraries. All Nix data lives in the dedicated `@nix` Btrfs subvolume mounted at `/nix`, which is shared across both `@blue` and `@green` slots — installed Nix packages survive all system updates and rollbacks.

`nix-daemon.socket` is enabled at boot. A channel must be added before installing packages for the first time.

## First-Time Setup

```bash
# Add the unstable channel (do this once after installation)
nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs
nix-channel --update
```

## Installing Packages

```bash
# Install a package into your profile
nix-env -iA nixpkgs.ripgrep
nix-env -iA nixpkgs.nodejs
nix-env -iA nixpkgs.python3

# Search for packages
nix search nixpkgs <keyword>

# Run a package without installing it (ephemeral shell)
nix shell nixpkgs#python3
nix shell nixpkgs#nodejs nixpkgs#yarn

# List installed packages
nix-env -q

# Upgrade all packages
nix-channel --update && nix-env -u '*'

# Remove a package
nix-env -e packagename

# Rollback to previous Nix profile generation
nix-env --rollback
```

## Python via Nix

```bash
# Install a Python package globally via Nix
nix-env -iA nixpkgs.python3Packages.requests
nix-env -iA nixpkgs.python3Packages.numpy

# Or use a temporary shell with specific Python packages
nix shell nixpkgs#python3 nixpkgs#python3Packages.flask
```

## Node.js via Nix

```bash
# Install Node.js and npm
nix-env -iA nixpkgs.nodejs

# Or a specific version
nix shell nixpkgs#nodejs_20
nix shell nixpkgs#nodejs_22
```

## Nix Flakes (Experimental)

```bash
# Enable flakes (add to ~/.config/nix/nix.conf)
# experimental-features = nix-command flakes

# Use a flake without installing
nix run nixpkgs#cowsay -- hello

# Enter a dev shell from a flake
nix develop

# Update flake inputs
nix flake update
```

## Tips

- Nix packages live in `/nix/store` — the `@nix` subvolume is preserved across every OS update and rollback
- Use `nix-env` for persistent installs; use `nix shell` for temporary/one-off usage
- Prefer `nix-env -iA nixpkgs.<package>` over `nix-env -i <package>` — the `-A` (attribute) form is faster and unambiguous
- The `@nix` subvolume has Copy-on-Write enabled so `bees` can deduplicate its content over time
- For complex development environments, consider using `nix shell` with a `shell.nix` or flake instead of polluting your global profile
