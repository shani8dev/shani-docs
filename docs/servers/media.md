---
title: Media & Entertainment
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Media & Entertainment

Self-hosted streaming servers, personal photo libraries, music servers, and download automation.

> All containers bind to `127.0.0.1` by default. Proxy through Caddy for HTTPS and expose via Tailscale or Cloudflare Tunnel for remote access.

---

## Jellyfin

**Purpose:** Free, open-source media server with hardware transcoding, multi-user accounts, parental controls, and native client apps for every platform (Android, iOS, Roku, Apple TV, Fire TV, web, Android TV).

```bash
podman run -d \
  --name jellyfin \
  -p 127.0.0.1:8096:8096 \
  -v /home/user/jellyfin/config:/config:Z \
  -v /home/user/jellyfin/cache:/cache:Z \
  -v /home/user/media:/media:ro,Z \
  --device /dev/dri \
  --restart unless-stopped \
  jellyfin/jellyfin
```

> `--device /dev/dri` enables Intel/AMD VA-API hardware transcoding. Remove if you have no GPU.

**Caddy:**
```caddyfile
media.home.local { tls internal; reverse_proxy localhost:8096 }
```

---

## Plex

**Purpose:** Polished media server with a premium client ecosystem, live TV/DVR support, and Plex Pass features (hardware transcoding, mobile sync, lyrics).

```bash
podman run -d \
  --name plex \
  -p 127.0.0.1:32400:32400 \
  -v /home/user/plex/config:/config:Z \
  -v /home/user/media:/media:ro,Z \
  --device /dev/dri \
  -e PLEX_CLAIM=claim-xxxxxxxxxxxx \
  --restart unless-stopped \
  plexinc/pms-docker
```

> Get your claim token from [plex.tv/claim](https://plex.tv/claim). It is only needed on first run.

---

## Navidrome

**Purpose:** Lightweight Subsonic-compatible music server. Streams your local music library to any Subsonic client — DSub, Symfonium, Ultrasonic, Feishin, and more.

```bash
podman run -d \
  --name navidrome \
  -p 127.0.0.1:4533:4533 \
  -v /home/user/navidrome/data:/data:Z \
  -v /home/user/Music:/music:ro,Z \
  -e ND_SCANSCHEDULE="@every 1h" \
  -e ND_LOGLEVEL=info \
  -e ND_SESSIONTIMEOUT=24h \
  --restart unless-stopped \
  deluan/navidrome:latest
```

Access at `http://localhost:4533`. Navidrome auto-scans on the schedule set by `ND_SCANSCHEDULE`.

---

## Immich

**Purpose:** High-performance self-hosted Google Photos alternative. Automatic mobile backup, AI-powered face recognition and object detection, timeline browsing, shared albums, and a polished web and mobile UI.

```yaml
# ~/immich/compose.yml
services:
  immich-server:
    image: ghcr.io/immich-app/immich-server:release
    ports: ["127.0.0.1:2283:2283"]
    environment:
      DB_HOSTNAME: database
      DB_USERNAME: postgres
      DB_PASSWORD: postgres
      DB_DATABASE_NAME: immich
      REDIS_HOSTNAME: redis
    volumes:
      - /home/user/photos:/usr/src/app/upload:Z
    depends_on: [redis, database]
    restart: unless-stopped

  immich-machine-learning:
    image: ghcr.io/immich-app/immich-machine-learning:release
    volumes:
      - model_cache:/cache
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  database:
    image: tensorchord/pgvecto-rs:pg14-v0.2.0
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: immich
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
  model_cache:
```

```bash
cd ~/immich && podman-compose up -d
```

Access at `http://localhost:2283`. Install the Immich mobile app and point it at your server for automatic photo backup.

---

## Jellyseerr

**Purpose:** Media request manager for Jellyfin (and Plex). Lets family and friends request movies and shows through a polished UI — requests go straight to Radarr/Sonarr for automated downloading.

```bash
podman run -d \
  --name jellyseerr \
  -p 127.0.0.1:5055:5055 \
  -v /home/user/jellyseerr/config:/app/config:Z \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  fallenbagel/jellyseerr:latest
```

---

## The *Arr Stack (Download Automation)

**Purpose:** Automate the discovery, downloading, and organisation of movies (Radarr), TV shows (Sonarr), music (Lidarr), and indexers (Prowlarr). Integrates with Jellyfin so your library stays current automatically.

```bash
# Radarr — movies
podman run -d \
  --name radarr \
  -p 127.0.0.1:7878:7878 \
  -v /home/user/radarr:/config:Z \
  -v /home/user/media/movies:/movies:Z \
  -v /home/user/downloads:/downloads:Z \
  -e PUID=$(id -u) -e PGID=$(id -g) \
  --restart unless-stopped \
  lscr.io/linuxserver/radarr:latest

# Sonarr — TV shows
podman run -d \
  --name sonarr \
  -p 127.0.0.1:8989:8989 \
  -v /home/user/sonarr:/config:Z \
  -v /home/user/media/tv:/tv:Z \
  -v /home/user/downloads:/downloads:Z \
  -e PUID=$(id -u) -e PGID=$(id -g) \
  --restart unless-stopped \
  lscr.io/linuxserver/sonarr:latest

# Lidarr — music
podman run -d \
  --name lidarr \
  -p 127.0.0.1:8686:8686 \
  -v /home/user/lidarr:/config:Z \
  -v /home/user/Music:/music:Z \
  -v /home/user/downloads:/downloads:Z \
  -e PUID=$(id -u) -e PGID=$(id -g) \
  --restart unless-stopped \
  lscr.io/linuxserver/lidarr:latest

# Prowlarr — indexer manager (connects to Radarr + Sonarr + Lidarr)
podman run -d \
  --name prowlarr \
  -p 127.0.0.1:9696:9696 \
  -v /home/user/prowlarr:/config:Z \
  -e PUID=$(id -u) -e PGID=$(id -g) \
  --restart unless-stopped \
  lscr.io/linuxserver/prowlarr:latest
```

> Use the same `/downloads` volume mount across all *arr apps and your download client so they can hardlink files instead of copying.

---

## qBittorrent (Download Client)

**Purpose:** Feature-rich torrent client with a web UI. Integrates with the *arr stack as a download client.

```bash
podman run -d \
  --name qbittorrent \
  -p 127.0.0.1:8080:8080 \
  -p 6881:6881/tcp \
  -p 6881:6881/udp \
  -v /home/user/qbittorrent:/config:Z \
  -v /home/user/downloads:/downloads:Z \
  -e PUID=$(id -u) -e PGID=$(id -g) \
  -e WEBUI_PORT=8080 \
  --restart unless-stopped \
  lscr.io/linuxserver/qbittorrent:latest
```

Access at `http://localhost:8080`. Default password is displayed in the container logs on first run.

---

## Pinchflat (YouTube Archiver)

**Purpose:** Automatically download and archive YouTube channels, playlists, and individual videos. Clean web UI, scheduled fetching, and Jellyfin-friendly naming.

```bash
podman run -d \
  --name pinchflat \
  -p 127.0.0.1:8088:8088 \
  -v /home/user/pinchflat/data:/app/data:Z \
  -v /home/user/downloads/youtube:/downloads:Z \
  --restart unless-stopped \
  ghcr.io/kieraneglin/pinchflat:latest
```

---

## Kavita (Comics, Manga & eBooks)

**Purpose:** Digital library server for comics, manga, and e-books. Supports CBZ, CBR, PDF, EPUB, and more. Web reader, reading progress sync, and OPDS support for mobile apps.

```bash
podman run -d \
  --name kavita \
  -p 127.0.0.1:5000:5000 \
  -v /home/user/kavita/config:/kavita/config:Z \
  -v /home/user/books:/books:ro,Z \
  --restart unless-stopped \
  jvmilazz0/kavita:latest
```

---

## Audiobookshelf

**Purpose:** Audiobook and podcast server with progress sync across devices, mobile apps (iOS and Android), and metadata management.

```bash
podman run -d \
  --name audiobookshelf \
  -p 127.0.0.1:13378:80 \
  -v /home/user/audiobooks:/audiobooks:Z \
  -v /home/user/podcasts:/podcasts:Z \
  -v /home/user/audiobookshelf/config:/config:Z \
  -v /home/user/audiobookshelf/metadata:/metadata:Z \
  --restart unless-stopped \
  ghcr.io/advplyr/audiobookshelf:latest
```

---

## PhotoPrism

**Purpose:** AI-powered photo management with automatic subject tagging, geolocation mapping, duplicate detection, and a timeline browser. Good Immich alternative if you prefer a lighter-weight option without the machine learning stack.

```bash
podman run -d \
  --name photoprism \
  -p 127.0.0.1:2342:2342 \
  -e PHOTOPRISM_ADMIN_PASSWORD=changeme \
  -e PHOTOPRISM_SITE_URL=https://photos.example.com \
  -e PHOTOPRISM_DATABASE_DRIVER=sqlite \
  -v /home/user/photoprism/storage:/photoprism/storage:Z \
  -v /home/user/pictures:/photoprism/originals:ro,Z \
  --restart unless-stopped \
  photoprism/photoprism:latest
```

---

## Calibre-Web (eBook Library)

**Purpose:** Web interface for browsing, reading, and downloading your Calibre eBook library. Supports OPDS for ebook reader apps (Koreader, Moon+ Reader), Kobo wireless sync, user accounts with restrictions, and basic metadata editing — without needing the Calibre desktop app running.

```bash
podman run -d \
  --name calibre-web \
  -p 127.0.0.1:8083:8083 \
  -v /home/user/calibre/config:/config:Z \
  -v /home/user/calibre/library:/books:Z \
  -e PUID=$(id -u) \
  -e PGID=$(id -g) \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  lscr.io/linuxserver/calibre-web:latest
```

Default login: `admin` / `admin123`. Point Calibre-Web at your existing Calibre library (`/books`) during setup.

> **Kobo sync:** Enable Kobo sync in Admin → Edit Basic Configuration → Feature Configuration. On your Kobo, add a new search provider with the URL `https://calibre.home.local/kobo/<token>/`.

---

## Readarr (Book Download Automation)

**Purpose:** The books equivalent of Sonarr and Radarr. Monitors for new releases from your favourite authors, integrates with download clients (qBittorrent, NZBGet), and organises your ebook and audiobook library automatically. Connects to Calibre-Web and Audiobookshelf.

```bash
podman run -d \
  --name readarr \
  -p 127.0.0.1:8787:8787 \
  -v /home/user/readarr:/config:Z \
  -v /home/user/books:/books:Z \
  -v /home/user/downloads:/downloads:Z \
  -e PUID=$(id -u) \
  -e PGID=$(id -g) \
  --restart unless-stopped \
  lscr.io/linuxserver/readarr:develop
```

---

## Bazarr (Subtitle Management)

**Purpose:** Companion app to Sonarr and Radarr that automatically downloads and manages subtitles for your media library. Supports 50+ subtitle providers, multiple languages, and custom scoring rules. Integrates directly with Jellyfin and Plex.

```bash
podman run -d \
  --name bazarr \
  -p 127.0.0.1:6767:6767 \
  -v /home/user/bazarr:/config:Z \
  -v /home/user/media/tv:/tv:Z \
  -v /home/user/media/movies:/movies:Z \
  -e PUID=$(id -u) \
  -e PGID=$(id -g) \
  --restart unless-stopped \
  lscr.io/linuxserver/bazarr:latest
```

Access at `http://localhost:6767`. Configure Sonarr and Radarr connection under Settings → Sonarr/Radarr, then add subtitle providers under Settings → Providers.

---

## Overseerr

Plex-native equivalent of Jellyseerr — same media request concept, optimised for Plex users. For Jellyfin, see [Jellyseerr above](#jellyseerr).

```bash
podman run -d \
  --name overseerr \
  -p 127.0.0.1:5056:5055 \
  -v /home/user/overseerr/config:/app/config:Z \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  sctx/overseerr:latest
```

---

## Tdarr (Video Transcoding Automation)

**Purpose:** Distributed video transcoding pipeline. Automatically detects media that doesn't meet your quality or format requirements (wrong codec, too high bitrate, no HDR tonemapping) and re-encodes it using FFmpeg or Handbrake. Runs workers on multiple machines, including GPU-accelerated workers.

```yaml
# ~/tdarr/compose.yml
services:
  tdarr:
    image: ghcr.io/haveagitgat/tdarr:latest
    ports:
      - "127.0.0.1:8265:8265"  # Web UI
      - "127.0.0.1:8266:8266"  # Server
    environment:
      TZ: Asia/Kolkata
      PUID: "1000"
      PGID: "1000"
      serverIP: "0.0.0.0"
      serverPort: "8266"
      webUIPort: "8265"
      internalNode: "true"
      inContainer: "true"
    volumes:
      - /home/user/tdarr/server:/app/server:Z
      - /home/user/tdarr/configs:/app/configs:Z
      - /home/user/tdarr/logs:/app/logs:Z
      - /home/user/media:/media:Z
      - /tmp/tdarr_cache:/temp
    devices:
      - /dev/dri:/dev/dri  # Intel/AMD GPU for hardware encoding
    restart: unless-stopped
```

> Use Tdarr to batch-convert your library to H.265/HEVC or AV1 to save 40–60% disk space while maintaining the same visual quality.

---

## MeTube (yt-dlp Web UI)

**Purpose:** Lightweight web interface for yt-dlp — paste a URL from YouTube, Vimeo, SoundCloud, Twitter, or 1,000+ other sites and download the video or audio in your chosen format and quality. Simpler than Pinchflat (which is designed for automated channel archiving) — MeTube is for on-demand, one-off downloads with a clean queue UI.

```bash
podman run -d \
  --name metube \
  -p 127.0.0.1:8081:8081 \
  -v /home/user/downloads/metube:/downloads:Z \
  -e DARK_MODE=true \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  ghcr.io/alexta69/metube
```

Access at `http://localhost:8081`. Paste any video URL, choose format (MP4, MKV, MP3, FLAC), and quality — the download appears in the queue, then lands in `/downloads`.

> **vs Pinchflat:** Use MeTube for one-off downloads. Use Pinchflat when you want to subscribe to a channel and automatically archive every new upload.

---

## Stash (Media Library Organiser)

**Purpose:** Self-hosted media library manager with a web UI, tagging system, scene/performer metadata, scraping from 50+ sites, smart playlists, and a REST/GraphQL API. Designed for organising large personal video libraries with structured metadata — tags, studios, performers, ratings, and markers for jumping to specific moments.

```bash
podman run -d \
  --name stash \
  -p 127.0.0.1:9999:9999 \
  -v /home/user/stash/config:/root/.stash:Z \
  -v /home/user/media/videos:/data:Z \
  -v /home/user/stash/metadata:/metadata:Z \
  -v /home/user/stash/cache:/cache:Z \
  -v /home/user/stash/blobs:/blobs:Z \
  --restart unless-stopped \
  stashapp/stash:latest
```

Access at `http://localhost:9999`. Add your video directories under Settings → Libraries, run a scan, and Stash builds a browsable library with thumbnail generation and metadata scraping.

---

## Komga (Comics & Manga Server)

**Purpose:** A polished, OPDS-compatible comics and manga server. Reads CBZ, CBR, PDF, and EPUB files; generates cover thumbnails; tracks read progress per user; and supports series/collections metadata. A more actively developed alternative to Kavita with a cleaner library management UI and better metadata editing.

```bash
podman run -d \
  --name komga \
  -p 127.0.0.1:8097:25600 \
  -v /home/user/komga/config:/config:Z \
  -v /home/user/books/comics:/data:ro,Z \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  gotson/komga
```

Access at `http://localhost:8097`. Add libraries pointing at your comic directories. Use the Tachiyomi (Android) or Paperback (iOS) app with the Komga plugin for mobile reading.

---

## TubeArchivist (YouTube Channel Archiver)

**Purpose:** Archive and self-host entire YouTube channels, playlists, and individual videos with metadata, thumbnails, and subtitles. TubeArchivist downloads via yt-dlp, indexes everything in Elasticsearch, and serves a clean web UI where you can browse, search, and play your archived videos — your own private YouTube. It complements Pinchflat (which is better for ongoing subscriptions) and MeTube (which is better for one-off downloads): TubeArchivist is the right tool when you want to archive a complete channel and browse it as a library.

```yaml
# ~/tubearchivist/compose.yml
services:
  tubearchivist:
    image: bbilly1/tubearchivist:latest
    ports: ["127.0.0.1:8000:8000"]
    environment:
      ES_URL: http://archivist-es:9200
      REDIS_HOST: archivist-redis
      HOST_UID: 1000
      HOST_GID: 1000
      TA_HOST: tubearchivist.home.local
      TA_USERNAME: admin
      TA_PASSWORD: changeme
      ELASTIC_PASSWORD: changeme
      TZ: Asia/Kolkata
    volumes:
      - /home/user/tubearchivist/media:/youtube:Z
      - /home/user/tubearchivist/cache:/cache:Z
    depends_on: [archivist-es, archivist-redis]
    restart: unless-stopped

  archivist-redis:
    image: redis/redis-stack-server:latest
    volumes: [redis_data:/data]
    restart: unless-stopped

  archivist-es:
    image: bbilly1/tubearchivist-es:latest
    environment:
      ELASTIC_PASSWORD: changeme
      ES_JAVA_OPTS: "-Xms512m -Xmx512m"
      xpack.security.enabled: "true"
      discovery.type: single-node
    volumes: [es_data:/usr/share/elasticsearch/data]
    restart: unless-stopped

volumes: {redis_data: {}, es_data: {}}
```

Access at `http://localhost:8000`. Add a YouTube channel URL and click Download to start archiving. Set a download schedule for automatic new-video ingestion.

**Caddy:**
```caddyfile
tubearchivist.home.local { tls internal; reverse_proxy localhost:8000 }
```

---

## Lidarr (Music Download Automation)

**Purpose:** The music counterpart to Radarr and Sonarr — automatically searches for, downloads, and organises music albums and discographies. Integrates with Prowlarr for indexer management, qBittorrent for downloading, and supports MusicBrainz for metadata. Part of the complete `*arr` stack.

```bash
podman run -d \
  --name lidarr \
  -p 127.0.0.1:8686:8686 \
  -v /home/user/lidarr/config:/config:Z \
  -v /home/user/media/music:/music:Z \
  -v /home/user/media/downloads:/downloads:Z \
  -e PUID=$(id -u) \
  -e PGID=$(id -g) \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  lscr.io/linuxserver/lidarr:latest
```

Access at `http://localhost:8686`. Configure your music root folder, connect Prowlarr as the indexer manager, and add qBittorrent as the download client. Lidarr discovers albums via MusicBrainz and automatically imports organised files into your Navidrome or other music server library.

> **Full *arr stack:** Prowlarr (indexers) → Sonarr (TV) + Radarr (movies) + Lidarr (music) + Readarr (books) → qBittorrent (downloads) → Jellyfin / Navidrome (playback).

---

## Kometa (Plex/Jellyfin Metadata Manager)

**Purpose:** Automated metadata management for Plex and Jellyfin libraries — creates and updates collections (e.g., "Christoper Nolan Films", "Oscar Winners", "Top Rated on IMDB"), overlays (4K/HDR badges, ratings, awards), playlists, and library sorting. Runs on a schedule and keeps your media library rich and organised without manual effort. Formerly known as Plex Meta Manager.

```bash
podman run -d \
  --name kometa \
  -v /home/user/kometa/config:/config:Z \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  kometateam/kometa:latest
```

**Minimal `config.yml`:**
```yaml
# /home/user/kometa/config/config.yml
plex:
  url: http://host.containers.internal:32400
  token: your-plex-token
  timeout: 60

libraries:
  Movies:
    metadata_path:
      - pmm: basic
      - pmm: imdb
      - pmm: actor
    overlay_path:
      - pmm: resolution
      - pmm: ratings
```

> Get your Plex token: sign in to Plex web, open any media item, click the three dots → Get Info → View XML. The token is in the URL as `?X-Plex-Token=`.

**For Jellyfin**, replace the `plex:` block:
```yaml
jellyfin:
  url: http://host.containers.internal:8096
  apikey: your-jellyfin-api-key
  user_library: your-username
```

---

## Caddy Configuration

media.home.local       { tls internal; reverse_proxy localhost:8096 }
plex.home.local        { tls internal; reverse_proxy localhost:32400 }
music.home.local       { tls internal; reverse_proxy localhost:4533 }
photos.home.local      { tls internal; reverse_proxy localhost:2283 }
requests.home.local    { tls internal; reverse_proxy localhost:5055 }
radarr.home.local      { tls internal; reverse_proxy localhost:7878 }
sonarr.home.local      { tls internal; reverse_proxy localhost:8989 }
lidarr.home.local      { tls internal; reverse_proxy localhost:8686 }
prowlarr.home.local    { tls internal; reverse_proxy localhost:9696 }
torrent.home.local     { tls internal; reverse_proxy localhost:8080 }
youtube.home.local     { tls internal; reverse_proxy localhost:8088 }
books.home.local       { tls internal; reverse_proxy localhost:5000 }
audiobooks.home.local  { tls internal; reverse_proxy localhost:13378 }
calibre.home.local     { tls internal; reverse_proxy localhost:8083 }
readarr.home.local     { tls internal; reverse_proxy localhost:8787 }
subs.home.local        { tls internal; reverse_proxy localhost:6767 }
tdarr.home.local       { tls internal; reverse_proxy localhost:8265 }
metube.home.local      { tls internal; reverse_proxy localhost:8081 }
stash.home.local       { tls internal; reverse_proxy localhost:9999 }
komga.home.local          { tls internal; reverse_proxy localhost:8097 }
tubearchivist.home.local  { tls internal; reverse_proxy localhost:8000 }
photoprism.example.com    { reverse_proxy localhost:2342 }
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Jellyfin transcoding is slow | Verify GPU passthrough: check `--device /dev/dri` is present and `renderD128` device exists on the host |
| Media not appearing in Jellyfin | Trigger a manual library scan; check that the media path uses correct naming conventions (TMDB naming recommended) |
| Radarr/Sonarr can't move files | Ensure `/downloads` and `/movies` or `/tv` are on the same volume — cross-device moves disable hardlinking |
| Immich mobile backup not working | Ensure the server is reachable (Tailscale or Cloudflare Tunnel); check the app is pointed at the correct server URL including port |
| Navidrome not finding music | Check volume mount path matches your actual music directory; confirm files are in a supported format (FLAC, MP3, AAC, OGG) |
| Plex not claiming server | Ensure `PLEX_CLAIM` token is fresh (valid for 4 minutes); remove the variable after first startup |
| qBittorrent can't connect from *arr | Verify the WebUI URL in Radarr/Sonarr uses `host.containers.internal` if they're in separate containers |
| Lidarr can't find albums | Ensure your music files are correctly tagged (Artist, Album, Year) — MusicBrainz Picard is a good tagger |
| Calibre-Web can't find library | Ensure the `/books` volume mount points to the directory containing your `metadata.db` Calibre database file |
| Readarr missing books | Readarr searches Goodreads and BookInfo — ensure the author name matches exactly; use the author search in the UI |
| Bazarr subtitles not downloading | Check API keys for subtitle providers (OpenSubtitles, Subscene); verify language codes match your Sonarr/Radarr profiles |
| Tdarr not processing files | Verify the media volume is mounted correctly; check the health check plugin outputs in the Tdarr logs panel |
| Tdarr GPU encoding fails | Ensure `--device /dev/dri` is passed; test GPU access with `podman exec tdarr ffmpeg -hwaccels` |
| MeTube download fails | Check yt-dlp supports the URL with `podman exec metube yt-dlp --list-formats <url>`; update the container for the latest yt-dlp version |
| Stash scan finds no files | Verify the `/data` volume mount path; ensure video file extensions are in supported formats list (Settings → General) |
| Komga library not updating | Trigger a manual scan under Libraries → Scan; ensure the comics volume is mounted correctly with file read permissions |
| TubeArchivist Elasticsearch not ready | ES takes 30–60 s to initialise; check `podman logs archivist-es`; increase `ES_JAVA_OPTS` heap if OOM-killed |
| TubeArchivist downloads stuck | Check `podman logs tubearchivist` for yt-dlp errors; update the container for the latest yt-dlp; verify the cache volume is writable |
| Lidarr can't find albums | Ensure your music files are correctly tagged (Artist, Album, Year) — MusicBrainz Picard is a good tagger |
| Kometa collections not created | Verify your Plex token is valid; check `podman logs kometa` for YAML parse errors in `config.yml`; run with `--run` flag for a one-shot debug pass |
