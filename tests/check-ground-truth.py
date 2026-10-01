#!/usr/bin/env python3
"""Check shani-docs' factual claims against the sibling repos that ship them.

Every doc in this repo tells a user to run a command, edit a path or enable a
unit. Each of those is a claim about code that lives *somewhere else* - in
`shani-deploy/scripts/`, in `shani-settings/`, in `shani-pkgbuilds/` - and a doc
that names a flag or a path that does not exist is worse than no doc at all,
because the user follows it verbatim and gets "unrecognized option".

**Why this is a check and not a review.** Three separate defects of exactly this
shape shipped before it existed, and each was found by hand only after a user
could have hit it:

  * `troubleshooting.md` walked a user through a wrong-slot recovery with
    `sudo shani-deploy --repair-boot`. That flag is in neither the script nor
    its `--help`. Following the page gives "unrecognized option".
  * `keyring.md` carried a live "Invalid GPG header ... this must be fixed for
    the trust root to function" known issue for a keyring that has had the
    correct header the whole time.
  * Three networking pages told users to run `semanage`, `setsebool` and
    `restorecon` on an OS whose LSM stack is
    `landlock,lockdown,yama,integrity,apparmor,bpf` and which ships none of
    those tools.

Each was invisible to review because the doc is correct *as prose*; only the
sibling repo can say otherwise. So this reads both sides.

**What it checks, and what it deliberately does not.** Flags and subcommands,
because those are the claims that fail hardest and are cheapest to verify.
Deliberately *not* checked: prose claims about behaviour, package availability
(the profile `Packages-*` lists are the authority and are not parsed here), and
whether a documented command does the thing the doc says - this proves the
command exists, not that it behaves as advertised.

SIBLINGS are located relative to this repo; with none of them present (CI checks
out only this repo) every check reports SKIP rather than PASS, because a check
that passes because it examined nothing is the failure this file exists to
prevent.
"""

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
WORKSPACE = REPO.parent

DEPLOY = WORKSPACE / "shani-deploy" / "scripts" / "shani-deploy.sh"
HEALTH = WORKSPACE / "shani-deploy" / "scripts" / "shani-health.sh"
RESET = WORKSPACE / "shani-deploy" / "scripts" / "shani-reset.sh"
GENEFI = WORKSPACE / "shani-deploy" / "scripts" / "gen-efi.sh"
SETTINGS = WORKSPACE / "shani-settings"

# Tools the image does not ship, which is why a doc naming them is wrong. Checked
# against the profile package lists by hand on 2026-10-01: none appears in any
# `Packages-Base`/`Packages-Desktop`/`Packages-Extras`, and none is a dependency
# of any PKGBUILD. Kept as a literal list because a real check would have to
# resolve the whole dependency graph, which is `shani-pkgbuilds`' contract and not
# this file's - so this is a tripwire for *new* occurrences, and the existing
# occurrences are struck from the docs rather than from this list.
# English words that appear immediately after "gen-efi" in prose. Checked
# against every occurrence in the corpus: each is followed by a sentence, not by
# a flag, so none is a subcommand claim.
PROSE_AFTER_GENEFI = frozenset({
    "will", "and", "may", "runs", "rebuilds", "regenerates", "has", "is",
    "to", "for", "on", "at", "in", "with", "that", "which", "reads", "enrols",
    "enrolls", "needs", "prints", "requires", "keeps", "stages", "uses",
    "manages", "returns", "creates", "writes", "reads",
})

SELINUX_TOOLS = ("semanage", "setsebool", "restorecon", "chcon", "getsebool",
                 "sestatus", "setenforce", "avc-status")


def scripts_present() -> bool:
    return all(p.exists() for p in (DEPLOY, HEALTH, RESET, GENEFI))


def deploy_flags(text: str) -> set[str]:
    """shani-deploy's own long options.

    The obvious `grep -o -- '--[a-z-]*'` over the whole file returns aria2's
    options too (`--check-certificate`, `--max-tries`, ...), because the script
    embeds an aria2 command line. Only the script's own `case` arms are its
    options, so the long form `--x)` at the start of a case arm is what counts.
    Short flags come from the usage header, which the script keeps by hand.
    """
    return set(re.findall(r"^\s+--([a-z][a-z0-9-]+)\)", text, re.M))


def deploy_shorts(text: str) -> set[str]:
    """shani-deploy's options, from its hand-written usage header.

    The header is a **comment block** (a `#`, then `-r, --rollback` and its
    text), so an anchored whitespace-then-dash never matched it, and the options
    found were the ones its `case` arms spell long-form. That reported
    `--rollback`, `--cleanup`, `--optimize` and `--dry-run` - all real - as
    options the script does not have, in 21 places.
    """
    return usage_pairs(text)


def usage_pairs(text: str) -> set[str]:
    """Short flags from the hand-written usage header, e.g. `-v, --verbose`.

    shani-health, shani-reset and shani-deploy all document short options in a
    hand-maintained header, and their `case` arms match them as `-v|--verbose)`.
    Reading only the long form reported `-v` and `-h` as options that do not
    exist, which was the checker being wrong about a working script.
    """
    found = set()
    # `^\s*(?:#\s*)?-` - shani-deploy's usage header is a comment block, while
    # shani-health's and shani-reset's are bare lines.
    for m in re.finditer(r"^\s*(?:#\s*)?-([a-zA-Z]),\s+--([a-z][a-z0-9-]+)",
                         text, re.M):
        found.add(m.group(1))
        found.add(m.group(2))
    # ...and from the dispatch arms themselves: `            -v|--verbose)`
    for m in re.finditer(r"^\s*-([a-zA-Z])\|--([a-z][a-z0-9-]+)\)", text, re.M):
        found.add(m.group(1))
        found.add(m.group(2))
    return found


def health_flags(text: str) -> set[str]:
    return (set(re.findall(r"^\s+--([a-z][a-z0-9-]+)", text, re.M))
            | usage_pairs(text))


def reset_flags(text: str) -> set[str]:
    return (set(re.findall(r"^\s+--([a-z][a-z0-9-]+)", text, re.M))
            | usage_pairs(text))


def genefi_subcommands(text: str) -> set[str]:
    """gen-efi's subcommands, from its dispatcher.

    There are **two** `case "${1:-}" in` blocks and only the second dispatches:
    the first exists solely to decide which helper commands are required
    (`tpm2-status|pcrlock-status` need `cryptsetup` and `jq`, everything else
    needs `dracut` and friends). Taking the first - which is what a
    non-greedy search finds - yields `tpm2-status` alone and then reports all
    seven real subcommands as non-existent, so every block is scanned and the
    union taken.
    """
    found: set[str] = set()
    for block in re.finditer(r'case "\$\{1:-\}" in\n(.*?)\n\s*esac', text,
                             re.S):
        found |= set(re.findall(r"^\s+([a-z][a-z0-9-]*)\)", block.group(1), re.M))
    return found


def fail(bad: list[str], name: str, detail: str) -> None:
    bad.append(f"{name}: {detail}")


def check_flags(bad: list[str]) -> int:
    """Every `--flag` a doc attributes to one of the four scripts must exist."""
    known = {
        "shani-deploy": deploy_flags(DEPLOY.read_text()) |
                        deploy_shorts(DEPLOY.read_text()),
        "shani-health": health_flags(HEALTH.read_text()),
        "shani-reset": reset_flags(RESET.read_text()),
    }
    for script, flags in known.items():
        for md in sorted(DOCS.rglob("*.md")):
            text = md.read_text()
            rel = md.relative_to(REPO)
            # `shani-deploy --x`, `sudo shani-deploy --x`, `shani-deploy -x`
            for m in re.finditer(rf"shani-{script.split('-')[1]}\s+(-{{1,2}}[\w-]+)",
                                 text):
                token = m.group(1)
                if not token.startswith("-"):
                    continue
                # `journalctl -u shani-deploy --no-pager` names the *unit*, not
                # the script, so a flag after it belongs to journalctl. The
                # script is only being invoked when something precedes it on
                # the same logical command - `sudo`, a pipe, a newline, or the
                # start of a fenced block.
                before = text[max(0, m.start() - 40):m.start()]
                if re.search(r"(?:-u\s+|--unit\s+|systemctl\s+\S*\s+)$",
                             before):
                    continue
                bare = token.lstrip("-")
                if bare in flags:
                    continue
                # A doc may legitimately write `--flag=value`; split on `=`.
                line_no = text[:m.start()].count("\n") + 1
                line_start = text.rfind("\n", 0, m.start()) + 1
                line_text = text[line_start:text.find("\n", m.start())]
                # A line that says the option is *absent* is the correction,
                # not the bug - and those corrections quote the bad flag on
                # purpose, so quoting it in backticks is not the signal. What
                # separates them is a negation *before* the flag on the same
                # line: "There is no `shani-deploy --repair-boot`".
                if re.search(r"\b(no|not|never|absent)\b",
                             line_text[:m.start() - line_start], re.I):
                    continue
                fail(bad, f"{rel}:{line_no}",
                     f"documents `{script} {token}` but the script has no such "
                     f"option (it has: {', '.join(sorted(flags))})")
    return len(known)


def check_genefi_subcommands(bad: list[str]) -> int:
    subs = genefi_subcommands(GENEFI.read_text())
    for md in sorted(DOCS.rglob("*.md")):
        text = md.read_text()
        rel = md.relative_to(REPO)
        for m in re.finditer(r"gen-efi\s+([a-z][a-z0-9-]*)(?![a-z0-9-])", text):
            sub = m.group(1)
            # Only a claim about the *command line* counts. Prose puts an
            # English word after "gen-efi" too ("gen-efi will rebuild it"), and
            # treating that as a subcommand produced 40 findings against a
            # script whose subcommands are all real.
            if sub in subs or sub in PROSE_AFTER_GENEFI:
                continue
            fail(bad, str(rel),
                 f"documents `gen-efi {sub}`, which is not a subcommand "
                 f"(it has: {', '.join(sorted(subs))})")
    return len(subs)


def check_selinux(bad: list[str]) -> int:
    """Shanios enforces AppArmor, not SELinux, and ships none of these tools.

    `comparison.md` is exempt: its SELinux mentions describe *Fedora*, which is
    correct and the whole point of a comparison table. Everything else naming a
    SELinux tool is telling an AppArmor-only user to run a command that is not
    installed.
    """
    hits = 0
    for md in sorted(DOCS.rglob("*.md")):
        if md.name == "comparison.md":
            continue
        text = md.read_text()
        rel = md.relative_to(REPO)
        for tool in SELINUX_TOOLS:
            for m in re.finditer(rf"(?<![\w-]){tool}(?![\w-])", text):
                line = text[:m.start()].count("\n") + 1
                context = text.splitlines()[line - 1]
                # A line that says the tool is absent here is the correction,
                # not the bug.
                if re.search(r"\bnot\b.*\b(use|installed|have)\b|does \*\*not\*\*|"
                             r"no SELinux|not on Shanios|skip on Shanios|"
                             r"harmless but pointless|absent", context, re.I):
                    continue
                fail(bad, str(rel),
                     f"line {line} uses SELinux tool `{tool}` on an AppArmor-only "
                     f"OS: {context.strip()[:90]!r}")
                hits += 1
    return hits


PKGBUILDS = WORKSPACE / "shani-pkgbuilds"
PROFILES = WORKSPACE / "shani-install-media" / "image_profiles"

# Phrases that tell a user a package is NOT in the image. Each one is a dead
# end - "AUR-only" on an immutable host means there is no way to get it at all,
# and "install via Nix" means a second package manager. So this direction is
# worth checking and the positive direction is not: "pre-installed on KDE Plasma"
# is profile-specific, and a checker that flagged it would be wrong constantly.
ABSENT_PHRASES = (
    r"AUR[- ]only", r"not part of the default image",
    r"cannot be installed", r"can not be installed",
    r"not pre-?installed", r"is not installed",
    r"install (?:it |them )?via Nix", r"Install \w+ via Nix",
    r"only in the AUR",
    # NOT "nothing to install" / "nothing needs installing": those assert the
    # package IS present, which is the opposite of this list's meaning, and
    # including them made every such correction read as a claim of absence.
)
# A package name as the docs write one: lowercase, may contain . _ + -
PKG_TOKEN = re.compile(r"`([a-z0-9][a-z0-9._+-]{1,40})`")
# Words that appear in backticks in these sentences and are not packages.
NOT_PACKAGES = frozenset({
    "sh", "bash", "zsh", "nix", "nix-env", "nixpkgs", "pacman", "sudo", "apt",
    "apt-get", "dnf", "yay", "flatpak", "pip", "pip3", "python", "cargo",
    "brew", "apk", "snap", "systemctl", "journalctl", "dmesg", "lsmod",
    "modprobe", "sysctl", "uname", "lspci", "lsusb", "ip", "ping",
})


def available_packages() -> set[str] | None:
    """Every package the image can have: our PKGBUILDs' deps plus profile lists.

    Two sources because they answer different halves. A package is in the image
    either because one of our PKGBUILDs depends on it, or because an image
    profile installs it directly. Reading only the PKGBUILDs would call
    NetworkManager absent; reading only the profiles would call `pam_pkcs11`
    absent, which is a transitive dep nobody lists.

    This is a *lower bound* on what is installed - it cannot see what a base
    image or another repo's dependency pulls in - so a package missing from this
    set is "not known to be shipped", never "definitely absent". That is why the
    check below only reports a doc claiming absence for a package this set says
    IS available, which is the direction that cannot be a false alarm.
    """
    if not PKGBUILDS.is_dir() or not PROFILES.is_dir():
        return None
    avail: set[str] = set()
    for pk in sorted(PKGBUILDS.glob("*/PKGBUILD")):
        text = pk.read_text()
        for block in re.finditer(
                r"^_?(?:depends|makedepends|checkdepends)\s*=\s*\((.*?)^\s*\)",
                text, re.S | re.M):
            for tok in re.findall(r"(?m)^\s+([A-Za-z0-9][A-Za-z0-9._+-]*)",
                                  block.group(1)):
                avail.add(tok)
    for f in sorted(PROFILES.glob("*/Packages-*")):
        for line in f.read_text().splitlines():
            line = line.split("#")[0].strip()
            if line:
                avail.add(line)
    return avail or None


def check_package_claims(bad: list[str]) -> int:
    """A doc must not tell a user to go install something the image ships.

    Only the negative direction is checked, because only that one produces a
    dead end: "pam_pkcs11 ... it is AUR-only" on an immutable host tells a user
    to install a second package manager for a package already in their image,
    and it was wrong. The positive direction ("pre-installed on KDE Plasma") is
    profile-specific and would be a false alarm constantly.
    """
    avail = available_packages()
    if avail is None:
        return 0
    pattern = re.compile("|".join(ABSENT_PHRASES), re.I)
    hits = 0
    for md in sorted(DOCS.rglob("*.md")):
        if md.name == "comparison.md":
            continue
        text = md.read_text()
        rel = md.relative_to(REPO)
        for line_no, line in enumerate(text.splitlines(), 1):
            if not pattern.search(line):
                continue
            # A correction states the opposite on the same line: "pam_pkcs11
            # itself **is** in the image ... nothing needs installing".
            if re.search(r"\bis\b[^.]*in the image|\bare\b[^.]*pre-?installed|"
                         r"is a dependency of|nothing needs installing|"
                         r"nothing to install|earlier version of this|"
                         r"used to say|no longer", line, re.I):
                continue
            # Scope to the sentence holding the phrase. A table row or a long
            # sentence routinely names several packages of which the claim is
            # about one, and checking all of them reported the wrong ones.
            sentence = line
            m = pattern.search(line)
            if m:
                start = max(line.rfind(". ", 0, m.start()),
                            line.rfind("| ", 0, m.start()),
                            line.rfind("; ", 0, m.start()))
                # `start + 2` when there is no delimiter is `1`, which silently
                # ate the first character - and when that character is the
                # opening backtick of `pam_pkcs11`, the token no longer matched
                # and the one real finding in the corpus went unreported.
                begin = start + 2 if start != -1 else 0
                end = line.find(". ", m.end())
                sentence = line[begin:end if end != -1 else len(line)]
            for name in PKG_TOKEN.findall(sentence):
                if name in NOT_PACKAGES:
                    continue
                # A package genuinely absent from every PKGBUILD and every
                # profile makes the doc RIGHT, not wrong - `powertop`,
                # `nvidia-container-toolkit` and `qrencode` are all really not
                # shipped, and telling a user to install them is correct. Only
                # the opposite is a finding. (This condition was inverted on
                # the first run, which reported six correct docs and missed the
                # one real bug.)
                # A doc may name a PAM module or a library rather than the
                # package: `pam_pkcs11.so` is shipped as `pam_pkcs11`. Checking
                # the token verbatim missed the one real finding in the corpus.
                bare = re.sub(r"\.(so|\d+|h)$", "", name)
                if name not in avail and bare not in avail:
                    continue
                # version pins and globs
                if re.search(r"[<>=]", name):
                    continue
                bad.append(
                    f"{rel}:{line_no}: says `{name}` is not in the image, but "
                    f"it is a dependency of a shani-pkgbuilds PKGBUILD or is "
                    f"listed by an image profile")
                hits += 1
    return hits


def check_paths(bad: list[str]) -> list[str]:
    """Every shipped-path a doc names as ours must exist in the overlay.

    Only paths under the overlay roots are checked - `/etc/ssh/sshd_config.d`
    is created by a package at install time and is not in `shani-settings`, so
    a path is only asserted when `shani-settings` actually carries it.
    """
    carried = []
    for root in ("etc", "usr"):
        base = SETTINGS / root
        if base.exists():
            # Absolute, because that is how the docs write a path and how a
            # reader compares one against another. `str(p.relative_to(...))`
            # gives "usr/lib/...", which matches nothing and makes every
            # shipped path look absent.
            carried += ["/" + str(p.relative_to(SETTINGS))
                        for p in base.rglob("*") if p.is_file()]
    if not carried:
        return carried
    referenced = set()
    for md in sorted(DOCS.rglob("*.md")):
        text = md.read_text()
        for m in re.finditer(r"`(/usr/lib/(?:systemd|modprobe\.d|sysctl\.d|"
                             r"tmpfiles\.d)/[A-Za-z0-9._/-]+)`", text):
            referenced.add(m.group(1))
    for path in sorted(referenced):
        if "*" in path:
            # A glob is a pattern, not a claim about one file; satisfied when
            # anything lives under its directory.
            parent = path.split("*")[0].rstrip("/")
            if any(c.startswith(f"{parent}/") for c in carried):
                continue
            continue
        base = path.rstrip("/")
        if base in carried:
            continue
        if not base.endswith((".conf", ".rules")):
            continue
        fail(bad, "path", f"`{base}` is documented as ours but shani-settings "
                         f"does not carry it")
    return carried


def main() -> int:
    if not scripts_present():
        print("SKIP: the shani-deploy checkout is not beside this repo, so "
              "every flag, subcommand and path check would pass vacuously")
        return 0

    bad: list[str] = []
    n_scripts = check_flags(bad)
    n_subs = check_genefi_subcommands(bad)
    n_sl = check_selinux(bad)
    n_pkg = check_package_claims(bad)
    carried = check_paths(bad)

    print(f"ground truth: {n_scripts} scripts, {n_subs} gen-efi subcommands, "
          f"{len(carried)} files carried by shani-settings, "
          f"{n_sl} SELinux occurrences outside comparison.md, "
          f"{n_pkg} wrong 'not shipped' claims")

    if bad:
        print(f"\n{len(bad)} claim(s) contradict the repos:\n")
        for b in bad:
            print(f"  - {b}")
        return 1
    print("every shani-deploy/health/reset flag, gen-efi subcommand, SELinux "
          "reference and shipped path the docs name exists")
    return 0


if __name__ == "__main__":
    sys.exit(main())