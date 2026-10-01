#!/usr/bin/env python3
"""Rebuild `tests/bin-index.tsv`: which package provides each binary.

**Why this exists.** Three separate survey passes concluded that `zramctl` was
not in the image, two of them on the strength of "zram-tools is in no PKGBUILD
and no profile". That proves only that it is not a *listed dependency* —
`util-linux` provides `/usr/bin/zramctl` and gets in by another route. Acting on
that narrower fact as though it were the answer put a false "this tool does not
exist" note into three docs pages.

The build cache settles the question outright: it is the set of package files
this image is actually built from, and a binary in one of them is in the image.

Run it when a dependency changes:

    python3 tests/build-binindex.py [--cache DIR]

With no `--cache` it uses
`../shani-install-media/cache/pacman_cache/pkg`. It writes
`tests/bin-index.tsv`, sorted and one tool per line, so the diff of that file is
the reviewable record of what moved.
"""

import argparse
import concurrent.futures
import os
import pathlib
import re
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_CACHE = (REPO.parent / "shani-install-media" / "cache" /
                 "pacman_cache" / "pkg")
OUT = REPO / "tests" / "bin-index.tsv"

# A binary is a file directly in bin/ or sbin/. Deliberately narrow: it excludes
# completions, man pages and library directories, which would triple the file
# for no extra signal.
BIN_PATH = re.compile(r"^(usr/)?s?bin/[A-Za-z0-9._+-]+$")


def listing(pkg: pathlib.Path) -> list[tuple[str, str]]:
    """(binary, package) pairs one cached package provides."""
    try:
        proc = subprocess.run(["zstd", "-dc", str(pkg)], capture_output=True,
                              timeout=300)
        if proc.returncode != 0:
            return []
        tar = subprocess.run(["tar", "-tf", "-"], input=proc.stdout,
                             capture_output=True, timeout=300)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return []
    name = pkg.name
    for suffix in (".pkg.tar.zst", ".pkg.tar.xz", ".pkg.tar.gz"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
            break
    pairs = []
    for raw in tar.stdout.decode("utf-8", "replace").splitlines():
        path = raw.strip()
        if BIN_PATH.match(path):
            pairs.append((path.rsplit("/", 1)[-1], name))
    return pairs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=str(DEFAULT_CACHE))
    args = ap.parse_args()

    cache = pathlib.Path(args.cache)
    if not cache.is_dir():
        print(f"no package cache at {cache}\n"
              f"(pass --cache, or mount "
              f"shani-install-media/cache/pacman_cache/pkg)", file=sys.stderr)
        return 1
    pkgs = sorted(cache.glob("*.pkg.tar.zst"))
    if not pkgs:
        print(f"no .pkg.tar.zst in {cache}", file=sys.stderr)
        return 1

    tools: dict[str, set[str]] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as pool:
        for pairs in pool.map(listing, pkgs):
            for binary, pkg in pairs:
                tools.setdefault(binary, set()).add(pkg)

    lines = [
        "# binary -> providing package, from the build cache. Regenerate with",
        "# tests/build-binindex.py; see the docstring there.",
        "# One line: <binary>\\t<package>[,<package>...]",
    ]
    for binary in sorted(tools):
        lines.append(f"{binary}\t{','.join(sorted(tools[binary]))}")
    OUT.write_text("\n".join(lines) + "\n")
    print(f"{len(pkgs)} packages -> {len(tools)} binaries -> {OUT.name} "
          f"({OUT.stat().st_size // 1024}K)")
    return 0


if __name__ == "__main__":
    sys.exit(main())