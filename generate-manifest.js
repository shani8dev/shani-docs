#!/usr/bin/env node
/**
 * generate-manifest.js
 * ────────────────────────────────────────────────────────────────
 * Shanios Docs — manifest generator
 * Generates docs/manifest.json, sitemap.xml, and manifest.json (PWA).
 * Mirrors the output of the GitHub Actions workflow (build-manifest.yml)
 * but runs on your local machine for offline/preview use.
 *
 * Usage:
 *   node generate-manifest.js
 *   node generate-manifest.js --watch     # re-run on every .md save
 *
 * Then start a local server:
 *   python3 -m http.server 8080
 *   # or: npx serve .
 *
 * Open: http://localhost:8080
 *
 * ── What it produces ─────────────────────────────────────────────
 *   docs/manifest.json   — slug + title + section index for all docs
 *                          (reserved for future full-text search; the
 *                           current engine builds its search index and
 *                           nav tree from nav-docs.js at runtime)
 *   sitemap.xml          — all doc URLs for SEO crawlers
 *                          (URLs use /docs/<slug> — the 404.html redirect
 *                           rewrites these to #doc/<slug> for the SPA)
 *   manifest.json        — PWA web app manifest (root)
 *
 * Config is sourced from config-docs.js (regex extraction, no require()).
 * ────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');

// ── Paths ─────────────────────────────────────────────────────────
const DOCS_DIR     = path.join(__dirname, 'docs');
const OUT_PATH     = path.join(DOCS_DIR, 'manifest.json');
const SITEMAP_PATH = path.join(__dirname, 'sitemap.xml');
const PWA_PATH     = path.join(__dirname, 'manifest.json');
const CONFIG_PATH  = path.join(__dirname, 'config-docs.js');
const WATCH_MODE   = process.argv.includes('--watch');

// ── Read config values from config-docs.js ────────────────────────
// config-docs.js is browser-only (no require/module.exports), so
// values are extracted with regex.
const configRaw = fs.existsSync(CONFIG_PATH)
  ? fs.readFileSync(CONFIG_PATH, 'utf8')
  : '';

function getConfig(key, fallback) {
  const m = configRaw.match(new RegExp(key + ":\\s*['\"`]([^'\"`]+)['\"`]"));
  return m ? m[1] : fallback;
}

// ── Config values (sourced from config-docs.js) ───────────────────
const WIKI_URL        = getConfig('WIKI_URL',        'https://wiki.shani.dev');
const SITE_TITLE      = getConfig('SITE_TITLE',      'Shanios Docs');
const SITE_DESC       = getConfig('SITE_DESCRIPTION','Technical documentation for Shanios.');
const LANG            = getConfig('LANG', getConfig('DATE_LOCALE', 'en-IN'));
const PWA_NAME        = getConfig('PWA_NAME',        SITE_TITLE);
const PWA_SHORT_NAME  = getConfig('PWA_SHORT_NAME',  'ShaniDocs');
const PWA_DESCRIPTION = getConfig('PWA_DESCRIPTION', SITE_DESC);
const PWA_THEME_COLOR = getConfig('PWA_THEME_COLOR', '#161514');
const PWA_BG_COLOR    = getConfig('PWA_BG_COLOR',    '#161514');
const PWA_ICON_URL    = getConfig('FAVICON_URL',     '/favicon.svg');

// ── Helpers ───────────────────────────────────────────────────────
function escXml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function slugToTitle(slug) {
  return slug.split('/').pop().split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Walk docs/ recursively, return relative slugs like 'intro/what-is-shanios'
function walkDocs(dir, base) {
  base = base || dir;
  const entries = [];
  if (!fs.existsSync(dir)) return entries;
  fs.readdirSync(dir).forEach(f => {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      entries.push(...walkDocs(full, base));
    } else if (f.endsWith('.md')) {
      const rel = path.relative(base, full).replace(/\\/g, '/');
      entries.push(rel);
    }
  });
  return entries;
}

// ── Build ─────────────────────────────────────────────────────────
function build() {
  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`\n  ✗ docs/ directory not found at: ${DOCS_DIR}\n`);
    process.exit(1);
  }

  const files = walkDocs(DOCS_DIR).sort();

  if (files.length === 0) {
    console.warn('\n  ⚠  No .md files found in docs/\n');
    fs.writeFileSync(OUT_PATH, '[]');
  } else {
    const docs = [];

    for (const file of files) {
      const raw  = fs.readFileSync(path.join(DOCS_DIR, file), 'utf8').replace(/^\uFEFF/, '');
      const slug = file.replace(/\.md$/, '');

      // Parse optional YAML front-matter
      const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
      const fm = {};
      if (fmMatch) {
        fmMatch[1].split(/\r?\n/).forEach(line => {
          const i = line.indexOf(':');
          if (i < 1) return;
          const k = line.slice(0, i).trim();
          const v = line.slice(i + 1).trim().replace(/^(['"`])([\s\S]*)\1$/, '$2');
          fm[k] = v;
        });
      }

      docs.push({
        slug,
        title:   fm.title   || slugToTitle(slug),
        updated: fm.updated || '',
        section: fm.section || '',
        draft:   fm.draft   === 'true',
      });

      console.log(`  [doc]  ${slug}`);
    }

    fs.writeFileSync(OUT_PATH, JSON.stringify(docs, null, 2));
    console.log(`\n  ✓ Written ${docs.length} doc(s) → docs/manifest.json`);

    // ── Generate sitemap.xml ──────────────────────────────────────
    // URLs use /docs/<slug> — the 404.html SPA redirect rewrites them
    // to the correct hash route (#doc/<slug>) for crawlers following links.
    const docUrls = docs
      .filter(d => !d.draft)
      .map(d => [
        '  <url>',
        `    <loc>${escXml(WIKI_URL)}/docs/${escXml(d.slug)}</loc>`,
        d.updated ? `    <lastmod>${escXml(d.updated)}</lastmod>` : null,
        `    <changefreq>monthly</changefreq>`,
        `    <priority>0.8</priority>`,
        '  </url>',
      ].filter(Boolean).join('\n'));

    const sitemapXml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      `  <url>\n    <loc>${escXml(WIKI_URL)}/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`,
      ...docUrls,
      '</urlset>',
    ].join('\n');
    fs.writeFileSync(SITEMAP_PATH, sitemapXml);
    console.log(`  ✓ Written sitemap.xml with ${docUrls.length + 1} URL(s)`);
  }

  // ── Generate manifest.json (PWA) — always written ────────────────
  const pwa = {
    name:             PWA_NAME,
    short_name:       PWA_SHORT_NAME,
    description:      PWA_DESCRIPTION,
    start_url:        '/',
    display:          'standalone',
    background_color: PWA_BG_COLOR,
    theme_color:      PWA_THEME_COLOR,
    lang:             LANG,
    icons: [
      { src: PWA_ICON_URL, sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
    ],
    categories: ['reference', 'technology'],
  };
  fs.writeFileSync(PWA_PATH, JSON.stringify(pwa, null, 2));
  console.log(`  ✓ Written manifest.json (PWA)\n`);
}

// ── Run ───────────────────────────────────────────────────────────
console.log(`\n  Shanios Docs — manifest generator\n`);
build();

if (WATCH_MODE) {
  console.log('  Watching docs/ for changes… (Ctrl+C to stop)\n');
  function watchDir(dir) {
    fs.watch(dir, { persistent: true }, (eventType, filename) => {
      if (!filename?.endsWith('.md')) return;
      console.log(`  → ${filename} changed, rebuilding…`);
      build();
    });
    fs.readdirSync(dir).forEach(f => {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) watchDir(full);
    });
  }
  if (fs.existsSync(DOCS_DIR)) watchDir(DOCS_DIR);
}
