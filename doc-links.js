/**
 * doc-links.js — shared canonical link resolver (UMD, dependency-free)
 *
 * The bug this exists to fix
 * --------------------------
 * Per AGENTS.md's authoring convention, every Markdown file under docs/ links
 * to sibling docs RELATIVELY: `[Backup](backup)`,
 * `[shani-health](../updates/shani-health)`.
 * But the site is served as a directory-index SPA: a doc lives at
 * /doc/<slug>/ and its Markdown lives at docs/<slug>.md. A relative href is
 * therefore resolved by the browser against the PAGE url, not the doc slug,
 * so on /doc/system/cassini/ every one of those links became
 * /doc/system/backup (no trailing slash, one directory too high) and 404'd.
 *
 * script-docs.js used to classify anything that did not start with '#' or
 * '/' as external, so those broken relatives also silently got
 * target="_blank" rel="noopener noreferrer".
 *
 * The fix
 * --------
 * One resolver, used by BOTH renderers, so the prerendered static stub
 * (generate-manifest.js) and the client render (script-docs.js) can never
 * disagree:
 *
 *   script-docs.js        renderer.link  → resolveDocHref(href, slug)
 *   generate-manifest.js  mdToHtml       → canonicalizeHtmlHrefs(html, slug)
 *
 * What is canonicalized: relative document links (same-directory, `../`,
 * `./`, `.md`, with `#fragment` and `?query` preserved) become
 * /doc/<resolved-slug>/.
 *
 * What is preserved verbatim: `#fragment` anchors, root-relative URLs
 * (already canonical or deliberately absolute), absolute URLs and any other
 * scheme (http:, https:, mailto:, …), protocol-relative `//host/…` URLs, and
 * relative non-document references (images, downloads, anything with a
 * non-.md file extension).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();   // Node: generate-manifest.js + node:test
  } else {
    root.DocLinks = factory();     // Browser: <script src="/doc-links.js">
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Every doc page is served from this prefix with a trailing slash.
  const DOC_BASE = '/doc/';

  const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

  // Split "path?query#fragment" into its three parts. The fragment is taken
  // first because a '#' can legally appear inside a query string.
  function splitUrl(href) {
    let rest = href;
    let fragment = '';
    const hash = rest.indexOf('#');
    if (hash !== -1) {
      fragment = rest.slice(hash);
      rest = rest.slice(0, hash);
    }
    let query = '';
    const q = rest.indexOf('?');
    if (q !== -1) {
      query = rest.slice(q);
      rest = rest.slice(0, q);
    }
    return { path: rest, query, fragment };
  }

  // A relative reference is a DOCUMENT link only when its last segment has no
  // extension, or a .md extension. Anything else (backup.zip, diagram.png,
  // shani.iso) is an asset/download and must be left exactly as authored.
  function isDocumentPath(path) {
    const trimmed = path.replace(/\/+$/, '');
    if (trimmed === '') return false;
    const lastSlash = trimmed.lastIndexOf('/');
    const base = trimmed.slice(lastSlash + 1);
    // A segment of only dots ('..', '.') is a directory traversal, not a
    // filename — '../..' must not be mistaken for an extensionless file.
    if (/^\.+$/.test(base)) return true;
    const dot = base.lastIndexOf('.');
    if (dot <= 0) return true;                       // no extension
    return base.slice(dot + 1).toLowerCase() === 'md';
  }

  // Resolve a relative doc path against the CURRENT DOC SLUG (not against a
  // URL), so the same function works identically in the browser (which knows
  // the slug from the router) and in the generator (which knows doc.slug).
  function resolveRelativeSlug(path, currentSlug) {
    const segments = [];
    const baseSlug = typeof currentSlug === 'string' ? currentSlug : '';
    // The slug's own filename segment is not part of the base directory:
    // 'system/cassini' means the file is in 'system/'.
    if (baseSlug) {
      baseSlug.split('/').slice(0, -1).forEach((s) => { if (s) segments.push(s); });
    }
    path.split('/').forEach((raw) => {
      if (!raw || raw === '.') return;
      if (raw === '..') { segments.pop(); return; }
      segments.push(raw);
    });
    // 'updates/index' is a directory alias for 'updates'.
    if (segments.length && segments[segments.length - 1].toLowerCase() === 'index') {
      segments.pop();
    }
    return segments.join('/');
  }

  /**
   * Resolve one href to its canonical form.
   * @param {string} href          href as authored (no HTML entities)
   * @param {string} currentSlug   slug of the doc the href appears in
   * @returns {string}             canonical href, or href unchanged
   */
  function resolveDocHref(href, currentSlug) {
    if (typeof href !== 'string' || href === '') return href;

    // Same-page fragment.
    if (href.startsWith('#')) return href;
    // Protocol-relative URL (//host/path) — not ours to rewrite.
    if (href.startsWith('//')) return href;
    // Any absolute scheme: https:, mailto:, tel:, data:, …
    if (SCHEME_RE.test(href)) return href;
    // Root-relative: either already canonical, or a deliberate absolute path.
    if (href.startsWith('/')) return href;

    const { path, query, fragment } = splitUrl(href);
    // Query-only or fragment-only: nothing to resolve.
    if (path === '') return href;
    if (!isDocumentPath(path)) return href;

    const slug = resolveRelativeSlug(path.replace(/\.md$/i, ''), currentSlug);
    return DOC_BASE + slug + (slug ? '/' : '') + query + fragment;
  }

  /**
   * The pre-existing "opens in a new tab" rule, applied to the RESOLVED
   * href — which is what makes a relative doc link internal rather than
   * external. Kept here so the browser renderer has no local copy.
   * @param {string} href
   * @returns {boolean}
   */
  function isExternalHref(href) {
    return !!href && !href.startsWith('#') && !href.startsWith('/');
  }

  function decodeAttr(value) {
    return value
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function encodeAttr(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Canonicalize every href attribute in a block of generated HTML.
   *
   * Used by the static stub generator, which renders with either the real
   * `marked` package or its own dependency-free converter — both emit
   * `href="…"` and both HTML-escape code spans and fenced code blocks, so
   * escaped markup (`&lt;a href=&quot;…`) never forms a real attribute and
   * is not touched. Only href is rewritten: src (images, downloads) and every
   * other attribute are left byte-for-byte alone.
   *
   * @param {string} html
   * @param {string} currentSlug
   * @returns {string}
   */
  function canonicalizeHtmlHrefs(html, currentSlug) {
    if (typeof html !== 'string' || html === '') return html;
    return html.replace(
      /(\shref\s*=\s*)(["'])([^"']*)\2/gi,
      (match, prefix, quote, rawValue) => {
        const decoded = decodeAttr(rawValue);
        const resolved = resolveDocHref(decoded, currentSlug);
        if (resolved === decoded) return match;
        return prefix + quote + encodeAttr(resolved) + quote;
      }
    );
  }

  return {
    DOC_BASE,
    resolveDocHref,
    isExternalHref,
    canonicalizeHtmlHrefs
  };
});
