#!/usr/bin/env node
/**
 * generate-manifest.js
 * Shanios Docs — FULL generator (manifest + sitemap + PWA + static stubs + drift check)
 *
 * What it does:
 *   docs/manifest.json        — metadata index for every .md doc (no bodies)
 *   sitemap.xml               — all doc URLs + home page
 *   manifest.json             — PWA web app manifest
 *   doc/<slug>/index.html     — static HTML stubs (HTTP 200 for Googlebot + SEO)
 *
 * Drift check compares every .md file in docs/ against CONFIG.NAV_TREE in
 * nav-docs.js and reports:
 *   • ORPHAN  — .md file exists but has no nav entry  (easy to forget)
 *   • PHANTOM — nav entry has no matching .md file     (broken link)
 *
 * Usage:
 *   node generate-manifest.js
 *   node generate-manifest.js --strict   # exit 1 on any drift
 *   node generate-manifest.js --watch    # re-run on every .md save
 */

const fs   = require('fs');
const path = require('path');

// ── Paths ─────────────────────────────────────────────────────────
const DOCS_DIR     = path.join(__dirname, 'docs');
const OUT_PATH     = path.join(DOCS_DIR, 'manifest.json');
const SITEMAP_PATH = path.join(__dirname, 'sitemap.xml');
const PWA_PATH     = path.join(__dirname, 'manifest.json');
const DOC_DIR      = path.join(__dirname, 'doc');   // static stub output dir
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
const AUTHOR          = getConfig('AUTHOR_NAME',     'Shrinivas Kumbhar');
const LANG            = getConfig('LANG', getConfig('DATE_LOCALE', 'en-IN'));
const PWA_NAME        = getConfig('PWA_NAME',        SITE_TITLE);
const PWA_SHORT_NAME  = getConfig('PWA_SHORT_NAME',  'ShaniDocs');
const PWA_DESCRIPTION = getConfig('PWA_DESCRIPTION', SITE_DESC);
const PWA_THEME_COLOR = getConfig('PWA_THEME_COLOR', '#161514');
const PWA_BG_COLOR    = getConfig('PWA_BG_COLOR',    '#161514');
const FAVICON_URL     = getConfig('FAVICON_URL',     'https://shani.dev/assets/images/logo.svg');
const OG_IMAGE        = getConfig('OG_IMAGE',        FAVICON_URL);
const TWITTER_HANDLE  = getConfig('TWITTER_HANDLE',  '@shani8dev');
const STORAGE_PREFIX  = getConfig('STORAGE_PREFIX',  'shanidocs');

// ── Helpers ───────────────────────────────────────────────────────
function escXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
const escHtml = escXml;

function slugToTitle(slug) {
  return slug.split('/').pop().split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function autoExcerpt(body) {
  const plain = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\n/g, ' ')
    .trim();
  return plain.substring(0, 155) + (plain.length > 155 ? '\u2026' : '');
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

// ── Static stub builder ───────────────────────────────────────────
// Generates doc/<slug>/index.html so GitHub Pages returns HTTP 200
// for every doc URL. Googlebot sees full meta tags + JSON-LD.
// Real users get the full SPA experience via script-docs.js.
function buildStub(doc) {
  const url           = `${WIKI_URL}/doc/${doc.slug}`;
  const title         = escHtml(doc.title);
  const desc          = escHtml(doc.description || SITE_DESC);
  const image         = escHtml(OG_IMAGE);
  const datePublished = doc.updated
    ? new Date(doc.updated + 'T00:00:00').toISOString()
    : '';
  const robots = doc.draft
    ? 'noindex'
    : 'index, follow, max-snippet:-1, max-image-preview:large';

  const ldJson = JSON.stringify({
    '@context':   'https://schema.org',
    '@type':      'TechArticle',
    headline:     doc.title,
    description:  doc.description || SITE_DESC,
    url,
    ...(datePublished ? { datePublished, dateModified: datePublished } : {}),
    author:    { '@type': 'Person',       name: AUTHOR },
    publisher: { '@type': 'Organization', name: SITE_TITLE,
                 logo: { '@type': 'ImageObject', url: FAVICON_URL } },
    image,
    isPartOf: { '@type': 'WebSite', name: SITE_TITLE, url: WIKI_URL },
  });

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">

  <title>${title} — ${escHtml(SITE_TITLE)}</title>
  <meta name="description" content="${desc}">
  <meta name="author"      content="${escHtml(AUTHOR)}">
  <meta name="robots"      content="${robots}">
  <link rel="canonical"    href="${escHtml(url)}">

  <meta property="og:type"        content="article">
  <meta property="og:site_name"   content="${escHtml(SITE_TITLE)}">
  <meta property="og:title"       content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:url"         content="${escHtml(url)}">
  <meta property="og:image"       content="${image}">
  ${datePublished ? `<meta property="article:published_time" content="${datePublished}">
  <meta property="article:modified_time"  content="${datePublished}">` : ''}
  <meta property="article:author"  content="${escHtml(AUTHOR)}">
  <meta property="article:section" content="${escHtml(doc.section || '')}">
  ${doc.keywords ? `<meta name="keywords" content="${escHtml(doc.keywords)}">` : ''}

  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:site"        content="${escHtml(TWITTER_HANDLE)}">
  <meta name="twitter:title"       content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image"       content="${image}">

  <script type="application/ld+json">${ldJson}</script>

  <link rel="icon" type="image/svg+xml" href="${escHtml(FAVICON_URL)}">
  <link rel="manifest" href="/manifest.json">

  <!-- Theme flash prevention — mirrors index.html inline script -->
  <script>
    (function () {
      // Prefix matches CONFIG.STORAGE_PREFIX + '_' from script-docs.js
      var pfx = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_PREFIX)
                  ? CONFIG.STORAGE_PREFIX + '_'
                  : '${STORAGE_PREFIX}_';
      var t = localStorage.getItem(pfx + 'theme') ||
              (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', t);
    })();
  </script>

  <link rel="stylesheet" href="/brand-shani.css">
  <link rel="stylesheet" href="/style-docs.css">
</head>
<body>
  <!-- Loading overlay — identical to index.html so the SPA's hideLoader() works -->
  <div id="page-loader" aria-hidden="true">
    <div class="loader__logo">
      <img id="loader-logo-img" src="${escHtml(FAVICON_URL)}" alt="${escHtml(SITE_TITLE)}" height="40">
    </div>
    <div class="loader__track"><div class="loader__bar"></div></div>
    <p class="loader__text">Loading wiki…</p>
  </div>

  <!-- SPA takes over: reads the current URL path, fetches the .md, renders the doc -->
  <script src="/config-docs.js"></script>
  <script src="/nav-docs.js"></script>
  <script src="/script-docs.js"></script>
</body>
</html>`;
}

// ── Extract all slugs from NAV_TREE in nav-docs.js ───────────────
function extractNavSlugs(navPath) {
  if (!fs.existsSync(navPath)) return null;
  const src = fs.readFileSync(navPath, 'utf8');
  const slugs = new Set();
  const re = /\bslug\s*:\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(src)) !== null) slugs.add(m[1]);
  return slugs;
}

// ── Drift check ───────────────────────────────────────────────────
function checkDrift(docSlugs, navSlugs) {
  if (navSlugs === null) {
    console.warn('⚠  nav-docs.js not found — skipping drift check\n');
    return false;
  }
  const docSet  = new Set(docSlugs);
  const orphans = [...docSet].filter(s => !navSlugs.has(s));
  const phantoms = [...navSlugs].filter(s => !docSet.has(s));
  const hasDrift = orphans.length > 0 || phantoms.length > 0;

  if (!hasDrift) {
    console.log('✓ No drift — all docs are in nav, all nav entries have files\n');
    return false;
  }

  if (orphans.length) {
    console.log(`⚠  ORPHAN docs (${orphans.length}) — file exists but missing from nav-docs.js:`);
    orphans.sort().forEach(s => console.log(`     + ${s}`));
    console.log('');
  }
  if (phantoms.length) {
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
    console.error(`✗ docs/ directory not found at: ${DOCS_DIR}`);
    process.exit(1);
  }

  const files = walkDocs(DOCS_DIR).sort();
  const docs  = [];

  for (const file of files) {
    const raw  = fs.readFileSync(path.join(DOCS_DIR, file), 'utf8').replace(/^\uFEFF/, '');
    const slug = file.replace(/\.md$/, '');

    // Parse front-matter
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const fm  = {};
    const body = fmMatch ? fmMatch[2] : raw;

    if (fmMatch) {
      const fmLines = fmMatch[1].split(/\r?\n/);
      let i = 0;
      while (i < fmLines.length) {
        const line = fmLines[i];
        if (!line.trim() || line.trim().startsWith('#') || /^\s/.test(line)) { i++; continue; }
        const colonIdx = line.indexOf(':');
        if (colonIdx < 1) { i++; continue; }
        const key    = line.slice(0, colonIdx).trim();
        let   rawVal = line.slice(colonIdx + 1).trim();

        // Block scalars
        if (rawVal === '|' || rawVal === '>') {
          const joiner = rawVal === '>' ? ' ' : '\n';
          const parts  = [];
          const baseIndent = (fmLines[i + 1] || '').match(/^(\s*)/)[1].length;
          i++;
          while (i < fmLines.length) {
            const next = fmLines[i];
            if (next.trim() === '' || next.match(/^(\s*)/)[1].length >= baseIndent) {
              parts.push(next.slice(baseIndent)); i++;
            } else break;
          }
          fm[key] = parts.join(joiner).trimEnd();
          continue;
        }

        // Quoted values (possibly multi-line)
        const quoteMatch = rawVal.match(/^(['"`])([\s\S]*)$/);
        if (quoteMatch) {
          const q   = quoteMatch[1];
          let   val = quoteMatch[2];
          if (val.endsWith(q)) {
            fm[key] = val.slice(0, -1);
          } else {
            i++;
            while (i < fmLines.length) {
              const next = fmLines[i].trimEnd();
              if (next.endsWith(q)) { val += '\n' + next.slice(0, -1); i++; break; }
              val += '\n' + next; i++;
            }
            fm[key] = val;
          }
        } else {
          fm[key] = rawVal;
        }
        i++;
      }
    }

    const doc = {
      slug,
      title:       fm.title       || slugToTitle(slug),
      section:     fm.section     || 'Other',
      description: fm.description || autoExcerpt(body),
      updated:     fm.updated     || '',
      order:       Number(fm.order || 999),
      draft:       fm.draft       === 'true',
      keywords:    fm.keywords    || '',
    };

    docs.push(doc);
    console.log(`  [doc] ${slug}`);
  }

  // ── docs/manifest.json ──────────────────────────────────────────
  fs.writeFileSync(OUT_PATH, JSON.stringify(docs, null, 2));
  console.log(`\n✓ docs/manifest.json  (${docs.length} doc(s))`);

  // ── sitemap.xml ─────────────────────────────────────────────────
  const urls = docs.filter(d => !d.draft).map(d => `
  <url>
    <loc>${escXml(WIKI_URL)}/doc/${escXml(d.slug)}</loc>
    ${d.updated ? `<lastmod>${escXml(d.updated)}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

  fs.writeFileSync(SITEMAP_PATH, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escXml(WIKI_URL)}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>${urls}
</urlset>`);
  console.log(`✓ sitemap.xml`);

  // ── manifest.json (PWA) ─────────────────────────────────────────
  fs.writeFileSync(PWA_PATH, JSON.stringify({
    name:             PWA_NAME,
    short_name:       PWA_SHORT_NAME,
    description:      PWA_DESCRIPTION,
    start_url:        '/',
    display:          'standalone',
    background_color: PWA_BG_COLOR,
    theme_color:      PWA_THEME_COLOR,
    lang:             LANG,
    icons: [{ src: FAVICON_URL, sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
  }, null, 2));
  console.log(`✓ manifest.json (PWA)`);

  // ── doc/<slug>/index.html stubs ─────────────────────────────────
  // Each stub is a real file → GitHub Pages returns HTTP 200 for every
  // doc URL. Googlebot indexes the meta tags + JSON-LD immediately.
  // The SPA (script-docs.js) hydrates the page for real users.
  fs.mkdirSync(DOC_DIR, { recursive: true });

  const liveSlugs = new Set();
  let stubsWritten = 0;
  let stubsRemoved = 0;

  for (const doc of docs) {
    if (!doc.slug) continue;
    liveSlugs.add(doc.slug);
    // Support nested slugs like "arch/boot" → doc/arch/boot/index.html
    const dir = path.join(DOC_DIR, ...doc.slug.split('/'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), buildStub(doc));
    stubsWritten++;
  }

  // Remove stubs for docs that no longer exist (walk only top-level for perf)
  function cleanStaleStubs(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const full      = path.join(dir, entry);
      const slugPart  = prefix ? `${prefix}/${entry}` : entry;
      const stat      = fs.statSync(full);
      if (stat.isDirectory()) {
        // If the directory itself is a valid slug, check children too
        if (!liveSlugs.has(slugPart)) {
          // It might be a section folder (e.g. "arch/") — recurse before deleting
          const children = fs.readdirSync(full);
          const hasLive  = children.some(c => liveSlugs.has(`${slugPart}/${c}`) || liveSlugs.has(slugPart));
          if (!hasLive && !children.some(c => fs.statSync(path.join(full, c)).isDirectory())) {
            fs.rmSync(full, { recursive: true, force: true });
            console.log(`  ✗ Removed stale stub: doc/${slugPart}/`);
            stubsRemoved++;
          } else {
            cleanStaleStubs(full, slugPart);
          }
        }
      }
    }
  }
  cleanStaleStubs(DOC_DIR, '');

  console.log(`✓ doc/ stubs: ${stubsWritten} written${stubsRemoved ? `, ${stubsRemoved} stale removed` : ''}`);

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
  console.log('Watching docs/ for changes… (Ctrl+C to stop)\n');
  let debounce;

  function watchDir(dir) {
    fs.watch(dir, { persistent: true }, (e, f) => {
      if (!f?.endsWith('.md')) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        console.log(`→ ${f} changed, rebuilding…\n`);
        build();
      }, 150);
    });
    fs.readdirSync(dir).forEach(f => {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) watchDir(full);
    });
  }

  watchDir(DOCS_DIR);
}
