---
title: Development Environments
section: Software & Apps
updated: 2026-08-28
---

# Development Environments

Shanios works as a daily development machine, but the workflow differs from a traditional distro: `/usr` is read-only and there is no package manager on the host. Toolchains, IDEs, and services live in runtime layers outside the root — update with `sudo shani-deploy`, roll back with `sudo shani-deploy -r`, check health with `shani-health`, and nothing about your projects, toolchains, or editor config moves.

## What Is Pre-Installed

Enough to be productive on first boot: git, python3, gcc toolchain basics, zsh/starship/fzf/mcfly, podman + buildah + skopeo, qemu-base/libvirt. Everything else installs into one of the four layers below — never into `/usr`.

## Choosing a Toolchain Strategy

| Layer | Best for | Install pattern |
|---|---|---|
| **Nix** | Reproducible CLI toolchains, per-project environments | `nix-env -iA nixpkgs.<pkg>`, `shell.nix`, flakes |
| **Distrobox** | Full mutable distro environments — apt/dnf/pacman inside | `distrobox create && distrobox enter` |
| **Flatpak** | GUI apps and IDEs | `flatpak install flathub <app>` — auto-updates every 12h |
| **Podman** | Services, databases, stacks | `podman run`, quadlets |

Rules of thumb: compiler pinned per project → Nix shell; apt/AUR packages with real system deps → Distrobox; GUI app → Flatpak; something listening on a port → rootless Podman.

## IDEs

VS Code and JetBrains IDEs are not pre-installed — install them as Flatpaks from Flathub:

```bash
flatpak install flathub org.visualstudio.code
flatpak search org.jetbrains
flatpak install flathub org.jetbrains.IntelliJ-IDEA-Community
```

VS Code sandbox notes:

- Host binaries are reachable via `flatpak-spawn --talk` helpers, or configure the integrated terminal to open a host terminal
- Extensions and settings persist under `~/.var/app/org.visualstudio.code/` in `@home` — they survive updates and rollbacks

Terminal editors ship pre-installed. When the sandbox does not fit, run the IDE outside it:

```bash
nix-env -iA nixpkgs.vscodium    # from the Nix profile

distrobox enter ubuntu-dev      # or a full IDE inside a container
distrobox-export --app code     # exported to GNOME Activities / KDE menu
```

## Language Toolchains

### Python

System `python3` handles scripts. Project environments belong in venv/poetry/uv setups created inside a Nix shell or Distrobox so versions never collide:

```bash
# Nix route — pins the exact pip version and pulls from nixpkgs
nix-shell -p python311 python311Packages.pip  

# Traditional venv inside @home (survives rollbacks)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Modern alternatives — uv is ~5x faster than pip
pip install uv
uv venv .venv && source .venv/bin/activate
uv pip install -r requirements.txt

# Poetry for dependency management
pip install poetry
poetry install --no-root

> 💡 **Shanios tip:** Always create venvs inside `~/venvs/` or project directories under `@home`. Never install packages system-wide via `pip install` — the immutable root cannot accept writes and it breaks reproducibility.
```

### Node.js

```bash
# nvm inside Distrobox (recommended for per-project version control)
distrobox enter ubuntu-dev
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 22
nvm use 22

# Nix route — installs node directly to your Nix profile
nix-env -iA nixpkgs.nodejs_22

# fnm (fast Node version manager) — single binary, no shell profile pollution
pip install fnm
fnm install 22
fnm use 22

# pnpm — recommended package manager for modern Node projects
curl -fsSL https://pnpm.io/install.sh | sh
pnpm install

> 💡 **Shanios tip:** nvm and fnm both store their data under `~/.nvm` or `~/.fnm` in `@home`, so they survive OS updates and rollbacks. Avoid `sudo npm install -g` — global installs under the read-only `/usr` are unreliable; use Distrobox or Nix for globally available tools.
```

### Rust

rustup lives entirely in your home directory and works unmodified — `~/.cargo` and `~/.rustup` are in `@home`:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh && rustup toolchain install stable
```

> 💡 **Shanios tip:** Rust toolchains are completely self-contained under `@home`. No host-package-manager steps needed. `rustup override set stable` in your shell profile makes it persist across Distrobox/Nix contexts.

### Java

The JDK is not pre-installed on Shanios — install it via one of these layers:

| Layer | Command | Shanios Pattern |
|-------|---------|-----------------|
| **Nix** | `nix-env -iA nixpkgs.openjdk_17` | Installs to Nix profile; `~/.java` in `@home`; survives rollbacks |
| **Distrobox** | `distrobox create --name java-dev --image ubuntu:24.04` then `apt install openjdk-17-jdk` | Full Ubuntu env with `apt`; `~/.java` in `@home`; good for AUR-prohibited setups |
| **SDKMAN** | `curl -s "https://get.sdkman.io" | bash && sdk install java 17` | Stores data under `~/.sdkman/candidates` in `@home`; single binary, no profile pollution |

> 💡 **Shanios tip:** Avoid `sudo apt install openjdk` on the host — `/usr` is read-only. Use Nix for reproducible CLI toolchains, Distrobox for full mutable environments, or SDKMAN for self-contained version management. All store user data under `@home` and survive OS updates.

### Go / C / C++

Use Nix shells so each project pins its own version — this avoids `PATH` conflicts between system and project toolchains:

```bash
nix-shell -p go gopkgcheck            # Go with go vet
nix-shell -p gcc                        # C compiler
nix-shell -p cmake                      # C/C++ build system
```

> 💡 **Shanios tip:** Nix shells provide ephemeral environments that disappear when you `exit`. Your `~/.cargo` and `~/.rustup` persist, but project-specific toolchains (Go modules, CMake toolchains) live inside the shell and don't pollute your host path.

### Per-Project Environments with shell.nix

Commit this next to your project — anyone with Nix gets the identical environment:

```nix
{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_22
    python311
    postgresql_16
  ];
}
```

```bash
cd ~/projects/myapp && nix-shell   # drops you into the pinned environment
```

## Language Toolchains Quick-Reference (July 2026)

| Language | Recommended Tool | Shanios Pattern |
|---|---|---|
| **Python** | `python3 -m venv .venv` | Create inside `~/venvs/` under `@home`; use `uv` or `pip` |
| **Python** | `poetry install` | Declarative `pyproject.toml`; locks reproduce exact env |
| **Node.js** | `nvm install 22` | Store `~/.nvm` in `@home`; works inside Distrobox |
| **Node.js** | `fnm install 22` | Single binary; no shell profile pollution |
| **Node.js** | `pnpm install` | Recommended PM; fast, disk-efficient |
| **Node.js** | `nix-env -iA nixpkgs.nodejs_22` | Installs to Nix profile; survives rollbacks |
| **Rust** | `rustup toolchain install stable` | `~/.cargo` / `~/.rustup` in `@home`; self-contained |
| **Rust** | `rustup override set stable` | Persists across Distrobox/Nix contexts |
| **Go** | `nix-shell -p go` | Ephemeral env; no PATH pollution |
| **Go** | `go mod init && go mod tidy` | Module-mode projects under `@home` |
| **C/C++** | `nix-shell -p cmake` | Build system; toolchain from Nix profile |
| **C/C++** | `gcc` / `cmake` | Project-local; no system-wide installs needed |
| **Java** | `nix-env -iA nixpkgs.openjdk_17` | Installs to Nix profile; `~/.java` in `@home`; survives rollbacks |
| **Java** | `sdk install java 17` | SDKMAN; `~/.sdkman` in `@home`; single binary, no profile pollution |
| **Java** | `distrobox create --name java-dev --image ubuntu:24.04` then `apt install openjdk-17-jdk` | Full Ubuntu env; `~/.java` in `@home`; good for AUR-prohibited setups |

---

### The Immutable Way

- **Never** `pip install` or `npm install -g` on the host — `/usr` is read-only
- **Always** use one of: Nix (`nix-env`, `nix-shell`), Distrobox (`distrobox create`), Flatpak (`flatpak install`), or Podman (`podman run`) for any tool beyond `python3`/`node` basics
- **Keep data in `@home`** — venvs, `.rustup`, `.cargo`, `~/.nvm` all survive updates and rollbacks
- **Snapshot before major toolchain changes**: `sudo btrfs subvolume snapshot / /snapshots/pre-toolchain-$(date +%s)`

---

## Distrobox Deep-Dive for Development

A complete mutable distro with your home directory shared by default:

```bash
# Create a dev box (--additional-flags passes options straight to Podman)
distrobox create --name ubuntu-dev --image ubuntu:24.04 \
  --additional-flags "--security-opt seccomp=unconfined"

distrobox enter ubuntu-dev
sudo apt install build-essential libssl-dev pkg-config

# Export GUI apps and binaries to the host
distrobox-export --app code
distrobox-export --bin /usr/bin/gcc
```

Inside the box: same `~` as the host, GPU/audio/Wayland forwarded, `host-spawn <cmd>` runs host commands. Container data lives in the `@containers` subvolume.

## Local Services and Dev Databases

Rootless Podman one-liners with named volumes:

```bash
# PostgreSQL
podman run -d --name dev-postgres -e POSTGRES_PASSWORD=dev \
  -v dev-pgdata:/var/lib/postgresql/data -p 127.0.0.1:5432:5432 postgres:16

# Redis
podman run -d --name dev-redis \
  -v dev-redis-data:/data -p 127.0.0.1:6379:6379 redis:7-alpine

# MySQL
podman run -d --name dev-mysql -e MYSQL_ROOT_PASSWORD=dev \
  -v dev-mysql-data:/var/lib/mysql -p 127.0.0.1:3306:3306 mysql:8
```

Multi-service stacks use `podman-compose` against any `docker-compose.yml`:

```bash
podman-compose up -d
podman-compose down
```

Auto-start a dev database at login with a quadlet — plain systemd, no daemon:

```ini
# ~/.config/containers/systemd/dev-postgres.container
[Container]
Image=docker.io/library/postgres:16
ContainerName=dev-postgres
Environment=POSTGRES_PASSWORD=dev
Volume=dev-pgdata:/var/lib/postgresql/data
PublishPort=127.0.0.1:5432:5432

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user start dev-postgres
```

## Dev Containers with Podman

VS Code Dev Containers work on top of Podman instead of Docker:

```bash
systemctl --user enable --now podman.socket     # enable the user socket once
echo $XDG_RUNTIME_DIR/podman/podman.sock        # /run/user/1000/podman/podman.sock
```

Point VS Code at Podman with `"dev.containers.dockerPath": "podman"` in `settings.json`, or export the socket for any Docker-API client: `export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/podman/podman.sock`. Then open a folder with `.devcontainer/devcontainer.json` and run **Dev Containers: Reopen in Container** — builds and execution happen entirely rootless.

## What You Cannot Do

Honest list:

- **No DKMS or out-of-tree kernel modules on the host.** Modules must match the exact running kernel; on an image-based immutable OS the kernel only changes through signed deploys, so ad-hoc module builds would break signature verification and rollback guarantees. Workaround: test kernels and modules in a VM — qemu-base and libvirt are pre-installed.
- **No global pacman packages.** There is no pacman on the host; package needs route through Nix, Flatpak, Distrobox, or Podman.
- **No installing system services directly.** Anything needing a boot-time systemd unit goes into the OS image upstream, or runs as a user-level container/quadlet.

```bash
virt-install --name kernel-test --memory 4096 --vcpus 2 --disk size=20 --cdrom shani-os.iso
```

## Persistence Model

Where everything lives, and what it survives:

| Location | Subvolume / mechanism | Survives updates | Survives rollback |
|---|---|---|---|
| `~` (user data, dotfiles, IDE extensions) | `@home` | Yes | Yes |
| `/etc` (writable overlay) | Overlay | Yes | Yes |
| Nix store | `@nix` | Yes | Yes |
| Podman/Distrobox storage | `@containers` | Yes | Yes |
| `/usr` (root filesystem) | Image slot | Replaced | Replaced |

Config in `@home` and `/etc` survives updates and rollbacks. Container storage persists across updates. Nothing under `/usr` survives anything — it is replaced wholesale by every `shani-deploy`, which is exactly why toolchains live outside it.

## See Also

- [Distrobox](distrobox) — full mutable distro environments
- [Nix Package Manager](nix) — reproducible toolchains and shells
- [Containers](containers) — Podman, compose, quadlets
- [Virtual Machines](vms) — kernel and driver testing
- [GPU Containers](gpu-containers) — CUDA/ROCm compute workflows
- [The Shanios Software Ecosystem](https://blog.shani.dev/post/shani-os-software-ecosystem) — when to use which layer
