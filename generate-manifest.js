#!/usr/bin/env node
/**
 * generate-manifest.js
 * Shanios Docs — FULL generator (manifest + sitemap + PWA + drift check)
 *
 * Drift check compares every .md file in docs/ against CONFIG.NAV_TREE in
 * nav-docs.js and reports:
 *   • ORPHAN  — .md file exists but has no nav entry  (easy to forget)
 *   • PHANTOM — nav entry has no matching .md file     (broken link)
 *
 * Run:          node generate-manifest.js
 * Strict mode:  node generate-manifest.js --strict   (exit 1 on any drift)
 * Watch mode:   node generate-manifest.js --watch
 */

const fs   = require('fs');
const path = require('path');

// ── Paths ─────────────────────────────────────────────────────────
const DOCS_DIR     = path.join(__dirname, 'docs');
const OUT_PATH     = path.join(DOCS_DIR, 'manifest.json');
const SITEMAP_PATH = path.join(__dirname, 'sitemap.xml');
const PWA_PATH     = path.join(__dirname, 'manifest.json');
const NAV_PATH     = path.join(__dirname, 'nav-docs.js');
const CONFIG_PATH  = path.join(__dirname, 'config-docs.js');
const WATCH_MODE   = process.argv.includes('--watch');
const STRICT_MODE  = process.argv.includes('--strict');

// ── Read config ───────────────────────────────────────────────────
const configRaw = fs.existsSync(CONFIG_PATH)
  ? fs.readFileSync(CONFIG_PATH, 'utf8')
  : '';

function getConfig(key, fallback) {
  const m = configRaw.match(new RegExp(key + ":\\s*['\"`]([^'\"`]+)['\"`]"));
  return m ? m[1] : fallback;
}

// ── Config values ─────────────────────────────────────────────────
const WIKI_URL        = getConfig('WIKI_URL',        'https://docs.shani.dev');
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
  return String(s || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function slugToTitle(slug) {
  return slug.split('/').pop().split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function walkDocs(dir, base) {
  base = base || dir;
  let entries = [];
  if (!fs.existsSync(dir)) return entries;
  fs.readdirSync(dir).forEach(f => {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      entries = entries.concat(walkDocs(full, base));
    } else if (f.endsWith('.md')) {
      entries.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  });
  return entries;
}

// ── Extract all slugs from NAV_TREE in nav-docs.js ───────────────
// Parse statically — no eval, no require — so it works even if
// CONFIG is not available in this Node process.
function extractNavSlugs(navPath) {
  if (!fs.existsSync(navPath)) return null; // nav file absent → skip drift

  const src = fs.readFileSync(navPath, 'utf8');
  const slugs = new Set();

  // Match all  slug: 'some/value'  or  slug: "some/value"  occurrences
  const re = /\bslug\s*:\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    slugs.add(m[1]);
  }

  return slugs;
}

// ── Drift check ───────────────────────────────────────────────────
function checkDrift(docSlugs, navSlugs) {
  if (navSlugs === null) {
    console.warn('⚠  nav-docs.js not found — skipping drift check\n');
    return false;
  }

  const docSet = new Set(docSlugs);

  // Slugs in docs/ but missing from NAV_TREE
  const orphans = [...docSet].filter(s => !navSlugs.has(s));

  // Slugs in NAV_TREE but no matching .md file
  const phantoms = [...navSlugs].filter(s => !docSet.has(s));

  const hasDrift = orphans.length > 0 || phantoms.length > 0;

  if (!hasDrift) {
    console.log('✓ No drift — all docs are in nav, all nav entries have files\n');
    return false;
  }

  console.log('');

  if (orphans.length > 0) {
    console.log(`⚠  ORPHAN docs (${orphans.length}) — file exists but missing from nav-docs.js:`);
    orphans.sort().forEach(s => console.log(`     + ${s}`));
    console.log('');
  }

  if (phantoms.length > 0) {
    console.log(`⚠  PHANTOM nav entries (${phantoms.length}) — in nav-docs.js but no .md file:`);
    phantoms.sort().forEach(s => console.log(`     - ${s}`));
    console.log('');
  }

  return true;
}

// ── Build ─────────────────────────────────────────────────────────
function build() {
  console.log(`\n  Shanios Docs — generator\n`);

  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`✗ docs/ not found`);
    process.exit(1);
  }

  const files = walkDocs(DOCS_DIR).sort();
  const docs = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(DOCS_DIR, file), 'utf8').replace(/^\uFEFF/, '');
    const slug = file.replace(/\.md$/, '');

    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
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
      section: fm.section || 'Other',
      updated: fm.updated || '',
      order:   Number(fm.order || 999),
      draft:   fm.draft === 'true'
    });

    console.log(`  [doc] ${slug}`);
  }

  // ── Write docs manifest ─────────────────────────────────────────
  fs.writeFileSync(OUT_PATH, JSON.stringify(docs, null, 2));
  console.log(`✓ docs/manifest.json`);

  // ── Sitemap ─────────────────────────────────────────────────────
  const urls = docs.filter(d => !d.draft).map(d => `
  <url>
    <loc>${escXml(WIKI_URL)}/doc/${escXml(d.slug)}</loc>
    ${d.updated ? `<lastmod>${escXml(d.updated)}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escXml(WIKI_URL)}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  ${urls}
</urlset>`;

  fs.writeFileSync(SITEMAP_PATH, sitemap);
  console.log(`✓ sitemap.xml`);

  // ── PWA manifest ────────────────────────────────────────────────
  fs.writeFileSync(PWA_PATH, JSON.stringify({
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
    ]
  }, null, 2));
  console.log(`✓ manifest.json (PWA)`);

  // ── Drift check ─────────────────────────────────────────────────
  const docSlugs = docs.map(d => d.slug);
  const navSlugs = extractNavSlugs(NAV_PATH);
  const hasDrift = checkDrift(docSlugs, navSlugs);

  if (hasDrift && STRICT_MODE) {
    console.error('✗ Strict mode: drift detected — exiting with code 1\n');
    process.exit(1);
  }
}

// ── Run ───────────────────────────────────────────────────────────
build();

// ── Watch mode ────────────────────────────────────────────────────
if (WATCH_MODE) {
  console.log('Watching docs/ for changes...\n');

  function watch(dir) {
    fs.watch(dir, (e, f) => {
      if (f && f.endsWith('.md')) {
        console.log(`→ ${f} changed`);
        build();
      }
    });
    fs.readdirSync(dir).forEach(f => {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) watch(full);
    });
  }

  watch(DOCS_DIR);
}
