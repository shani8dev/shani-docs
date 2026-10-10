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

# One per element, counted by opening tag. `<h1 class="doc-title">` is the
# template's own; a second one is the duplicate this gates.
H1_RE = re.compile(r"<h1[\s>]")
# Both metas carry an id attribute between name and content in the generator
# (`<meta name="description" id="meta-desc"     content="...">`), so anything
# requiring name and content adjacent matches nothing.
DESCRIPTION_RE = re.compile(r'<meta\s+name="description"[^>]*content="([^"]*)"')


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

    h1s = collections.defaultdict(int)
    descriptions = collections.defaultdict(list)
    breadcrumb = []
    csp = []

    for path in files:
        rel = os.path.relpath(path, ROOT)
        with open(path, encoding="utf-8") as fh:
            html = fh.read()

        for m in CONTROL_RE.finditer(html):
            control.append(f"{rel}: control character U+{ord(m.group()):04X} at offset {m.start()}")

        h1s[rel] = len(H1_RE.findall(html))
        for d in DESCRIPTION_RE.findall(html):
            descriptions[re.sub(r"\s+", " ", d).strip()].append(rel)
        if "BreadcrumbList" in html:
            breadcrumb.append(rel)
        if "Content-Security-Policy" in html:
            csp.append(rel)
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

    # --- the corpus invariants -------------------------------------------
    #
    # 404.html is not an indexable page: it is absent from every sitemap, and it
    # has no parent to name, so holding it to the breadcrumb and description
    # rules would make this check a nuisance that gets disabled - the same
    # reasoning the duplicate-title check above already applies to it.
    # index.html is excluded too, but for its own reason: a breadcrumb on the
    # home page is "Home -> Home", a self-link nobody wants.
    # Match on the full relative path, NOT the basename: every doc stub is
    # `doc/<slug>/index.html`, so `basename(f) != "index.html"` discards all 204
    # of them and leaves the description and breadcrumb checks with nothing to
    # inspect - they then report 0 problems on an empty set, which is the
    # vacuous-check shape this session has now hit three times.
    rel = {f: os.path.relpath(f, ROOT) for f in files}
    indexable = [f for f in files
                 if rel[f] not in ("404.html", "index.html")]

    # A corpus invariant checked over nothing is the vacuous check this repo
    # keeps finding. Assert the set is populated, so a layout change fails
    # loudly instead of reporting 0 problems on an empty set.
    if not indexable:
        print("check-html: no indexable pages after exclusions - the stub "
              "layout changed; every stub is doc/<slug>/index.html, so match "
              "on the full relative path", file=sys.stderr)
        return 1

    multi_h1 = {r: n for r, n in h1s.items() if n > 1}
    for r, n in sorted(multi_h1.items()):
        print(f"DUPLICATE H1  {r} carries {n}")

    dupe_desc = {d: ps for d, ps in descriptions.items()
                 if len([q for q in ps if os.path.basename(q) != "404.html"]) > 1}
    for d, ps in sorted(dupe_desc.items()):
        print(f"DUPLICATE DESCRIPTION  {d[:70]!r} -> {', '.join(sorted(ps))}")
    no_desc = [f for f in indexable if not DESCRIPTION_RE.search(
        open(f, encoding="utf-8").read())]
    for f in no_desc:
        print(f"NO DESCRIPTION  {os.path.relpath(f, ROOT)}")

    no_crumb = [f for f in indexable if rel[f] not in set(breadcrumb)]
    for f in no_crumb:
        print(f"NO BREADCRUMBLIST  {os.path.relpath(f, ROOT)}")

    # `files` holds absolute paths and `csp` holds the relative ones from
    # the loop above; comparing one against the other reported all 206 pages
    # as missing CSP on a corpus where none is. Convert before comparing.
    no_csp = [f for f in files
              if os.path.relpath(f, ROOT) not in set(csp)]
    for f in no_csp:
        print(f"NO CSP  {os.path.relpath(f, ROOT)}")

    print(f"\nchecked {len(files)} generated pages: "
          f"{len(titles)} distinct titles, "
          f"{errored} parse error(s), "
          f"{len(control)} control character(s), "
          f"{len(dupes)} duplicate title(s), "
          f"{len(untitled)} untitled, "
          f"{len(multi_h1)} duplicate h1(s), "
          f"{len(dupe_desc)} shared description(s), "
          f"{len(no_desc)} without description, "
          f"{len(no_crumb)} without BreadcrumbList, "
          f"{len(no_csp)} without CSP")

    bad = (errored or control or dupes or untitled
           or multi_h1 or dupe_desc or no_desc or no_crumb or no_csp)
    if bad:
        print("\nHTML validation FAILED", file=sys.stderr)
        return 1
    print("no HTML validation problems")
    return 0


if __name__ == "__main__":
    sys.exit(main())