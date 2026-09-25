/**
 * tests/generated-contract.test.js
 *
 * Contract checks over the GENERATED static output and the load order that
 * makes the client half work.
 *
 * The resolver itself is unit-tested in tests/doc-links.test.js. What this
 * file guards is the wiring: both renderers must go through that one shared
 * helper, root index.html must load it before script-docs.js (generated stubs
 * inherit index.html verbatim), the service worker must precache it, and the
 * Cassini stub on disk must already carry canonical hrefs.
 *
 * Run: node --test tests/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const CASSINI_STUB = read('doc/system/cassini/index.html');
const INDEX_HTML = read('index.html');
const SCRIPT_DOCS = read('script-docs.js');
const GENERATOR = read('generate-manifest.js');
const SW = read('sw.js');

test('the generated Cassini stub carries canonical /doc/<slug>/ hrefs', () => {
  const expected = [
    '/doc/concepts/blue-green/',
    '/doc/updates/channels/',
    '/doc/updates/shani-health/',
    '/doc/updates/shani-reset/',
    '/doc/security/tpm2/',
    '/doc/system/backup/',
  ];
  for (const href of expected) {
    assert.ok(
      CASSINI_STUB.includes(`href="${href}"`),
      `doc/system/cassini/index.html is missing href="${href}"`
    );
  }
});

test('the generated Cassini stub no longer contains the broken relative hrefs', () => {
  for (const href of [
    'href="../concepts/blue-green"',
    'href="../updates/channels"',
    'href="../updates/shani-health"',
    'href="../updates/shani-reset"',
    'href="../security/tpm2"',
    'href="backup"',
  ]) {
    assert.ok(
      !CASSINI_STUB.includes(href),
      `doc/system/cassini/index.html still contains ${href}`
    );
  }
});

test('the generated stub preserves external links, root links and assets', () => {
  // External hrefs are byte-identical to what the Markdown authored.
  assert.match(CASSINI_STUB, /<a href="https:\/\/shani\.dev"/);
  assert.match(read('doc/faq/index.html'), /<a href="https:\/\/t\.me\/shani8dev">/);
  assert.match(CASSINI_STUB, /href="#main-content"/);
  assert.match(CASSINI_STUB, /<link rel="canonical"[^>]*href="https:\/\/docs\.shani\.dev\/doc\/system\/cassini\/"/);
  // Assets are never rewritten into /doc/ paths.
  assert.ok(
    !/<img[^>]+src="\/doc\//.test(CASSINI_STUB),
    'an image src was rewritten into a /doc/ path'
  );
});

test('the external target=_blank rule survives in the browser renderer', () => {
  // target="_blank" is a client-render concern (the generator's
  // dependency-free converter never emitted it), so the contract to protect
  // is that script-docs.js still applies it — now to the RESOLVED href.
  assert.match(SCRIPT_DOCS, /target="_blank" rel="noopener noreferrer"/);
  assert.match(SCRIPT_DOCS, /DocLink\.isExternalHref\(resolved\)/);
});

test('root index.html loads doc-links.js before script-docs.js', () => {
  const docLinks = INDEX_HTML.indexOf('src="/doc-links.js"');
  const scriptDocs = INDEX_HTML.indexOf('src="/script-docs.js"');
  assert.ok(docLinks !== -1, 'index.html does not load /doc-links.js');
  assert.ok(scriptDocs !== -1, 'index.html does not load /script-docs.js');
  assert.ok(
    docLinks < scriptDocs,
    '/doc-links.js must be loaded before /script-docs.js'
  );
});

test('every generated stub inherits the resolver script tag from index.html', () => {
  // buildStub() splices into the real index.html, so one spot check on a
  // second stub proves the inheritance rather than re-scanning 202 files.
  const other = read('doc/concepts/blue-green/index.html');
  const docLinks = other.indexOf('src="/doc-links.js"');
  const scriptDocs = other.indexOf('src="/script-docs.js"');
  assert.ok(docLinks !== -1, 'a generated stub is missing /doc-links.js');
  assert.ok(docLinks < scriptDocs, 'a generated stub loads /script-docs.js first');
});

test('the service worker precaches doc-links.js', () => {
  const shell = SW.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(shell, 'sw.js has no SHELL array');
  assert.ok(
    shell[1].includes("'/doc-links.js'"),
    'sw.js SHELL does not precache /doc-links.js (addAll() is all-or-nothing)'
  );
});

test('both renderers use the one shared resolver, not a local copy', () => {
  assert.ok(
    /require\(['"]\.\/doc-links\.js['"]\)/.test(GENERATOR),
    'generate-manifest.js does not require the shared resolver'
  );
  assert.ok(
    /DocLinks\./.test(GENERATOR),
    'generate-manifest.js never calls the shared resolver'
  );
  assert.ok(
    /DocLinks/.test(SCRIPT_DOCS),
    'script-docs.js never calls the shared resolver'
  );
  // The slug must actually reach the renderer, otherwise relative links
  // cannot be resolved at all.
  assert.ok(
    /buildMarkedHtml\(body,\s*slug\)/.test(SCRIPT_DOCS),
    'renderDoc() does not pass its slug into buildMarkedHtml()'
  );
  assert.ok(
    /buildMarkedHtml\(body,\s*_slug\)/.test(SCRIPT_DOCS),
    'the editor preview does not pass _slug into buildMarkedHtml()'
  );
  assert.ok(
    /mdToHtml\(stripDuplicateLeadingH1\(doc\.body \|\| ''\),\s*doc\.slug\)/.test(GENERATOR),
    'buildStub() does not pass doc.slug into mdToHtml()'
  );
});
