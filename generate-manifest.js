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

// ── Markdown → HTML (for prerendered stub content) ─────────────────
// Prefer the real `marked` package (same renderer family the client uses)
// if it's installed; otherwise fall back to a small dependency-free
// converter. Either way, the goal is real, crawlable text in the static
// stub — script-docs.js still hydrates/replaces this on the client for
// full interactivity (TOC, copy buttons, Prism, KaTeX, etc).
let marked = null;
try { marked = require('marked'); } catch { /* not installed — fallback used */ }

function mdToHtmlFallback(md) {
  const blocks = [];
  let src = String(md || '').replace(/\r\n/g, '\n');

  // Pull out fenced code blocks first so nothing inside them gets mangled
  src = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = blocks.push(
      `<pre><code${lang ? ` class="language-${escXml(lang)}"` : ''}>${escXml(code.replace(/\n$/, ''))}</code></pre>`
    ) - 1;
    return `\u0000BLOCK${idx}\u0000`;
  });

  const inline = s => s
    .replace(/`([^`]+)`/g, (_, c) => `<code>${escXml(c)}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${escXml(u)}">${t}</a>`);

  const lines = src.split('\n');
  const out = [];
  let para = [];
  let list = null; // 'ul' | 'ol'

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' ').trim())}</p>`); para = []; }
  };
  const flushList = () => {
    if (list) { out.push(`</${list}>`); list = null; }
  };

  for (const line of lines) {
    if (/^\u0000BLOCK\d+\u0000$/.test(line.trim())) {
      flushPara(); flushList();
      out.push(line.trim());
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      const lvl = h[1].length;
      out.push(`<h${lvl}>${inline(h[2].trim())}</h${lvl}>`);
      continue;
    }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (list !== tag) { flushList(); out.push(`<${tag}>`); list = tag; }
      out.push(`<li>${inline((ul || ol)[1].trim())}</li>`);
      continue;
    }
    const bq = line.match(/^\s*>\s?(.*)$/);
    if (bq) {
      flushPara(); flushList();
      out.push(`<blockquote><p>${inline(bq[1].trim())}</p></blockquote>`);
      continue;
    }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    para.push(line.trim());
  }
  flushPara(); flushList();

  let html = out.join('\n');
  blocks.forEach((b, i) => { html = html.replace(`\u0000BLOCK${i}\u0000`, b); });
  return html;
}

function mdToHtml(md) {
  if (marked) {
    try { return typeof marked.parse === 'function' ? marked.parse(md || '') : marked(md || ''); }
    catch { /* fall through to the built-in converter */ }
  }
  return mdToHtmlFallback(md);
}

// Strip a leading "# Title" line from the body if it duplicates the doc's
// title (which the stub already renders in <h1 class="doc-title">) —
// otherwise every page ships two H1s, which is bad for SEO/structure.
function stripDuplicateLeadingH1(body, title) {
  const m = String(body || '').match(/^\s*#\s+(.+?)\s*\n([\s\S]*)$/);
  if (!m) return body;
  const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return norm(m[1]) === norm(title) ? m[2] : body;
}

// Same admonition syntax the client renders (> [!NOTE] ...), turned into
// the same .callout markup used by processCallouts() in script-docs.js,
// so the prerendered stub and the hydrated client version match.
const CALLOUT_MAP = {
  NOTE:      ['note',      'fa-solid fa-circle-info',          'Note'],
  TIP:       ['tip',       'fa-solid fa-lightbulb',            'Tip'],
  WARNING:   ['warning',   'fa-solid fa-triangle-exclamation', 'Warning'],
  DANGER:    ['danger',    'fa-solid fa-circle-xmark',         'Danger'],
  IMPORTANT: ['important', 'fa-solid fa-star',                 'Important'],
  CAUTION:   ['caution',   'fa-solid fa-shield-exclamation',   'Caution'],
};
function renderCallouts(html) {
  return html.replace(
    /<blockquote>\s*<p>\[!(NOTE|TIP|WARNING|DANGER|IMPORTANT|CAUTION)\]\s*([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
    (_, type, body) => {
      const [cls, icon, label] = CALLOUT_MAP[type.toUpperCase()] || CALLOUT_MAP.NOTE;
      return `<div class="callout callout--${cls}" role="note">
        <i class="${icon} callout__icon" aria-label="${label}"></i>
        <div class="callout__body"><strong class="callout__title">${label}</strong><div>${body.trim()}</div></div>
      </div>`;
    }
  );
}

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

  const LOGO_IMG_URL = getConfig('LOGO_IMG_URL', FAVICON_URL);
  const bodyHtml = renderCallouts(mdToHtml(stripDuplicateLeadingH1(doc.body || '', doc.title)));

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">

  <title>${title} — ${escHtml(SITE_TITLE)}</title>
  <meta name="description" id="meta-desc"     content="${desc}">
  <meta name="keywords"    id="meta-keywords" content="${escHtml(doc.keywords || '')}">
  <meta name="author"      content="${escHtml(AUTHOR)}">
  <meta name="robots"      content="${robots}">
  <link rel="canonical"    id="canonical-url" href="${escHtml(url)}">

  <meta property="og:site_name" id="og-site-name" content="${escHtml(SITE_TITLE)}">
  <meta property="og:type"      id="og-type"       content="article">
  <meta property="og:title"     id="og-title"      content="${title}">
  <meta property="og:description" id="og-desc"     content="${desc}">
  <meta property="og:url"       id="og-url"        content="${escHtml(url)}">
  <meta property="og:image"     id="og-image"      content="${image}">
  ${datePublished ? `<meta property="article:published_time" content="${datePublished}">
  <meta property="article:modified_time"  content="${datePublished}">` : ''}
  <meta property="article:author"  content="${escHtml(AUTHOR)}">
  <meta property="article:section" content="${escHtml(doc.section || '')}">

  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:site"        id="tw-site"  content="${escHtml(TWITTER_HANDLE)}">
  <meta name="twitter:title"       id="tw-title" content="${title}">
  <meta name="twitter:description" id="tw-desc"  content="${desc}">
  <meta name="twitter:image"       id="tw-image" content="${image}">

  <script type="application/ld+json">${ldJson}</script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="dns-prefetch" href="https://cdnjs.cloudflare.com">
  <link rel="dns-prefetch" href="https://cdn.jsdelivr.net">

  <link rel="icon" id="favicon" type="image/svg+xml" href="${escHtml(FAVICON_URL)}">
  <link rel="manifest" href="/manifest.json">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="theme-color" content="#161514">

  <script>
    (function () {
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
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <link rel="stylesheet" id="prism-theme"
        href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-bash.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-yaml.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-json.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-typescript.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-python.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-css.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-go.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-markup.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-markup-templating.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-java.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-properties.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-hcl.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-docker.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-nginx.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-sql.min.js"></script>
</head>
<body>

  <a class="skip-link" href="#main-content">Skip to content</a>

  <noscript>
    <div style="text-align:center;padding:4rem 2rem;font-family:sans-serif">
      <strong>JavaScript is required to view this wiki.</strong>
    </div>
  </noscript>

  <div id="page-loader" aria-hidden="true">
    <div class="loader__logo">
      <img id="loader-logo-img" src="${escHtml(FAVICON_URL)}" alt="${escHtml(SITE_TITLE)}" height="40">
    </div>
    <div class="loader__track"><div class="loader__bar"></div></div>
    <p class="loader__text">Loading wiki…</p>
  </div>

  <div class="auspicious-bar" aria-label="${escHtml(SITE_TITLE)}">
    <a href="https://shani.dev" id="auspicious-link" aria-label="Visit Shanios">॥ श्री ॥</a>
  </div>

  <header class="topbar" role="banner">
    <button class="topbar__menu-btn btn-icon" id="menu-toggle" aria-label="Toggle navigation" aria-expanded="false" aria-controls="wiki-sidebar">
      <i class="fa-solid fa-bars"></i>
    </button>
    <a href="/" class="topbar__logo" aria-label="${escHtml(SITE_TITLE)} home">
      <img src="${escHtml(LOGO_IMG_URL)}" alt="${escHtml(SITE_TITLE)}" id="logo-img" height="24">
      <span class="topbar__logo-word logo__word">docs</span>
    </a>
    <div class="topbar__search-wrap" role="search">
      <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
      <input type="search" id="wiki-search" class="topbar__search"
        placeholder="Search docs… (/ or Ctrl+K)"
        aria-label="Search documentation" autocomplete="off" spellcheck="false">
      <div id="search-results" class="search-results" hidden role="listbox" aria-label="Search results"></div>
    </div>
    <div class="topbar__actions">
      <button class="btn-icon" id="font-decrease" aria-label="Decrease font size" title="Decrease font size (A−)">
        <i class="fa-solid fa-text-height" style="font-size:0.7rem"></i>
      </button>
      <button class="btn-icon" id="font-increase" aria-label="Increase font size" title="Increase font size (A+)">
        <i class="fa-solid fa-text-height"></i>
      </button>
      <button class="btn-icon" id="theme-btn" aria-label="Toggle light/dark theme">
        <i class="fa-solid fa-moon" id="theme-icon"></i>
      </button>
      <a class="btn-icon" href="https://github.com/shani8dev" target="_blank" rel="noopener" aria-label="View on GitHub">
        <i class="fa-brands fa-github"></i>
      </a>
    </div>
  </header>

  <div id="sidebar-overlay" class="sidebar-overlay" aria-hidden="true"></div>

  <aside class="sidebar" id="wiki-sidebar" role="navigation" aria-label="Documentation navigation">
    <div class="sidebar__header">
      <div class="sidebar__section-label">Documentation</div>
    </div>
    <nav class="nav-tree" id="wiki-nav" aria-label="Pages"></nav>
  </aside>

  <div class="reading-progress" aria-hidden="true">
    <div class="reading-progress__bar" id="reading-bar"></div>
  </div>

  <main class="content" id="main-content" tabindex="-1">
    <div class="content__inner" id="doc-content" role="article">
      <!--
        Prerendered content below — real text for crawlers and no-JS
        clients. script-docs.js overwrites this div with the fully
        interactive render (TOC, copy buttons, Prism, KaTeX, view
        counts, etc.) once it loads, so markup here only needs to be
        semantically correct, not byte-identical to the client render.
      -->
      <div class="doc-header">
        <h1 class="doc-title">${title}</h1>
        <div class="doc-meta">
          ${doc.section ? `<span class="doc-meta__badge">${escHtml(doc.section)}</span>` : ''}
          ${doc.updated ? `<span><i class="fa-regular fa-clock"></i> ${escHtml(doc.updated)}</span>` : ''}
        </div>
      </div>
      <div class="prose">${bodyHtml}</div>
    </div>
  </main>

  <button class="to-top" id="back-top" aria-label="Back to top">
    <i class="fa-solid fa-arrow-up"></i>
  </button>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>

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
      body,        // kept in-memory only for stub rendering — NOT written to manifest.json
    };

    docs.push(doc);
    console.log(`  [doc] ${slug}`);
  }

  // ── docs/manifest.json ──────────────────────────────────────────
  // Strip `body` — it's only carried on the in-memory doc objects so
  // buildStub() can prerender content; it doesn't belong in the client-
  // facing manifest (bloats the file the search index loads).
  const manifestDocs = docs.map(({ body, ...rest }) => rest);
  fs.writeFileSync(OUT_PATH, JSON.stringify(manifestDocs, null, 2));
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
