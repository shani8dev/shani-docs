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


def shipped_units() -> set[str]:
    """Every unit file any repo in the workspace carries."""
    found = set()
    for repo in WORKSPACE.iterdir():
        if not repo.is_dir() or repo.name.startswith('.'):
            continue
        for f in repo.rglob("*"):
            if f.suffix in (".service", ".timer", ".socket", ".path") \
                    and ".git" not in f.parts:
                found.add(f.name)
    return found


def enabled_units() -> set[str]:
    """Every unit an install-time script turns on."""
    found = set()
    roots = list(WORKSPACE.glob("shani-pkgbuilds/*/*.install"))
    roots += list((WORKSPACE / "shani-settings").rglob("*.sh"))
    roots += list((WORKSPACE / "shani-install-media" /
                   "image_profiles").rglob("*.sh"))
    for f in roots:
        try:
            text = f.read_text()
        except OSError:
            continue
        for m in re.finditer(
                r"systemctl (?:--user )?enable(?: --now)?\s+([A-Za-z0-9_.@-]+)",
                text):
            found.add(m.group(1))
    return found


BININDEX = REPO / "tests" / "bin-index.tsv"

# Shell syntax and builtins, which are not files anywhere. Also the words that
# lead a pipeline without being the command being run.
SHELL_WORDS = frozenset({
    "sudo", "doas", "env", "command", "builtin", "exec", "eval", "time",
    "if", "then", "else", "elif", "fi", "for", "while", "until", "do", "done",
    "case", "esac", "function", "in", "return", "exit", "set", "unset",
    "shift", "trap", "source", ".", ":", "!", "[", "]]", "[[", "true", "false",
    "test", "read", "printf", "echo", "cd", "pwd", "which", "type", "hash",
    "export", "local", "declare", "readonly", "alias", "unalias", "wait",
    "jobs", "bg", "fg", "disown", "umask", "ulimit", "times", "help",
    "let", "getopts", "mapfile", "readarray", "caller", "pushd", "popd",
    "dirs", "suspend", "logout", "history", "bind", "complete", "enable",
    "fc", "hash", "type", "ulimit", "wait", "kill", "nice", "nohup", "trap",
})
# Our own programs, installed from shani-pkgbuilds and so not in the cache.
OUR_TOOLS = frozenset({
    "shani-deploy", "shani-health", "shani-reset", "gen-efi", "shani-fleet-agent",
    "shani-cassini", "shani-backup", "shani-chronoa", "adduser", "orin",
    "shani-user-setup", "shani-deploy-notify", "btrfs-scrub", "btrfs-balance",
})


def binindex() -> set[str] | None:
    if not BININDEX.exists():
        return None
    found = set()
    for line in BININDEX.read_text().splitlines():
        if line.startswith("#") or "\t" not in line:
            continue
        found.add(line.split("\t", 1)[0])
    return found or None


# A command word: lowercase-ish, no assignment, no punctuation that marks an
# ini key, a path, a shell operator or a keystroke. `[Service]`, `Restart=always`,
# `Ctrl+B`, `~/.config/...` and `VER="${DATE:0:4}..."` all fail this, which is the
# point - the first version of this check reported all five as missing tools.
COMMAND_WORD = re.compile(r"^[a-z][a-z0-9._+-]{1,30}$")
# Words that are module names, modprobe.d directives or unit-file keys rather
# than tools. `blacklist`, `install` and the like appear as bare words in the
# config examples this corpus is full of.
CONFIG_KEYWORDS = frozenset({
    "blacklist", "install", "options", "alias", "remove", "softdep",
    "kvm", "kvm_intel", "kvm_amd", "vhost_net", "vhost_vsock", "kvm_hv",
    "options", "defaults", "conf", "log", "logind", "swap", "cpu",
})


def binindex() -> set[str] | None:
    if not BININDEX.exists():
        return None
    found = set()
    for line in BININDEX.read_text().splitlines():
        if line.startswith("#") or "\t" not in line:
            continue
        found.add(line.split("\t", 1)[0])
    return found or None


def check_commands(advisory: list[str]) -> int:
    r"""ADVISORY ONLY - reports, never fails. See the docstring.

    Every tool the docs tell a user to run must exist in the image.

    **This is the check whose absence produced three wrong corrections.** The
    rule we got wrong was "no PKGBUILD depends on it and no profile lists it",
    which proves a package is not a *listed dependency* - not that nothing
    provides the binary. `zramctl` looked absent that way and is provided by
    util-linux. The build-cache index answers the actual question, and
    `tests/build-binindex.py` regenerates it from the cache.

    Scoped to the first word of a command inside a ```bash block. Prose is
    skipped (it is mostly prose) and lines that are comments, ini keys, section
    headers, assignments, paths, heredoc bodies and shell operators are not
    commands at all.

    **Why this is advisory and not a gate.** A line-based scan cannot tell a
    whole command from a subcommand, and this corpus is full of the latter:
    `bluetoothctl power on` written across lines starts with `power`, and
    `kadmin.local addprinc` starts with a bare subcommand. That produced 1348
    findings of which perhaps a dozen were real - so the check found six genuine
    problems (notably `lastlog`, which util-linux 2.42 renamed to `lastlog2`)
    and then drowned them. A gate that cries wolf 1348 times is a gate nobody
    reads, so this reports and continues; **the index beside it
    (`tests/bin-index.tsv`) is the part to query** when you want to know whether
    a tool exists, and it is exact.
    """
    tools = binindex()
    if tools is None:
        return 0
    hits = 0
    for md in sorted(DOCS.rglob("*.md")):
        text = md.read_text()
        rel = md.relative_to(REPO)
        # `finditer`, not `find`: a page with several bash blocks needs each
        # block's own offset. Using `text.index(block)` gave every block after
        # the first the first block's line numbers, so the findings pointed at
        # unrelated lines - `smartctl` and `nvme` are in the cache, and the
        # report was naming them.
        for bm in re.finditer(r"```bash\n(.*?)```", text, re.S):
            block = bm.group(1)
            # +1: `bm.start()` is the fence itself, so count("\n") gives the
            # line the fence is on, and the first line of content is the next.
            line_no = text[:bm.start()].count("\n") + 1
            previous_continued = False
            # The whole run of comment lines above a command, not just the
            # last one: a note is often two or three lines long ("debootstrap
            # is not in the image - it is Debian's tool, so this only / applies
            # to a Debian host"), and looking at one line reported a command
            # the reader had been told about directly above.
            disclosures = ""
            # A comment run at the *top* of a block is a note about the whole
            # block, so it applies to every command in it - blank lines do not
            # end it. Without this, a note above the first command excused only
            # that one and the check reported the other eight.
            block_note = ""
            heredoc = None
            for raw in block.splitlines():
                line_no += 1
                cmd = raw.strip()
                # Between `cat > file << 'EOF'` and the terminator the lines
                # are the *content of a config file*, not commands -
                # `context.properties = {` in audio.md's samplerate example.
                if heredoc is not None:
                    if cmd == heredoc:
                        heredoc = None
                    continue
                m = re.search(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?\s*$", cmd)
                if m:
                    heredoc = m.group(1)
                    previous_continued = False
                    continue
                if not cmd:
                    previous_continued = False
                    if block_note:
                        disclosures = block_note
                    continue
                if cmd.startswith("#"):
                    previous_continued = False
                    disclosures += " " + cmd
                    if not block_note:
                        block_note = disclosures
                    continue
                # A continuation of the previous command is not a command: a
                # wrapped `restic forget --keep-daily ...` has a line that
                # begins `log`, which is not a tool being run.
                if previous_continued:
                    previous_continued = cmd.endswith("\\")
                    continue
                previous_continued = cmd.endswith("\\")
                for prefix in ("sudo ", "doas ", "env ", "time "):
                    if cmd.startswith(prefix):
                        cmd = cmd[len(prefix):].strip()
                word = cmd.split()[0] if cmd.split() else ""
                skip = (
                    not COMMAND_WORD.match(word)
                    or re.match(r"^[A-Za-z][\w.]*=", cmd)   # an ini key
                    or word in SHELL_WORDS
                    or word in OUR_TOOLS
                    or word in CONFIG_KEYWORDS
                    or word in tools
                    or word.endswith((".sh", ".py"))
                    or re.search(r"(script|command|example|placeholder|todo)$",
                                 word)
                )
                if not skip:
                    # A command whose surrounding comments say it is not
                    # shipped is not a defect: `intel_gpu_top  # requires
                    # intel-gpu-tools (not pre-installed)` tells the reader
                    # exactly that, and the disclosure is often several comment
                    # lines long, so the whole run above it counts.
                    nearby = f"{block_note} {disclosures} {cmd}"
                    disclosed = re.search(
                        r"not pre-?installed|is not installed|"
                        r"not available|not in the image|not shipped|"
                        r"not on the host|container-side|runs inside|"
                        r"inside the container|in the container|"
                        r"requires? `?" + re.escape(word), nearby, re.I)
                    if not disclosed:
                        advisory.append(
                            f"{rel}:{line_no}: `{word}` is not in the build "
                            f"cache")
                        hits += 1
    return hits


def check_units(bad: list[str]) -> int:
    """A `shani-*` unit the docs name must actually exist.

    Scoped deliberately, after a wider version produced only false positives.
    Checking every unit name cannot work here: a third-party unit is invisible
    (the workspace shows units *our* packages carry, so `sshd.service` looks
    unknown until you list openssh from the pacman cache - which is how we know
    `config.md`'s `systemctl enable --now sshd` is correct), a page teaching
    unit authoring names units the reader is to create, and a unit's name need
    not match its package's (`openssh` -> `sshd.service`).

    What *is* precise is the class this catches: a doc claiming a Shanios unit
    that does not exist. Those names are ours, we enumerate them exactly, and
    there is no legitimate exception - so a wrong one is a real bug and a right
    one is silent.
    """
    ours = shipped_units() | enabled_units()
    # Units we ship under names that are not `shani-*`, so they are recognised
    # as ours when a doc names them.
    ours_prefixes = ("shani-", "mark-boot-", "bless-boot", "check-boot-failure",
                     "beesd-setup")
    if not ours:
        return 0
    pattern = re.compile(
        r"systemctl\s+(?:--user\s+)?(?:enable|start)"
        r"(?:\s+-{1,2}[\w-]+)*\s+"
        r"([A-Za-z0-9_.-]+(?:@[A-Za-z0-9_.-]*)?(?:\.(?:service|timer|socket|path))?)")
    hits = 0
    for md in sorted(DOCS.rglob("*.md")):
        text = md.read_text()
        rel = md.relative_to(REPO)
        for line_no, line in enumerate(text.splitlines(), 1):
            m = pattern.search(line)
            if not m:
                continue
            unit = m.group(1)
            if not unit.startswith(ours_prefixes):
                continue
            if unit in ours:
                continue
            # A template instance of one we ship: `shani-boot-safety-failed@x`.
            if "@" in unit and unit.split("@")[0] + "@" in {
                    u.split("@")[0] + "@" for u in ours if "@" in u}:
                continue
            # A doc that *writes out* the unit a few lines up is teaching the
            # reader to create one, not claiming we ship it -
            # `shani-health-report.timer` in shani-health.md is shown in full,
            # with `Unit=shani-health-report.service` and `[Install]`, before
            # the `systemctl enable` that acts on it.
            stem = unit.split(".")[0]
            if re.search(rf"Unit=\s*{re.escape(stem)}\b", text) and \
                    "[Unit]" in text and "[Install]" in text:
                continue
            fail(bad, f"{rel}:{line_no}",
                 f"names `{unit}`, which no repo ships and no install script "
                 f"enables")
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
    advisory: list[str] = []
    n_scripts = check_flags(bad)
    n_subs = check_genefi_subcommands(bad)
    n_sl = check_selinux(bad)
    n_pkg = check_package_claims(bad)
    n_unit = check_units(bad)
    n_cmd = check_commands(advisory)
    carried = check_paths(bad)

    print(f"ground truth: {n_scripts} scripts, {n_subs} gen-efi subcommands, "
          f"{len(carried)} files carried by shani-settings, "
          f"{n_sl} SELinux occurrences outside comparison.md, "
          f"{n_pkg} wrong 'not shipped' claims, {n_unit} unbacked units, "
          f"{n_cmd} unrunnable commands")

    if advisory:
        print(f"\n{n_cmd} command(s) whose first word is not a package in the "
              f"build cache - ADVISORY, not a failure:")
        print("  Most are subcommands (`bluetoothctl power on` written across")
        print("  lines, `kadmin.local addprinc`) or container-side tools, which")
        print("  this line-based scan cannot tell apart. The ones it did find")
        print("  real are fixed; the rest need a human. First 40:")
        for a in advisory[:40]:
            print(f"  ~ {a}")
        print(f"  ... and {len(advisory) - 40} more")
    if bad:
        print(f"\n{len(bad)} claim(s) contradict the repos:\n")
        for b in bad:
            print(f"  - {b}")
        return 1
    print("every shani-deploy/health/reset flag, gen-efi subcommand, SELinux "
          "reference and shipped path the docs name exists")
    print("(the command scan above is advisory - see its docstring)")
    return 0


if __name__ == "__main__":
    sys.exit(main())