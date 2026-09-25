/**
 * tests/doc-links.test.js
 *
 * Unit coverage for the shared canonical link resolver (doc-links.js).
 *
 * Why this exists: every Markdown file under docs/ links to sibling docs
 * RELATIVELY (per AGENTS.md's "Internal links are relative" convention), but
 * the site is a
 * directory-index SPA served at /doc/<slug>/. A relative href therefore
 * resolved against the *page* URL, not the doc slug, and every such link
 * turned into a 404 with no trailing slash. The resolver is the one place
 * that turns a relative doc link into the canonical /doc/<slug>/ form, and
 * it is shared by the browser renderer (script-docs.js) and the static stub
 * generator (generate-manifest.js) so the two can never diverge.
 *
 * Run: node --test tests/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const DocLinks = require(path.join(ROOT, 'doc-links.js'));

// The page that proved the bug: docs/system/cassini.md links to five
// cross-section pages plus one same-directory page, all relative.
const CASSINI = 'system/cassini';

test('doc-links.js exposes the shared API surface', () => {
  assert.equal(typeof DocLinks.resolveDocHref, 'function');
  assert.equal(typeof DocLinks.isExternalHref, 'function');
  assert.equal(typeof DocLinks.canonicalizeHtmlHrefs, 'function');
  assert.equal(DocLinks.DOC_BASE, '/doc/');
});

test('the five repaired Cassini cross-section links resolve canonically', () => {
  assert.equal(
    DocLinks.resolveDocHref('../concepts/blue-green', CASSINI),
    '/doc/concepts/blue-green/'
  );
  assert.equal(
    DocLinks.resolveDocHref('../updates/channels', CASSINI),
    '/doc/updates/channels/'
  );
  assert.equal(
    DocLinks.resolveDocHref('../updates/shani-health', CASSINI),
    '/doc/updates/shani-health/'
  );
  assert.equal(
    DocLinks.resolveDocHref('../updates/shani-reset', CASSINI),
    '/doc/updates/shani-reset/'
  );
  assert.equal(
    DocLinks.resolveDocHref('../security/tpm2', CASSINI),
    '/doc/security/tpm2/'
  );
});

test('a same-directory relative link resolves against the current slug', () => {
  assert.equal(DocLinks.resolveDocHref('backup', CASSINI), '/doc/system/backup/');
  // Nested current slug: the base is the slug's directory, never the whole slug.
  assert.equal(
    DocLinks.resolveDocHref('btrfs', 'arch/btrfs'),
    '/doc/arch/btrfs/'
  );
  assert.equal(
    DocLinks.resolveDocHref('../security/tpm2', 'software/containers/nested'),
    '/doc/software/security/tpm2/'
  );
});

test('.md links lose the extension and gain a trailing slash', () => {
  assert.equal(
    DocLinks.resolveDocHref('../concepts/blue-green.md', CASSINI),
    '/doc/concepts/blue-green/'
  );
  assert.equal(DocLinks.resolveDocHref('backup.md', CASSINI), '/doc/system/backup/');
  assert.equal(
    DocLinks.resolveDocHref('./backup.MD', CASSINI),
    '/doc/system/backup/'
  );
  // index.md / index are directory aliases, not distinct pages.
  assert.equal(
    DocLinks.resolveDocHref('../updates/index.md', CASSINI),
    '/doc/updates/'
  );
  assert.equal(
    DocLinks.resolveDocHref('../updates/', CASSINI),
    '/doc/updates/'
  );
});

test('fragments and query strings survive canonicalization', () => {
  assert.equal(
    DocLinks.resolveDocHref('../concepts/blue-green#immutability', CASSINI),
    '/doc/concepts/blue-green/#immutability'
  );
  assert.equal(
    DocLinks.resolveDocHref('backup?from=cassini', CASSINI),
    '/doc/system/backup/?from=cassini'
  );
  assert.equal(
    DocLinks.resolveDocHref('../updates/shani-health.md?x=1#run', CASSINI),
    '/doc/updates/shani-health/?x=1#run'
  );
  // Query-only and fragment-only hrefs have no path to resolve.
  assert.equal(DocLinks.resolveDocHref('#main-content', CASSINI), '#main-content');
  assert.equal(DocLinks.resolveDocHref('?q=wireguard', CASSINI), '?q=wireguard');
});

test('anchors, root-relative URLs and non-doc relatives are preserved verbatim', () => {
  assert.equal(DocLinks.resolveDocHref('#', CASSINI), '#');
  assert.equal(DocLinks.resolveDocHref('/', CASSINI), '/');
  assert.equal(DocLinks.resolveDocHref('/doc/system/backup/', CASSINI), '/doc/system/backup/');
  assert.equal(DocLinks.resolveDocHref('/feed.xml', CASSINI), '/feed.xml');
  // Already canonical / idempotent.
  const once = DocLinks.resolveDocHref('backup', CASSINI);
  assert.equal(DocLinks.resolveDocHref(once, CASSINI), once);
});

test('external schemes and protocol-relative URLs are left alone', () => {
  assert.equal(
    DocLinks.resolveDocHref('https://shani.dev/', CASSINI),
    'https://shani.dev/'
  );
  assert.equal(
    DocLinks.resolveDocHref('http://example.com/a/b', CASSINI),
    'http://example.com/a/b'
  );
  assert.equal(
    DocLinks.resolveDocHref('mailto:hi@shani.dev', CASSINI),
    'mailto:hi@shani.dev'
  );
  assert.equal(
    DocLinks.resolveDocHref('//cdn.jsdelivr.net/npm/marked', CASSINI),
    '//cdn.jsdelivr.net/npm/marked'
  );
});

test('relative image/download asset links are not rewritten', () => {
  assert.equal(
    DocLinks.resolveDocHref('../assets/diagram.png', CASSINI),
    '../assets/diagram.png'
  );
  assert.equal(
    DocLinks.resolveDocHref('backup.zip', CASSINI),
    'backup.zip'
  );
  assert.equal(
    DocLinks.resolveDocHref('../downloads/shani.iso', CASSINI),
    '../downloads/shani.iso'
  );
});

test('a relative link that climbs past the doc root lands on /doc/', () => {
  assert.equal(DocLinks.resolveDocHref('../../', CASSINI), '/doc/');
  assert.equal(DocLinks.resolveDocHref('..', CASSINI), '/doc/');
});

test('empty / non-string input is returned untouched', () => {
  assert.equal(DocLinks.resolveDocHref('', CASSINI), '');
  assert.equal(DocLinks.resolveDocHref(undefined, CASSINI), undefined);
  assert.equal(DocLinks.resolveDocHref(null, CASSINI), null);
  assert.equal(DocLinks.resolveDocHref(42, CASSINI), 42);
});

test('isExternalHref keeps the pre-existing target=_blank rule', () => {
  assert.equal(DocLinks.isExternalHref('https://shani.dev/'), true);
  assert.equal(DocLinks.isExternalHref('mailto:hi@shani.dev'), true);
  assert.equal(DocLinks.isExternalHref('#main-content'), false);
  assert.equal(DocLinks.isExternalHref('/doc/system/backup/'), false);
  assert.equal(DocLinks.isExternalHref(''), false);
  // A relative doc link, once resolved, is internal — this is the bug.
  assert.equal(DocLinks.isExternalHref(DocLinks.resolveDocHref('backup', CASSINI)), false);
});

test('canonicalizeHtmlHrefs rewrites every href but leaves the rest intact', () => {
  const html = [
    '<p><a href="../concepts/blue-green">Blue-Green</a>',
    '<a href="backup">Backup</a>',
    '<a href="../updates/shani-health#run">health</a>',
    '<a href="https://shani.dev/">site</a>',
    '<a href="#main-content">top</a>',
    '<a href="/feed.xml">feed</a>',
    '<img src="../assets/diagram.png" alt="d">',
    '<a href=\'../security/tpm2\'>single</a></p>',
  ].join('');

  const out = DocLinks.canonicalizeHtmlHrefs(html, CASSINI);

  assert.match(out, /<a href="\/doc\/concepts\/blue-green\/">/);
  assert.match(out, /<a href="\/doc\/system\/backup\/">/);
  assert.match(out, /<a href="\/doc\/updates\/shani-health\/#run">/);
  assert.match(out, /<a href=['"]\/doc\/security\/tpm2\/['"]>/);
  assert.match(out, /<a href="https:\/\/shani\.dev\/">/);
  assert.match(out, /<a href="#main-content">/);
  assert.match(out, /<a href="\/feed\.xml">/);
  // Images and downloads keep their original relative src.
  assert.match(out, /<img src="\.\.\/assets\/diagram\.png"/);
  // Nothing left in the relative form.
  assert.doesNotMatch(out, /href="(\.\.\/)?(updates|concepts|security)\//);
  assert.doesNotMatch(out, /href="backup"/);
});

test('canonicalizeHtmlHrefs decodes and re-escapes href entities', () => {
  const html = '<a href="backup?a=1&amp;b=2">x</a>';
  assert.equal(
    DocLinks.canonicalizeHtmlHrefs(html, CASSINI),
    '<a href="/doc/system/backup/?a=1&amp;b=2">x</a>'
  );
});

test('canonicalizeHtmlHrefs leaves escaped code samples untouched', () => {
  // Fenced code is HTML-escaped by the converters, so quotes inside a code
  // sample never form a real attribute and must not be rewritten.
  const html = '<pre><code>&lt;a href=&quot;backup&quot;&gt;x&lt;/a&gt;</code></pre>';
  assert.equal(DocLinks.canonicalizeHtmlHrefs(html, CASSINI), html);
});

test('canonicalizeHtmlHrefs is a no-op for non-string input', () => {
  assert.equal(DocLinks.canonicalizeHtmlHrefs(null, CASSINI), null);
  assert.equal(DocLinks.canonicalizeHtmlHrefs(undefined, CASSINI), undefined);
});

test('canonicalizeHtmlHrefs is deterministic (idempotent)', () => {
  const html = '<a href="backup">Backup</a>';
  const once = DocLinks.canonicalizeHtmlHrefs(html, CASSINI);
  const twice = DocLinks.canonicalizeHtmlHrefs(once, CASSINI);
  assert.equal(once, twice);
});

test('the UMD wrapper exposes DocLinks as a browser global (no module/exports)', () => {
  // script-docs.js reads the global, not a require — if the wrapper only
  // worked under Node, every link on the live site would silently fall back
  // to the identity shim. A plain <script> context has neither `module` nor
  // `exports` in scope.
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'doc-links.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.DocLinks, 'object');
  assert.equal(sandbox.DocLinks.DOC_BASE, '/doc/');
  assert.equal(sandbox.DocLinks.resolveDocHref('backup', CASSINI), '/doc/system/backup/');
  assert.equal(sandbox.DocLinks.isExternalHref('https://shani.dev'), true);
  // No CommonJS leakage into the browser global.
  assert.equal(sandbox.module, undefined);
});
