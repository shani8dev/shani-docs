#!/usr/bin/env node
// Link checker for the generated docs tree.
//
// WHY THIS EXISTS: generate-manifest.js already guards nav<->file drift
// (ORPHAN / PHANTOM), but nothing checked whether a link written in prose
// actually resolves. On 2026-09-25 that let 87 broken cross-links ship across
// 20 distinct targets in 51 files - every one of them a page or section that
// had been reorganised out from under the text that linked to it. All 87 were
// found by hand; this makes CI fail on the first one instead.
//
// It checks the GENERATED tree (doc/**/index.html), because that is what the
// site actually serves - a correct Markdown source with a broken static stub is
// still a 404 for the reader.
//
//   node tests/check-links.js          # report + exit 1 on any broken link
//   node tests/check-links.js --quiet  # only the summary
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOC_DIR = path.join(ROOT, 'doc');
const QUIET = process.argv.includes('--quiet');

/** Every generated page, as a repo-relative path. */
function pageFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) pageFiles(full, acc);
    else if (entry.name === 'index.html') acc.push(full);
  }
  return acc;
}

/** Slug ("system/cassini") -> absolute index.html path. */
function indexPages() {
  const map = new Map();
  for (const file of pageFiles(DOC_DIR)) {
    const slug = path.relative(DOC_DIR, file).replace(/[\\/]index\.html$/, '').replace(/[\\/]/g, '/');
    map.set(slug, file);
  }
  return map;
}

const problems = [];
const seen = new Set();

function report(file, text, href, why) {
  // One report per (target, reason): a nav sidebar links the same page from
  // every page, which would otherwise produce hundreds of identical lines.
  const key = `${file}|${href}|${why}`;
  if (seen.has(key)) return;
  seen.add(key);
  const rel = path.relative(ROOT, file);
  if (!QUIET) {
    const label = text ? `"${text}"` : '(no link text)';
    console.log(`BROKEN ${rel}: ${label} -> ${href}`);
    console.log(`       ${why}`);
  }
  problems.push({ file: rel, text, href, why });
}

function main() {
  if (!fs.existsSync(DOC_DIR)) {
    console.error('doc/ not found - run `node generate-manifest.js` first.');
    return 2;
  }

  const pages = indexPages();
  const files = pageFiles(DOC_DIR);

  // Every id in every page, so #fragment links can be resolved across pages.
  const idsBySlug = new Map();
  for (const [slug, file] of pages) {
    const ids = new Set();
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
    idsBySlug.set(slug, ids);
  }

  let checked = 0;

  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const href = m[1];
      const text = m[2].replace(/<[^>]+>/g, '').trim().slice(0, 60);

      // External, mailto, and pure-fragment links are out of scope.
      if (/^(https?:|mailto:|tel:|javascript:)/i.test(href)) continue;

      if (href.startsWith('#')) {
        // In-page anchor: only meaningful on the page it appears on.
        const slug = path.relative(DOC_DIR, file).replace(/[\\/]index\.html$/, '').replace(/[\\/]/g, '/');
        checked++;
        if (!idsBySlug.get(slug).has(href.slice(1))) {
          report(file, text, href, `no element with id="${href.slice(1)}" on this page`);
        }
        continue;
      }

      if (!href.startsWith('/doc/')) continue;
      checked++;

      const [pathPart, fragment] = href.split('#');
      const slug = pathPart.replace(/^\/doc\//, '').replace(/\/$/, '');

      // The docs root itself is a valid destination.
      if (slug === '') continue;

      if (!pages.has(slug)) {
        report(file, text, href, `no such page: doc/${slug}/index.html`);
        continue;
      }
      if (fragment && !idsBySlug.get(slug).has(fragment)) {
        report(file, text, href, `doc/${slug}/index.html has no id="${fragment}"`);
      }
    }
  }

  const targets = new Set();
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/href="(\/doc\/[^"]*)"/g)) targets.add(m[1]);
  }

  console.log(`checked ${checked} internal link(s) across ${files.length} pages ` +
              `(${targets.size} distinct targets, ${pages.size} pages exist)`);

  if (problems.length === 0) {
    console.log('no broken internal links');
    return 0;
  }
  console.error(`\n${problems.length} broken internal link(s) - see BROKEN lines above`);
  return 1;
}

process.exit(main());
