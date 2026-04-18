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

## Caddy Configuration

```caddyfile
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
photoprism.example.com { reverse_proxy localhost:2342 }
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
