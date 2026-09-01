---
title: SearXNG
section: Self-Hosted Networking
updated: 2026-08-28
---

> **Part of the Networking & Infrastructure series:** See [all networking docs](../networking)

## SearXNG

**Purpose:** Privacy-respecting meta-search engine. Aggregates results from Google, Bing, DuckDuckGo, and 70+ other sources without tracking, logging, or profiling users. Run it on your server and use it as your default browser search engine.

```yaml
# ~/searxng/compose.yaml
services:
  searxng:
    image: searxng/searxng:latest
    ports:
      - 127.0.0.1:8091:8080
    volumes:
      - /home/user/searxng/settings:/etc/searxng:Z
    environment:
      SEARXNG_BASE_URL: https://search.home.local
    restart: unless-stopped
```

```bash
cd ~/searxng && podman-compose up -d
```

---



---

## See Also

- [Networking & Infrastructure](networking) — overview
