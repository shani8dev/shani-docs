---
title: Shell & Environment
section: Updates & Config
updated: 2026-09-24
---

# Shell & Environment

Shanios ships a fully configured terminal environment: Zsh as the default shell, with Bash and Fish configured the same way, a Starship prompt, fuzzy history and file search, modern replacements for `ls`/`cat`/`find`/`grep`, and matching Saturn colours across the prompt, tmux and editors. Your shell configuration lives in your home directory and persists across every OS update and rollback.

## Default Shell Stack

| Tool | Role |
|------|------|
| **Zsh** | Default login shell for all users |
| **Starship** | Prompt: user, directory, git, language toolchain, with exit code and duration on the right |
| **McFly** | Context-aware command history search on `Ctrl+R` (Zsh, Bash and Fish) |
| **FZF** | Fuzzy file finder on `Ctrl+T`, fuzzy `cd` on `Alt+C`, with previews |
| **zoxide** | `z <part-of-dir>` jumps to directories you visit often; `zi` picks interactively |
| **eza** | `ls`, `ll`, `la`, `lt` with icons, git status and colours |
| **bat** | `cat` with syntax highlighting; also colours `man` pages |
| **fastfetch** | System summary with the Shanios logo when a terminal opens |
| **zsh-syntax-highlighting** | Fish-style inline syntax colouring (Zsh only) |
| **zsh-autosuggestions** | Ghost-text suggestions from history; press → or End to accept (Zsh only) |
| **zsh-history-substring-search** | Up/Down search history for any part of what you've typed (Zsh only) |

Zsh, Bash and Fish share one set of aliases, key bindings and tool integrations. The shared settings live in `/usr/share/shani/shell/common.sh` (Zsh and Bash) and `/usr/share/shani/shell/shani.fish` (Fish). Your own rc files (`~/.zshrc`, `~/.bashrc`, `~/.config/fish/config.fish`) source them, so fixes to the defaults arrive with system updates while your own additions stay yours. To opt out completely, delete the `source` line from your rc file.

## Terminal Emulator

The default terminal app differs by edition — all of them run the same shell stack above.

- **KDE Plasma:** **Konsole**, pre-installed, with the Saturn colour scheme and a translucent blurred background. It launches the shell named by the `shani.profile` terminal profile (`Command=` under `[General]`), which ships as **fish**; change that key to use a different shell in Konsole/Yakuake. Note this is *not* the same as your login shell: `chsh` changes `/etc/passwd`, so it affects Konsole only while the profile inherits `$SHELL`, and a `chsh`-based expectation does not hold now that the shell is pinned. **FiraMono Nerd Font** is the system fixed-width font, shared by Konsole, Yakuake, Kate and every other KDE app (*System Settings → Text & Fonts → Fixed width*). **Yakuake**, a drop-down terminal, is also pre-installed: press `F12` to toggle it from anywhere.
- **GNOME:** **GNOME Console**, pre-installed.
- **COSMIC:** **COSMIC Terminal**, pre-installed.

The prompt and `ls` icons are Nerd Font glyphs. Shanios ships **FiraMono Nerd Font** plus the Nerd Font symbols as a fallback for any monospace font. If you pick a different fixed-width font, choose a *Nerd Font* variant. Konsole (Qt) can't borrow the prompt's rounded separators from the fallback font.

## Welcome Screen (fastfetch)

Every new terminal starts with a `fastfetch` summary: the Shanios logo, OS, kernel, package counts (pacman, Flatpak, Snap, Nix, Homebrew, AppImage), desktop and theme, plus hardware, memory and disk usage. It is skipped in terminals smaller than 105×20 (split panes, a short Yakuake), in pipes and in scripts.

```bash
touch ~/.config/shani/no-fastfetch   # turn it off (all shells)
rm ~/.config/shani/no-fastfetch      # turn it back on
fastfetch                            # run it any time
```

The system-wide layout is `/etc/xdg/fastfetch/config.jsonc`. To customise it, copy it to `~/.config/fastfetch/config.jsonc` and edit the copy.

## Changing Your Shell

```bash
chsh -s /bin/bash    # switch to Bash
chsh -s /bin/fish    # switch to Fish
chsh -s /bin/zsh     # switch back to Zsh (default)
```

Log out and back in for the change to take effect. This sets your **login
shell**. On KDE Plasma, Konsole and Yakuake use the shell pinned in the
`shani.profile` terminal profile instead, so update that profile's `Command=`
under `[General]` as well if you want them to follow:

```bash
# ~/.local/share/konsole/shani.profile, [General]
# Command=/usr/bin/zsh
kwriteconfig6 --file ~/.local/share/konsole/shani.profile \
  --group General --key Command /usr/bin/zsh
```

## Customising Zsh

```bash
micro ~/.zshrc    # add your own settings at the end, under "Your own additions"
exec zsh          # reload
```

Useful built-in keys:

| Key | Action |
|-----|--------|
| `↑` / `↓` | Search history for what you've typed so far (any part of it) |
| `Ctrl+R` | McFly history search |
| `Ctrl+T` / `Alt+C` | FZF file picker / fuzzy `cd` |
| `Alt+S` | Put `sudo` in front of the current (or previous) command |
| `Ctrl+Z` | On an empty line, bring the suspended job back (`fg`) |
| `Ctrl+←` / `Ctrl+→` | Move by word |
| `Ctrl+Backspace` / `Ctrl+Delete` | Delete a word |

History holds 50,000 entries with timestamps. It is shared live between open terminals, and commands typed with a leading space stay out of it.

## Starship Prompt

The prompt is a two-line "pill" layout. The left side shows **♄ user**, the directory (truncated at the repo root), and the git branch and status. It also shows the active toolchain for the project you're in: Python, Node, Rust, Go, Java, containers, Nix shells and more. The right side appears only when relevant: how long the last command took (over 2 seconds), its exit status when it failed, background jobs, cached `sudo`, low battery, and the hostname over SSH. You type on the second line after `❯`.

```bash
micro ~/.config/starship.toml
starship explain      # what each part of the current prompt means
```

## McFly History Search

McFly replaces `Ctrl+R` with a context-aware history search that learns which commands you run where. Everything runs on-device — no data leaves your system.

```bash
# Press Ctrl+R to open McFly
# Type to filter; Enter to run, Tab to edit first; Esc to cancel
ls ~/.local/share/mcfly/     # the history database
```

Shipped settings (in the shared shell files):

```bash
MCFLY_FUZZY=2                 # fuzzy matching
MCFLY_RESULTS=25              # results shown
MCFLY_INTERFACE_VIEW=BOTTOM   # results anchored at the bottom
MCFLY_RESULTS_SORT=LAST_RUN   # most recently run first
```

Override any of them by exporting the variable in your rc file *before* the `source` line.

## FZF Integration

| Keybinding | Action |
|-----------|--------|
| `Ctrl+T` | Fuzzy file finder (uses `fd`, previews with `bat`) — inserts the path at the cursor |
| `Alt+C` | Fuzzy `cd` into any subdirectory (previews the tree with `eza`) |
| `**<Tab>` | Fuzzy completion in Zsh and Bash, e.g. `vim **<Tab>`, `cd **<Tab>`, `kill **<Tab>` |

`Ctrl+R` is McFly in every shell, not FZF.

```bash
git branch | fzf | xargs git checkout   # fzf works in pipelines too
```

## Pre-Installed CLI Tools

### Aliases and helpers

| Command | Runs |
|---------|------|
| `ls` `ll` `la` `lt` | eza: list / long with git status / all / tree (2 levels) |
| `cat` | `bat` without paging or decorations (`command bat` for the full view) |
| `z <dir>` / `zi` | zoxide jump / interactive jump |
| `mkcd <dir>` | create a directory and `cd` into it |
| `backup <file>` | timestamped copy (`file.bak.20260924-101500`) |
| `hw` | hardware summary (`inxi`, serial numbers masked) |
| `jctl` / `sctl` | this boot's errors / failed system and user units |
| `ports` | listening ports and the processes behind them |
| `tldr <cmd>` | short, example-first help pages (downloaded on first use) |

`cp`, `mv` and `ln` ask before overwriting in interactive shells. Aliases never apply inside scripts, so scripts behave normally.

### File search and navigation

```bash
rg "search term"           # ripgrep — fast recursive search, respects .gitignore
fd name                    # fd — fast find by name
plocate filename           # indexed filename search — see Storage
```

### System monitoring

```bash
htop                       # classic process viewer
fastfetch                  # system summary
ncdu                       # interactive disk usage
df -h                      # mounted filesystems
```

### Text processing and compression

```bash
echo '{"key": "value"}' | jq .
7z a archive.7z file.txt
tar -xvf archive.tar.zst     # tar auto-detects gz/xz/zst/bz2
unrar x archive.rar          # extraction only — RAR is proprietary
```

## Git

System-wide defaults live in `/etc/gitconfig`; anything in your `~/.gitconfig` overrides them.

- **delta** is the pager: syntax-highlighted diffs with line numbers. Press `n`/`N` to jump between files.
- Better merges and diffs: `zdiff3` conflict style, the histogram diff algorithm, moved-line detection, and `rerere` to remember conflict resolutions.
- New repositories start on `main`. `git push` sets up the upstream branch for you, and `fetch` prunes deleted branches.

| Alias | Does |
|-------|------|
| `git st` | short status with branch |
| `git lg` | coloured graph log |
| `git br` | branches with upstream and last commit |
| `git amend` | amend the last commit, same message |
| `git undo` | undo the last commit, keep the changes staged |
| `git unstage <file>` | unstage |
| `git wip` | commit everything as "WIP" |
| `git aliases` | list all aliases |

Set your identity once: `git config --global user.name "…"` and `git config --global user.email "…"`.

## Tmux

Tmux is pre-installed and configured system-wide in `/etc/tmux.conf`, with a Saturn status bar, mouse support, true colour and a 50,000-line history. Put your own settings in `~/.config/tmux/tmux.conf`; they load after the system file, so they override it.

```text
tmux new -s work              start a named session
Ctrl+B |    Ctrl+B -          split side-by-side / stacked (in the current directory)
Alt+←/→/↑/↓                   move between panes (no prefix needed)
Alt+1 … Alt+9                 switch windows (no prefix needed)
Ctrl+B h/j/k/l                move between panes, vim-style; H/J/K/L resize
Ctrl+B [   then v, y          copy mode: select, copy (reaches the desktop clipboard)
Ctrl+B S                      type into all panes at once (toggle)
Ctrl+B r                      reload the configuration
Ctrl+B d                      detach; `tmux attach -t work` to return
```

## Editors

- **micro** — the default `$EDITOR`/`$VISUAL`. Uses the Saturn colour scheme, `Ctrl+S`/`Ctrl+Q`/`Ctrl+C`/`Ctrl+V` like a desktop editor, and restores the cursor position and undo history when you reopen a file.
- **nano** — line numbers, mouse, syntax highlighting for 44 file types, and reopens files where you left off (`~/.config/nano/nanorc`).
- **vim** — Vim's own defaults plus line numbers, mouse and persistent undo (`~/.vimrc`). `"+y` copies to the desktop clipboard through the terminal (OSC 52), because Arch's vim has no built-in X/Wayland clipboard.

## Other Package Managers in the Shell

Shanios's root is read-only, so extra software comes from [Nix](../software/nix.md), [Flatpak](../software/flatpak.md), [Snap](../software/snaps.md), [Distrobox](../software/distrobox.md) or, optionally, [Homebrew](../software/homebrew.md). The shared shell files make sure their commands are on your `PATH` in every terminal, not only in login shells. This matters most for Fish, which never reads `/etc/profile.d`:

- **Nix** — `~/.nix-profile/bin` (after your first `nix-env -i`) and the default profile.
- **Snap** — `/var/lib/snapd/snap/bin`.
- **Flatpak** — exported app commands in `/var/lib/flatpak/exports/bin` and `~/.local/share/flatpak/exports/bin`.
- **Homebrew** — picked up automatically once installed, with no `brew shellenv` line to add.
- **`~/.local/bin`** — always first on `PATH`: `distrobox-export --bin` and tools like OpenCode install here.

**Inside a Distrobox container**, your home directory (and so your rc files) is shared with the host, but `/usr` is the container's. The rc files fall back to the host's copies under `/run/host`, so the same aliases, key bindings and Zsh plugins work inside containers. Tools that exist only on the host (Starship, eza, bat…) are skipped unless you install them in the container.

## Shell Configuration Files

```
~/.zshrc                     — Zsh (options, completion, keys, plugins, your additions)
~/.bashrc                    — Bash (created from ~/.bashrc_shani at first desktop login)
~/.config/fish/config.fish   — Fish
~/.inputrc                   — readline keys for Bash, Python, sqlite and others
~/.config/starship.toml      — prompt
~/.config/micro/  ~/.config/nano/nanorc  ~/.vimrc   — editors
~/.config/bat/  ~/.config/eza/theme.yml  ~/.config/tealdeer/
~/.local/share/mcfly/        — McFly history database
~/.config/environment.d/     — session environment variables (Wayland/X)

/usr/share/shani/shell/      — shared shell defaults (updated with the OS)
/etc/gitconfig  /etc/tmux.conf  /etc/xdg/fastfetch/config.jsonc   — system defaults
```

Everything under `~` is in `@home` — never touched by OS updates or rollbacks. The files under `/usr` and `/etc` are the system defaults, updated with the OS. Override them from your home directory (`~/.gitconfig`, `~/.config/tmux/tmux.conf`, `~/.config/fastfetch/`) rather than editing them in place.

## Environment Variables

Shanios sets these system-wide defaults in `/etc/environment.d/90-shani.conf`, read by systemd user sessions (not just login shells). They therefore apply to `sudoedit`, `visudo`, `crontab -e`, `systemctl edit` and anything else that uses `$EDITOR`:

```bash
EDITOR=micro
VISUAL=micro
SYSTEMD_LESS=FRXMK      # systemctl/journalctl pager: colours, no wrapping
```

Override per user rather than editing the drop-in, which lives on the read-only root:

```bash
# Session environment (Wayland/X sessions)
# ~/.config/environment.d/my-vars.conf
EDITOR=nvim

# Shell only: in ~/.zshrc
export EDITOR=vim
```

## Nix Package Manager

Nix is pre-installed on the dedicated `@nix` subvolume. Install CLI tools without root — they survive all OS updates and rollbacks, and appear on your `PATH` in every shell:

```bash
nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs
nix-channel --update

nix-env -iA nixpkgs.lazygit
nix-env -q          # list installed
nix-env -u '*'      # upgrade all
```

## See Also

- [System Config](config) — /etc overlay, locale, hostname, kernel parameters
- [Nix Package Manager](../software/nix.md) — Nix details and channel setup
- [Distrobox](../software/distrobox.md) — containers that share your home and shell config
- [Migrating from Traditional Linux](../intro/migrating.md) — shell workflow changes
- [What's Included](../intro/whats-included.md) — complete software stack
- [System Updates](system) — how updates affect your shell config
