/**
 * config-docs.js — Site settings for wiki.shani.dev
 * Contains only static configuration — identity, branding, GitHub source, UI flags.
 * Navigation tree lives in nav-docs.js (loaded after this file).
 * Load order: config-docs.js → nav-docs.js → script-docs.js
 */
const CONFIG = {
  // ── GitHub source ────────────────────────────────────────────
  GITHUB_USER: 'shani8dev',
  GITHUB_REPO: 'shani-docs',          // repo holding your .md docs
  GITHUB_BRANCH: 'main',
  // ── URLs ─────────────────────────────────────────────────────
  WIKI_URL: 'https://wiki.shani.dev',
  // ── Site identity ────────────────────────────────────────────
  SITE_TITLE:       'Shanios Docs',
  SITE_TAGLINE:     'Technical Documentation',
  SITE_DESCRIPTION: 'Comprehensive technical documentation for Shanios — the immutable Linux OS.',
  SITE_KEYWORDS:    'Shanios, immutable Linux, documentation, Arch Linux, Btrfs, Secure Boot',
  // ── Branding ─────────────────────────────────────────────────
  FAVICON_URL:   'https://shani.dev/assets/images/logo.svg',
  LOGO_IMG_URL:  'https://shani.dev/assets/images/about.svg',
  LOGO_ALT:      'Shanios',
  LOGO_WORDMARK: 'wiki',
  // ── Top bar ──────────────────────────────────────────────────
  AUSPICIOUS_TEXT:  '॥ श्री ॥',
  AUSPICIOUS_URL:   'https://shani.dev',
  AUSPICIOUS_LABEL: 'Visit Shanios',
  // ── Author ───────────────────────────────────────────────────
  AUTHOR_NAME:     'Shrinivas Kumbhar',
  AUTHOR_INITIALS: 'SK',
  AUTHOR_ROLE:     'Shanios · shani.dev',
  // ── Locale ───────────────────────────────────────────────────
  LANG:        'en-IN',
  DATE_LOCALE: 'en-IN',
  // ── Social ───────────────────────────────────────────────────
  TWITTER_HANDLE: '@shani8dev',
  OG_IMAGE: 'https://shani.dev/assets/images/logo.svg',
  SOCIAL_LINKS: [
    { label: 'GitHub',   icon: 'fa-brands fa-github',   url: 'https://github.com/shani8dev' },
    { label: 'LinkedIn', icon: 'fa-brands fa-linkedin',  url: 'https://www.linkedin.com/in/Shrinivasvkumbhar/' },
    { label: 'Shanios',  icon: 'fa-brands fa-linux',     url: 'https://shani.dev' },
    { label: 'Blog',     icon: 'fa-solid fa-rss',        url: 'https://blog.shani.dev' },
  ],
  // ── Storage ──────────────────────────────────────────────────
  STORAGE_PREFIX: 'shanidocs',
  // ── PWA ──────────────────────────────────────────────────────
  PWA_NAME:        'Shanios Docs',
  PWA_SHORT_NAME:  'ShaniDocs',
  PWA_DESCRIPTION: 'Technical documentation for Shanios.',
  PWA_THEME_COLOR: '#161514',
  PWA_BG_COLOR:    '#161514',
  // ── NAV_TREE is defined in nav-docs.js (loaded separately) ──
  NAV_TREE: [], // populated by nav-docs.js at runtime
  // ── Search ───────────────────────────────────────────────────
  FUZZY_SEARCH_ENABLED: true,
  // ── UI ───────────────────────────────────────────────────────
  FONT_SIZE_CONTROLS: true,
  BACK_TO_TOP_OFFSET: 400,
  TOAST_DURATION: 2500,
  // ── Reader features ──────────────────────────────────────────
  VIEW_COUNT_ENABLED:    true,   // privacy-safe localStorage view counter
  STREAK_ENABLED:        true,   // consecutive-day reading streak badge
  RECENTLY_VIEWED_COUNT: 5,      // max docs kept in "recently viewed" list
  // ── Giscus comments ──────────────────────────────────────────
  GISCUS_ENABLED:     false,
  GISCUS_REPO:        '',
  GISCUS_REPO_ID:     '',
  GISCUS_CATEGORY:    'General',
  GISCUS_CATEGORY_ID: '',
  GISCUS_MAPPING:     'pathname',
  GISCUS_THEME:       '',
  // ── Analytics ────────────────────────────────────────────────
  CF_WEB_ANALYTICS_TOKEN: '',
};
