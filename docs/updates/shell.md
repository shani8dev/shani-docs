---
title: Shell & Environment
section: Updates & Config
updated: 2026-04-01
---

# Shell & Environment

Shanios ships a fully configured Zsh environment with modern UX features enabled out of the box. All shell configuration lives in your home directory and persists across every OS update.

## Default Shell Stack

| Tool | Role |
|------|------|
| **Zsh 5.9** | Default shell for all users |
| **Starship** | Cross-shell prompt with git, language runtime, and exit-code info |
| **McFly** | Neural-network command history search (replaces Ctrl+R) |
| **FZF** | Fuzzy finder — integrated for Ctrl+R, Ctrl+T (files), Alt+C (cd) |
| **zsh-syntax-highlighting** | Fish-style inline syntax colouring |
| **zsh-autosuggestions** | Ghost-text suggestions from history |
| **zsh-history-substring-search** | Up/Down arrow searches history by prefix |

Bash 5.3 and Fish 4.5 are also installed if you prefer them.

## Changing Your Shell

```bash
# Switch to bash
chsh -s /bin/bash

# Switch to fish
chsh -s /usr/bin/fish

# Switch back to zsh
chsh -s /bin/zsh
```

Log out and back in for the change to take effect.

## Customising Zsh

Your Zsh config lives in `~/.zshrc` (and optionally `~/.zshenv`, `~/.zprofile`). The default `~/.zshrc` sources the plugins and sets up FZF and McFly — edit it freely.

```bash
# Edit your Zsh config
nano ~/.zshrc

# Reload without restarting the shell
source ~/.zshrc
```

## Starship Prompt

Starship configuration lives at `~/.config/starship.toml`. The default Shanios config shows: directory, git branch/status, language runtime versions, last exit code, and execution time.

```bash
# Edit prompt
nano ~/.config/starship.toml

# Starship documentation
starship help
```

## McFly History Search

McFly replaces `Ctrl+R` with a smarter history search that learns from your usage patterns.

```bash
# Press Ctrl+R to open McFly search
# Type to filter; Enter to select; Ctrl+C to cancel

# McFly database location
ls ~/.local/share/mcfly/

# Reset McFly history
mcfly search --delete "command to remove"
```

## FZF Integration

FZF is integrated into Zsh for three keybindings:

| Keybinding | Action |
|-----------|--------|
| `Ctrl+R` | History search (McFly takes precedence; FZF is fallback) |
| `Ctrl+T` | Fuzzy file/dir finder — inserts selected path at cursor |
| `Alt+C` | Fuzzy `cd` — jump to any subdirectory |

```bash
# Use fzf in scripts
selected=$(ls | fzf)

# Preview files while selecting
fzf --preview 'cat {}'
```

## Environment Variables

Set persistent environment variables in `~/.zshenv` (sourced for all Zsh invocations):

```bash
# ~/.zshenv
export EDITOR=nvim
export BROWSER=vivaldi
export XDG_DATA_HOME="$HOME/.local/share"
```

For session-only variables (Wayland/X sessions), use `~/.config/environment.d/`:

```bash
# ~/.config/environment.d/my-vars.conf
EDITOR=nvim
MOZ_ENABLE_WAYLAND=1
```

## Nix Package Manager

Nix is pre-installed on the dedicated `@nix` subvolume. Install CLI tools without root:

```bash
# Add channel (required before first install)
nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs
nix-channel --update

# Install a package (available immediately in PATH)
nix-env -iA nixpkgs.ripgrep
nix-env -iA nixpkgs.bat
nix-env -iA nixpkgs.fd

# List installed
nix-env -q

# Upgrade all
nix-env -u '*'

# Uninstall
nix-env -e ripgrep
```

Nix packages survive all OS updates and rollbacks because `@nix` is an independent subvolume.
