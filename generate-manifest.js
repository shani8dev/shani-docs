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


  const inline = s => s
    .replace(/`([^`]+)`/g, (_, c) => `<code>${escXml(c)}</code>`)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, a, u) => `<img src="${escXml(u)}" alt="${escXml(a)}" loading="lazy">`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${escXml(u)}">${t}</a>`);

  const lines = src.split('\n');
  const slugifyH = t => t.toLowerCase().replace(/[^\w\s-]/g,'').trim().replace(/\s+/g,'-');
  let inQuoteFence = false, qfLang = '', qfBuf = [];
  const usedIds = new Set();
  const uniqId = t => { let id = slugifyH(t) || 'section'; let n = id; let k = 2;
    while (usedIds.has(n)) n = id + '-' + k++; usedIds.add(n); return n; };

  // Blockquoted fences ("> ```bash … > ```"): convert to a quoted code
  // block before line processing so the fence scanner sees clean fences.
  src = src.replace(
    /^> ```([\w-]*)\n([\s\S]*?)^> ```[ \t]*$/gm,
    (_, lang, body) => {
      const lines = body.split('\n').map(l => l.replace(/^> ?/, ''));
      const esc2 = t => t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return `<blockquote><pre><code${lang ? ` class="language-${lang}"` : ''}>${esc2(lines.join('\n').replace(/\n$/,''))}</code></pre></blockquote>`;
    });
  let inFence = false, fenceChar = '`', fenceLen = 0, fenceLang = '', fenceBuf = [];
  const out = [];
  let para = [];
  let list = null; // 'ul' | 'ol'
  let quote = null; // collected blockquote lines
  let table = null; // { head:[], rows:[][] }

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' ').trim())}</p>`); para = []; }
  };
  const flushList = () => {
    if (list) { out.push(`</${list}>`); list = null; }
  };
  const flushQuote = () => {
    if (quote) { out.push(`<blockquote>${inline(quote.join(' ').trim())}</blockquote>`); quote = null; }
  };
  const flushTable = () => {
    if (!table) return;
    const cell = c => `<td>${inline(c.trim())}</td>`;
    let h = '<thead><tr>' + table.head.map(c => `<th>${inline(c.trim())}</th>`).join('') + '</tr></thead>';
    let b = '';
    for (const row of table.rows) b += '<tr>' + row.map(cell).join('') + '</tr>';
    out.push(`<table>${h}<tbody>${b}</tbody></table>`);
    table = null;
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); flushTable(); };

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];

    // ── Fenced code (CommonMark-style): a fence OPENER may carry an info
    // string; a CLOSER is backticks/tildes only, ≥ opener length. Lines
    // inside a fence are always literal — nested ``` examples can never
    // desync the parser.
    {
      const m = line.match(/^(`{3,}|~{3,})(.*)$/);
      if (inFence) {
        if (m && m[1][0] === fenceChar && m[1].length >= fenceLen && !m[2].trim()) {
          const idx = blocks.push(
            `<pre><code${fenceLang ? ` class="language-${escXml(fenceLang)}"` : ''}>${escXml(fenceBuf.join('\n'))}</code></pre>`
          ) - 1;
          flushAll();
          out.push(`\u0000BLOCK${idx}\u0000`);
          inFence = false; fenceBuf = [];
        } else {
          fenceBuf.push(line);
        }
        continue;
      }
      if (m && m[2].trim()) { // opener requires info string (or bare ``` handled below)
        flushAll();
        inFence = true; fenceChar = m[1][0]; fenceLen = m[1].length;
        fenceLang = m[2].trim().split(/\s+/)[0]; fenceBuf = [];
        continue;
      }
      if (m && !m[2].trim()) { // bare fence with no info string: treat as opener too
        flushAll();
        inFence = true; fenceChar = m[1][0]; fenceLen = m[1].length;
        fenceLang = ''; fenceBuf = [];
        continue;
      }
    }

    if (/^\u0000BLOCK\d+\u0000$/.test(line.trim())) { flushAll(); out.push(line.trim()); continue; }

    // GFM table: current line has |, next line is a |---|---| separator
    if (line.includes('|') && li + 1 < lines.length &&
        /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(lines[li + 1]) &&
        /\|/.test(lines[li + 1])) {
      flushAll();
      const splitRow = r => r.trim().replace(/^\||\|$/g, '').split('|');
      table = { head: splitRow(line), rows: [] };
      li++; // skip separator
      continue;
    }
    if (table && line.includes('|')) { table.rows.push(line.trim().replace(/^\||\|$/g, '').split('|')); continue; }
    flushTable();

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flushAll(); const lvl = h[1].length; const ht = inline(h[2].trim()); out.push(`<h${lvl} id="${uniqId(h[2].trim())}">${ht}</h${lvl}>`); continue; }

    // Horizontal rule (standalone --- / *** with blank-ish context)
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flushAll(); out.push('<hr>'); continue; }

    const task = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (task || ul || ol) {
      flushPara(); flushQuote();
      const tag = ol ? 'ol' : 'ul';
      if (list !== tag) { flushList(); out.push(`<${tag}>`); list = tag; }
      if (task) {
        const checked = task[1].toLowerCase() === 'x';
        out.push(`<li><input type="checkbox" disabled${checked ? ' checked' : ''}> ${inline(task[2].trim())}</li>`);
      } else {
        out.push(`<li>${inline((ul || ol)[1].trim())}</li>`);
      }
      continue;
    }

    const bq = line.match(/^\s*>\s?(.*)$/);
    if (bq) {
      flushPara(); flushList();
      if (!quote) quote = [];
      quote.push(bq[1]);
      continue;
    }
    flushQuote();

    if (!line.trim()) { flushPara(); flushList(); continue; }
    para.push(line.trim());
  }
  flushAll();

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

// Strip a leading "# Heading" line from the body — the stub always
// renders its own <h1 class="doc-title">{title}</h1> immediately before
// `.prose`, so ANY genuinely-leading H1 is redundant by construction,
// not just one that happens to match the frontmatter title verbatim.
// (Originally this only stripped on an exact title match, which missed
// ~36 pages whose body H1 is a fuller/differently-worded restatement of
// the title, e.g. "Troubleshooting Guide" vs. title "Troubleshooting" —
// those still shipped two H1s. See AGENTS.md.)
function stripDuplicateLeadingH1(body) {
  const text = String(body || '');
  // Skip a leading blockquote note (e.g. "> **Portability note:** ...")
  // before looking for the H1 — the note itself must stay in the output,
  // only the redundant H1 after it gets removed.
  const leadMatch = text.match(/^\s*((?:>.*\n?)+\n*)/);
  const lead = leadMatch ? leadMatch[0] : '';
  const rest = text.slice(lead.length);
  const m = rest.match(/^\s*#\s+.+?\s*\n([\s\S]*)$/);
  return m ? lead + m[1] : body;
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
const FEED_PATH    = path.join(__dirname, 'feed.xml');
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
  // The closing delimiter must be the SAME character as the opening one,
  // so a value may contain the other quote types (e.g. "team's OS").
  // A naive [^'"`]+ would truncate at the first quote of any kind.
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = configRaw.match(new RegExp(esc + ":\\s*('([^']*)'|\"([^\"]*)\"|`([^`]*)`)"));
  if (!m) return fallback;
  return m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
}

// ── Service-worker cache busting ─────────────────────────────────
// Rewrites SHELL_CACHE's version suffix in sw.js with today's build stamp.
function bumpServiceWorkerCache(baseName) {
  const swPath = path.join(__dirname, 'sw.js');
  if (!fs.existsSync(swPath)) return;
  let sw = fs.readFileSync(swPath, 'utf8');
  const m = sw.match(/^const SHELL_CACHE = '([^-]+)-[^']*';$/m);
  if (!m) {
    console.warn('⚠  sw.js SHELL_CACHE format unrecognized — not bumping');
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  sw = sw.replace(/^const SHELL_CACHE = '.*';$/m, `const SHELL_CACHE = '${baseName}-${stamp}';`);
  fs.writeFileSync(swPath, sw);
  console.log(`✓ sw.js SHELL_CACHE → ${baseName}-${stamp}`);
}

function getConfigNum(key, fallback) {
  const m = configRaw.match(new RegExp(key + ":\\s*(-?\\d+(?:\\.\\d+)?)"));
  return m ? Number(m[1]) : fallback;
}

// ── SITEMAP_STATIC_URLS — optional extra static pages (e.g. /about,
// /changelog) parsed from a CONFIG array literal, same convention as the
// blog generator. Falls back to just the home page if not present/parseable.
function parseSitemapStaticUrls() {
  const m = configRaw.match(/SITEMAP_STATIC_URLS\s*:\s*\[([\s\S]*?)\]/);
  if (!m) return [];
  const block = m[1];
  const entries = [];
  const entryRe = /\{([^}]+)\}/g;
  let em;
  while ((em = entryRe.exec(block)) !== null) {
    const inner = em[1];
    const get = k => { const r = inner.match(new RegExp(k + ":\\s*('([^']*)'|\"([^\"]*)\"|`([^`]*)`)")); if (!r) return ''; return r[2] !== undefined ? r[2] : (r[3] !== undefined ? r[3] : r[4]); };
    entries.push({ path: get('path'), priority: get('priority') || '0.6', changefreq: get('changefreq') || 'monthly' });
  }
  return entries;
}

// ── Config values ─────────────────────────────────────────────────
const WIKI_URL        = getConfig('WIKI_URL',        'https://docs.shani.dev');
const DOC_CONTENT_PLACEHOLDER = '<div class="content__inner" id="doc-content" role="article"></div>';
const HOME_MARKER_START = '<!--PRERENDERED-DOCS-START-->';
const HOME_MARKER_END   = '<!--PRERENDERED-DOCS-END-->';
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
const SITEMAP_STATIC_URLS = parseSitemapStaticUrls();

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

function mdToPlainText(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^(?:-{3,}|\*{3,}|_{3,})$/gm, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function autoExcerpt(body) {
  // Drop a leading H1 that just repeats the page title \u2014 it's already
  // shown separately as <title>/og:title, so restating it here wastes
  // the excerpt's ~155-char budget on a redundant repeat.
  let text = body.replace(/^\s+/, '');
  text = text.replace(/^#\s+.+\n+/, '').replace(/^\s+/, '');
  // Drop a leading blockquote note (e.g. "> **Portability note:** ...")
  // as long as real content remains after it \u2014 these are disclaimers,
  // not page-specific summaries, and were producing identical excerpts
  // across every page that opens with the same boilerplate note.
  const stripped = text.replace(/^(?:>.*\n?)+\n*/, '');
  if (stripped.trim().length > 40) text = stripped;

  const plain = mdToPlainText(text);
  return plain.substring(0, 155) + (plain.length > 155 ? '\u2026' : '');
}

// \u2500\u2500 FAQPage schema extraction (docs/faq.md only) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// FAQ entries in this repo follow a strict, hand-authored convention:
// a lone bolded question line ("**Does X work?**") followed by its
// answer, up to the next question or a "## Section" / "---" boundary.
// Mechanically reliable to extract \u2014 verified against the real file
// before this was wired in (see AGENTS.md).
function extractFaqPairs(body) {
  const lines = body.split('\n');
  const pairs = [];
  let current = null;

  function flush() {
    if (!current) return;
    const answer = mdToPlainText(current.answerLines.join('\n'));
    // Skip fragments left behind when a code block was the actual
    // payload and stripping it leaves a dangling lead-in ("...then
    // run:") or an orphaned continuation ("Or select the...") \u2014 better
    // to omit the pair than emit a broken-looking answer in search
    // results.
    const isFragment = /:$/.test(answer.trim())
      || /^(Or|And|But|Then)\s+[a-z]/.test(answer.trim());
    if (answer.length >= 15 && !isFragment) {
      pairs.push({ question: current.q, answer });
    }
    current = null;
  }

  for (const line of lines) {
    const qMatch = line.match(/^\*\*(.+\?)\*\*$/);
    if (qMatch) {
      flush();
      current = { q: mdToPlainText(qMatch[1]), answerLines: [] };
      continue;
    }
    if (/^##\s+/.test(line) || /^-{3,}$/.test(line.trim())) {
      flush();
      continue;
    }
    if (current) current.answerLines.push(line);
  }
  flush();
  return pairs;
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
// for every doc URL. Googlebot indexes the meta tags + JSON-LD immediately.
// The SPA (script-docs.js) hydrates the page for real users.
//
// KEY DESIGN: rather than re-declaring the entire page markup here,
// this reads the REAL index.html once and splices in per-doc <head>
// SEO tags + prerendered #doc-content.
function buildStub(doc) {
  // FIX B: standardise on trailing slashes (GitHub Pages directory indexes)
  const url           = `${WIKI_URL}/doc/${doc.slug}/`;
  const title         = escHtml(doc.title);
  const desc          = escHtml(doc.description || SITE_DESC);
  const image         = escHtml(OG_IMAGE);
  const datePublished = doc.updated
    ? new Date(doc.updated + 'T00:00:00').toISOString()
    : '';
  const robots = doc.draft
    ? 'noindex'
    : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

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

  // Two-level breadcrumb (Home > Page). Deliberately not three levels
  // (Home > Section > Page): section groupings have no landing page of
  // their own on this site (confirmed — see AGENTS.md), so a middle
  // breadcrumb entry would have to point at a URL that doesn't exist.
  const breadcrumbJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type':    'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_TITLE, item: `${WIKI_URL}/` },
      { '@type': 'ListItem', position: 2, name: doc.title,  item: url },
    ],
  });

  // FAQPage schema — only for docs/faq.md, whose Q&A pairs are
  // mechanically extractable (see extractFaqPairs). Wrong/absent on
  // every other page is correct: FAQPage is only valid for content that
  // actually is a list of questions and answers.
  const faqPairs = doc.slug === 'faq' ? extractFaqPairs(doc.body || '') : [];
  const faqJson = faqPairs.length ? JSON.stringify({
    '@context': 'https://schema.org',
    '@type':    'FAQPage',
    mainEntity: faqPairs.map(p => ({
      '@type': 'Question',
      name: p.question,
      acceptedAnswer: { '@type': 'Answer', text: p.answer },
    })),
  }) : '';

  const bodyHtml = renderCallouts(mdToHtml(stripDuplicateLeadingH1(doc.body || '')));

  const docContentHtml = `
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
      <div class="prose">${bodyHtml}</div>`;

  // ── <head> SEO block to splice in ────────────────────────────────
  const SEO_INJECTION = `
  <title>${title} — ${escHtml(SITE_TITLE)}</title>
  <meta name="description" id="meta-desc"     content="${desc}">
  <meta name="keywords"    id="meta-keywords" content="${escHtml(doc.keywords || '')}">
  <meta name="author"      content="${escHtml(AUTHOR)}">
  <meta name="robots"      content="${robots}">
  <link rel="canonical"    id="canonical-url" href="${escHtml(url)}">

  <meta property="og:site_name" id="og-site-name" content="${escHtml(SITE_TITLE)}">
  <meta property="og:title"     id="og-title"     content="${title}">
  <meta property="og:description" id="og-desc"    content="${desc}">
  <meta property="og:type"      id="og-type"      content="article">
  <meta property="og:url"       id="og-url"       content="${escHtml(url)}">
  <meta property="og:image"     id="og-image"     content="${image}">
  <meta property="og:image:alt" id="og-image-alt" content="${title}">
  <meta property="og:locale"    content="en_IN">

  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:site"        id="tw-site"  content="${escHtml(TWITTER_HANDLE)}">
  <meta name="twitter:title"       id="tw-title" content="${title}">
  <meta name="twitter:description" id="tw-desc"  content="${desc}">
  <meta name="twitter:image"       id="tw-image" content="${image}">

  <script type="application/ld+json" id="ld-doc">${ldJson}<\/script>
  <script type="application/ld+json" id="ld-breadcrumb">${breadcrumbJson}<\/script>${faqJson ? `
  <script type="application/ld+json" id="ld-faq">${faqJson}<\/script>` : ''}

  <link rel="alternate" type="application/rss+xml" title="${escHtml(SITE_TITLE)} Feed" href="/feed.xml">`;

  // Read the root index.html once and cache it
  if (!buildStub._indexHtml) {
    const indexPath = path.join(__dirname, 'index.html');
    if (!fs.existsSync(indexPath)) {
      throw new Error(`buildStub: index.html not found at ${indexPath}`);
    }
    // Strip the prerendered-home block so doc stubs never inherit it
    // (prerenderHome runs last, but a previous run's markers may persist).
    buildStub._indexHtml = fs.readFileSync(indexPath, 'utf8')
      .replace(new RegExp(`${HOME_MARKER_START}[\\s\\S]*?${HOME_MARKER_END}`), DOC_CONTENT_PLACEHOLDER);
  }

  let html = buildStub._indexHtml;

  // SENTINEL DESIGN
  const START_SENTINEL = '<!-- ═══ SEO ══════════════════════════════════════════════════════════ -->';
  const END_SENTINEL   = '<!-- ═══ PERFORMANCE';

  const startIdx = html.indexOf(START_SENTINEL);
  const endIdx   = html.indexOf(END_SENTINEL, startIdx);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      'buildStub: Could not find SEO injection sentinels in index.html.\n' +
      'Ensure index.html contains the "═══ SEO ═══" comment block and a "═══ PERFORMANCE" comment.'
    );
  }

  html = html.slice(0, startIdx) +
         START_SENTINEL + '\n' +
         SEO_INJECTION.trimStart() + '\n\n  ' +
         html.slice(endIdx);

  // Fill the favicon href — index.html now defaults to the local
  // /favicon.svg fallback (instead of an empty href) so there's no
  // blank/broken icon before client JS runs; this still overwrites it
  // with the configured brand favicon for the prerendered stub.
  html = html.replace(
    '<link rel="icon" id="favicon" type="image/svg+xml" href="/favicon.svg">',
    `<link rel="icon" id="favicon" type="image/svg+xml" href="${escHtml(FAVICON_URL)}">`
  );

  // ── Prerender doc content ────────────────────────────────────────
  // (DOC_CONTENT_PLACEHOLDER defined at module scope)
  if (html.includes(DOC_CONTENT_PLACEHOLDER)) {
    html = html.replace(
      DOC_CONTENT_PLACEHOLDER,
      `<div class="content__inner" id="doc-content" role="article">${docContentHtml}\n    </div>`
    );
  } else {
    console.warn(`  ⚠  buildStub: #doc-content placeholder not found for "${doc.slug}" — stub will ship with empty content.`);
  }

  return html;
}

// ── Extract all slugs from NAV_TREE in nav-docs.js ───────────────
function extractNavSlugs(navPath) {
  if (!fs.existsSync(navPath)) return null;
  const src = fs.readFileSync(navPath, 'utf8');
  const slugs = new Set();
  const re = /["']?slug["']?\s*:\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(src)) !== null) slugs.add(m[1]);
  return slugs;
}

// ── Generate nav-docs.js from docs/ (merge-preserving) ───────────
// nav-docs.js used to be hand-maintained and could silently drift from
// docs/. It is now REGENERATED on every build:
//   • truth = docs/*.md frontmatter (title, section)
//   • curated titles/icons/order from the previous file are preserved
//   • phantoms (nav entries with no .md) are dropped
//   • orphans (new .md files) are inserted into their frontmatter section
function parseExistingNavTree(navPath) {
  if (!fs.existsSync(navPath)) return { tree: [], sections: {} };
  const src = fs.readFileSync(navPath, 'utf8');
  try {
    const fn = new Function(
      'const CONFIG = {};\n' + src.replace(/^\s*CONFIG\.NAV_TREE\s*=/, 'CONFIG.NAV_TREE =') +
      ';\nreturn CONFIG.NAV_TREE;'
    );
    const tree = fn() || [];
    const sections = {};
    const walk = nodes => {
      for (const n of nodes || []) {
        if (n.children) {
          if (n.title && !sections[n.title]) {
            sections[n.title] = { icon: n.icon || '', titles: {} };
          }
          for (const c of n.children) {
            if (sections[n.title]) sections[n.title].titles[c.slug] = { title: c.title, icon: c.icon };
          }
        } else if (n.slug) {
          // Top-level leaf page (e.g. Overview).
          (sections.__top = sections.__top || { icon: n.icon || '', leaves: [], titles: {} });
          if (!sections.__top.titles[n.slug]) sections.__top.titles[n.slug] = { title: n.title };
        }
      }
    };
    walk(tree);
    return { tree, sections, topOrder: tree.map(n => ({ title: n.title, slug: n.slug, hasChildren: !!n.children })) };
  } catch (e) {
    console.warn(`⚠  Could not parse existing nav-docs.js (${e.message}) — regenerating from scratch`);
    return { tree: [], sections: {}, topOrder: [] };
  }
}

function generateNavDocs(docList, navPath) {
  const prev = parseExistingNavTree(navPath);
  const secMeta = prev.sections || {};

  // Group docs by frontmatter section (fallback: slug prefix).
  const grouped = new Map();      // section -> [{slug,title}]
  for (const d of docList) {
    if (!d.slug || d.draft) continue;
    const section = d.section || d.slug.split('/')[0] || 'Reference';
    if (!grouped.has(section)) grouped.set(section, []);
    grouped.get(section).push({ slug: d.slug, title: d.title });
  }

  // Values are emitted via JSON.stringify (not hand-rolled quoting) and
  // keys are double-quoted, so the array body is valid JSON — the browser
  // side (script-docs.js's extractNavTree) parses it with JSON.parse
  // instead of `new Function`, since it may be parsing content fetched
  // live from GitHub rather than this trusted local build script's own
  // output. Trailing commas are still emitted here for readability/diff
  // stability; the JSON.parse consumer strips them first.
  let out = '// AUTO-GENERATED by generate-manifest.js — do not edit by hand.\n';
  out += '// Titles/icons below are preserved from previous manual curation where\n';
  out += "// they existed; additions/removals come from docs/*.md frontmatter.\n";
  out += '// Array body is valid JSON (double-quoted keys/strings) — see extractNavTree\n';
  out += '// in script-docs.js, which JSON.parses this rather than evaluating it as JS.\n';
  out += 'CONFIG.NAV_TREE = [\n';

  // Top-level standalone pages (previous tree order, only if still live).
  const live = new Set(docList.filter(d => d.slug && !d.draft).map(d => d.slug));
  const topLeaves = (secMeta.__top?.titles) || {};
  for (const slug of Object.keys(topLeaves)) {
    if (!live.has(slug)) continue;
    const icon = secMeta.__top.icon || 'fa-solid fa-house';
    out += `  { "title": ${JSON.stringify(topLeaves[slug].title)}, "icon": ${JSON.stringify(icon)}, "slug": ${JSON.stringify(slug)} },\n`;
  }

  // Sections: previous order first, then any newly discovered ones.
  const prevOrder = prev.topOrder ? prev.topOrder.filter(t => t.hasChildren).map(t => t.title) : [];
  const allSections = [
    ...prevOrder.filter(s => grouped.has(s)),
    ...[...grouped.keys()].filter(s => !prevOrder.includes(s)).sort(),
  ];

  for (const section of allSections) {
    const meta = secMeta[section] || {};
    const icon = meta.icon || 'fa-solid fa-folder';
    out += `\n  {\n    "title": ${JSON.stringify(section)},\n    "icon": ${JSON.stringify(icon)},\n    "children": [\n`;
    for (const d of grouped.get(section)) {
      const kept = meta.titles?.[d.slug];
      const title = kept?.title || d.title;
      out += `      { "title": ${JSON.stringify(title)}, "slug": ${JSON.stringify(d.slug)} },\n`;
    }
    out += '    ]\n  },\n';
  }

  out += '];\n';
  fs.writeFileSync(navPath, out);
  console.log(`✓ nav-docs.js regenerated (${allSections.length} sections, ${live.size} pages)`);
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
      section:     fm.section     || slug.split('/')[0] || 'Reference',
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

  // ── Note drafts (still written to manifest for now — docs relies on
  // per-page `noindex`/sitemap filtering rather than dropping drafts
  // outright, since draft docs may still be linked internally) ─────
  const draftSlugs = docs.filter(d => d.draft).map(d => d.slug);
  if (draftSlugs.length) {
    console.log(`\n  ✎ ${draftSlugs.length} draft doc(s) (excluded from sitemap/feed/index): ${draftSlugs.join(', ')}`);
  }

  // ── Warn on duplicate titles (common sign of copy-paste front-matter) ──
  const titleCount = {};
  docs.forEach(d => { titleCount[d.title] = (titleCount[d.title] || 0) + 1; });
  const dupes = Object.entries(titleCount).filter(([, n]) => n > 1);
  if (dupes.length) {
    console.warn('\n  ⚠  Duplicate titles detected (likely wrong title: in front-matter):');
    dupes.forEach(([title, n]) => {
      const slugs = docs.filter(d => d.title === title).map(d => d.slug).join(', ');
      console.warn(`     "${title}" appears ${n}×  →  ${slugs}`);
    });
    console.warn('');
  }

  // ── docs/manifest.json ──────────────────────────────────────────
  const manifestDocs = docs.map(({ body, ...rest }) => rest);
  fs.writeFileSync(OUT_PATH, JSON.stringify(manifestDocs, null, 2));
  console.log(`\n✓ docs/manifest.json  (${docs.length} doc(s))`);

  // ── sitemap.xml ─────────────────────────────────────────────────
  // FIX B: trailing slash on every doc URL to match canonical exactly.
  const staticUrls = SITEMAP_STATIC_URLS.map(u => `
  <url>
    <loc>${escXml(WIKI_URL)}${escXml(u.path)}</loc>
    <changefreq>${escXml(u.changefreq)}</changefreq>
    <priority>${escXml(u.priority)}</priority>
  </url>`).join('');

  const urls = docs.filter(d => !d.draft).map(d => `
  <url>
    <loc>${escXml(WIKI_URL)}/doc/${escXml(d.slug)}/</loc>
    ${d.updated ? `<lastmod>${escXml(d.updated)}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

  fs.writeFileSync(SITEMAP_PATH, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escXml(WIKI_URL)}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>${staticUrls}${urls}
</urlset>`);
  console.log(`✓ sitemap.xml${staticUrls ? ` (+${SITEMAP_STATIC_URLS.length} static page(s))` : ''}`);

  // ── feed.xml (RSS 2.0) ────────────────────────────────────────────
  const FEED_ITEM_LIMIT = 40;
  const rssDocs = docs
    .filter(d => !d.draft)
    .slice()
    .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))
    .slice(0, FEED_ITEM_LIMIT);

  const toRfc822 = d => {
    const date = d ? new Date(d + 'T00:00:00Z') : new Date();
    return isNaN(date) ? new Date().toUTCString() : date.toUTCString();
  };

  const rssItems = rssDocs.map(d => `
    <item>
      <title>${escXml(d.title)}</title>
      <link>${escXml(WIKI_URL)}/doc/${escXml(d.slug)}/</link>
      <guid isPermaLink="true">${escXml(WIKI_URL)}/doc/${escXml(d.slug)}/</guid>
      <description>${escXml(d.description || SITE_DESC)}</description>
      <pubDate>${toRfc822(d.updated)}</pubDate>
      <category>${escXml(d.section || 'Docs')}</category>
      <author>${escXml(AUTHOR)}</author>
    </item>`).join('');

  fs.writeFileSync(FEED_PATH, `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escXml(SITE_TITLE)}</title>
    <link>${escXml(WIKI_URL)}/</link>
    <description>${escXml(SITE_DESC)}</description>
    <language>${escXml(LANG)}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escXml(WIKI_URL)}/feed.xml" rel="self" type="application/rss+xml"/>${rssItems}
  </channel>
</rss>`);
  console.log(`✓ feed.xml  (${rssDocs.length} item(s))`);

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
    categories: ['education', 'reference', 'documentation'],
  }, null, 2));
  console.log(`✓ manifest.json (PWA)`);

// ── Static homepage prerender ────────────────────────────────────
// Inject the full docs section tree into the root index.html placeholder
// so crawlers/AI hitting / see every page title + link without JS.
// script-docs.js already understands prerendered #doc-content content.
function buildStaticDocsHomeHtml() {
  const sections = {};
  const order = [];
  for (const doc of docs) {
    if (!doc.slug || doc.draft) continue;
    const section = doc.section || doc.slug.split('/')[0] || 'Reference';
    if (!sections[section]) { sections[section] = []; order.push(section); }
    sections[section].push(doc);
  }
  let html = `\n<h1>${escHtml(SITE_TITLE)}</h1>\n<p>${escHtml(SITE_DESC)}</p>\n`;
  for (const section of order) {
    html += `\n<h2>${escHtml(section)}</h2>\n<ul>\n`;
    for (const d of sections[section]) {
      html += `  <li><a href="/doc/${d.slug}/">${escHtml(d.title)}</a>${d.description ? ` — ${escHtml(d.description.slice(0, 140))}` : ''}</li>\n`;
    }
    html += '</ul>\n';
  }
  return html;
}

function prerenderHome() {
  const indexPath = path.join(__dirname, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');

  // Idempotent: restore placeholder from any previous injection first.
  const prev = new RegExp(`${HOME_MARKER_START}[\\s\\S]*?${HOME_MARKER_END}`);
  if (prev.test(html)) {
    html = html.replace(prev, DOC_CONTENT_PLACEHOLDER);
  }
  if (!html.includes(DOC_CONTENT_PLACEHOLDER)) return;

  html = html.replace(
    DOC_CONTENT_PLACEHOLDER,
    `${HOME_MARKER_START}${buildStaticDocsHomeHtml()}${HOME_MARKER_END}`
  );
  fs.writeFileSync(indexPath, html);
  console.log('✓ index.html homepage prerendered (static docs tree)');
}

// ── llms.txt / llms-full.txt (AI discoverability) ────────────────
// llmstxt.org convention: curated markdown index + full corpus so AI
// crawlers (GPTBot, ClaudeBot, PerplexityBot, …) can ingest the docs
// without executing JavaScript.
function generateLlmsFiles() {
  const summary = 'Comprehensive technical documentation for Shanios — the immutable Linux OS with atomic blue-green updates. Architecture, installation, networking, security hardening, servers, containers, and troubleshooting reference for every subsystem.';

  // Group by top-level section (slug prefix), preserving nav order.
  const sections = {};
  const order = [];
  for (const doc of docs) {
    if (!doc.slug || doc.draft) continue;
    const section = doc.section || doc.slug.split('/')[0] || 'Reference';
    if (!sections[section]) { sections[section] = []; order.push(section); }
    sections[section].push(doc);
  }

  let idx = `# ${SITE_TITLE}\n\n> ${summary}\n\n`;
  idx += `Every page is also available as full-content HTML at ${WIKI_URL}/doc/<slug>/ and in the complete corpus at ${WIKI_URL}/llms-full.txt\n`;

  for (const section of order) {
    idx += `\n## ${section}\n\n`;
    for (const d of sections[section]) {
      const url = `${WIKI_URL}/doc/${d.slug}/`;
      idx += `- [${d.title}](${url}): ${(d.description || '').replace(/\n+/g, ' ').trim() || 'Documentation page'}\n`;
    }
  }
  fs.writeFileSync(path.join(__dirname, 'llms.txt'), idx);

  // Full corpus: every doc's complete markdown body, grouped by section.
  let full = `# ${SITE_TITLE} — Complete Documentation\n\n> ${summary}\n`;
  for (const section of order) {
    full += `\n\n# Section: ${section}\n`;
    for (const d of sections[section]) {
      const url = `${WIKI_URL}/doc/${d.slug}/`;
      full += `\n---\n\n# ${d.title}\n\nURL: ${url}\n${d.updated ? `Updated: ${d.updated}\n` : ''}${d.description ? `\n${d.description}\n` : ''}\n${(d.body || '').trim()}\n`;
    }
  }
  fs.writeFileSync(path.join(__dirname, 'llms-full.txt'), full);

  console.log(`✓ llms.txt (${order.length} sections, ${docs.filter(d => !d.draft).length} docs indexed)`);
  console.log(`✓ llms-full.txt (full corpus: ${Math.round(full.length / 1024)} KB)`);
}

// ── Service-worker cache busting ─────────────────────────────────
  // Same rationale as the blog generator: without a bump, the cache-first
  // SW serves stale script-docs.js/config-docs.js after every deploy.
  bumpServiceWorkerCache('shanidocs');

  // ── AI discoverability ───────────────────────────────────────────
  generateLlmsFiles();

  // ── Static homepage prerender (run last) ────────────────────────
  prerenderHome();


  // ── doc/<slug>/index.html stubs ─────────────────────────────────
  fs.mkdirSync(DOC_DIR, { recursive: true });

  const liveSlugs = new Set();
  let stubsWritten = 0;
  let stubsRemoved = 0;

  for (const doc of docs) {
    if (!doc.slug) continue;
    liveSlugs.add(doc.slug);
    const dir = path.join(DOC_DIR, ...doc.slug.split('/'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), buildStub(doc));
    stubsWritten++;
  }

  // Remove stubs for docs that no longer exist.
  //
  // BUGFIX: the previous version only recursed into a directory when
  // `!liveSlugs.has(slugPart)` — so once a slug like "guides" was itself a
  // live doc (doc/guides/index.html), its subdirectories (e.g. a stale
  // doc/guides/old/) were never even inspected, let alone removed. We now
  // always recurse first (post-order), then delete the directory only if,
  // after cleaning, it contains no index.html for itself and no children.
  function cleanStaleStubs(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const full     = path.join(dir, entry);
      const slugPart = prefix ? `${prefix}/${entry}` : entry;
      if (!fs.statSync(full).isDirectory()) continue; // skip stray files (.nojekyll, etc.)

      // Recurse first so nested stale stubs are always checked, even
      // when this directory itself corresponds to a live doc.
      cleanStaleStubs(full, slugPart);

      const isLive = liveSlugs.has(slugPart);
      if (isLive) continue; // this directory's own index.html is current — keep it

      const stillHasChildDirs = fs.readdirSync(full)
        .some(c => fs.statSync(path.join(full, c)).isDirectory());

      if (stillHasChildDirs) {
        // Not live itself, but a live nested doc still lives underneath
        // (e.g. doc/guides/ is stale but doc/guides/setup/ is current) —
        // keep the directory, just drop this level's own stale index.html.
        const own = path.join(full, 'index.html');
        if (fs.existsSync(own)) {
          fs.rmSync(own, { force: true });
          console.log(`  ✗ Removed stale stub: doc/${slugPart}/index.html`);
          stubsRemoved++;
        }
      } else {
        fs.rmSync(full, { recursive: true, force: true });
        console.log(`  ✗ Removed stale stub: doc/${slugPart}/`);
        stubsRemoved++;
      }
    }
  }
  cleanStaleStubs(DOC_DIR, '');

  console.log(`✓ doc/ stubs: ${stubsWritten} written${stubsRemoved ? `, ${stubsRemoved} stale removed` : ''}`);

  // ── Regenerate nav-docs.js from docs/ frontmatter ───────────────
  // Runs BEFORE the drift check so the check validates the fresh file.
  generateNavDocs(docs, NAV_PATH);

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
