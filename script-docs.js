/**
 * script-docs.js — Coda-style Wiki SPA Engine + Full Inline Admin
 * ─────────────────────────────────────────────────────────────────
 * Architecture: Config → NavTree → Router → DocLoader → Renderer
 *               + InlineEditor (Edit mode) with full admin panel:
 *                 • Monaco editor + split/preview panes
 *                 • Front-matter bar
 *                 • Inline Nav tree editor (add/edit/delete/reorder groups & pages)
 *                 • New page creation + doc deletion
 *                 • Draft auto-save to sessionStorage
 *                 • GitHub API commit (PUT /repos/…/contents/…) commit to branch and create PR if main is protected
 * Load order: config-docs.js → nav-docs.js → script-docs.js
 */

if (typeof CONFIG === 'undefined') {
  throw new Error('[Wiki Engine] No CONFIG found. Load config-docs.js before script-docs.js.');
}

// ── Helpers ──────────────────────────────────────────────────────
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
const esc  = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const escJs = s => String(s || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const pfx  = (CONFIG.STORAGE_PREFIX || 'wiki') + '_';
const key  = k => pfx + k;
const today    = () => new Date().toISOString().split('T')[0];
const docPath  = slug => `docs/${slug}.md`;
const draftKey = slug => `wdraft_${slug}`;

// ── State ─────────────────────────────────────────────────────────
const State = {
  theme:      localStorage.getItem(key('theme')) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  docCache:   {},
  currentSlug: null,
  searchIndex: [],
  fontSize:   parseInt(localStorage.getItem(key('fontsize')) || '16'),
  editMode:   false,
};

// ── Apply initial theme ───────────────────────────────────────────
document.documentElement.setAttribute('data-theme', State.theme);

// ══════════════════════════════════════════════════════════════════
//  VIEW COUNTER — privacy-safe, localStorage only
// ══════════════════════════════════════════════════════════════════
const ViewCounter = {
  get(slug) {
    if (CONFIG.VIEW_COUNT_ENABLED === false) return 0;
    return parseInt(localStorage.getItem(key('views:' + slug)) || '0');
  },
  increment(slug) {
    if (CONFIG.VIEW_COUNT_ENABLED === false) return;
    const sessionKey = 'view_counted_' + slug;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, '1');
    const count = this.get(slug) + 1;
    localStorage.setItem(key('views:' + slug), count);
    return count;
  },
  fmt(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }
};

// ══════════════════════════════════════════════════════════════════
//  READING STREAK — consecutive-day visitor tracking
// ══════════════════════════════════════════════════════════════════
const ReadingStreak = {
  get() {
    return parseInt(localStorage.getItem(key('streak')) || '0');
  },
  update() {
    if (CONFIG.STREAK_ENABLED === false) return;
    const todayStr  = new Date().toDateString();
    const last      = localStorage.getItem(key('streak_date'));
    if (last === todayStr) return;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const streak    = last === yesterday ? this.get() + 1 : 1;
    localStorage.setItem(key('streak'), streak);
    localStorage.setItem(key('streak_date'), todayStr);
    return streak;
  },
  render() {
    if (CONFIG.STREAK_ENABLED === false) return;
    const streak = this.get();
    if (streak < 2) return;
    if (document.getElementById('streak-badge')) return;
    const badge = document.createElement('span');
    badge.id        = 'streak-badge';
    badge.className = 'streak-badge';
    badge.title     = `You've visited ${streak} days in a row!`;
    badge.innerHTML = `🔥 <span>${streak}</span>`;
    const actions = document.querySelector('.topbar__actions');
    // Insert before the GitHub link (last item) so it doesn't displace auspicious
    if (actions) {
      const ghLink = actions.querySelector('a[aria-label="View on GitHub"]');
      if (ghLink) actions.insertBefore(badge, ghLink);
      else actions.appendChild(badge);
    }
  }
};

// ══════════════════════════════════════════════════════════════════
//  RELATIVE DATE HELPER
// ══════════════════════════════════════════════════════════════════
const RelDate = {
  fmt(dateStr) {
    const d   = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    if (isNaN(d)) return '';
    const diff = Math.floor((now - d) / 1000);
    if (diff < 3600)   return 'just now';
    if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
    const days = Math.floor(diff / 86400);
    if (days < 7)   return `${days}d ago`;
    if (days < 30)  return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  }
};

// ══════════════════════════════════════════════════════════════════
//  WORD COUNT HELPER
// ══════════════════════════════════════════════════════════════════
const WordCount = {
  count(body) {
    return body ? body.trim().split(/\s+/).filter(Boolean).length : 0;
  },
  readTime(body) {
    const words = this.count(body);
    const mins  = Math.max(1, Math.round(words / 200));
    return `${mins} min read`;
  },
  fmt(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k words';
    return n + ' words';
  }
};

// ══════════════════════════════════════════════════════════════════
//  RECENTLY VIEWED DOCS TRACKER
// ══════════════════════════════════════════════════════════════════
const RecentlyViewed = {
  get() {
    try { return JSON.parse(localStorage.getItem(key('recently_viewed')) || '[]'); } catch { return []; }
  },
  add(slug) {
    const max  = CONFIG.RECENTLY_VIEWED_COUNT || 5;
    const list = this.get().filter(s => s !== slug);
    list.unshift(slug);
    localStorage.setItem(key('recently_viewed'), JSON.stringify(list.slice(0, max)));
  },
  getSlugs() { return this.get(); }
};

// ══════════════════════════════════════════════════════════════════
//  GITHUB API CLIENT
// ══════════════════════════════════════════════════════════════════
const GH = (() => {
  const GH_API   = 'https://api.github.com';
  const TOKEN_KEY = key('gh_token');
  let _user = null;

  function getToken()  {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  }
  function setToken(t) {
    const v = t.trim();
    sessionStorage.setItem(TOKEN_KEY, v);
    localStorage.setItem(TOKEN_KEY, v);
  }
  function clearToken(){
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }

  async function request(path, opts = {}) {
    const token = getToken();
    const res = await fetch(`${GH_API}${path}`, {
      ...opts,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) {
      if (res.status === 401) { clearToken(); throw new Error('GitHub token invalid (401). Please re-enter your PAT.'); }
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `GitHub API ${res.status}`);
    }
    return res.status === 204 ? null : res.json();
  }

  async function getFile(path) {
    try {
      const data = await request(`/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/contents/${path}?ref=${encodeURIComponent(CONFIG.GITHUB_BRANCH||'main')}`);
      const raw  = atob(data.content.replace(/\n/g,''));
      const content = new TextDecoder('utf-8').decode(Uint8Array.from(raw, c => c.charCodeAt(0)));
      return { content, sha: data.sha, exists: true };
    } catch(e) {
      if (e.message.includes('404') || e.message.includes('Not Found')) return { content:'', sha: null, exists: false };
      throw e;
    }
  }

  async function putFile(repoPath, textContent, commitMsg, sha) {
    const body = {
      message: commitMsg,
      content: btoa(unescape(encodeURIComponent(textContent))),
      branch:  CONFIG.GITHUB_BRANCH || 'main',
    };
    if (sha) body.sha = sha;
    return request(`/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/contents/${repoPath}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function deleteFile(repoPath, sha, commitMsg) {
    return request(`/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/contents/${repoPath}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: commitMsg, sha, branch: CONFIG.GITHUB_BRANCH || 'main' }),
    });
  }

  async function listDir(dirPath) {
    try {
      return await request(`/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/contents/${dirPath}?ref=${encodeURIComponent(CONFIG.GITHUB_BRANCH||'main')}`);
    } catch(e) {
      if (e.message.includes('404')) return [];
      throw e;
    }
  }

  async function getUser() {
    if (_user) return _user;
    _user = await request('/user');
    return _user;
  }

  async function getBaseSha(branch) {
    const data = await request(`/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/git/ref/heads/${encodeURIComponent(branch)}`);
    return data.object.sha;
  }

  async function ensureBranch(newBranch, baseBranch) {
    // Check if branch already exists
    try {
      await request(`/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/git/ref/heads/${encodeURIComponent(newBranch)}`);
      return; // already exists
    } catch(e) {
      if (!e.message.includes('404') && !e.message.includes('Not Found')) throw e;
    }
    // Create branch from base
    const sha = await getBaseSha(baseBranch);
    await request(`/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/git/refs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha }),
    });
  }

  async function createPR(headBranch, baseBranch, title, body = '') {
    return request(`/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/pulls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, head: headBranch, base: baseBranch }),
    });
  }

  return { getToken, setToken, clearToken, getFile, putFile, deleteFile, listDir, getUser, request, ensureBranch, createPR };
})();

// ══════════════════════════════════════════════════════════════════
//  NAV TREE HELPERS
// ══════════════════════════════════════════════════════════════════
function buildSearchIndex(tree) {
  const idx = [];
  tree.forEach(item => {
    if (item.slug) idx.push({ title: item.title, slug: item.slug, group: '' });
    if (item.children) {
      item.children.forEach(child => {
        idx.push({ title: child.title, slug: child.slug, group: item.title });
      });
    }
  });
  return idx;
}

function renderNavTree(tree, activeSlug) {
  const nav = $('#wiki-nav');
  if (!nav) return;
  nav.innerHTML = '';

  tree.forEach(item => {
    const li = document.createElement('div');
    li.className = 'nav-item';

    if (!item.children) {
      li.classList.add('nav-item--standalone');
      const btn = document.createElement('button');
      btn.className = 'nav-item__group-btn' + (item.slug === activeSlug ? ' is-active' : '');
      btn.innerHTML = `
        <span class="nav-item__icon"><i class="${esc(item.icon || 'fa-solid fa-file')}"></i></span>
        <span class="nav-item__label">${esc(item.title)}</span>`;
      btn.addEventListener('click', () => navigate(item.slug));
      li.appendChild(btn);
    } else {
      const hasActive = item.children.some(c => c.slug === activeSlug);
      const groupBtn = document.createElement('button');
      groupBtn.className = 'nav-item__group-btn' + (hasActive ? ' is-active' : '');
      groupBtn.setAttribute('aria-expanded', hasActive ? 'true' : 'false');
      groupBtn.innerHTML = `
        <span class="nav-item__icon"><i class="${esc(item.icon || 'fa-solid fa-folder')}"></i></span>
        <span class="nav-item__label">${esc(item.title)}</span>
        <i class="fa-solid fa-chevron-right nav-item__chevron"></i>`;

      const children = document.createElement('div');
      children.className = 'nav-item__children' + (hasActive ? ' is-open' : '');

      item.children.forEach(child => {
        const leaf = document.createElement('div');
        leaf.className = 'nav-leaf' + (child.slug === activeSlug ? ' is-active' : '');
        leaf.setAttribute('role', 'button');
        leaf.setAttribute('tabindex', '0');
        leaf.setAttribute('aria-label', child.title);
        leaf.innerHTML = `<span class="nav-leaf__dot"></span>${esc(child.title)}`;
        leaf.addEventListener('click', () => navigate(child.slug));
        leaf.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(child.slug); } });
        children.appendChild(leaf);
      });

      groupBtn.addEventListener('click', () => {
        const open = children.classList.toggle('is-open');
        groupBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      li.appendChild(groupBtn);
      li.appendChild(children);
    }

    nav.appendChild(li);
  });
}

// ── Router ────────────────────────────────────────────────────────
function getSlugFromHash() {
  // Support path-style URLs: /doc/<slug>
  const p = location.pathname;
  if (p.startsWith('/doc/')) return decodeURIComponent(p.slice(5));
  // Legacy hash fallback: #doc/<slug> or #/<slug>
  const h = location.hash.slice(1);
  if (h.startsWith('doc/')) return h.slice(4);
  if (h.startsWith('/'))    return h.slice(1);
  return h || null;
}

function navigate(slug, pushState = true) {
  if (State.editMode) {
    if (!confirm('You have unsaved changes. Leave editing?')) return;
    exitEditMode();
  }
  if (slug != null && slug === State.currentSlug && pushState) return;
  State.currentSlug = slug;

  if (pushState) history.pushState({ slug }, '', slug ? `/doc/${slug}` : '/');

  renderNavTree(CONFIG.NAV_TREE, slug);
  closeSearch();
  const sidebarEl = $('#wiki-sidebar');
  const overlayEl = $('#sidebar-overlay');
  if (sidebarEl) sidebarEl.classList.remove('is-open');
  if (overlayEl) overlayEl.classList.remove('is-visible');
  $('#menu-toggle')?.setAttribute('aria-expanded', 'false');

  if (!slug) { renderHome(); return; }

  // Section landing pages use a synthetic slug: _section:GroupTitle
  if (slug.startsWith('_section:')) {
    const groupTitle = decodeURIComponent(slug.slice(9));
    const groupItem  = CONFIG.NAV_TREE.find(item => item.children && item.title === groupTitle);
    if (groupItem) { renderSectionPage(groupItem); return; }
  }

  loadDoc(slug);
}

window.addEventListener('popstate', () => navigate(getSlugFromHash(), false));

// ── Doc Loader ────────────────────────────────────────────────────
async function loadDoc(slug) {
  const content = $('#doc-content');
  if (!content) return;

  // Reset wide layout when navigating to a regular doc
  const inner = content.closest('.content__inner');
  if (inner) inner.classList.remove('content__inner--wide');

  content.innerHTML = `
    <div class="doc-skeleton">
      <div class="doc-skeleton__line doc-skeleton__line--title"></div>
      <div class="doc-skeleton__line doc-skeleton__line--wide" style="margin-top:1.5rem"></div>
      <div class="doc-skeleton__line doc-skeleton__line--mid"></div>
      <div class="doc-skeleton__line doc-skeleton__line--wide"></div>
      <div class="doc-skeleton__line doc-skeleton__line--short"></div>
    </div>`;

  $('.content')?.scrollTo(0, 0);

  if (State.docCache[slug]) { renderDoc(slug, State.docCache[slug]); return; }

  const base = CONFIG.DOCS_BASE_URL ? CONFIG.DOCS_BASE_URL.replace(/\/$/, '') : '';
  const urls = [
    `${base}/docs/${slug}.md`,
    `https://raw.githubusercontent.com/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/${CONFIG.GITHUB_BRANCH || 'main'}/docs/${slug}.md`,
  ];

  let text = null;
  for (const url of urls) {
    try { const res = await fetch(url); if (res.ok) { text = await res.text(); break; } } catch {}
  }

  if (!text) {
    content.innerHTML = `
      <div class="doc-error">
        <div class="doc-error__icon"><i class="fa-solid fa-file-circle-xmark"></i></div>
        <h2>Page not found</h2>
        <p>The doc <code>${esc(slug)}</code> doesn't exist yet.</p>
        <p style="margin-top:1rem;font-size:0.85rem;color:var(--color-text-faint)">
          ${GH.getToken() ? `<button onclick="AdminEditor.newDoc('${esc(slug)}')" style="color:var(--color-accent);background:none;border:1px solid var(--color-accent);border-radius:4px;padding:.3rem .7rem;cursor:pointer;font-size:.82rem"><i class='fa-solid fa-plus'></i> Create this page</button>` : `Want to contribute? <a href="https://github.com/${esc(CONFIG.GITHUB_USER)}/${esc(CONFIG.GITHUB_REPO)}" target="_blank" rel="noopener" style="color:var(--color-accent)">Edit on GitHub</a>.`}
        </p>
      </div>`;
    return;
  }

  State.docCache[slug] = text;
  renderDoc(slug, text);
}

// ── Doc Renderer ──────────────────────────────────────────────────
function parseFm(raw) {
  const m = raw.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const fm = {};
  m[1].split(/\r?\n/).forEach(line => {
    const i = line.indexOf(':');
    if (i < 1) return;
    const rawVal = line.slice(i + 1).trim();
    // Strip only the outermost matching quote pair — preserves URLs with colons
    fm[line.slice(0, i).trim()] = rawVal.replace(/^(['"`])([\s\S]*)\1$/, '$2');
  });
  return { fm, body: m[2] };
}

function renderDoc(slug, raw) {
  const content = $('#doc-content');
  if (!content) return;

  const { fm, body } = parseFm(raw);

  const title   = fm.title   || slugToTitle(slug);
  const section = fm.section || getGroupTitle(slug);

  document.title = `${title} — ${CONFIG.SITE_TITLE}`;
  $('#meta-desc')?.setAttribute('content', fm.description || fm.excerpt || CONFIG.SITE_DESCRIPTION);

  // Track view and recently viewed
  ViewCounter.increment(slug);
  RecentlyViewed.add(slug);
  const viewCount = ViewCounter.get(slug);

  let html = buildMarkedHtml(body);

  const tmpDiv = document.createElement('div');
  tmpDiv.innerHTML = html;
  const headings = tmpDiv.querySelectorAll('h2,h3,h4');
  let tocHtml = '';
  if (headings.length > 2) {
    const items = [...headings].map(h => {
      const id = h.id || slugify(h.textContent);
      h.id = id;
      // Inject anchor link
      const anchor = document.createElement('a');
      anchor.className = 'heading-anchor';
      anchor.href = '#' + id;
      anchor.setAttribute('aria-hidden', 'true');
      anchor.textContent = '#';
      h.appendChild(anchor);
      return `<li class="doc-toc__item doc-toc__item--${h.tagName.toLowerCase()}">
        <a href="#${id}" class="doc-toc__link">${esc(h.textContent.replace(/#\s*$/, '').trim())}</a></li>`;
    }).join('');
    tocHtml = `<nav class="doc-toc" aria-label="On this page">
      <div class="doc-toc__title">On this page</div>
      <ul class="doc-toc__list">${items}</ul></nav>`;
  }
  html = tmpDiv.innerHTML;

  // Freshness badge
  const _postDate = fm.updated || fm.date || '';
  const _postAge  = _postDate ? Math.floor((Date.now() - new Date(_postDate + 'T00:00:00')) / 86400000) : 999;
  const _newDays    = CONFIG.NEW_DOC_DAYS    || 7;
  const _recentDays = CONFIG.RECENT_DOC_DAYS || 30;
  const _freshBadge = _newDays > 0 && _postAge <= _newDays
    ? '<span class="freshness-badge freshness-badge--new">New</span>'
    : (_recentDays > 0 && _postAge <= _recentDays
      ? '<span class="freshness-badge freshness-badge--recent">Recently Updated</span>'
      : '');

  // Word count + read time
  const _wc     = WordCount.count(body);
  const _rt     = WordCount.readTime(body);
  const _relUpd = fm.updated ? RelDate.fmt(fm.updated) : (fm.date ? RelDate.fmt(fm.date) : '');

  const hasToken = !!GH.getToken();

  // Build breadcrumb and sibling navigation (these helpers exist below)
  const breadcrumb       = buildBreadcrumb(slug);
  const { prev, next }   = getSiblings(slug);

  content.innerHTML = `
    <div class="doc-header">
      <nav class="doc-breadcrumb" aria-label="Breadcrumb">
        <a href="#"><i class="fa-solid fa-house" style="font-size:0.7rem"></i></a>
        ${breadcrumb.map(b => `<i class="fa-solid fa-chevron-right" style="font-size:0.55rem;color:var(--color-border)"></i><a href="#doc/${esc(b.slug)}">${esc(b.title)}</a>`).join('')}
        <i class="fa-solid fa-chevron-right" style="font-size:0.55rem;color:var(--color-border)"></i>
        <span>${esc(title)}</span>
      </nav>
      <h1 class="doc-title">${_freshBadge}${esc(title)}</h1>
      <div class="doc-meta">
        ${section ? `<span class="doc-meta__badge">${esc(section)}</span>` : ''}
        ${_relUpd ? `<span title="${esc(fm.updated || fm.date || '')}"><i class="fa-regular fa-clock"></i> ${esc(_relUpd)}</span>` : ''}
        ${_wc > 0 ? `<span><i class="fa-regular fa-file-lines"></i> ${esc(_rt)} · ${WordCount.fmt(_wc)}</span>` : ''}
        ${CONFIG.VIEW_COUNT_ENABLED !== false && viewCount > 0 ? `<span><i class="fa-regular fa-eye"></i> ${ViewCounter.fmt(viewCount)} views</span>` : ''}
        <span class="doc-meta__actions"></span>
      </div>
    </div>
    ${tocHtml}
    <div class="prose">${processCallouts(html)}</div>
    <footer class="doc-footer">
      <div class="doc-footer__nav">
        ${prev ? `<button class="doc-footer__btn" onclick="navigate('${prev.slug}')"><i class="fa-solid fa-arrow-left"></i> ${esc(prev.title)}</button>` : ''}
        ${next ? `<button class="doc-footer__btn" onclick="navigate('${next.slug}')"><i class="fa-solid fa-arrow-right"></i> ${esc(next.title)}</button>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:.6rem">
        <button class="doc-footer__btn doc-footer__btn--print" onclick="window.print()" title="Print this page"><i class="fa-solid fa-print"></i> Print</button>
        <span class="doc-footer__edit"><i class="fa-brands fa-github"></i> <a href="https://github.com/${esc(CONFIG.GITHUB_USER)}/${esc(CONFIG.GITHUB_REPO)}" target="_blank" rel="noopener">View on GitHub</a></span>
      </div>
    </footer>`;

  // FIX: Wire TOC links to scroll .content instead of using native hash navigation
  // (the page uses overflow-y:auto on .content, so #id hrefs don't work correctly)
  content.querySelectorAll('.doc-toc__link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const targetId = link.getAttribute('href')?.slice(1);
      if (!targetId) return;
      const targetEl = content.querySelector('#' + CSS.escape(targetId));
      if (!targetEl) return;
      const scroller = document.querySelector('.content');
      if (!scroller) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const targetRect   = targetEl.getBoundingClientRect();
      const topbarH      = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h') || '52');
      scroller.scrollBy({ top: targetRect.top - scrollerRect.top - topbarH - 8, behavior: 'smooth' });
    });
  });

  // Run Prism FIRST — it rebuilds <code> internals, which would destroy any
  // buttons appended before highlighting.
  if (typeof Prism !== 'undefined') Prism.highlightAllUnder(content);

  // Now inject copy buttons — after Prism has finished rewriting the DOM.
  content.querySelectorAll('pre').forEach(pre => {
    // Guard: don't add a second button if the node somehow re-renders
    if (pre.querySelector('.code-copy-btn')) return;
    pre.style.position = 'relative';
    // Capture code text BEFORE appending the button so btn text isn't included
    const codeEl = pre.querySelector('code');
    const codeText = (codeEl ? codeEl.textContent : pre.textContent) || '';
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    btn.addEventListener('click', e => {
      e.stopPropagation();
      navigator.clipboard.writeText(codeText).then(() => {
        btn.textContent = 'Copied!';
        btn.style.opacity = '1';
        setTimeout(() => { btn.textContent = 'Copy'; btn.style.opacity = ''; }, 2000);
      }).catch(() => {
        // Fallback for non-HTTPS or blocked clipboard
        try {
          const ta = document.createElement('textarea');
          ta.value = codeText;
          ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
        } catch {}
      });
    });
    pre.appendChild(btn);
  });
  initReadingProgress();

  // Apply saved font size to this newly rendered prose
  if (State.fontSize !== 16) {
    content.querySelectorAll('.prose').forEach(el => el.style.fontSize = State.fontSize + 'px');
  }

  // Scroll to anchor if the URL contains a hash (e.g. deep-linked via
  // /doc/servers/kubernetes#rancher-multi-cluster-management-ui).
  // Must run after DOM is painted, so defer with requestAnimationFrame.
  const _anchor = location.hash.slice(1);
  if (_anchor) {
    requestAnimationFrame(() => {
      const targetEl = content.querySelector('#' + CSS.escape(_anchor));
      if (!targetEl) return;
      const scroller = document.querySelector('.content');
      if (!scroller) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const targetRect   = targetEl.getBoundingClientRect();
      const topbarH      = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h') || '52');
      scroller.scrollBy({ top: targetRect.top - scrollerRect.top - topbarH - 8, behavior: 'smooth' });
    });
  }
}

// ── Callouts ─────────────────────────────────────────────────────
// NOTE: Callouts are now processed by the marked blockquote renderer inside
// buildMarkedHtml. This function is kept as a passthrough for any HTML that
// still needs post-processing (e.g. cached HTML from older renders).
function processCallouts(html) {
  // Only process blockquotes that weren't already converted by the renderer
  return html.replace(
    /<blockquote>\s*<p>\[!(NOTE|TIP|WARNING|DANGER|IMPORTANT|CAUTION)\]([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
    (_, type, body) => {
      const map = {
        NOTE:      ['note',      'fa-solid fa-circle-info',          'Note'],
        TIP:       ['tip',       'fa-solid fa-lightbulb',            'Tip'],
        WARNING:   ['warning',   'fa-solid fa-triangle-exclamation', 'Warning'],
        DANGER:    ['danger',    'fa-solid fa-circle-xmark',         'Danger'],
        IMPORTANT: ['important', 'fa-solid fa-star',                 'Important'],
        CAUTION:   ['caution',   'fa-solid fa-shield-exclamation',   'Caution'],
      };
      const [cls, icon, label] = map[type.toUpperCase()] || map.NOTE;
      return `<div class="callout callout--${cls}" role="note">
        <i class="${icon} callout__icon" aria-label="${label}"></i>
        <div class="callout__body"><strong class="callout__title">${label}</strong><div>${body.trim()}</div></div>
      </div>`;
    }
  );
}

// ── Home ─────────────────────────────────────────────────────────
function renderHome() {
  const content = $('#doc-content');
  if (!content) return;
  document.title = `${CONFIG.SITE_TITLE} — ${CONFIG.SITE_TAGLINE}`;

  // Widen the content column for the home page
  const inner = content.closest('.content__inner');
  if (inner) inner.classList.add('content__inner--wide');

  // Build section cards from the full NAV_TREE
  const cards = CONFIG.NAV_TREE.map(item => {
    const isGroup    = !!item.children;
    const firstChild = isGroup ? item.children[0] : null;
    // Groups go to their section landing page; standalone items go direct
    const dest       = item.slug || (isGroup ? `_section:${encodeURIComponent(item.title)}` : '');
    const countLabel = isGroup ? `${item.children.length} article${item.children.length !== 1 ? 's' : ''}` : 'Reference doc';
    const firstLabel = firstChild ? firstChild.title : '';

    return `<button class="wiki-home__card" onclick="navigate('${esc(dest)}')" tabindex="0" aria-label="${esc(item.title)}">
      <div class="wiki-home__card-icon"><i class="${esc(item.icon || 'fa-solid fa-file')}"></i></div>
      <div class="wiki-home__card-title">${esc(item.title)}</div>
      <div class="wiki-home__card-count">${countLabel}</div>
      ${firstLabel ? `<div class="wiki-home__card-first"><i class="fa-solid fa-arrow-right" style="font-size:0.6rem;margin-right:0.25rem"></i>${esc(firstLabel)}</div>` : ''}
    </button>`;
  }).join('');

  // Quick-start: first three articles from the first group with children
  const firstGroup = CONFIG.NAV_TREE.find(i => i.children?.length);
  const quickLinks = firstGroup ? firstGroup.children.slice(0, 3).map(c =>
    `<button class="wiki-home__cta wiki-home__cta--ghost" onclick="navigate('${esc(c.slug)}')" style="font-size:0.8rem;padding:0.4rem 0.85rem">
      <i class="fa-solid fa-file-lines" style="font-size:0.75rem"></i> ${esc(c.title)}
    </button>`
  ).join('') : '';

  content.innerHTML = `
    <div class="wiki-home">
      <div class="wiki-home__hero">
        <div class="wiki-home__eyebrow">${esc(CONFIG.SITE_TAGLINE)}</div>
        <h1 class="wiki-home__title">${esc(CONFIG.SITE_TITLE)}</h1>
        <p class="wiki-home__desc">${esc(CONFIG.SITE_DESCRIPTION)}</p>
        <div class="wiki-home__actions">
          ${firstGroup?.children?.[0] ? `<button class="wiki-home__cta" onclick="navigate('${esc(firstGroup.children[0].slug)}')">
            <i class="fa-solid fa-rocket"></i> Get Started
          </button>` : ''}
          <a class="wiki-home__cta wiki-home__cta--ghost" href="https://github.com/${esc(CONFIG.GITHUB_USER)}/${esc(CONFIG.GITHUB_REPO)}" target="_blank" rel="noopener">
            <i class="fa-brands fa-github"></i> View on GitHub
          </a>
          ${quickLinks}
        </div>
      </div>
      <div class="wiki-home__sections-label">Browse Documentation</div>
      <div class="wiki-home__cards">${cards}</div>
    </div>`;
}

// ── Section landing page ──────────────────────────────────────────
function renderSectionPage(groupItem) {
  const content = $('#doc-content');
  if (!content) return;
  document.title = `${groupItem.title} — ${CONFIG.SITE_TITLE}`;

  // Widen content column for section listing too
  const inner = content.closest('.content__inner');
  if (inner) inner.classList.add('content__inner--wide');

  const articles = (groupItem.children || []).map((child, i) => `
    <button class="wiki-section__article" onclick="navigate('${esc(child.slug)}')" tabindex="0" aria-label="${esc(child.title)}">
      <span class="wiki-section__article-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="wiki-section__article-body">
        <span class="wiki-section__article-title">${esc(child.title)}</span>
        <span class="wiki-section__article-slug">${esc(child.slug)}</span>
      </span>
      <i class="fa-solid fa-chevron-right wiki-section__article-arrow"></i>
    </button>`).join('');

  content.innerHTML = `
    <div class="wiki-section">
      <div class="wiki-section__header">
        <div class="wiki-section__icon-wrap">
          <i class="${esc(groupItem.icon || 'fa-solid fa-folder')}"></i>
        </div>
        <div class="wiki-section__meta">
          <div class="wiki-section__eyebrow">Documentation</div>
          <h1 class="wiki-section__title">${esc(groupItem.title)}</h1>
          <div class="wiki-section__count">${groupItem.children?.length || 0} articles in this section</div>
        </div>
      </div>
      <div class="wiki-section__articles">${articles}</div>
      <div class="wiki-section__back">
        <button class="wiki-section__back-btn" onclick="navigate(null)">
          <i class="fa-solid fa-arrow-left"></i> Back to all docs
        </button>
      </div>
    </div>`;
}

// ── Reading progress ──────────────────────────────────────────────
function initReadingProgress() {
  const bar     = $('#reading-bar');
  const scroller = $('.content');
  if (!bar || !scroller) return;
  const update = () => {
    const { scrollTop, scrollHeight, clientHeight } = scroller;
    const pct = scrollHeight - clientHeight < 1 ? 100 : (scrollTop / (scrollHeight - clientHeight)) * 100;
    bar.style.width = pct + '%';
  };
  scroller.removeEventListener('scroll', update);
  scroller.addEventListener('scroll', update, { passive: true });
}

function initBackToTop() {
  const btn     = $('#back-top');
  const scroller = $('.content');
  if (!btn || !scroller) return;
  scroller.addEventListener('scroll', () => {
    btn.classList.toggle('visible', scroller.scrollTop > (CONFIG.BACK_TO_TOP_OFFSET || 400));
  }, { passive: true });
  btn.addEventListener('click', () => scroller.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ── Theme ─────────────────────────────────────────────────────────
const PRISM_DARK  = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css';
const PRISM_LIGHT = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css';

function initTheme() {
  const btn  = $('#theme-btn');
  const icon = $('#theme-icon');
  const apply = t => {
    document.documentElement.setAttribute('data-theme', t);
    State.theme = t;
    localStorage.setItem(key('theme'), t);
    // Moon = shown in dark mode (click to go light); Sun = shown in light mode (click to go dark)
    if (icon) icon.className = t === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    const prism = $('#prism-theme');
    if (prism) prism.href = t === 'dark' ? PRISM_DARK : PRISM_LIGHT;
    // Re-apply Monaco editor theme if editor is open
    if (typeof AdminEditor !== 'undefined') AdminEditor._applyMonacoTheme(t);
  };
  apply(State.theme);
  btn?.addEventListener('click', () => apply(State.theme === 'dark' ? 'light' : 'dark'));
}

function initMobileSidebar() {
  const menuBtn = $('#menu-toggle');
  const sidebar = $('#wiki-sidebar');
  const overlay = $('#sidebar-overlay');

  function setSidebarOpen(open) {
    sidebar?.classList.toggle('is-open', open);
    overlay?.classList.toggle('is-visible', open);
    menuBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  menuBtn?.addEventListener('click', () => {
    const isOpen = sidebar?.classList.contains('is-open');
    setSidebarOpen(!isOpen);
  });
  overlay?.addEventListener('click', () => setSidebarOpen(false));
}



// ── Search ────────────────────────────────────────────────────────
let searchTimeout = null, searchSelectedIdx = -1;

function initSearch() {
  const input   = $('#wiki-search');
  const results = $('#search-results');
  if (!input || !results) return;

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => doSearch(input.value.trim()), 200);
  });
  input.addEventListener('keydown', e => {
    const items = results.querySelectorAll('.search-result');
    if (e.key === 'ArrowDown') { e.preventDefault(); searchSelectedIdx = Math.min(searchSelectedIdx + 1, items.length - 1); highlightSearchItem(items); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); searchSelectedIdx = Math.max(searchSelectedIdx - 1, -1); highlightSearchItem(items); }
    if (e.key === 'Enter' && searchSelectedIdx >= 0 && items[searchSelectedIdx]) items[searchSelectedIdx].click();
    if (e.key === 'Escape') closeSearch();
  });
  document.addEventListener('click', e => { if (!e.target.closest('.topbar__search-wrap')) closeSearch(); });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); input.focus(); input.select(); }
  });
}

function doSearch(q) {
  const results = $('#search-results');
  if (!results) return;
  if (!q) { results.innerHTML = ''; results.hidden = true; return; }
  const lower   = q.toLowerCase();
  const matches = State.searchIndex.filter(item =>
    item.title.toLowerCase().includes(lower) || item.group.toLowerCase().includes(lower) || item.slug.toLowerCase().includes(lower)
  ).slice(0, 8);

  if (!matches.length) {
    results.innerHTML = `<div class="search-result__empty">No results for "<strong>${esc(q)}</strong>"</div>`;
    results.hidden = false; return;
  }
  results.innerHTML = matches.map(m => `
    <div class="search-result" data-slug="${esc(m.slug)}">
      <i class="fa-solid fa-file search-result__icon"></i>
      <span class="search-result__title">${highlight(esc(m.title), lower)}</span>
      ${m.group ? `<span class="search-result__path">${esc(m.group)}</span>` : ''}
    </div>`).join('');
  results.hidden = false;
  searchSelectedIdx = -1;
  results.querySelectorAll('.search-result').forEach(el => {
    el.addEventListener('click', () => { navigate(el.dataset.slug); $('#wiki-search').value = ''; closeSearch(); });
  });
}

function highlight(text, q) {
  return text.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'), '<mark>$1</mark>');
}
function highlightSearchItem(items) { items.forEach((el, i) => el.classList.toggle('is-selected', i === searchSelectedIdx)); }
function closeSearch() { const r = $('#search-results'); if (r) { r.innerHTML = ''; r.hidden = true; } }

// ── Toast ─────────────────────────────────────────────────────────
function toast(msg, type = 'default') {
  // Support both legacy #toast element and new dynamic approach
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, CONFIG.TOAST_DURATION || 2500);
}

// ── Branding ──────────────────────────────────────────────────────
function applyBranding() {
  const cfg = CONFIG;
  const logoImg = $('#logo-img');
  if (logoImg) { logoImg.src = cfg.LOGO_IMG_URL || cfg.FAVICON_URL; logoImg.alt = cfg.LOGO_ALT || cfg.SITE_TITLE; }
  const fav = $('#favicon');
  if (fav) fav.href = cfg.FAVICON_URL;
  $$('.logo__word').forEach(el => el.textContent = cfg.LOGO_WORDMARK || 'wiki');
  const ausLink = $('#auspicious-link');
  if (ausLink) { ausLink.textContent = cfg.AUSPICIOUS_TEXT || ''; ausLink.href = cfg.AUSPICIOUS_URL || '#'; ausLink.title = cfg.AUSPICIOUS_LABEL || ''; }
  $('title').textContent = cfg.SITE_TITLE;
  $('#meta-desc')?.setAttribute('content', cfg.SITE_DESCRIPTION);
  $('#meta-keywords')?.setAttribute('content', cfg.SITE_KEYWORDS || '');
  $('#og-site-name')?.setAttribute('content', cfg.SITE_TITLE);
  $('#og-title')?.setAttribute('content', cfg.SITE_TITLE);
  $('#og-desc')?.setAttribute('content', cfg.SITE_DESCRIPTION);
  $('#og-image')?.setAttribute('content', cfg.OG_IMAGE || cfg.FAVICON_URL);
  $('#og-url')?.setAttribute('content', cfg.WIKI_URL || location.href);
  $('#tw-site')?.setAttribute('content', cfg.TWITTER_HANDLE || '');
  $('#tw-title')?.setAttribute('content', cfg.SITE_TITLE);
  $('#tw-desc')?.setAttribute('content', cfg.SITE_DESCRIPTION);
  $('#tw-image')?.setAttribute('content', cfg.OG_IMAGE || cfg.FAVICON_URL);
  $('#canonical-url')?.setAttribute('href', cfg.WIKI_URL || location.href);
}

// ── Helpers ───────────────────────────────────────────────────────
function slugify(text) {
  return text.toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '').trim()
    .replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}
function slugToTitle(slug) { return slug.split('/').pop().split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }
function getGroupTitle(slug) {
  for (const item of CONFIG.NAV_TREE) {
    if (item.children) for (const child of item.children) if (child.slug === slug) return item.title;
  }
  return '';
}
function buildBreadcrumb(slug) {
  for (const item of CONFIG.NAV_TREE) {
    if (item.children) for (const child of item.children) if (child.slug === slug) return [{ title: item.title, slug: item.children[0].slug }];
  }
  return [];
}
function getSiblings(slug) {
  const flat = State.searchIndex;
  const idx  = flat.findIndex(i => i.slug === slug);
  return { prev: idx > 0 ? flat[idx - 1] : null, next: idx < flat.length - 1 ? flat[idx + 1] : null };
}

// ── Media shortcode processor ─────────────────────────────────────
const _mediaBlocks = {};
function _mediaToken(html) {
  const key = `MBLOCK_${Object.keys(_mediaBlocks).length}_END`;
  _mediaBlocks[key] = html;
  return '\n\n' + key + '\n\n';
}
function _capPipe(raw) {
  const pipe = raw.lastIndexOf('|');
  return pipe === -1
    ? { val: raw.trim(), caption: '' }
    : { val: raw.slice(0, pipe).trim(), caption: raw.slice(pipe + 1).trim() };
}
function _processShortcodes(text) {
  Object.keys(_mediaBlocks).forEach(k => delete _mediaBlocks[k]);
  // ::youtube[id|caption]
  text = text.replace(/::youtube\[([^\]]+)\]/g, (_, raw) => {
    const { val, caption } = _capPipe(raw);
    const fig = caption ? `<figcaption>${caption}</figcaption>` : '';
    return _mediaToken(`<figure class="media-embed"><div class="media-embed__ratio"><iframe src="https://www.youtube-nocookie.com/embed/${esc(val)}" title="${caption || 'YouTube video'}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>${fig}</figure>`);
  });
  // ::vimeo[id|caption]
  text = text.replace(/::vimeo\[([^\]]+)\]/g, (_, raw) => {
    const { val, caption } = _capPipe(raw);
    const fig = caption ? `<figcaption>${caption}</figcaption>` : '';
    return _mediaToken(`<figure class="media-embed"><div class="media-embed__ratio"><iframe src="https://player.vimeo.com/video/${esc(val)}?dnt=1" title="${caption || 'Vimeo video'}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>${fig}</figure>`);
  });
  // ::video[url|caption]
  text = text.replace(/::video\[([^\]]+)\]/g, (_, raw) => {
    const { val, caption } = _capPipe(raw);
    const ext  = val.split('?')[0].split('.').pop().toLowerCase();
    const mime = { mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', mov: 'video/mp4' }[ext] || 'video/mp4';
    const fig  = caption ? `<figcaption>${caption}</figcaption>` : '';
    return _mediaToken(`<figure class="media-figure media-figure--video"><video controls preload="metadata" playsinline><source src="${esc(val)}" type="${mime}">Your browser doesn't support HTML video.</video>${fig}</figure>`);
  });
  // ::audio[url|caption]
  text = text.replace(/::audio\[([^\]]+)\]/g, (_, raw) => {
    const { val, caption } = _capPipe(raw);
    const fig = caption ? `<figcaption>${caption}</figcaption>` : '';
    return _mediaToken(`<figure class="media-figure media-figure--audio"><audio controls preload="metadata"><source src="${esc(val)}">Your browser doesn't support HTML audio.</audio>${fig}</figure>`);
  });
  return text;
}
function _restoreShortcodes(html) {
  html = html.replace(/<p>(MBLOCK_\d+_END)<\/p>/g, (_, token) => _mediaBlocks[token] || '');
  html = html.replace(/MBLOCK_\d+_END/g, token => _mediaBlocks[token] || '');
  return html;
}

// ── KaTeX math renderer ───────────────────────────────────────────
function renderMath(html) {
  if (typeof katex === 'undefined') return html;
  const parts = html.split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>)/);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part;
    // Display math: $$...$$
    part = part.replace(/\$\$([\s\S]+?)\$\$/g, (match, expr) => {
      try { return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false }); }
      catch { return match; }
    });
    // Inline math: $...$
    part = part.replace(/(?<!\$)\$([^\n$]+?)\$(?!\$)/g, (match, expr) => {
      try { return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false }); }
      catch { return match; }
    });
    return part;
  }).join('');
}

/**
 * Shared Markdown → sanitized HTML renderer (used by renderDoc + updatePreview).
 * Includes: heading anchors, external link detection, figure captions,
 *           KaTeX math, GitHub-style callouts, media shortcodes.
 */
function buildMarkedHtml(body) {
  if (typeof marked === 'undefined') return `<pre>${esc(body)}</pre>`;

  body = _processShortcodes(body);

  const renderer = new marked.Renderer();

  // Syntax-highlighted code blocks
  renderer.code = (tokenOrCode, lang) => {
    const code     = (tokenOrCode && typeof tokenOrCode === 'object') ? tokenOrCode.text : tokenOrCode;
    const language = ((tokenOrCode && typeof tokenOrCode === 'object') ? tokenOrCode.lang : lang) || '';
    const validLang = language && typeof Prism !== 'undefined' && Prism.languages[language] ? language : null;
    const highlighted = validLang
      ? Prism.highlight(code, Prism.languages[validLang], validLang)
      : esc(code);
    return `<pre class="language-${esc(language || 'text')}"><code class="language-${esc(language || 'text')}">${highlighted}</code></pre>`;
  };

  // Headings with anchor links
  renderer.heading = (textOrToken, level) => {
    const text  = (textOrToken && typeof textOrToken === 'object') ? (textOrToken.text || '') : textOrToken;
    const depth = (textOrToken && typeof textOrToken === 'object') ? textOrToken.depth : level;
    const plain = text.replace(/<[^>]+>/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    const id    = slugify(plain);
    return `<h${depth} id="${id}">${text}<a class="heading-anchor" href="#${id}" aria-hidden="true">#</a></h${depth}>\n`;
  };

  // External links open in new tab
  renderer.link = (hrefOrToken, title, linkText) => {
    const href = (hrefOrToken && typeof hrefOrToken === 'object') ? hrefOrToken.href  : hrefOrToken;
    const ttl  = (hrefOrToken && typeof hrefOrToken === 'object') ? hrefOrToken.title : title;
    const txt  = (hrefOrToken && typeof hrefOrToken === 'object') ? hrefOrToken.text  : linkText;
    const isExternal = href && !href.startsWith('#') && !href.startsWith('/');
    const t   = ttl ? ` title="${ttl}"` : '';
    const ext = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${href}"${t}${ext}>${txt}</a>`;
  };

  // Images wrapped in <figure> with optional <figcaption>
  renderer.image = (srcOrToken, title, alt) => {
    const src     = (srcOrToken && typeof srcOrToken === 'object') ? srcOrToken.href : srcOrToken;
    const ttl     = (srcOrToken && typeof srcOrToken === 'object') ? srcOrToken.title : title;
    const altText = (srcOrToken && typeof srcOrToken === 'object') ? srcOrToken.text  : alt;
    const t       = ttl ? ` title="${ttl}"` : '';
    const caption = altText || ttl;
    const fig     = caption ? `<figcaption>${caption}</figcaption>` : '';
    return `<figure class="media-figure"><img src="${src}" alt="${altText || ''}"${t} loading="lazy">${fig}</figure>`;
  };

  // GitHub-style callouts via blockquote [!TYPE]
  renderer.blockquote = (quoteOrToken) => {
    const quote = (quoteOrToken && typeof quoteOrToken === 'object')
      ? (quoteOrToken.body || quoteOrToken.text || '')
      : quoteOrToken;
    const match = quote.match(/^<p>\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT|DANGER)\]([\s\S]*)/i);
    if (match) {
      const type = match[1].toUpperCase();
      const map  = {
        NOTE:      ['note',      'fa-solid fa-circle-info',          'Note'],
        TIP:       ['tip',       'fa-solid fa-lightbulb',            'Tip'],
        WARNING:   ['warning',   'fa-solid fa-triangle-exclamation', 'Warning'],
        CAUTION:   ['caution',   'fa-solid fa-shield-exclamation',   'Caution'],
        IMPORTANT: ['important', 'fa-solid fa-star',                 'Important'],
        DANGER:    ['danger',    'fa-solid fa-circle-xmark',         'Danger'],
      };
      const [cls, icon, label] = map[type] || map.NOTE;
      const body = match[2].replace(/<\/p>$/, '').replace(/^(\s*<br\s*\/?>\s*)/i, '').trim();
      return `<div class="callout callout--${cls}" role="note"><i class="${icon} callout__icon" aria-label="${label}"></i><div class="callout__body"><strong class="callout__title">${label}</strong><div>${body}</div></div></div>\n`;
    }
    return `<blockquote>${quote}</blockquote>\n`;
  };

  if (typeof marked.use === 'function') {
    marked.use({ gfm: true, breaks: false, renderer });
  } else {
    marked.setOptions({ gfm: true, breaks: false, renderer });
  }

  let html = marked.parse(body);
  html = renderMath(html);

  if (typeof DOMPurify !== 'undefined') {
    html = DOMPurify.sanitize(html, {
      ADD_TAGS: ['pre', 'code', 'span', 'video', 'audio', 'source', 'iframe',
                 'details', 'summary', 'figure', 'figcaption',
                 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
                 'math', 'annotation', 'semantics', 'mrow', 'mi', 'mn',
                 'mo', 'msup', 'msub', 'mfrac', 'mspace', 'mtext'],
      ADD_ATTR: ['class', 'id', 'src', 'controls', 'autoplay', 'loop', 'muted',
                 'playsinline', 'width', 'height', 'allow', 'allowfullscreen',
                 'frameborder', 'loading', 'type', 'checked', 'disabled',
                 'target', 'rel', 'title', 'alt', 'scope', 'align',
                 'encoding', 'display', 'style', 'aria-hidden', 'preload',
                 'poster', 'dnt', 'download', 'aria-label'],
    });
  }

  return _restoreShortcodes(html);
}

/**
 * Shared "enter edit or prompt for auth first" flow used in topbar toggle
 * and inline doc edit button — avoids repeating the token check in both places.
 */
function enterEditOrAuth(slug) {
  if (!slug) { toast('Navigate to a page first', 'error'); return; }
  if (GH.getToken()) {
    AdminEditor.enterEdit(slug, State.docCache[slug] || '');
  } else {
    AdminEditor.showAuthModal(() => AdminEditor.enterEdit(slug, State.docCache[slug] || ''));
  }
}

// ══════════════════════════════════════════════════════════════════
//  INLINE ADMIN EDITOR
//  Full Coda-style edit mode: Monaco, nav tree, config, new pages
// ══════════════════════════════════════════════════════════════════
const AdminEditor = (() => {

  // ── Internal state ────────────────────────────────────────────
  let _monacoEditor = null;
  let _monacoReady  = false;
  let _previewTimer = null;
  let _slug         = null;
  let _sha          = '';
  let _rawMd        = '';
  let _editTarget   = null;
  let _liveNavTree  = [];
  let _viewMode     = 'split'; // monaco view mode — split by default so preview is immediately visible

  // ── CSS injected once ─────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('admin-editor-styles')) return;
    const style = document.createElement('style');
    style.id = 'admin-editor-styles';
    style.textContent = `
/* ══ Edit mode bar ══════════════════════════════════════════════ */
.edit-mode-active .topbar { background: color-mix(in srgb, var(--color-accent) 6%, var(--color-bg-card)); }
.edit-mode-badge {
  display: inline-flex; align-items: center; gap: .3rem;
  font-family: var(--font-mono); font-size: .68rem; font-weight: 600;
  color: var(--color-accent); background: var(--color-accent-bg);
  border: 1px solid color-mix(in srgb, var(--color-accent) 30%, transparent);
  border-radius: 99px; padding: .15rem .55rem; flex-shrink: 0;
}
.edit-mode-badge .blink { animation: blink 1.4s infinite; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }


/* Shared label / divider used in panel sections and modals */
.admin-section-label {
  font-family: var(--font-mono); font-size: .6rem; font-weight: 600;
  letter-spacing: .12em; text-transform: uppercase; color: var(--color-text-faint); margin-bottom: .15rem;
}
.admin-divider { border: none; border-top: 1px solid var(--color-border); margin: .4rem 0; }

/* ══ Admin inputs ════════════════════════════════════════════════ */
.a-label { display: block; font-size: .72rem; color: var(--color-text-muted); margin-bottom: .18rem; }
.a-input, .a-select, .a-textarea {
  width: 100%; background: var(--color-bg-alt); border: 1px solid var(--color-border);
  color: var(--color-text); border-radius: var(--radius-sm); padding: .35rem .55rem;
  font-family: var(--font-sans); font-size: .8rem; outline: none;
  transition: border-color .15s; box-sizing: border-box;
}
.a-input:focus, .a-select:focus, .a-textarea:focus { border-color: var(--color-accent); }
.a-input.mono { font-family: var(--font-mono); font-size: .74rem; }
.a-textarea { resize: vertical; min-height: 52px; line-height: 1.5; }
.a-select option { background: var(--color-bg-card); }
.a-row { display: flex; gap: .4rem; }
.a-row > * { flex: 1; }

/* ══ Admin buttons ═══════════════════════════════════════════════ */
.a-btn {
  display: inline-flex; align-items: center; gap: .3rem; padding: .33rem .65rem;
  border-radius: var(--radius-sm); border: none; font-size: .75rem;
  font-family: var(--font-sans); font-weight: 500; cursor: pointer;
  transition: background .15s, color .15s; white-space: nowrap;
}
.a-btn--primary { background: var(--color-accent); color: var(--color-accent-text); }
.a-btn--primary:hover { background: var(--color-accent-hover); }
.a-btn--ghost { background: var(--color-bg-elevated); color: var(--color-text); border: 1px solid var(--color-border); }
.a-btn--ghost:hover { border-color: var(--color-accent); color: var(--color-accent); }
.a-btn--danger { background: rgba(237,95,95,.08); color: var(--color-error, #ed5f5f); border: 1px solid rgba(237,95,95,.25); }
.a-btn--danger:hover { background: rgba(237,95,95,.16); }
.a-btn--new {
  width: 100%; justify-content: center; padding: .4rem;
  background: color-mix(in srgb, var(--color-accent) 5%, transparent);
  color: var(--color-accent); border: 1px dashed color-mix(in srgb, var(--color-accent) 25%, transparent);
}
.a-btn--new:hover { background: color-mix(in srgb, var(--color-accent) 12%, transparent); border-color: var(--color-accent); }
.a-btn:disabled { opacity: .4; cursor: not-allowed; }
.a-btn-row { display: flex; gap: .4rem; flex-wrap: wrap; }
.a-btn-row > .a-btn { flex: 1; justify-content: center; }

/* ══ Nav tree ════════════════════════════════════════════════════ */
.admin-nav-tree { display: flex; flex-direction: column; gap: .3rem; }
.admin-nav-group {
  border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  background: var(--color-bg-alt); overflow: hidden;
}
.admin-nav-group__head {
  display: flex; align-items: center; gap: .35rem; padding: .38rem .55rem;
  background: var(--color-bg-elevated); cursor: default; user-select: none;
}
.admin-nav-group__head:hover { background: color-mix(in srgb, var(--color-accent) 4%, var(--color-bg-elevated)); }
.admin-nav-group__icon { font-size: .62rem; color: var(--color-text-faint); width: 14px; text-align: center; }
.admin-nav-group__title { font-size: .76rem; font-weight: 600; flex: 1; }
.admin-nav-group__slug { font-family: var(--font-mono); font-size: .62rem; color: var(--color-text-faint); background: var(--color-bg); padding: .08rem .28rem; border-radius: 3px; }
.admin-nav-group__actions { display: flex; gap: .15rem; }
.admin-nav-btn {
  background: none; border: none; color: var(--color-text-faint); cursor: pointer;
  padding: 2px 5px; border-radius: 3px; font-size: .68rem;
  transition: color .12s, background .12s;
}
.admin-nav-btn:hover { color: var(--color-text); background: var(--color-bg-elevated); }
.admin-nav-btn.danger:hover { color: var(--color-error, #ed5f5f); }
.admin-nav-children { padding: .28rem .45rem; display: flex; flex-direction: column; gap: .18rem; }
.admin-nav-leaf {
  display: flex; align-items: center; gap: .3rem; padding: .24rem .4rem;
  border-radius: 4px; border: 1px solid transparent; background: var(--color-bg-card);
}
.admin-nav-leaf:hover { border-color: var(--color-border); }
.admin-nav-leaf__title { flex: 1; font-size: .73rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.admin-nav-leaf__slug { font-family: var(--font-mono); font-size: .62rem; color: var(--color-text-faint); }
.admin-nav-leaf__actions { display: flex; gap: .12rem; }
.drag-handle { color: var(--color-text-faint); font-size: .68rem; cursor: grab; padding: 2px 3px; }
.drag-handle:active { cursor: grabbing; }
.drop-target { border: 2px dashed var(--color-accent) !important; background: var(--color-accent-bg) !important; }

/* ══ Draft banner ════════════════════════════════════════════════ */
.admin-draft-banner {
  display: flex; align-items: center; gap: .55rem; padding: .38rem .85rem;
  background: color-mix(in srgb, var(--color-warning, #e8a215) 8%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-warning, #e8a215) 22%, transparent);
  font-size: .73rem; color: var(--color-warning, #e8a215); flex-shrink: 0;
}
.admin-draft-banner button {
  margin-left: auto; background: none; border: 1px solid color-mix(in srgb, var(--color-warning,#e8a215) 30%, transparent);
  color: var(--color-warning,#e8a215); border-radius: 4px; padding: .18rem .45rem; font-size: .7rem; cursor: pointer;
}
.admin-draft-banner button:hover { background: color-mix(in srgb, var(--color-warning,#e8a215) 10%, transparent); }

/* ══ FM bar ══════════════════════════════════════════════════════ */
.admin-fm-bar { border-bottom: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-accent) 2%, var(--color-bg)); flex-shrink: 0; }
.admin-fm-bar__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: .32rem .85rem; cursor: pointer; user-select: none; min-height: 30px;
}
.admin-fm-bar__header:hover { background: color-mix(in srgb, var(--color-accent) 3%, transparent); }
.admin-fm-bar__label { font-family: var(--font-mono); font-size: .6rem; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--color-text-faint); display: flex; align-items: center; gap: .35rem; }
.admin-fm-bar__toggle { background: none; border: none; color: var(--color-text-faint); cursor: pointer; padding: .12rem .28rem; border-radius: 3px; font-size: .62rem; transition: color .12s; }
.admin-fm-bar__toggle:hover { color: var(--color-text); }
.fm-chevron { transition: transform .18s; }
.admin-fm-bar.collapsed .admin-fm-bar__body { display: none; }
.admin-fm-bar.collapsed .fm-chevron { transform: rotate(-90deg); }
.admin-fm-bar__body { padding: .55rem .85rem .7rem; }
.admin-fm-row { display: flex; gap: .5rem; margin-bottom: .45rem; }
.admin-fm-row > * { flex: 1; }

/* ══ Monaco / editor area ════════════════════════════════════════ */
.admin-editor-wrap {
  display: flex; flex-direction: column; overflow: hidden; min-height: 0; flex: 1;
  transition: margin-right .22s cubic-bezier(.4,0,.2,1);
}
.admin-toolbar {
  display: flex; align-items: center; gap: .25rem; padding: .38rem .75rem;
  border-bottom: 1px solid var(--color-border); background: var(--color-bg-card);
  flex-wrap: nowrap; overflow-x: auto; flex-shrink: 0; height: 44px;
}
.admin-toolbar::-webkit-scrollbar { height: 0; }
.admin-toolbar__group { display: flex; align-items: center; gap: .18rem; }
.admin-toolbar__sep { width: 1px; height: 16px; background: var(--color-border); margin: 0 .1rem; flex-shrink: 0; }
.admin-toolbar__spacer { flex: 1; }
.atbtn {
  display: inline-flex; align-items: center; justify-content: center; gap: .18rem;
  padding: .22rem .38rem; border-radius: 4px; border: none; cursor: pointer;
  font-size: .7rem; font-family: var(--font-sans); font-weight: 500;
  background: none; color: var(--color-text-muted); transition: background .12s, color .12s;
  min-width: 26px; height: 26px; flex-shrink: 0;
}
.atbtn:hover { background: var(--color-bg-elevated); color: var(--color-text); }
.atbtn:disabled { opacity: .35; cursor: not-allowed; }
.atbtn.is-active { background: var(--color-accent-bg); color: var(--color-accent); }
.view-toggle { display: flex; background: var(--color-bg-alt); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 2px; gap: 2px; }
.view-toggle .atbtn { border-radius: 3px; height: 22px; font-size: .66rem; }
.view-toggle .atbtn.is-active { background: var(--color-bg-card); color: var(--color-text); }
.admin-status-pill {
  font-family: var(--font-mono); font-size: .68rem; padding: .2rem .5rem;
  border-radius: var(--radius-sm); background: var(--color-bg-alt); flex-shrink: 0;
}
.admin-status-pill.ok { color: var(--color-success, #3dba7e); }
.admin-status-pill.error { color: var(--color-error, #ed5f5f); }
.admin-status-pill.info { color: var(--color-text-muted); }
.admin-status-pill.warn { color: var(--color-warning, #e8a215); }

.admin-edit-area { display: flex; flex: 1; min-height: 0; overflow: hidden; }
.admin-monaco-wrap { flex: 1; min-width: 0; position: relative; display: flex; flex-direction: column; }
#admin-monaco-container { flex: 1; min-height: 0; }
.admin-preview-pane { flex: 1; overflow-y: auto; border-left: 1px solid var(--color-border); background: var(--color-bg); }
.admin-preview-inner { padding: 2rem; max-width: 1160px; font-size: .9rem; line-height: 1.7; }
.admin-preview-inner h1 { font-size: 1.5rem; margin: 0 0 .65rem; }
.admin-preview-inner h2 { font-size: 1.2rem; margin: 1.4rem 0 .45rem; border-bottom: 1px solid var(--color-border); padding-bottom: .28rem; }
.admin-preview-inner h3 { font-size: 1rem; margin: 1.1rem 0 .35rem; }
.admin-preview-inner p { margin: 0 0 .85rem; }
.admin-preview-inner code { background: var(--color-bg-elevated); border-radius: 3px; padding: .1em .32em; font-family: var(--font-mono); font-size: .82em; }
.admin-preview-inner pre { background: var(--color-bg-elevated); border-radius: 6px; padding: 1rem; overflow-x: auto; margin: 0 0 .9rem; }
.admin-preview-inner pre code { background: none; padding: 0; }
.admin-preview-inner ul, .admin-preview-inner ol { margin: 0 0 .85rem 1.5rem; }
.admin-preview-inner blockquote { border-left: 3px solid var(--color-accent); padding: .3rem .75rem; color: var(--color-text-muted); margin: 0 0 .85rem; }

.admin-wc-bar {
  display: flex; align-items: center; gap: .85rem; padding: .25rem .75rem;
  border-top: 1px solid var(--color-border); background: var(--color-bg-card);
  font-family: var(--font-mono); font-size: .65rem; color: var(--color-text-faint); flex-shrink: 0;
}

/* ══ Modals ══════════════════════════════════════════════════════ */
.admin-modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 300;
  display: none; align-items: center; justify-content: center; padding: 1rem;
}
.admin-modal-backdrop.is-open { display: flex; }
.admin-modal {
  background: var(--color-bg-card); border: 1px solid var(--color-border);
  border-radius: 10px; width: 100%; max-width: 440px; display: flex;
  flex-direction: column; max-height: 90vh;
}
.admin-modal__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: .8rem 1rem; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
}
.admin-modal__title { font-size: .86rem; font-weight: 600; }
.admin-modal__close { background: none; border: none; color: var(--color-text-faint); cursor: pointer; font-size: .88rem; padding: .18rem .28rem; border-radius: 3px; }
.admin-modal__close:hover { color: var(--color-text); }
.admin-modal__body { padding: 1rem; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: .65rem; }
.admin-modal__footer { padding: .65rem 1rem; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: .4rem; flex-shrink: 0; }

/* ══ Auth modal ══════════════════════════════════════════════════ */
.admin-auth-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 400;
  display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.admin-auth-box {
  background: var(--color-bg-card); border: 1px solid var(--color-border);
  border-radius: 12px; padding: 2rem 1.75rem; max-width: 440px; width: 100%;
  display: flex; flex-direction: column; gap: .85rem;
}
.admin-auth-box h2 { font-size: 1rem; margin: 0; }
.admin-auth-box p { font-size: .8rem; color: var(--color-text-muted); line-height: 1.6; margin: 0; }
.admin-auth-box a { color: var(--color-accent); }
.admin-auth-box .a-label { display: block; font-size: .72rem; color: var(--color-text-muted); margin-bottom: .22rem; }
.admin-auth-input {
  width: 100%; background: var(--color-bg-alt); border: 1px solid var(--color-border);
  color: var(--color-text); border-radius: var(--radius-sm); padding: .45rem .65rem;
  font-family: var(--font-mono); font-size: .82rem; outline: none; transition: border-color .15s;
  box-sizing: border-box;
}
.admin-auth-input:focus { border-color: var(--color-accent); }
.admin-auth-actions { display: flex; gap: .5rem; justify-content: flex-end; }

/* ══ Toggle button in topbar ════════════════════════════════════ */
.topbar__edit-toggle {
  display: inline-flex; align-items: center; gap: .3rem; padding: .28rem .65rem;
  border-radius: var(--radius-sm); font-size: .75rem; font-weight: 500;
  background: var(--color-bg-elevated); color: var(--color-text-muted);
  border: 1px solid var(--color-border); cursor: pointer; transition: all .15s; flex-shrink: 0;
}
.topbar__edit-toggle:hover { border-color: var(--color-accent); color: var(--color-accent); }
.topbar__edit-toggle.is-editing { background: var(--color-accent); color: var(--color-accent-text); border-color: var(--color-accent); }


`;
    document.head.appendChild(style);
  }

  // ── Auth modal ────────────────────────────────────────────────
  function showAuthModal(onSuccess) {
    injectStyles(); // ensure .a-btn styles exist even before edit mode is entered
    const existing = document.getElementById('admin-auth-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'admin-auth-overlay';
    overlay.className = 'admin-auth-overlay';
    overlay.innerHTML = `
      <div class="admin-auth-box" role="dialog" aria-modal="true" aria-labelledby="aam-title">
        <h2 id="aam-title"><i class="fa-brands fa-github" style="color:var(--color-accent);margin-right:.35rem"></i>GitHub Authentication</h2>
        <p>
          Inline editing commits directly to <strong>${esc(CONFIG.GITHUB_USER)}/${esc(CONFIG.GITHUB_REPO)}</strong>
          via the GitHub API. Only users with <strong>write access</strong> to the repo can edit.<br><br>
          You need a <strong>fine-grained Personal Access Token</strong> with
          <em>Contents: Read &amp; write</em> scope.<br><br>
          <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create a token on GitHub →</a>
        </p>
        <div>
          <label class="a-label" for="aam-username">GitHub Username</label>
          <input type="text" id="aam-username" class="admin-auth-input" placeholder="your-github-username" autocomplete="username" spellcheck="false" style="margin-bottom:.55rem">
        </div>
        <div>
          <label class="a-label" for="aam-token">Personal Access Token</label>
          <input type="password" id="aam-token" class="admin-auth-input" placeholder="github_pat_…" autocomplete="off" spellcheck="false">
        </div>
        <div id="aam-error" style="display:none;color:var(--color-error,#ed5f5f);font-size:.77rem;background:rgba(237,95,95,.08);border:1px solid rgba(237,95,95,.22);border-radius:5px;padding:.38rem .6rem"></div>
        <div class="admin-auth-actions">
          <button class="a-btn a-btn--ghost" id="aam-cancel">Cancel</button>
          <button class="a-btn a-btn--primary" id="aam-save"><i class="fa-solid fa-key"></i> <span id="aam-save-label">Verify &amp; connect</span></button>
        </div>
        <p style="font-size:.7rem;color:var(--color-text-faint);margin-top:-.2rem">Token is stored only in your browser's localStorage.</p>
      </div>`;

    document.body.appendChild(overlay);

    const usernameInput = document.getElementById('aam-username');
    const tokenInput    = document.getElementById('aam-token');
    const saveBtn       = document.getElementById('aam-save');
    const saveLabel     = document.getElementById('aam-save-label');
    const cancelBtn     = document.getElementById('aam-cancel');
    const errorBox      = document.getElementById('aam-error');

    // Pre-fill from storage — GH.getToken() is in outer scope, username stored separately
    tokenInput.value    = GH.getToken();
    usernameInput.value = localStorage.getItem(key('gh_username')) || '';
    usernameInput.focus();

    function showError(msg) {
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
    }
    function clearError() { errorBox.style.display = 'none'; }

    saveBtn.addEventListener('click', async () => {
      clearError();
      const username = usernameInput.value.trim();
      const token    = tokenInput.value.trim();

      if (!username) { usernameInput.style.borderColor = 'var(--color-error,#ed5f5f)'; usernameInput.focus(); return; }
      if (!token)    { tokenInput.style.borderColor    = 'var(--color-error,#ed5f5f)'; tokenInput.focus(); return; }
      usernameInput.style.borderColor = '';
      tokenInput.style.borderColor    = '';

      saveBtn.disabled = true;
      saveLabel.textContent = 'Verifying…';

      try {
        // 1. Verify the token is valid by fetching /user
        const userRes = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });
        if (!userRes.ok) {
          throw new Error(userRes.status === 401
            ? 'Invalid token — check it hasn\'t expired.'
            : `GitHub returned ${userRes.status}.`);
        }
        const userData = await userRes.json();
        if (userData.login.toLowerCase() !== username.toLowerCase()) {
          throw new Error(`Token belongs to "${userData.login}", not "${username}". Check your username.`);
        }

        // 2. Verify the user has push access to the configured repo
        const collabRes = await fetch(
          `https://api.github.com/repos/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/collaborators/${encodeURIComponent(userData.login)}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          },
        );
        // 204 = collaborator with access; 404 = not a collaborator
        // Also accept if user IS the repo owner (login matches CONFIG.GITHUB_USER)
        const isOwner = userData.login.toLowerCase() === CONFIG.GITHUB_USER.toLowerCase();
        if (!isOwner && collabRes.status === 404) {
          throw new Error(`"${userData.login}" doesn't have write access to ${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}.`);
        }
        if (!isOwner && !collabRes.ok && collabRes.status !== 204) {
          throw new Error(`Could not verify repo access (${collabRes.status}).`);
        }

        // All checks passed — persist credentials
        GH.setToken(token);
        localStorage.setItem(key('gh_username'), userData.login);
        overlay.remove();
        toast(`✓ Connected as ${userData.login}`);
        onSuccess();
      } catch (err) {
        showError(err.message || 'Authentication failed. Please try again.');
        saveBtn.disabled = false;
        saveLabel.textContent = 'Verify &amp; connect';
      }
    });

    cancelBtn.addEventListener('click', () => overlay.remove());
    [usernameInput, tokenInput].forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') saveBtn.click();
        if (e.key === 'Escape') cancelBtn.click();
      });
      inp.addEventListener('input', clearError);
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) cancelBtn.click(); });
  }

  // ── Parse front-matter ────────────────────────────────────────
  function parseFm(raw) {
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!m) return { fm: {}, body: raw };
    const fm = {};
    m[1].split(/\r?\n/).forEach(line => {
      const i = line.indexOf(':');
      if (i < 1) return;
      fm[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"`]|['"`]$/g, '');
    });
    return { fm, body: m[2] };
  }

  function buildRaw() {
    if (!_monacoEditor) return '';
    const { body } = parseFm(_monacoEditor.getValue());
    const fmFields = [];
    const title       = document.getElementById('afm-title')?.value.trim();
    const section     = document.getElementById('afm-section')?.value.trim();
    const description = document.getElementById('afm-desc')?.value.trim();
    const updated     = document.getElementById('afm-updated')?.value.trim();
    if (title)       fmFields.push(`title: '${escJs(title)}'`);
    if (section)     fmFields.push(`section: '${escJs(section)}'`);
    if (description) fmFields.push(`description: '${escJs(description)}'`);
    if (updated)     fmFields.push(`updated: '${updated}'`);
    const fmBlock = fmFields.length ? `---\n${fmFields.join('\n')}\n---\n\n` : '';
    return fmBlock + body;
  }

  // ── Monaco theme ──────────────────────────────────────────────
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function buildMonacoTheme(mode) {
    const prev = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', mode);
    const bg=cssVar('--color-bg').replace('#',''), fgText=cssVar('--color-text').replace('#',''),
          fgFaint=cssVar('--color-text-faint').replace('#',''), fgMuted=cssVar('--color-text-muted').replace('#',''),
          bgAlt=cssVar('--color-bg-alt').replace('#',''), bgElev=cssVar('--color-bg-elevated').replace('#',''),
          bgCard=cssVar('--color-bg-card').replace('#',''), border=cssVar('--color-border').replace('#',''),
          accent=cssVar('--color-accent').replace('#',''), success=cssVar('--color-success').replace('#','');
    document.documentElement.setAttribute('data-theme', prev);
    return {
      base: mode==='dark' ? 'vs-dark' : 'vs', inherit: true,
      rules: [
        { token:'keyword', foreground:accent },
        { token:'string',  foreground:success },
        { token:'comment', foreground:fgFaint, fontStyle:'italic' },
      ],
      colors: {
        'editor.background':'#'+bg,'editor.foreground':'#'+fgText,
        'editorLineNumber.foreground':'#'+fgFaint,'editorLineNumber.activeForeground':'#'+fgMuted,
        'editor.lineHighlightBackground':'#'+bgAlt,'editor.selectionBackground':'#'+bgElev,
        'editorCursor.foreground':'#'+accent,'editorGutter.background':'#'+bg,
        'editorWidget.background':'#'+bgCard,'editorWidget.border':'#'+border,
        'scrollbarSlider.background':'#'+border+'66',
      },
    };
  }

  function initMonaco(container, initialValue, onChange) {
    if (!window.require) {
      // Load Monaco loader
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js';
      script.onload = () => _loadMonaco(container, initialValue, onChange);
      document.head.appendChild(script);
    } else {
      _loadMonaco(container, initialValue, onChange);
    }
  }

  function _loadMonaco(container, initialValue, onChange) {
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
    require(['vs/editor/editor.main'], () => {
      const curTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'wiki-light' : 'wiki-dark';
      monaco.editor.defineTheme('wiki-dark',  buildMonacoTheme('dark'));
      monaco.editor.defineTheme('wiki-light', buildMonacoTheme('light'));

      _monacoEditor = monaco.editor.create(container, {
        value: initialValue,
        language: 'markdown',
        theme: curTheme,
        fontSize: 14, fontFamily: cssVar('--font-mono') || "'IBM Plex Mono',monospace",
        lineHeight: 22, wordWrap: 'on', minimap: { enabled: false },
        scrollBeyondLastLine: false, padding: { top: 12, bottom: 12 },
      });
      _monacoReady = true;
      // Apply the default split view so preview is visible from the start
      setViewMode(_viewMode);
      _monacoEditor.onDidChangeModelContent(() => { onChange(); updateWc(); });
      _monacoEditor.onDidChangeCursorPosition(e => {
        const pos = e.position;
        const el  = document.getElementById('admin-cursor');
        if (el) el.textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
      });
      _monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => doSave());
      _monacoEditor.focus();
    });
  }

  // ── Format helpers (Monaco) ───────────────────────────────────
  function monacoWrap(pre, post, placeholder = 'text') {
    if (!_monacoEditor) return;
    const sel = _monacoEditor.getSelection();
    const selected = _monacoEditor.getModel().getValueInRange(sel) || placeholder;
    _monacoEditor.executeEdits('wrap', [{ range: sel, text: `${pre}${selected}${post}`, forceMoveMarkers: true }]);
    _monacoEditor.focus();
  }
  function monacoLinePrefix(prefix) {
    if (!_monacoEditor) return;
    const pos  = _monacoEditor.getPosition();
    const line = _monacoEditor.getModel().getLineContent(pos.lineNumber);
    const range = { startLineNumber: pos.lineNumber, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: 1 };
    if (!line.startsWith(prefix)) _monacoEditor.executeEdits('prefix', [{ range, text: prefix }]);
    _monacoEditor.focus();
  }
  function monacoInsert(text) {
    if (!_monacoEditor) return;
    const sel = _monacoEditor.getSelection();
    _monacoEditor.executeEdits('insert', [{ range: sel, text, forceMoveMarkers: true }]);
    _monacoEditor.focus();
  }

  // ── Status / WC bar ───────────────────────────────────────────
  function setStatus(msg, type = 'info') {
    const el = document.getElementById('admin-status');
    if (el) { el.textContent = msg; el.className = `admin-status-pill ${type}`; }
  }
  function updateWc() {
    if (!_monacoEditor) return;
    const text  = _monacoEditor.getValue();
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const mins  = Math.max(1, Math.ceil(words / 200));
    const el    = document.getElementById('admin-wc');
    if (el) el.textContent = `${words.toLocaleString()} words · ${mins} min read`;
  }
  function schedulePreview() {
    clearTimeout(_previewTimer);
    _previewTimer = setTimeout(() => { if (_viewMode !== 'editor') updatePreview(); }, 400);
    if (_slug && _monacoEditor) sessionStorage.setItem(`wdraft_${_slug}`, _monacoEditor.getValue());
    setStatus('unsaved', 'warn');
  }
  function updatePreview() {
    if (!_monacoEditor) return;
    const { body } = parseFm(_monacoEditor.getValue());
    const title    = document.getElementById('afm-title')?.value || '';
    const html     = buildMarkedHtml(body); // shared renderer — no duplication
    const pi       = document.getElementById('admin-preview-inner');
    if (pi) {
      pi.innerHTML = `<h1 class="admin-preview-inner__title">${esc(title)}</h1>${processCallouts(html)}`;
      if (typeof Prism !== 'undefined') Prism.highlightAllUnder(pi);
    }
  }

  // ── View mode (split / editor / preview) ─────────────────────
  function setViewMode(mode) {
    _viewMode = mode;
    const mw = document.getElementById('admin-monaco-wrap');
    const pp = document.getElementById('admin-preview-pane');
    if (mw) mw.style.display = mode === 'preview' ? 'none' : '';
    if (pp) pp.style.display = mode === 'editor'  ? 'none' : '';
    ['split','editor','preview'].forEach(m => {
      document.getElementById(`admin-pane-${m}`)?.classList.toggle('is-active', m === mode);
    });
    if (_monacoEditor) setTimeout(() => _monacoEditor.layout(), 50);
    if (mode !== 'editor') updatePreview();
  }




  // ── Open doc in editor ────────────────────────────────────────
  async function _openDoc(slug) {
    try {
      setStatus('loading…', 'info');
      const { content, sha } = await GH.getFile(`docs/${slug}.md`);
      _sha  = sha || '';
      _slug = slug;
      const draft    = sessionStorage.getItem(`wdraft_${slug}`);
      const raw      = (draft && draft !== content) ? draft : content;
      const hasDraft = !!(draft && draft !== content);
      loadIntoMonaco(slug, raw);
      const banner = document.getElementById('admin-draft-banner');
      if (banner) banner.style.display = hasDraft ? 'flex' : 'none';
      setStatus(hasDraft ? 'draft restored' : 'saved', hasDraft ? 'warn' : 'ok');
    } catch(e) {
      setStatus('load failed', 'error');
      toast('Load failed: ' + e.message, 'error');
    }
  }

  function loadIntoMonaco(slug, raw) {
    _slug  = slug;
    const { fm } = parseFm(raw);
    const titleEl   = document.getElementById('afm-title');
    const sectionEl = document.getElementById('afm-section');
    const descEl    = document.getElementById('afm-desc');
    const updatedEl = document.getElementById('afm-updated');
    if (titleEl)   titleEl.value   = fm.title       || slugToTitle(slug);
    if (sectionEl) sectionEl.value = fm.section     || '';
    if (descEl)    descEl.value    = fm.description || fm.excerpt || '';
    if (updatedEl) updatedEl.value = fm.updated     || today();

    if (_monacoEditor) {
      _monacoEditor.setValue(raw);
      _monacoEditor.revealLine(1);
      _monacoEditor.focus();
      _monacoEditor.layout();
    }
    updateWc();
    if (_viewMode !== 'editor') updatePreview();
  }

  // ── New doc ───────────────────────────────────────────────────
  function openNewDocModal(prefillSlug = '') {
    const modal = document.getElementById('admin-new-doc-modal');
    if (!modal) return;
    document.getElementById('anew-slug').value  = prefillSlug;
    document.getElementById('anew-title').value = prefillSlug ? slugToTitle(prefillSlug.split('/').pop()) : '';
    modal.classList.add('is-open');
    document.getElementById('anew-slug').focus();
  }

  function createNewDoc() {
    const slug  = document.getElementById('anew-slug').value.trim().replace(/\.md$/, '');
    const title = document.getElementById('anew-title').value.trim() || slugToTitle(slug.split('/').pop());
    if (!slug) { alert('Please enter a slug'); return; }
    closeAdminModal('admin-new-doc-modal');
    const rawFm = `---\ntitle: '${escJs(title)}'\nsection: ''\ndescription: ''\nupdated: '${today()}'\n---\n\n# ${title}\n\nStart writing here.\n`;
    _sha  = null;
    loadIntoMonaco(slug, rawFm);
    setStatus('new file — not saved', 'warn');
    toast('New page created — save to publish');
  }

  // ── Delete doc ────────────────────────────────────────────────
  async function _deleteDoc(slug) {
    if (!confirm(`Delete docs/${slug}.md permanently?`)) return;
    try {
      const { sha } = await GH.getFile(`docs/${slug}.md`);
      if (!sha) throw new Error('File not found');
      await GH.deleteFile(`docs/${slug}.md`, sha, `docs: delete ${slug}`);
      if (_slug === slug) { _slug = null; if (_monacoEditor) _monacoEditor.setValue(''); setStatus('deleted', 'info'); }
      toast(`Deleted ${slug}`);
      // Invalidate cache
      delete State.docCache[slug];
    } catch(e) {
      toast('Delete failed: ' + e.message, 'error');
    }
  }

  // ── Save ──────────────────────────────────────────────────────
  async function doSave() {
    if (!_slug) return;
    const raw = buildRaw();
    const commitMsgEl = document.getElementById('admin-commit-msg');
    const msg = commitMsgEl?.value.trim() || `docs: update ${_slug}`;
    const branch = CONFIG.GITHUB_BRANCH || 'main';
    setStatus('saving…', 'info');
    try {
      const { sha } = await GH.getFile(`docs/${_slug}.md`);
      const putResult = await GH.putFile(`docs/${_slug}.md`, raw, msg, sha || _sha || undefined);
      _sha = putResult?.content?.sha || '';
      sessionStorage.removeItem(`wdraft_${_slug}`);
      State.docCache[_slug] = raw;
      setStatus('saved', 'ok');
      toast('✓ Committed to GitHub!');
      const banner = document.getElementById('admin-draft-banner');
      if (banner) banner.style.display = 'none';
      // Reset commit msg placeholder
      if (commitMsgEl) commitMsgEl.value = '';
    } catch(e) {
      setStatus('save failed', 'error');
      toast('Save failed: ' + e.message, 'error');
    }
  }

  // ── Save & open PR ────────────────────────────────────────────
  async function doSaveWithPR() {
    if (!_slug) return;
    const raw       = buildRaw();
    const msg       = document.getElementById('admin-commit-msg')?.value.trim() || `docs: update ${_slug}`;
    const baseBranch = CONFIG.GITHUB_BRANCH || 'main';
    const prBranchInput = document.getElementById('admin-pr-branch')?.value.trim();
    const prBranch = prBranchInput || `wiki-edit/${(_slug||'doc').replace(/\//g,'-')}-${Date.now().toString(36)}`;

    if (!confirm(`Commit to branch "${prBranch}" and open a Pull Request into "${baseBranch}"?\n\nCommit message: ${msg}`)) return;

    setStatus('creating PR…', 'info');
    try {
      // Ensure the PR branch exists (creates from base if not)
      await GH.ensureBranch(prBranch, baseBranch);

      // Get existing file SHA on the PR branch (if any)
      let fileSha;
      try {
        const existing = await GH.getFile(`docs/${_slug}.md`);
        fileSha = existing.sha || undefined;
      } catch { fileSha = undefined; }

      // Commit the file to the PR branch — reuse GH.putFile (temporarily override branch)
      const savedBranch = CONFIG.GITHUB_BRANCH;
      CONFIG.GITHUB_BRANCH = prBranch;
      try { await GH.putFile(`docs/${_slug}.md`, raw, msg, fileSha || undefined); }
      finally { CONFIG.GITHUB_BRANCH = savedBranch; }

      // Open the PR
      const pr = await GH.createPR(prBranch, baseBranch, msg, `Updated \`docs/${_slug}.md\`\n\n_Created via Shanios Docs inline editor._`);

      sessionStorage.removeItem(`wdraft_${_slug}`);
      setStatus('PR opened', 'ok');
      toast(`✓ PR #${pr.number} opened — click to view`);

      // Open PR in new tab
      if (pr.html_url) window.open(pr.html_url, '_blank', 'noopener');

      const banner = document.getElementById('admin-draft-banner');
      if (banner) banner.style.display = 'none';
    } catch(e) {
      setStatus('PR failed', 'error');
      toast('PR failed: ' + e.message, 'error');
    }
  }

  // ── Nav tree (from admin) ─────────────────────────────────────
  async function loadNavFromConfig() {
    try {
      const { content } = await GH.getFile('nav-docs.js');
      if (content) {
        _liveNavTree = extractNavTree(content);
        renderNavTreePanel();
        // Cache for offline fallback
        try { localStorage.setItem(key('nav_cache'), JSON.stringify(_liveNavTree)); } catch {}
        return;
      }
    } catch(e) {
      console.warn('Could not load nav from GitHub:', e.message);
    }
    // Fallback 1: cached nav from previous load
    const cachedNav = localStorage.getItem(key('nav_cache'));
    if (cachedNav) {
      try {
        _liveNavTree = JSON.parse(cachedNav);
        renderNavTreePanel();
        toast('Nav loaded from local cache (GitHub unreachable)');
        return;
      } catch {}
    }
    // Fallback 2: seed from the live CONFIG object already in memory
    _liveNavTree = JSON.parse(JSON.stringify(CONFIG.NAV_TREE));
    renderNavTreePanel();
    toast('Nav loaded from in-memory CONFIG');
  }

  // Seed config form fields from the live CONFIG object (when config-docs.js is unavailable)

  function extractNavTree(src) {
    try {
      // nav-docs.js format: CONFIG.NAV_TREE = [ ... ];
      const m = src.match(/CONFIG\.NAV_TREE\s*=\s*\[([\s\S]*?)\];/);
      if (!m) return [...CONFIG.NAV_TREE];
      return (new Function('return [' + m[1] + ']'))();
    } catch(e) {
      return [...CONFIG.NAV_TREE];
    }
  }

  function navTreeToJs(tree) {
    const indent = '  ';
    const lines  = [];
    tree.forEach(item => {
      if (item.children) {
        lines.push(`${indent}{`);
        lines.push(`${indent}  title: '${escJs(item.title)}', icon: '${escJs(item.icon||'')}',`);
        lines.push(`${indent}  children: [`);
        item.children.forEach(child => {
          lines.push(`${indent}    { title: '${escJs(child.title)}', slug: '${escJs(child.slug)}' },`);
        });
        lines.push(`${indent}  ]`);
        lines.push(`${indent}},`);
      } else {
        lines.push(`${indent}{ title: '${escJs(item.title)}', icon: '${escJs(item.icon||'')}', slug: '${escJs(item.slug||'')}' },`);
      }
    });
    return lines.join('\n') + '\n';
  }

  function renderNavTreePanel() {
    const container = document.getElementById('admin-nav-tree');
    if (!container) return;
    container.innerHTML = '';

    _liveNavTree.forEach((item, gi) => {
      const group = document.createElement('div');
      group.className = 'admin-nav-group';
      group.dataset.gi = gi;

      const hasChildren = !!item.children;
      group.innerHTML = `
        <div class="admin-nav-group__head">
          <span class="drag-handle" title="Drag to reorder">⠿</span>
          <span class="admin-nav-group__icon"><i class="${esc(item.icon||'fa-solid fa-circle')}"></i></span>
          <span class="admin-nav-group__title">${esc(item.title)}</span>
          ${item.slug ? `<span class="admin-nav-group__slug">${esc(item.slug)}</span>` : ''}
          <div class="admin-nav-group__actions">
            ${hasChildren ? `<button class="admin-nav-btn" title="Add page" onclick="AdminEditor._addLeafModal(${gi})"><i class="fa-solid fa-plus"></i></button>` : ''}
            <button class="admin-nav-btn" title="Edit" onclick="AdminEditor._editNodeModal('group',${gi})"><i class="fa-solid fa-pencil"></i></button>
            <button class="admin-nav-btn danger" title="Delete" onclick="AdminEditor._deleteNavGroup(${gi})"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </div>
        ${hasChildren && item.children.length ? `
        <div class="admin-nav-children">
          ${item.children.map((child, li) => `
            <div class="admin-nav-leaf" data-gi="${gi}" data-li="${li}">
              <span class="drag-handle">⠿</span>
              <span class="admin-nav-leaf__title">${esc(child.title)}</span>
              <span class="admin-nav-leaf__slug">${esc(child.slug)}</span>
              <div class="admin-nav-leaf__actions">
                <button class="admin-nav-btn" title="Open in editor" onclick="State.editMode ? AdminEditor._openDoc('${esc(child.slug)}') : enterEditOrAuth('${esc(child.slug)}')"><i class="fa-solid fa-arrow-up-right-from-square" style="font-size:.58rem"></i></button>
                <button class="admin-nav-btn" title="Edit" onclick="AdminEditor._editNodeModal('leaf',${gi},${li})"><i class="fa-solid fa-pencil"></i></button>
                <button class="admin-nav-btn danger" title="Remove" onclick="AdminEditor._deleteNavLeaf(${gi},${li})"><i class="fa-solid fa-xmark"></i></button>
              </div>
            </div>`).join('')}
        </div>` : (hasChildren ? `<div class="admin-nav-children" style="padding:.5rem;font-size:.72rem;color:var(--color-text-faint)">No pages yet — <button class="admin-nav-btn" onclick="AdminEditor._addLeafModal(${gi})" style="color:var(--color-accent);font-size:.72rem">Add one</button></div>` : '')}`;

      // Drag & drop reorder
      group.setAttribute('draggable', 'true');
      group.addEventListener('dragstart', e => { e.dataTransfer.setData('gi', gi); e.dataTransfer.setData('type', 'group'); });
      group.addEventListener('dragover',  e => { e.preventDefault(); group.classList.add('drop-target'); });
      group.addEventListener('dragleave', () => group.classList.remove('drop-target'));
      group.addEventListener('drop', e => {
        e.preventDefault(); group.classList.remove('drop-target');
        const fromGi = parseInt(e.dataTransfer.getData('gi'));
        if (e.dataTransfer.getData('type') === 'group' && fromGi !== gi) {
          const [moved] = _liveNavTree.splice(fromGi, 1);
          _liveNavTree.splice(gi, 0, moved);
          renderNavTreePanel();
        }
      });

      container.appendChild(group);
    });
  }

  function _deleteNavGroup(gi) {
    if (!confirm(`Remove "${_liveNavTree[gi].title}" from nav?`)) return;
    _liveNavTree.splice(gi, 1);
    renderNavTreePanel();
  }
  function _deleteNavLeaf(gi, li) {
    if (!confirm(`Remove "${_liveNavTree[gi].children[li].title}"?`)) return;
    _liveNavTree[gi].children.splice(li, 1);
    renderNavTreePanel();
  }


  // ── Inline leaf add (sidebar nav editor) ───────────────────
  function _addLeafInline(gi) {
    // Hide any other open inline add rows first
    document.querySelectorAll('.admin-nav-add-leaf').forEach(el => el.style.display = 'none');
    const row = document.getElementById(`admin-nav-add-leaf-${gi}`);
    if (row) { row.style.display = 'block'; row.querySelector(`#add-leaf-title-${gi}`)?.focus(); }
  }

  function _cancelAddLeafInline(gi) {
    const row = document.getElementById(`admin-nav-add-leaf-${gi}`);
    if (row) row.style.display = 'none';
  }

  function _commitAddLeafInline(gi) {
    const t = document.getElementById(`add-leaf-title-${gi}`)?.value.trim();
    const sl = document.getElementById(`add-leaf-slug-${gi}`)?.value.trim();
    if (!t || !sl) return alert('Title & slug required');
    _liveNavTree[gi].children.push({ title: t, slug: sl });
    renderNavTreePanel();
  }

  // ── Add group modal ───────────────────────────────────────────
  function openAddGroupModal() {
    const modal = document.getElementById('admin-add-group-modal');
    if (!modal) return;
    document.getElementById('agrp-title').value    = '';
    document.getElementById('agrp-icon').value     = '';
    document.getElementById('agrp-type').value     = 'group';
    document.getElementById('agrp-slug').value     = '';
    document.getElementById('agrp-slug-wrap').style.display = 'none';
    updateGroupIconPreview();
    modal.classList.add('is-open');
    document.getElementById('agrp-title').focus();
  }
  function updateGroupIconPreview() {
    const cls = document.getElementById('agrp-icon')?.value.trim() || 'fa-solid fa-folder';
    const el  = document.getElementById('agrp-icon-prev');
    if (el) { el.className = cls; el.style.color = 'var(--color-accent)'; }
  }
  function toggleGroupSlug() {
    const isLeaf = document.getElementById('agrp-type')?.value === 'leaf';
    const wrap   = document.getElementById('agrp-slug-wrap');
    if (wrap) wrap.style.display = isLeaf ? '' : 'none';
  }
  function addNavGroup() {
    const title = document.getElementById('agrp-title')?.value.trim();
    const icon  = document.getElementById('agrp-icon')?.value.trim()  || 'fa-solid fa-folder';
    const type  = document.getElementById('agrp-type')?.value;
    const slug  = document.getElementById('agrp-slug')?.value.trim();
    if (!title) { alert('Title is required'); return; }
    if (type === 'leaf') _liveNavTree.push({ title, icon, slug: slug || slugify(title) });
    else                 _liveNavTree.push({ title, icon, children: [] });
    renderNavTreePanel();
    closeAdminModal('admin-add-group-modal');
  }

  // ── Add leaf modal ────────────────────────────────────────────
  function _addLeafModal(giPreset) {
    const modal = document.getElementById('admin-add-leaf-modal');
    if (!modal) return;
    const sel = document.getElementById('alef-group');
    sel.innerHTML = '';
    _liveNavTree.forEach((item, i) => {
      if (item.children !== undefined) {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = item.title;
        if (i === giPreset) opt.selected = true;
        sel.appendChild(opt);
      }
    });
    document.getElementById('alef-title').value = '';
    document.getElementById('alef-slug').value  = '';
    modal.classList.add('is-open');
    document.getElementById('alef-title').focus();
  }
  function autoLeafSlug() {
    const title   = document.getElementById('alef-title')?.value.trim();
    const gi      = parseInt(document.getElementById('alef-group')?.value);
    const grpTitle = _liveNavTree[gi]?.title || '';
    const prefix  = grpTitle.toLowerCase().replace(/[^\w]+/g,'-').replace(/^-+|-+$/g,'');
    const slugEl  = document.getElementById('alef-slug');
    if (slugEl) slugEl.value = prefix + '/' + slugify(title);
  }
  function addNavLeaf() {
    const gi    = parseInt(document.getElementById('alef-group')?.value);
    const title = document.getElementById('alef-title')?.value.trim();
    const slug  = document.getElementById('alef-slug')?.value.trim();
    if (!title || !slug) { alert('Fill in title and slug'); return; }
    if (!_liveNavTree[gi].children) _liveNavTree[gi].children = [];
    _liveNavTree[gi].children.push({ title, slug });
    renderNavTreePanel();
    closeAdminModal('admin-add-leaf-modal');
  }

  // ── Edit node modal ───────────────────────────────────────────
  function _editNodeModal(type, gi, li) {
    _editTarget = { type, gi, li };
    const body    = document.getElementById('aedit-modal-body');
    const titleEl = document.getElementById('aedit-modal-title');
    if (!body || !titleEl) return;

    if (type === 'group') {
      const item = _liveNavTree[gi];
      titleEl.innerHTML = '<i class="fa-solid fa-pencil" style="margin-right:.35rem"></i>Edit Group';
      body.innerHTML = `
        <div><label class="a-label">Title</label><input class="a-input" id="aen-title" type="text" value="${esc(item.title)}"></div>
        <div><label class="a-label">Icon class</label>
          <input class="a-input mono" id="aen-icon" type="text" value="${esc(item.icon||'')}" oninput="document.getElementById('aen-icon-prev').className=this.value||'fa-solid fa-folder';document.getElementById('aen-icon-prev').style.color='var(--color-accent)'">
          <div style="margin-top:.3rem;display:flex;align-items:center;gap:.4rem;font-size:.74rem;color:var(--color-text-muted)">Preview: <i id="aen-icon-prev" class="${esc(item.icon||'fa-solid fa-folder')}" style="color:var(--color-accent)"></i></div>
        </div>
        ${item.slug !== undefined ? `<div><label class="a-label">Slug</label><input class="a-input mono" id="aen-slug" type="text" value="${esc(item.slug||'')}"></div>` : ''}`;
    } else {
      const child = _liveNavTree[gi].children[li];
      titleEl.innerHTML = '<i class="fa-solid fa-pencil" style="margin-right:.35rem"></i>Edit Page';
      body.innerHTML = `
        <div><label class="a-label">Title</label><input class="a-input" id="aen-title" type="text" value="${esc(child.title)}"></div>
        <div><label class="a-label">Slug</label><input class="a-input mono" id="aen-slug" type="text" value="${esc(child.slug)}"></div>`;
    }
    document.getElementById('admin-edit-node-modal').classList.add('is-open');
  }
  function commitNodeEdit() {
    if (!_editTarget) return;
    const { type, gi, li } = _editTarget;
    if (type === 'group') {
      _liveNavTree[gi].title = document.getElementById('aen-title')?.value.trim() || _liveNavTree[gi].title;
      _liveNavTree[gi].icon  = document.getElementById('aen-icon')?.value.trim()  || _liveNavTree[gi].icon;
      const slugEl = document.getElementById('aen-slug');
      if (slugEl) _liveNavTree[gi].slug = slugEl.value.trim();
    } else {
      _liveNavTree[gi].children[li].title = document.getElementById('aen-title')?.value.trim() || _liveNavTree[gi].children[li].title;
      _liveNavTree[gi].children[li].slug  = document.getElementById('aen-slug')?.value.trim()  || _liveNavTree[gi].children[li].slug;
    }
    renderNavTreePanel();
    closeAdminModal('admin-edit-node-modal');
  }

  async function saveNavTree() {
    const commitMsgEl = document.getElementById('admin-commit-msg');
    const msg = commitMsgEl?.value.trim() || 'config: update NAV_TREE';
    setStatus('saving nav…', 'info');
    try {
      const { content, sha } = await GH.getFile('nav-docs.js');
      if (!content) throw new Error('nav-docs.js not found');
      const navJs  = navTreeToJs(_liveNavTree);
      const updated = content.replace(
        /CONFIG\.NAV_TREE\s*=\s*\[[\s\S]*?\];/,
        () => `CONFIG.NAV_TREE = [\n${navJs}];`
      );
      if (updated === content) throw new Error('Could not locate CONFIG.NAV_TREE in nav-docs.js');
      await GH.putFile('nav-docs.js', updated, msg, sha);
      // Live-update the running CONFIG
      CONFIG.NAV_TREE = JSON.parse(JSON.stringify(_liveNavTree));
      State.searchIndex = buildSearchIndex(CONFIG.NAV_TREE);
      renderNavTree(CONFIG.NAV_TREE, State.currentSlug);
      if (commitMsgEl) commitMsgEl.value = '';
      setStatus('nav saved', 'ok');
      toast('✓ Nav saved to nav-docs.js!');
    } catch(e) {
      setStatus('nav save failed', 'error');
      toast('Nav save failed: ' + e.message, 'error');
    }
  }


  // ── Modals ────────────────────────────────────────────────────
  function closeAdminModal(id) { document.getElementById(id)?.classList.remove('is-open'); }

  // ── Build the full edit UI into #doc-content area ─────────────
  function buildEditUI() {
    // Inject modals into body once (no right panel - nav/config live in sidebar)
    if (document.getElementById('admin-modals-host')) return;

    // ── Modals ───────────────────────────────────────────────────
    const modals = document.createElement('div');
    modals.id = 'admin-modals-host';
    modals.innerHTML = `
      <!-- New doc -->
      <div class="admin-modal-backdrop" id="admin-new-doc-modal">
        <div class="admin-modal">
          <div class="admin-modal__header">
            <span class="admin-modal__title"><i class="fa-solid fa-file-plus" style="color:var(--color-success,#3dba7e);margin-right:.3rem"></i>New Page</span>
            <button class="admin-modal__close" onclick="AdminEditor._closeModal('admin-new-doc-modal')"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="admin-modal__body">
            <div><label class="a-label">Slug / path <span style="color:var(--color-text-faint);font-size:.68rem">(e.g. intro/getting-started)</span></label>
              <input class="a-input mono" id="anew-slug" type="text" placeholder="section/page-name" oninput="this.value=this.value.replace(/[^a-z0-9\\-\\/]/g,'')">
            </div>
            <div><label class="a-label">Title</label><input class="a-input" id="anew-title" type="text" placeholder="Getting Started"></div>
          </div>
          <div class="admin-modal__footer">
            <button class="a-btn a-btn--ghost" onclick="AdminEditor._closeModal('admin-new-doc-modal')">Cancel</button>
            <button class="a-btn a-btn--primary" onclick="AdminEditor._createNewDoc()"><i class="fa-solid fa-plus"></i> Create</button>
          </div>
        </div>
      </div>

      <!-- Add Group -->
      <div class="admin-modal-backdrop" id="admin-add-group-modal">
        <div class="admin-modal">
          <div class="admin-modal__header">
            <span class="admin-modal__title"><i class="fa-solid fa-folder-plus" style="color:var(--color-callout-note,#5a9cf7);margin-right:.3rem"></i>Add Nav Group</span>
            <button class="admin-modal__close" onclick="AdminEditor._closeModal('admin-add-group-modal')"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="admin-modal__body">
            <div><label class="a-label">Group Title</label><input class="a-input" id="agrp-title" type="text" placeholder="Installation"></div>
            <div><label class="a-label">Icon <span style="color:var(--color-text-faint);font-size:.68rem">(Font Awesome class)</span></label>
              <input class="a-input mono" id="agrp-icon" type="text" placeholder="fa-solid fa-download" oninput="AdminEditor._updateIconPrev()">
              <div style="margin-top:.4rem;display:flex;align-items:center;gap:.4rem;font-size:.74rem;color:var(--color-text-muted)">Preview: <i id="agrp-icon-prev" class="fa-solid fa-folder" style="color:var(--color-accent)"></i></div>
            </div>
            <div><label class="a-label">Type</label>
              <select class="a-select" id="agrp-type" onchange="AdminEditor._toggleGroupSlug()">
                <option value="group">Group (with child pages)</option>
                <option value="leaf">Standalone page</option>
              </select>
            </div>
            <div id="agrp-slug-wrap" style="display:none"><label class="a-label">Slug</label><input class="a-input mono" id="agrp-slug" type="text" placeholder="overview"></div>
          </div>
          <div class="admin-modal__footer">
            <button class="a-btn a-btn--ghost" onclick="AdminEditor._closeModal('admin-add-group-modal')">Cancel</button>
            <button class="a-btn a-btn--primary" onclick="AdminEditor._addNavGroup()"><i class="fa-solid fa-plus"></i> Add</button>
          </div>
        </div>
      </div>

      <!-- Add Leaf -->
      <div class="admin-modal-backdrop" id="admin-add-leaf-modal">
        <div class="admin-modal">
          <div class="admin-modal__header">
            <span class="admin-modal__title"><i class="fa-solid fa-file-plus" style="color:var(--color-success,#3dba7e);margin-right:.3rem"></i>Add Page to Group</span>
            <button class="admin-modal__close" onclick="AdminEditor._closeModal('admin-add-leaf-modal')"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="admin-modal__body">
            <div><label class="a-label">Parent Group</label><select class="a-select" id="alef-group"></select></div>
            <div><label class="a-label">Page Title</label><input class="a-input" id="alef-title" type="text" placeholder="Page Title" oninput="AdminEditor._autoLeafSlug()"></div>
            <div><label class="a-label">Slug</label><input class="a-input mono" id="alef-slug" type="text" placeholder="group/page-name"></div>
          </div>
          <div class="admin-modal__footer">
            <button class="a-btn a-btn--ghost" onclick="AdminEditor._closeModal('admin-add-leaf-modal')">Cancel</button>
            <button class="a-btn a-btn--primary" onclick="AdminEditor._addNavLeaf()"><i class="fa-solid fa-plus"></i> Add</button>
          </div>
        </div>
      </div>

      <!-- Edit Node -->
      <div class="admin-modal-backdrop" id="admin-edit-node-modal">
        <div class="admin-modal">
          <div class="admin-modal__header">
            <span class="admin-modal__title" id="aedit-modal-title"></span>
            <button class="admin-modal__close" onclick="AdminEditor._closeModal('admin-edit-node-modal')"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="admin-modal__body" id="aedit-modal-body"></div>
          <div class="admin-modal__footer">
            <button class="a-btn a-btn--ghost" onclick="AdminEditor._closeModal('admin-edit-node-modal')">Cancel</button>
            <button class="a-btn a-btn--primary" onclick="AdminEditor._commitNodeEdit()"><i class="fa-solid fa-check"></i> Save</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modals);

    // Close modals on backdrop click
    document.querySelectorAll('.admin-modal-backdrop').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) m.classList.remove('is-open'); });
    });

  }

    // ── Enter edit mode ───────────────────────────────────────────
  async function enterEdit(slug, rawMd) {
    if (State.editMode) return;
    State.editMode = true;

    injectStyles();
    buildEditUI(); // inject modals into <body> once

    _slug  = slug;
    _rawMd = rawMd;

    // Re-wire the topbar
    const editToggle = document.getElementById('topbar-edit-toggle');
    if (editToggle) { editToggle.classList.add('is-editing'); editToggle.innerHTML = '<i class="fa-solid fa-eye"></i> Viewing'; }
    document.body.classList.add('edit-mode-active');

    const badge = document.getElementById('edit-mode-badge');
    if (badge) badge.style.display = 'inline-flex';

    // Fetch latest SHA
    try {
      const result = await GH.getFile(`docs/${slug}.md`);
      _sha   = result.sha || '';
      _rawMd = result.content || rawMd;
    } catch(e) { toast('Could not fetch SHA: ' + e.message, 'error'); }

    // Inject editor into main content area
    const content = $('#doc-content');
    if (!content) return;

    const { fm } = parseFm(_rawMd);
    const title   = fm.title   || slugToTitle(slug);
    const section = fm.section || '';
    const updated = fm.updated || today();
    const desc    = fm.description || fm.excerpt || '';

    // Build breadcrumb
    const breadcrumb = buildBreadcrumb(slug);

    const draft    = sessionStorage.getItem(`wdraft_${slug}`);
    const hasDraft = !!(draft && draft !== _rawMd);
    if (hasDraft) _rawMd = draft;

    content.innerHTML = `
      <div class="admin-editor-area-wrap admin-editor-wrap" id="admin-editor-area-wrap">

        <!-- Breadcrumb preserved -->
        <div class="doc-header" style="border-bottom:1px solid var(--color-border);padding-bottom:.65rem;margin-bottom:0">
          <nav class="doc-breadcrumb" aria-label="Breadcrumb">
            <a href="#"><i class="fa-solid fa-house" style="font-size:0.7rem"></i></a>
            ${breadcrumb.map(b => `<i class="fa-solid fa-chevron-right" style="font-size:0.55rem;color:var(--color-border)"></i><a href="#doc/${esc(b.slug)}">${esc(b.title)}</a>`).join('')}
            <i class="fa-solid fa-chevron-right" style="font-size:0.55rem;color:var(--color-border)"></i>
            <span>${esc(title)}</span>
          </nav>
        </div>

        <!-- Draft banner -->
        <div class="admin-draft-banner" id="admin-draft-banner" style="display:${hasDraft ? 'flex' : 'none'}">
          <i class="fa-solid fa-clock-rotate-left"></i>
          <span>Unsaved draft restored.</span>
          <button onclick="AdminEditor._discardDraft()">Discard &amp; reload</button>
        </div>

        <!-- Front-matter bar -->
        <div class="admin-fm-bar" id="admin-fm-bar">
          <div class="admin-fm-bar__header" onclick="AdminEditor._toggleFmBar()">
            <span class="admin-fm-bar__label"><i class="fa-solid fa-sliders"></i> Front Matter (YAML)</span>
            <button class="admin-fm-bar__toggle" onclick="event.stopPropagation();AdminEditor._toggleFmBar()">
              <i class="fa-solid fa-chevron-down fm-chevron"></i>
            </button>
          </div>
          <div class="admin-fm-bar__body">
            <div class="admin-fm-row">
              <div><label class="a-label">Title</label><input class="a-input" id="afm-title" type="text" value="${esc(title)}" oninput="AdminEditor._fmChange()"></div>
            </div>
            <div class="admin-fm-row" style="gap:.5rem">
              <div style="flex:1.2"><label class="a-label">Slug</label><input class="a-input mono" id="afm-slug" type="text" value="${esc(slug)}" style="font-size:.73rem" readonly title="Slug is the file path"></div>
              <div><label class="a-label">Section</label><input class="a-input" id="afm-section" type="text" value="${esc(section)}" oninput="AdminEditor._fmChange()"></div>
              <div><label class="a-label">Updated</label><input class="a-input" id="afm-updated" type="date" value="${esc(updated)}" onchange="AdminEditor._fmChange()"></div>
            </div>
            <div class="admin-fm-row">
              <div style="flex:1"><label class="a-label">Description / excerpt</label><textarea class="a-textarea" id="afm-desc" rows="1" style="resize:none" oninput="AdminEditor._fmChange()">${esc(desc)}</textarea></div>
            </div>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="admin-toolbar" id="admin-toolbar">

          <!-- ── Save / file actions ── -->
          <div class="admin-toolbar__group">
            <button class="atbtn" title="Download .md" onclick="AdminEditor._downloadMd()"><i class="fa-solid fa-download" style="font-size:.68rem"></i></button>
            <button class="atbtn" title="Copy raw markdown" onclick="AdminEditor._copyMd()"><i class="fa-solid fa-clipboard" style="font-size:.68rem"></i></button>
          </div>
          <div class="admin-toolbar__sep"></div>

          <!-- ── Inline format ── -->
          <div class="admin-toolbar__group">
            <button class="atbtn" title="Bold (Ctrl+B)" onclick="AdminEditor._wrap('**','**','bold text')"><b style="font-size:.85rem">B</b></button>
            <button class="atbtn" title="Italic (Ctrl+I)" onclick="AdminEditor._wrap('_','_','italic text')"><i style="font-size:.85rem">I</i></button>
            <button class="atbtn" title="Strikethrough" onclick="AdminEditor._wrap('~~','~~','strikethrough')"><s style="font-size:.78rem">S</s></button>
            <button class="atbtn" title="Inline code" onclick="AdminEditor._wrap('\`','\`','code')"><i class="fa-solid fa-code" style="font-size:.68rem"></i></button>
          </div>
          <div class="admin-toolbar__sep"></div>

          <!-- ── Block / heading ── -->
          <div class="admin-toolbar__group">
            <button class="atbtn" title="Heading 1" onclick="AdminEditor._linePrefix('# ')" style="font-size:.72rem;font-weight:700">H1</button>
            <button class="atbtn" title="Heading 2" onclick="AdminEditor._linePrefix('## ')" style="font-size:.72rem;font-weight:700">H2</button>
            <button class="atbtn" title="Heading 3" onclick="AdminEditor._linePrefix('### ')" style="font-size:.72rem;font-weight:700">H3</button>
            <button class="atbtn" title="Blockquote" onclick="AdminEditor._linePrefix('> ')"><i class="fa-solid fa-quote-left" style="font-size:.68rem"></i></button>
            <button class="atbtn" title="Bullet list" onclick="AdminEditor._linePrefix('- ')"><i class="fa-solid fa-list" style="font-size:.68rem"></i></button>
            <button class="atbtn" title="Numbered list" onclick="AdminEditor._linePrefix('1. ')"><i class="fa-solid fa-list-ol" style="font-size:.68rem"></i></button>
            <button class="atbtn" title="Task / checklist" onclick="AdminEditor._linePrefix('- [ ] ')"><i class="fa-regular fa-square-check" style="font-size:.68rem"></i></button>
            <button class="atbtn" title="Horizontal rule" onclick="AdminEditor._insert('\\n---\\n')"><i class="fa-solid fa-minus" style="font-size:.68rem"></i></button>
          </div>
          <div class="admin-toolbar__sep"></div>

          <!-- ── Rich inserts ── -->
          <div class="admin-toolbar__group">
            <button class="atbtn" title="Insert link" onclick="AdminEditor._fmtLink()"><i class="fa-solid fa-link" style="font-size:.68rem"></i></button>
            <button class="atbtn" title="Insert image" onclick="AdminEditor._fmtImage()"><i class="fa-solid fa-image" style="font-size:.68rem"></i></button>
            <button class="atbtn" title="Insert code block" onclick="AdminEditor._fmtCodeBlock()"><i class="fa-solid fa-terminal" style="font-size:.68rem"></i></button>
            <button class="atbtn" title="Insert table" onclick="AdminEditor._fmtTable()"><i class="fa-solid fa-table" style="font-size:.68rem"></i></button>
            <button class="atbtn" title="Insert callout (Note, Tip, Warning, Caution…)" onclick="AdminEditor._fmtCallout()"><i class="fa-solid fa-circle-info" style="font-size:.68rem"></i></button>
            <button class="atbtn" title="Insert math — KaTeX inline or block" onclick="AdminEditor._fmtMath()"><i class="fa-solid fa-square-root-variable" style="font-size:.68rem"></i></button>
          </div>
          <div class="admin-toolbar__sep"></div>

          <!-- ── Shortcodes ── -->
          <div class="admin-toolbar__group">
            <button class="atbtn" title="Insert Table of Contents [[toc]]" onclick="AdminEditor._insert('\\n[[toc]]\\n')" style="font-size:.62rem;font-family:var(--font-mono);letter-spacing:.02em">TOC</button>
            <button class="atbtn" title="Insert snippet / template" onclick="AdminEditor._fmtSnippet()"><i class="fa-solid fa-wand-magic-sparkles" style="font-size:.68rem"></i></button>
          </div>
          <div class="admin-toolbar__sep"></div>

          <!-- ── View toggle ── -->
          <div class="view-toggle">
            <button class="atbtn" id="admin-pane-editor" title="Editor only (Ctrl+1)" onclick="AdminEditor._setViewMode('editor')"><i class="fa-solid fa-pen" style="font-size:.62rem"></i> <span style="font-size:.62rem">Edit</span></button>
            <button class="atbtn is-active" id="admin-pane-split"   title="Split (Ctrl+2)"   onclick="AdminEditor._setViewMode('split')"><i class="fa-solid fa-table-columns" style="font-size:.62rem"></i> <span style="font-size:.62rem">Split</span></button>
            <button class="atbtn" id="admin-pane-preview" title="Preview only (Ctrl+3)" onclick="AdminEditor._setViewMode('preview')"><i class="fa-solid fa-eye" style="font-size:.62rem"></i> <span style="font-size:.62rem">Preview</span></button>
          </div>
          <div class="admin-toolbar__spacer"></div>
          <span class="admin-status-pill info" id="admin-status">${hasDraft ? 'draft restored' : 'saved'}</span>
        </div>

        <!-- Edit area -->
        <div class="admin-edit-area">
          <div class="admin-monaco-wrap" id="admin-monaco-wrap">
            <div id="admin-monaco-container" style="height:100%;min-height:400px"></div>
          </div>
          <div class="admin-preview-pane" id="admin-preview-pane">
            <div class="admin-preview-inner" id="admin-preview-inner">
              <p style="color:var(--color-text-faint);padding-top:2rem;text-align:center;font-size:.85rem">Preview appears here…</p>
            </div>
          </div>
        </div>

        <!-- WC bar -->
        <div class="admin-wc-bar">
          <span id="admin-wc">0 words</span>
          <span id="admin-cursor" style="margin-left:auto"></span>
        </div>

        <!-- Commit bar (unified) -->
        <div class="admin-commit-bar" id="admin-commit-bar">
          <button class="a-btn a-btn--ghost" onclick="AdminEditor._downloadMd()" title="Download .md" style="font-size:.7rem;padding:.22rem .45rem"><i class="fa-solid fa-download"></i></button>
          <div class="admin-commit-bar__spacer"></div>
          <input class="a-input admin-commit-bar__input" id="admin-commit-msg" placeholder="Commit message…" style="flex:2;min-width:140px">
          <input class="a-input admin-commit-bar__input mono" id="admin-pr-branch" placeholder="PR branch (optional)…" title="Leave empty to commit directly; fill to open a PR" style="flex:1.2;min-width:100px;font-size:.7rem">
          <button class="a-btn a-btn--ghost" onclick="AdminEditor._saveNav()" title="Save navigation tree to nav-docs.js" style="font-size:.7rem;white-space:nowrap" id="admin-nav-save-btn">
            <i class="fa-solid fa-sitemap"></i> Save Nav
          </button>
          <div style="width:1px;height:16px;background:var(--color-border);flex-shrink:0"></div>
          <button class="a-btn a-btn--ghost" id="admin-save-btn" onclick="AdminEditor._doSave()" title="Commit directly to ${esc(CONFIG.GITHUB_BRANCH||'main')}" style="font-size:.7rem;white-space:nowrap">
            <i class="fa-brands fa-github"></i> Commit
          </button>
          <button class="a-btn a-btn--primary" onclick="AdminEditor._doSaveWithPR()" title="Commit to PR branch and open Pull Request" style="font-size:.7rem;white-space:nowrap">
            <i class="fa-solid fa-code-pull-request"></i> Open PR
          </button>
        </div>

      </div>`;

    // Init Monaco
    const container = document.getElementById('admin-monaco-container');
    initMonaco(container, _rawMd, schedulePreview);

    // Inject nav editor into sidebar (PowerPoint-style slide panel)
    _buildSidebarNavEditor();

    // Load all docs and config now that sidebar DOM containers exist
    loadNavFromConfig();
  }

  // ── Exit edit mode ────────────────────────────────────────────
  function exitEdit() {
    if (!State.editMode) return;
    State.editMode = false;

    document.body.classList.remove('edit-mode-active');
    const editToggle = document.getElementById('topbar-edit-toggle');
    if (editToggle) { editToggle.classList.remove('is-editing'); editToggle.innerHTML = '<i class="fa-solid fa-pencil"></i> Edit'; }
    const badge = document.getElementById('edit-mode-badge');
    if (badge) badge.style.display = 'none';

    // Restore sidebar nav (remove edit mode UI)
    _destroySidebarNavEditor();

    // Cleanup Monaco
    if (_monacoEditor) { _monacoEditor.dispose(); _monacoEditor = null; _monacoReady = false; }

    // Re-render doc
    const slug = _slug || State.currentSlug;
    if (slug) {
      // Evict cache so it re-fetches clean from GitHub next time
      // delete State.docCache[slug];
      navigate(slug, false);
    } else {
      renderHome();
    }
  }

  // ── Discard draft ─────────────────────────────────────────────
  async function _discardDraft() {
    if (!_slug) return;
    sessionStorage.removeItem(`wdraft_${_slug}`);
    const banner = document.getElementById('admin-draft-banner');
    if (banner) banner.style.display = 'none';
    try {
      const { content, sha } = await GH.getFile(`docs/${_slug}.md`);
      _sha = sha;
      if (_monacoEditor) _monacoEditor.setValue(content);
      setStatus('saved', 'ok');
    } catch(e) { toast('Could not reload: ' + e.message, 'error'); }
  }

  // ── FM bar ─────────────────────────────────────────────────────
  function _toggleFmBar() {
    const bar = document.getElementById('admin-fm-bar');
    if (bar) bar.classList.toggle('collapsed');
    if (_monacoEditor) setTimeout(() => _monacoEditor.layout(), 220);
  }
  function _fmChange() { setStatus('unsaved', 'warn'); }

  // ── Sidebar nav editor (PowerPoint-style) ─────────────────────
  function _buildSidebarNavEditor() {
    const nav = document.getElementById('wiki-nav');
    if (!nav) return;

    // Seed _liveNavTree synchronously so renderNavTreePanel has data immediately
    if (!_liveNavTree.length) {
      _liveNavTree = JSON.parse(JSON.stringify(CONFIG.NAV_TREE));
    }

    // Wrap existing nav content
    nav.dataset.prevHtml = nav.innerHTML;
    nav.innerHTML = `
      <div class="sidebar-nav-editor" id="sidebar-nav-editor">
        <div class="sidebar-nav-editor__header">
          <span class="sidebar-nav-editor__title"><i class="fa-solid fa-sitemap"></i> Navigation</span>
          <div style="display:flex;gap:.25rem">
            <button class="admin-nav-btn" title="Add group or page" onclick="AdminEditor._addGroupModal()" style="font-size:.65rem;padding:2px 6px"><i class="fa-solid fa-folder-plus"></i> Add</button>
            <button class="admin-nav-btn" title="New doc" onclick="AdminEditor._newDocModal()" style="font-size:.65rem;padding:2px 6px"><i class="fa-solid fa-file-plus"></i> New</button>
          </div>
        </div>
        <div class="admin-nav-tree" id="admin-nav-tree" style="flex:1;overflow-y:auto;padding:.3rem .35rem"></div>
        <div class="sidebar-nav-editor__footer">
          <button class="a-btn a-btn--ghost" style="font-size:.68rem;padding:.22rem .45rem;width:100%" onclick="AdminEditor._reloadNav()" title="Reload nav from GitHub"><i class="fa-solid fa-rotate"></i> Reload from GitHub</button>
        </div>
      </div>`;

    // Render immediately with seeded data (async GitHub load will refresh later)
    renderNavTreePanel();
  }

  function _destroySidebarNavEditor() {
    const nav = document.getElementById('wiki-nav');
    if (!nav) return;
    if (nav.dataset.prevHtml !== undefined) {
      nav.innerHTML = nav.dataset.prevHtml;
      delete nav.dataset.prevHtml;
    }
    // Re-render normal nav tree
    renderNavTree(CONFIG.NAV_TREE, State.currentSlug);
  }

  // ── Public surface ────────────────────────────────────────────
  return {
    // Auth
    showAuthModal,

    // Edit lifecycle
    enterEdit,
    exitEdit,
    newDoc: (slug) => { openNewDocModal(slug || ''); },
    isActive: () => State.editMode,

    // Expose internals for onclick="" attributes
    _openDoc,
    _deleteDoc,
    _newDocModal: openNewDocModal,
    _createNewDoc: createNewDoc,
    _doSave: doSave,
    _doSaveWithPR: doSaveWithPR,
    _downloadMd: () => {
      if (!_monacoEditor || !_slug) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buildRaw()], { type: 'text/markdown' }));
      a.download = _slug.split('/').pop() + '.md';
      a.click();
    },
    _copyMd: () => {
      if (!_monacoEditor) return;
      navigator.clipboard.writeText(_monacoEditor.getValue());
      toast('Markdown copied!');
    },


    // Toolbar
    _wrap:        (a, b, ph) => monacoWrap(a, b, ph),
    _linePrefix:  (p)        => monacoLinePrefix(p),
    _insert:      (t)        => monacoInsert(t),
    _setViewMode: (m)        => setViewMode(m),
    _fmtLink:     () => monacoWrap('[', '](https://)', 'link text'),
    _fmtImage:    () => {
      const url = prompt('Image URL:', 'https://'); if (!url) return;
      const alt = prompt('Alt text:', 'image') || 'image';
      monacoInsert(`\n![${alt}](${url})\n`);
    },
    _fmtCodeBlock: () => {
      const lang = prompt('Language (bash, js, python, yaml, json, go…):', 'bash') || 'bash';
      monacoWrap(`\n\`\`\`${lang}\n`, `\n\`\`\`\n`, '# code here');
    },

    _fmtTable: () => {
      const cols = parseInt(prompt('Number of columns:', '3') || '3');
      const rows = parseInt(prompt('Number of data rows:', '2') || '2');
      const c = Math.max(1, Math.min(cols, 10));
      const r = Math.max(1, Math.min(rows, 20));
      const header  = '| ' + Array.from({length: c}, (_, i) => `Column ${i + 1}`).join(' | ') + ' |';
      const divider = '| ' + Array(c).fill('---').join(' | ') + ' |';
      const row     = '| ' + Array(c).fill('Cell').join(' | ') + ' |';
      monacoInsert(`\n${header}\n${divider}\n${Array(r).fill(row).join('\n')}\n`);
    },

    _fmtCallout: () => {
      const types = ['NOTE','TIP','IMPORTANT','WARNING','CAUTION'];
      const icons  = { NOTE:'ℹ️', TIP:'💡', IMPORTANT:'❗', WARNING:'⚠️', CAUTION:'🔴' };
      const menu   = types.map((t, i) => `${i + 1} = ${t}`).join('\n');
      const choice = prompt(`Callout type:\n${menu}\n\nEnter number (1–5):`, '1');
      const idx    = Math.max(0, Math.min(parseInt(choice || '1') - 1, 4));
      const type   = types[idx];
      monacoInsert(`\n> [!${type}]\n> ${icons[type]} Your ${type.toLowerCase()} here.\n`);
    },

    _fmtMath: () => {
      const mode = prompt('Math mode:\n1 = Inline  ($…$)\n2 = Block ($$…$$)\n\nEnter 1 or 2:', '2');
      if (mode === '1') {
        monacoWrap('$', '$', 'E = mc^2');
      } else {
        monacoInsert('\n$$\n\\frac{d}{dx}\\left(\\int_{0}^{x} f(u)\\,du\\right) = f(x)\n$$\n');
      }
    },

    _fmtSnippet: () => {
      const snippets = [
        { label: 'Note admonition',         value: '\n> [!NOTE]\n> Add your note here.\n' },
        { label: 'Warning admonition',       value: '\n> [!WARNING]\n> Add your warning here.\n' },
        { label: 'Tip admonition',           value: '\n> [!TIP]\n> Add your tip here.\n' },
        { label: 'Code block — bash',        value: '\n```bash\n# Your command here\n```\n' },
        { label: 'Code block — yaml',        value: '\n```yaml\nkey: value\n```\n' },
        { label: 'Steps / numbered list',    value: '\n1. First step\n2. Second step\n3. Third step\n' },
        { label: 'Task checklist',           value: '\n- [x] Done item\n- [ ] Pending item\n- [ ] Another item\n' },
        { label: 'Table 3×3',               value: '\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Cell | Cell | Cell |\n| Cell | Cell | Cell |\n' },
        { label: 'Details / collapsible',    value: '\n<details>\n<summary>Click to expand</summary>\n\nContent goes here.\n\n</details>\n' },
        { label: 'Math block (KaTeX)',        value: '\n$$\nE = mc^2\n$$\n' },
        { label: 'TOC shortcode',            value: '\n[[toc]]\n' },
        { label: 'Keyboard shortcut',        value: '<kbd>Ctrl</kbd> + <kbd>S</kbd>' },
        { label: 'Front-matter template',    value: '---\ntitle: "My Doc"\ndescription: ""\nupdated: ""\n---\n\n' },
      ];
      const menu   = snippets.map((s, i) => `${i + 1}. ${s.label}`).join('\n');
      const choice = prompt(`Choose a snippet:\n\n${menu}\n\nEnter number:`, '1');
      const idx    = parseInt(choice || '1') - 1;
      if (idx >= 0 && idx < snippets.length) monacoInsert(snippets[idx].value);
    },

    // FM bar
    _toggleFmBar,
    _fmChange,
    _discardDraft,

    // Nav
    _ensureNavLoaded: () => { if (!_liveNavTree.length) loadNavFromConfig(); },
    _addGroupModal:  openAddGroupModal,
    _addLeafModal:   _addLeafModal,
    _addLeafInline:    (gi) => _addLeafInline(gi),
    _cancelAddLeafInline: (gi) => _cancelAddLeafInline(gi),
    _commitAddLeafInline: (gi) => _commitAddLeafInline(gi),
    _editNodeModal:  _editNodeModal,
    _commitNodeEdit: commitNodeEdit,
    _addNavGroup:    addNavGroup,
    _addNavLeaf:     addNavLeaf,
    _autoLeafSlug:   autoLeafSlug,
    _deleteNavGroup,
    _deleteNavLeaf,
    _updateIconPrev: updateGroupIconPreview,
    _toggleGroupSlug: toggleGroupSlug,
    _saveNav:        saveNavTree,
    _reloadNav:      () => { if (confirm('Reload nav from GitHub? Local changes will be lost.')) loadNavFromConfig(); },

    // Config

    // Modals
    _closeModal: closeAdminModal,

    // Theme — exposed so initTheme() can re-apply Monaco colors on toggle
    _buildMonacoTheme: buildMonacoTheme,
    _applyMonacoTheme: (t) => {
      if (typeof monaco === 'undefined' || !monaco.editor) return;
      try {
        monaco.editor.defineTheme('wiki-dark',  buildMonacoTheme('dark'));
        monaco.editor.defineTheme('wiki-light', buildMonacoTheme('light'));
        monaco.editor.setTheme(t === 'dark' ? 'wiki-dark' : 'wiki-light');
      } catch(e) { /* not ready */ }
    },
  };
})();

// ══════════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS MODAL
// ══════════════════════════════════════════════════════════════════
function showShortcutsModal() {
  if (document.getElementById('shortcuts-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'shortcuts-modal';
  modal.className = 'shortcuts-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Keyboard shortcuts');
  modal.innerHTML = `<div class="shortcuts-modal__card">
    <div class="shortcuts-modal__header">
      <h2 class="shortcuts-modal__title"><i class="fa-solid fa-keyboard"></i> Keyboard Shortcuts</h2>
      <button class="btn-icon shortcuts-modal__close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="shortcuts-modal__grid">
      <div class="shortcuts-modal__group">
        <h3>Navigation</h3>
        <div class="shortcut-row"><kbd>/</kbd><span>Focus search</span></div>
        <div class="shortcut-row"><kbd>Ctrl</kbd><kbd>K</kbd><span>Open search</span></div>
        <div class="shortcut-row"><kbd>Esc</kbd><span>Close search / exit edit</span></div>
      </div>
      <div class="shortcuts-modal__group">
        <h3>Editing</h3>
        <div class="shortcut-row"><kbd>Ctrl</kbd><kbd>S</kbd><span>Save changes</span></div>
        <div class="shortcut-row"><kbd>Esc</kbd><span>Exit edit mode</span></div>
      </div>
      <div class="shortcuts-modal__group">
        <h3>Interface</h3>
        <div class="shortcut-row"><kbd>?</kbd><span>Show this panel</span></div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('.shortcuts-modal__close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escHandler); }
  });
  setTimeout(() => modal.querySelector('.shortcuts-modal__close')?.focus(), 50);
}


function injectTopbarEditToggle() {
  const actions = $('.topbar__actions');
  if (!actions) return;

  // Edit toggle button — append after all existing action icons
  const toggle = document.createElement('button');
  toggle.id = 'topbar-edit-toggle';
  toggle.className = 'topbar__edit-toggle';
  toggle.innerHTML = '<i class="fa-solid fa-pencil"></i> Edit';
  toggle.addEventListener('click', () => {
    if (State.editMode) {
      exitEditMode();
    } else {
      enterEditOrAuth(State.currentSlug);
    }
  });
  actions.appendChild(toggle);

  // Edit mode badge (shown in topbar during editing)
  const badge = document.createElement('span');
  badge.id    = 'edit-mode-badge';
  badge.className = 'edit-mode-badge';
  badge.style.display = 'none';
  badge.innerHTML = '<i class="fa-solid fa-circle blink" style="font-size:.45rem"></i> Editing';
  actions.appendChild(badge);
}

function exitEditMode() {
  AdminEditor.exitEdit();
}

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  State.searchIndex = buildSearchIndex(CONFIG.NAV_TREE);

  applyBranding();
  initTheme();

  const initialSlug = getSlugFromHash() || null;
  renderNavTree(CONFIG.NAV_TREE, initialSlug);

  initMobileSidebar();
  initSearch();
  initBackToTop();

  // Reading streak
  ReadingStreak.update();
  ReadingStreak.render();

  // Hide loader
  const loader = $('#page-loader');
  if (loader) { loader.classList.add('hidden'); setTimeout(() => loader.remove(), 600); }

  // Initial route
  navigate(initialSlug, false);

  // Font size controls
  const applyFontSize = (size) => {
    const prose = document.querySelectorAll('.prose');
    prose.forEach(el => el.style.fontSize = size + 'px');
    localStorage.setItem(key('fontsize'), size);
  };
  $('#font-decrease')?.addEventListener('click', () => {
    State.fontSize = Math.max(13, State.fontSize - 1);
    applyFontSize(State.fontSize);
  });
  $('#font-increase')?.addEventListener('click', () => {
    State.fontSize = Math.min(22, State.fontSize + 1);
    applyFontSize(State.fontSize);
  });
  if (State.fontSize !== 16) applyFontSize(State.fontSize);

  // / key → focus search
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault(); $('#wiki-search')?.focus();
    }
    // ? → keyboard shortcuts modal
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault(); showShortcutsModal();
    }
    // Escape exits edit mode
    if (e.key === 'Escape' && State.editMode && !document.querySelector('.admin-modal-backdrop.is-open') && !document.getElementById('admin-auth-overlay')) {
      if (confirm('Exit edit mode? Unsaved changes will be kept as a draft.')) exitEditMode();
    }
    // Ctrl/Cmd+S in edit mode
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && State.editMode) {
      e.preventDefault(); AdminEditor._doSave();
    }
    // Ctrl/Cmd+K → focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault(); $('#wiki-search')?.focus(); $('#wiki-search')?.select();
    }
  });

  // Year
  $$('[data-current-year]').forEach(el => el.textContent = new Date().getFullYear());

  // Inject edit toggle into topbar (admin panel is no longer used)
  injectTopbarEditToggle();
});

// Expose globally
window.WikiEditor      = AdminEditor;
window.AdminEditor     = AdminEditor;
window.navigate        = navigate;
window.ViewCounter     = ViewCounter;
window.ReadingStreak   = ReadingStreak;
window.RecentlyViewed  = RecentlyViewed;
