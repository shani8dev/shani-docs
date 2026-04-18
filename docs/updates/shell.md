---
title: Shell & Environment
section: Updates & Config
updated: 2026-04-22
---

# Shell & Environment

Shanios ships a fully configured Zsh environment with modern UX features enabled out of the box. All shell configuration lives in your home directory and persists across every OS update and rollback.

## Default Shell Stack

| Tool | Role |
|------|------|
| **Zsh** | Default shell for all users |
| **Starship** | Cross-shell prompt with git, language runtime, exit-code, and timing info |
| **McFly** | Neural-network command history search (replaces Ctrl+R) |
| **FZF** | Fuzzy finder — integrated for Ctrl+T (files) and Alt+C (cd) |
| **zsh-syntax-highlighting** | Fish-style inline syntax colouring (green = valid, red = invalid) |
| **zsh-autosuggestions** | Ghost-text suggestions from history; press → or End to accept |
| **zsh-history-substring-search** | Up/Down arrow searches history by substring, not just prefix |
| **zsh-completions** | Tab completions for git, systemctl, podman, flatpak, nix-env, shani-deploy, and more |

Bash and Fish are also installed if you prefer them.

## Changing Your Shell

```bash
chsh -s /bin/bash    # switch to Bash
chsh -s /bin/fish    # switch to Fish
chsh -s /bin/zsh     # switch back to Zsh (default)
```

Log out and back in for the change to take effect.

## Customising Zsh

```bash
nano ~/.zshrc
source ~/.zshrc   # reload without restarting the shell
```

## Starship Prompt

Starship shows by default: current directory, git branch/status, active Python virtualenv, Node.js version (in Node projects), Rust toolchain version (when `Cargo.toml` is present), exit code of last command (when non-zero), and command duration for long-running commands.

```bash
nano ~/.config/starship.toml
starship help
```

## McFly History Search

McFly replaces `Ctrl+R` with a context-aware, exit-code-aware history search that learns from your usage patterns. Everything runs on-device — no data leaves your system.

```bash
# Press Ctrl+R to open McFly
# Type to filter; Enter to select; Ctrl+C to cancel

# McFly database location (grows more useful over time)
ls ~/.local/share/mcfly/
```

## FZF Integration

FZF is integrated into Zsh for three keybindings:

| Keybinding | Action |
|-----------|--------|
| `Ctrl+R` | History search (McFly takes precedence; FZF is fallback) |
| `Ctrl+T` | Fuzzy file finder — inserts selected path at cursor |
| `Alt+C` | Fuzzy `cd` — jump to any subdirectory |

```bash
# Use fzf in scripts
ls | fzf
fzf --preview 'cat {}'

# Select a git branch to checkout
git branch | fzf | xargs git checkout
```

## Pre-Installed CLI Tools

### File Search and Navigation

```bash
rg "search term"           # ripgrep — fast recursive search
rg --type py "import"      # search only Python files
fd "filename"              # fd — modern find replacement
fd -e py                   # find by extension
```

### File Viewing

```bash
bat file.py                # bat — cat with syntax highlighting
eza -la --git              # eza — modern ls with git status
```

### System Monitoring

```bash
htop                       # interactive process viewer
fastfetch                  # system information summary
ncdu                       # interactive disk usage analyser
```

### Text Processing

```bash
echo '{"key": "value"}' | jq .    # jq — JSON processor
```

### Compression

```bash
7z a archive.7z file.txt
tar xzf archive.tar.gz
unzip archive.zip
```

## Shell Configuration Files

```
~/.zshrc                     — Zsh configuration (plugins, aliases, env vars)
~/.bashrc                    — Bash configuration
~/.profile                   — login shell config (shared between shells)
~/.config/starship.toml      — Starship prompt configuration
~/.local/share/mcfly/        — McFly history database
~/.config/environment.d/     — session environment variables (Wayland/X)
```

All of these are in `@home` — never touched by OS updates or rollbacks.

## Environment Variables

```bash
# Shell-specific (Zsh)
nano ~/.zshrc
export EDITOR=vim
export PATH="$HOME/.local/bin:$PATH"

# Session environment (Wayland/X sessions)
# ~/.config/environment.d/my-vars.conf
EDITOR=nvim
MOZ_ENABLE_WAYLAND=1

# System-wide
sudo nano /etc/environment
```

## Nix Package Manager

Nix is pre-installed on the dedicated `@nix` subvolume. Install CLI tools without root — they survive all OS updates and rollbacks:

```bash
# Add channel (required before first install)
nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs
nix-channel --update

# Install packages
nix-env -iA nixpkgs.ripgrep
nix-env -iA nixpkgs.bat
nix-env -iA nixpkgs.lazygit
nix-env -iA nixpkgs.zoxide

# List installed
nix-env -q

# Upgrade all
nix-env -u '*'
```

## Tmux

Tmux is pre-installed:

```bash
tmux new -s work          # start named session
Ctrl+B then %             # split horizontally
Ctrl+B then "             # split vertically
Ctrl+B then D             # detach (session keeps running)
tmux ls                   # list sessions
tmux attach -t work       # reattach
```

Configuration lives in `~/.tmux.conf`.
