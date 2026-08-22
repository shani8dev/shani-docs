# shani-docs

`docs/` holds the authored Markdown source; `doc/` holds generated static HTML stubs (written by `generate-manifest.js` and committed by CI) that exist only so GitHub Pages/crawlers get a real page — the live site is an SPA that reads `docs/` at runtime.