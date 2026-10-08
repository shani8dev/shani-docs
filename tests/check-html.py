#!/usr/bin/env python3
"""HTML validation + duplicate-title check for the GENERATED docs tree.

WHY THIS EXISTS
---------------
`node generate-manifest.js` guards nav<->file drift, and `tests/check-links.js`
checks that links resolve. Neither looked at whether the emitted HTML was
well-formed. It was not: the committed tree carried 45 html5lib parse errors
and 68 stray NUL bytes before 2026-10-05, in three classes that all reached
docs.shani.dev:

  * 32 literal `\\x00BLOCKnn\\x00` placeholders in
    doc/servers/kubernetes/security/index.html (plus 1 each in operations and
    workloads) - NUL bytes are invalid HTML and invisible to grep;
  * bare `&` and `<` in prose (`users & groups`, `shows disk < 30 GB`)
    reaching the served page unescaped;
  * emphasis delimiters mis-nesting across a code span.

It checks the GENERATED tree (`doc/**/index.html`, plus the root index and
404.html), because that is what the site actually serves - correct Markdown
producing broken HTML is still broken for the reader.

    python3 tests/check-html.py            # report + exit 1 on any problem
    python3 tests/check-html.py --quiet    # summary only
"""
import collections
import glob
import os
import re
import sys

import html5lib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUIET = "--quiet" in sys.argv

# A NUL, or any other C0 control character that is not tab/newline/carriage
# return, is invalid in HTML text. \\x00BLOCK\\x00 is the shape the markdown
# converter's code-block placeholder leaves behind when its substitution pass
# does not consume every marker.
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
TITLE_RE = re.compile(r"<title>(.*?)</title>", re.S)


def pages():
    found = sorted(glob.glob(os.path.join(ROOT, "doc", "**", "index.html"), recursive=True))
    for extra in ("index.html", "404.html"):
        p = os.path.join(ROOT, extra)
        if os.path.isfile(p):
            found.append(p)
    return found


def main():
    files = pages()
    if not files:
        print("check-html: no generated pages found - run `node generate-manifest.js` first",
              file=sys.stderr)
        return 1

    parse_problems = collections.defaultdict(list)
    control = []
    titles = collections.defaultdict(list)
    errored = 0

    for path in files:
        rel = os.path.relpath(path, ROOT)
        with open(path, encoding="utf-8") as fh:
            html = fh.read()

        for m in CONTROL_RE.finditer(html):
            control.append(f"{rel}: control character U+{ord(m.group()):04X} at offset {m.start()}")
        for t in TITLE_RE.findall(html):
            titles[re.sub(r"\s+", " ", t).strip()].append(rel)

        parser = html5lib.HTMLParser(strict=False)
        parser.parse(html)
        for err in parser.errors:
            # html5lib reports (position, code, data); keep the code + a place.
            pos = err[0]
            line = pos[0] if isinstance(pos, tuple) else pos
            code = str(err[1]) if len(err) > 1 else "unknown"
            parse_problems[code].append(f"{rel}:{line}")

    # A page with no <title> is its own SEO failure, and is also what a
    # duplicate-title check would silently pass by finding nothing.
    untitled = [os.path.relpath(p, ROOT) for p in files if not TITLE_RE.search(
        open(p, encoding="utf-8").read())]
    for t in untitled:
        print(f"NO TITLE  {t}")

    dupes = {t: ps for t, ps in titles.items() if len(ps) > 1}
    # 404.html is not an indexable page: it legitimately shares the site title,
    # and it is not in any sitemap. Holding it to a uniqueness rule the author
    # cannot satisfy without inventing a title nobody wants would make this
    # check a nuisance that gets disabled, which is worse than no check.
    real_dupes = {}
    for t, ps in dupes.items():
        # 404.html is not an indexable page (absent from every sitemap), so it
        # legitimately shares the site title. Holding it to a uniqueness rule
        # the author cannot satisfy would make this check a nuisance that gets
        # disabled, which is worse than no check at all.
        real = [p for p in ps if os.path.basename(p) != "404.html"]
        if len(real) > 1:
            real_dupes[t] = real
    dupes = real_dupes
    for t, ps in sorted(dupes.items()):
        print(f"DUPLICATE TITLE  {t!r}  ->  {', '.join(sorted(ps))}")

    for code, where in sorted(parse_problems.items()):
        errored += len(where)
        if not QUIET:
            for w in where[:10]:
                print(f"PARSE {code}  {w}")
            if len(where) > 10:
                print(f"  ... and {len(where) - 10} more ({code})")

    for c in control:
        print(f"CONTROL CHAR  {c}")

    print(f"\nchecked {len(files)} generated pages: "
          f"{len(titles)} distinct titles, "
          f"{errored} parse error(s), "
          f"{len(control)} control character(s), "
          f"{len(dupes)} duplicate title(s), "
          f"{len(untitled)} untitled")

    bad = errored or control or dupes or untitled
    if bad:
        print("\nHTML validation FAILED", file=sys.stderr)
        return 1
    print("no HTML validation problems")
    return 0


if __name__ == "__main__":
    sys.exit(main())