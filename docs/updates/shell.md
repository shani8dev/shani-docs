---
title: Shell & Environment
section: Updates & Config
updated: 2026-08-28
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

Bash and Fish are also installed if you prefer them — both ship with a Starship-enabled prompt and McFly history search in their skeleton config (`~/.bashrc_shani`, `~/.config/fish/config.fish`), though the Zsh-only plugins above (syntax highlighting, autosuggestions, history-substring-search) are not mirrored there.

## Terminal Emulator

The default terminal app differs by edition — both run the same shell stack above.

- **KDE Plasma:** **Konsole**, pre-installed. **Yakuake** (a drop-down/quake-style variant of Konsole) is also pre-installed — press `F12` to toggle it from anywhere.
- **GNOME:** **GNOME Console**, pre-installed.
- **COSMIC:** **COSMIC Terminal**, pre-installed.

Any terminal emulator you install separately (via Flatpak, Nix, etc.) uses the same Zsh config and prompt — the shell environment isn't tied to a specific terminal app.

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

Starship shows by default: current directory (truncated to the repo root), git branch/status, active Python virtualenv, Node.js version (in Node projects), Rust toolchain version (when `Cargo.toml` is present), exit code of last command (when non-zero), and command duration — the shipped config sets `min_time = 1` (millisecond), so the duration shows for almost every command, not just long-running ones.

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

Default configuration (set in `~/.zshrc`, and mirrored in `~/.bashrc_shani` / `~/.config/fish/config.fish`):

```bash
MCFLY_FUZZY=true              # fuzzy matching instead of exact substring
MCFLY_RESULTS=20              # number of results shown
MCFLY_INTERFACE_VIEW=BOTTOM   # results list anchored to the bottom of the screen
MCFLY_RESULTS_SORT=LAST_RUN   # most-recently-run commands surface first
```

Override any of these in your shell's rc file before the `mcfly init` line.

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

`ripgrep` (`rg`) is present on **KDE Plasma only**, pulled in transitively by KTextEditor's search-in-files feature (`ripgrep-all` depends on it) — not deliberately curated, and absent on GNOME. `fd` is **not pre-installed on either edition**. The standard POSIX tools always work:

```bash
grep -r "search term" .    # recursive text search
find . -name "filename"    # find by name
plocate filename           # indexed filename search — see Storage
```

For a consistent experience across editions, install both via Nix: `nix-env -iA nixpkgs.ripgrep nixpkgs.fd`.

### File Viewing

`bat` and `eza` (modern `cat`/`ls` alternatives) are also **not pre-installed** — only standard `cat`/`less`/`ls` are. Install via Nix if wanted: `nix-env -iA nixpkgs.bat nixpkgs.eza`.

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
unrar x archive.rar          # extract a RAR archive (extraction only — RAR is proprietary)
lrzip -o archive.lrz file    # long-range compression, best ratio on large/redundant files
lzop -o file.lzo file        # fast, low-ratio compression — optimised for speed over size
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

All of these are in `@home` — never touched by OS updates or rollbacks. The one exception is `/etc/environment.d/90-shani.conf` (sets the system-wide `EDITOR=micro` default) — it lives on the read-only root, so overriding it means setting the same variable in `~/.config/environment.d/` or your shell rc, not editing it in place.

## Environment Variables

Shanios sets one system-wide default out of the box: `EDITOR=micro`, via a drop-in at `/etc/environment.d/90-shani.conf`. This is read by systemd user sessions (not just login shells), so it applies to `sudoedit`, `visudo`, `crontab -e`, and any tool that shells out with `$EDITOR` set — override it per-user rather than editing the drop-in directly, since it lives on the read-only root and any local edit would be lost on the next OS update.

```bash
# Shell-specific (Zsh)
nano ~/.zshrc
export EDITOR=vim
export PATH="$HOME/.local/bin:$PATH"

# Session environment (Wayland/X sessions) — overrides the system-wide default
# ~/.config/environment.d/my-vars.conf
EDITOR=nvim
MOZ_ENABLE_WAYLAND=1

# System-wide (traditional PAM-read file, separate mechanism from environment.d)
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
Ctrl+B then %             # split vertically (panes side-by-side)
Ctrl+B then "             # split horizontally (panes stacked)
Ctrl+B then D             # detach (session keeps running)
tmux ls                   # list sessions
tmux attach -t work       # reattach
```

Configuration lives in `~/.tmux.conf`.

## See Also

- [System Config](config) — /etc overlay, locale, hostname, kernel parameters
- [Nix Package Manager](../software/nix.md) — Nix details and channel setup
- [Migrating from Traditional Linux](../intro/migrating.md) — shell workflow changes
- [What's Included](../intro/whats-included.md) — complete software stack
- [System Updates](system) — how updates affect your shell config
