---
title: How Shanios Compares
section: Introduction
updated: 2026-08-28
---

# How Shanios Compares

Immutable, atomic-update Linux distributions share one idea: the running system is never modified in place. Updates land as a complete, verified image; rollback is a switch, not a repair. Beyond that shared core, each project takes a different route — different base distro, different update unit, different philosophy about where users install software.

This page positions Shanios honestly against the other mainstream options, including the cases where an alternative is the better choice. It is a positioning document, not marketing. Claims about other distributions describe their documented default behaviour and are kept deliberately conservative.

## Landscape Overview

| Project | Core mechanism | One-line summary |
|---------|----------------|------------------|
| Shanios | Full-image blue-green slot deploys via `shani-deploy` | Arch-fresh immutable desktop, zero-maintenance updates |
| Fedora Silverblue | ostree deployments (rpm-ostree / Fedora Atomic) | Upstream-supported GNOME workstation from Fedora |
| openSUSE MicroOS / Aeon | `transactional-update` + btrfs snapshots (snapper) | Rolling release with transaction-level snapshots |
| NixOS | Nix generations built from declarative config | Config-as-code; reproducibility of everything |
| VanillaOS | ABRoot A/B partitions | Debian-based A/B immutability |

## Big Table

| | Shanios | Fedora Silverblue | openSUSE MicroOS / Aeon | NixOS | VanillaOS |
|---|---|---|---|---|---|
| **Base distro** | Arch Linux | Fedora | openSUSE Tumbleweed | Independent (nixpkgs) | Debian |
| **Update unit** | Full image, blue-green slot deploy (`shani-deploy`) | ostree deployment (rpm-ostree / Fedora Atomic) | Transactional update + btrfs snapshot (snapper) | Nix generation (not image-based) | ABRoot A/B partition |
| **Desktop options** | GNOME + KDE Plasma (shipping); COSMIC (announced) + Server profile | GNOME-first; KDE via Kinoite spin | Aeon = GNOME desktop flavour; Kalpa = KDE; MicroOS = headless-first | Any desktop, declared in configuration | GNOME-first (KDE experimental) |
| **Extra package layers** | Flatpak primary + Nix + Distrobox/Podman + AppImage | Flatpak + toolbox containers; rpm-ostree layering discouraged | Flatpak + Distrobox/container workflows | Everything through nixpkgs; overlays and pins | Flatpak + `apx` container package manager |
| **Rollback model** | Instant slot switch (previous image always on disk) + automatic boot-failure fallback | Previous ostree deployment selectable at boot | snapper rollback to pre-update snapshot | Roll back to any prior generation at boot | Switch to inactive A/B partition at boot |
| **Config management** | `/etc` writable overlay persists across updates; system tree immutable | `/etc` persisted per-deployment; `/usr` read-only | `/etc` on overlay; snapshotted alongside transactions | Entire system state declared in config files | `/etc` managed through ABRoot transactions |
| **Security defaults** | Six LSMs incl. AppArmor, LUKS2 argon2id, TPM2 unlock, Secure Boot UKIs, GPG+SHA256 images | SELinux enforcing by default | Security modules configurable; signed transactions | Depends entirely on user configuration | Standard Debian hardening |
| **Learning curve** | Low for daily use | Low-medium | Medium | Steepest of the group | Low |
| **Telemetry** | None | Fedora opt-in data collection (disabled by default) | None notable | None | None |
| **Best for** | User-friendly immutable desktop, zero-maintenance updates, strong out-of-box security | Fedora ecosystem users wanting an upstream-supported GNOME workstation | Rolling release with mature snapshot tooling | Users who want reproducible config-as-code systems | Debian users wanting a simple A/B experience |

## Update Mechanics Compared

| Aspect | Shanios | Others |
|--------|---------|--------|
| What gets replaced | Whole root image, written to the inactive slot | Deployment tree, snapshot, generation, or partition depending on project |
| Verification before switch | GPG signature + SHA256 checksum mandatory | Varies; ostree and snapper verify differently |
| Failure handling | Automatic fallback to previous slot on failed boot | Manual rollback in most cases |
| Disk cost | Two full slots kept resident | One active tree plus deltas/snapshots/generations |

## Software Installation Model

Where applications come from on each system:

| System | Desktop apps | CLI tools | Dev environments |
|--------|-------------|-----------|------------------|
| Shanios | Flatpak (primary) | Nix, Distrobox | Distrobox/Podman containers |
| Silverblue | Flatpak | toolbox containers; rpm-ostree layering discouraged | toolbox |
| MicroOS / Aeon | Flatpak | Distrobox, zypper via transaction | Distrobox/containers |
| NixOS | nixpkgs (incl. desktop apps) | nixpkgs | nix-shell / flakes |
| VanillaOS | Flatpak, apx | apx containers | apx |

Shanios keeps the base image small and stable; user-chosen software lives in layers that survive every update and rollback untouched.

## Rollback in Practice

| Scenario | Shanios response |
|----------|------------------|
| Update deployed but not yet booted | Previous slot untouched; reboot switches forward |
| New slot fails to boot | Automatic fallback to previous slot |
| User wants to undo after booting | `sudo shani-deploy -r` from the kept slot |
| Manual choice at power-on | systemd-boot menu lists both slots |

The guarantee is simple: the previous working image is always resident on disk, so rollback never depends on re-downloading anything.

## Honest Strengths of Each Alternative

Every distribution below does something better than Shanios does today. If that thing matters to you, use that distribution.

### Fedora Silverblue

- Larger ecosystem and corporate backing (Red Hat); the most-tested immutable desktop upstream.
- rpm-ostree/Fedora Atomic is the reference implementation many others learn from.
- Tight integration with Fedora tooling: `toolbox`, mature SELinux policy, upstream-defined defaults.
- Predictable release cadence with long support windows per release.
- First-party KDE (Kinoite) and other spins maintained under the same Atomic umbrella.
- Extensive third-party documentation and community size; most problems are already solved somewhere.

### openSUSE MicroOS / Aeon

- snapper + `transactional-update` integration is the most mature snapshot workflow in Linux.
- True rolling release with automatic btrfs snapshots taken before every change.
- MicroOS is battle-proven as a container/host OS for Kubernetes clusters.
- Fine-grained rollback: revert individual transactions, not only whole images.
- Deep zypper/openSUSE tooling heritage for users already invested in that ecosystem.

### NixOS

- Reproducibility of configuration, not just packages: the entire system state is a buildable expression.
- Any package versions coexist side by side; multiple generations bootable from the boot menu.
- Enormous, current nixpkgs collection; overrides, pins, and per-project environments are precise.
- Ideal for fleets: one configuration file, many identical machines.
- Home Manager extends the same model to user-level dotfiles.
- The nix language can express conditional, parameterised setups no image-based system can match.

### VanillaOS

- Straightforward Debian base: broad familiarity and a huge documentation pool.
- `apx` makes containerized package installs approachable for newcomers.
- Clean, simple A/B partitioning story that is easy to explain and reason about.
- Debian's package archive and ABI stability carry over for container workloads.

## Where Shanios Differs

- **Arch freshness as a base** — current kernels, drivers, and desktop stacks without manual maintenance; freshness arrives through full-image deploys, not incremental package churn on a live system.
- **Multiple desktop editions from one pipeline** — GNOME and KDE Plasma ship through the same signed-image process today, with COSMIC built by the identical pipeline for its upcoming release, plus a headless Server profile. Most projects treat non-default desktops as secondary spins.
- **Security defaults out of the box** — six Linux Security Modules active simultaneously (AppArmor among them), LUKS2 argon2id full-disk encryption, TPM2 auto-unlock, Secure Boot with signed UKIs, and GPG+SHA256 verification of every image. Installed state, not post-install hardening.
- **Automatic boot-failure fallback** — a slot that fails to boot hands control back to the previous one without user intervention.
- **Zero telemetry** — no usage data, analytics, or crash reporting of any kind, ever. The codebase is public; every claim is verifiable.
- **Indian languages first-class** — nine Indic script families pre-configured with IBus input from first boot, not an afterthought in a language settings panel.

## Telemetry and Trust

| | Shanios | Notes on the others |
|---|---------|---------------------|
| Telemetry collected | None | Silverblue: opt-in Fedora countme, disabled by default; others: none notable |
| Update image verification | GPG + SHA256 mandatory per deploy | ostree verifies commits; snapper snapshots are local-state based |
| Build provenance | Public codebase; claims independently verifiable | Varies by project |

## When NOT to Choose Shanios

These are real reasons to pick something else:

- You need specific distro certifications or vendor support contracts tied to RHEL/openSUSE/Ubuntu lineage.
- You want declarative, config-as-code management of the whole system — choose NixOS.
- Your workflow depends on rpm/dnf ecosystem tooling or building custom RPM layers — Silverblue fits better.
- You rely heavily on out-of-tree kernel modules built via DKMS against a mutable kernel tree; immutable image bases make this painful everywhere, and Shanios offers no layering escape hatch.
- You need per-transaction snapshot granularity rather than whole-slot rollback — MicroOS/snapper handles that better.
- Your team standardises on Debian packaging internals — VanillaOS stays closer to that world.

None of these disqualify Shanios for general desktop use; they are workload boundaries. Choosing the right tool here is the point of this page.

## Migrating to Shanios

| Coming from | Start here |
|-------------|-----------|
| Windows | [Switching from Windows](switching-from-windows) |
| Another Linux distribution | [Migrating](migrating) |

## See Also

- [What is Shanios?](what-is-shanios)
- [What's Included](whats-included)
- [Switching from Windows](switching-from-windows)
- Blog: [Shanios vs Alternatives](https://blog.shani.dev/post/shani-os-vs-alternatives)
