---
title: Media & Entertainment
section: Self-Hosting & Servers
updated: 2026-04-16
---

# Media & Entertainment

Streaming, automation, and personal library management.

## Jellyfin
**Purpose**: Free, open-source media server with hardware transcoding, multi-user support, and client apps for all major platforms.
```bash
podman run -d \
  --name jellyfin \
  -p 127.0.0.1:8096:8096 \
  -v /home/user/jellyfin/config:/config:Z \
  -v /home/user/jellyfin/cache:/cache:Z \
  -v /home/user/media:/media:ro,Z \
  --restart unless-stopped \
  jellyfin/jellyfin
```
> Add `--device /dev/dri/renderD128` for Intel/AMD VA-API transcoding.

## Plex
**Purpose**: Polished media server with hardware transcoding, live TV/DVR, and premium client apps across all platforms.
```bash
podman run -d \
  --name plex \
  -p 127.0.0.1:32400:32400 \
  -p 127.0.0.1:3005:3005 \
  -p 127.0.0.1:8324:8324 \
  -v /home/user/plex/config:/config:Z \
  -v /home/user/media:/media:ro,Z \
  --device /dev/dri/renderD128 \
  --restart unless-stopped \
  plexinc/pms-docker
```

## Navidrome
**Purpose**: Lightweight Subsonic-compatible music server. Streams your personal collection to mobile/desktop apps like DSub, Ultrasonic, and Symfonium.
```bash
podman run -d \
  --name navidrome \
  -p 127.0.0.1:4533:4533 \
  -v /home/user/navidrome/data:/data:Z \
  -v /home/user/Music:/music:ro,Z \
  -e ND_SCANSCHEDULE="@every 1h" \
  -e ND_LOGLEVEL=info \
  --restart unless-stopped \
  deluan/navidrome:latest
```

## Jellyseerr
**Purpose**: Media request manager for Plex/Jellyfin. Allows friends and family to request movies/shows through a polished UI.
```bash
podman run -d \
  --name jellyseerr \
  -p 127.0.0.1:5055:5055 \
  -v /home/user/jellyseerr/config:/app/config:Z \
  -e TZ=Europe/London \
  --restart unless-stopped \
  fallenbagel/jellyseerr:latest
```

## The *Arr Stack (Automation)
**Purpose**: Automate the discovery, downloading, and sorting of movies and TV series.
```bash
# Radarr (Movies)
podman run -d \
  --name radarr \
  -p 127.0.0.1:7878:7878 \
  -v /home/user/radarr:/config:Z \
  -v /home/user/media/movies:/movies:Z \
  -v /home/user/downloads:/downloads:Z \
  -e PUID=$(id -u) -e PGID=$(id -g) \
  --restart unless-stopped \
  lscr.io/linuxserver/radarr:latest

# Sonarr (TV Shows)
podman run -d \
  --name sonarr \
  -p 127.0.0.1:8989:8989 \
  -v /home/user/sonarr:/config:Z \
  -v /home/user/media/tv:/tv:Z \
  -v /home/user/downloads:/downloads:Z \
  -e PUID=$(id -u) -e PGID=$(id -g) \
  --restart unless-stopped \
  lscr.io/linuxserver/sonarr:latest
```

## Pinchflat
**Purpose**: Lightweight YouTube downloader/archiver. Fetches videos/channels automatically and serves them via a clean UI.
```bash
podman run -d \
  --name pinchflat \
  -p 127.0.0.1:8088:8088 \
  -v /home/user/pinchflat/data:/app/data:Z \
  -v /home/user/downloads:/downloads:Z \
  --restart unless-stopped \
  ghcr.io/pinchflat/pinchflat:latest
```

## Immich
**Purpose**: High-performance, self-hosted Google Photos alternative. Features AI-powered facial recognition, object detection, mobile sync, and a polished web interface.
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
```

## Stash
**Purpose**: Self-hosted video library manager with metadata scraping, tagging, and streaming capabilities.
```bash
podman run -d \
  --name stash \
  -p 127.0.0.1:9999:9999 \
  -v /home/user/stash/config:/root/.stash:Z \
  -v /home/user/media:/media:ro,Z \
  --restart unless-stopped \
  stashapp/stash
```

## Kavita / Audiobookshelf / Calibre-Web
**Purpose**: Digital library servers for manga, comics, e-books, and audiobooks.
```bash
# Kavita
podman run -d \
  --name kavita \
  -p 127.0.0.1:5000:5000 \
  -v /home/user/kavita/config:/kavita/config:Z \
  -v /home/user/books:/books:ro,Z \
  --restart unless-stopped \
  jvmilazz0/kavita:latest

# Audiobookshelf
podman run -d \
  --name audiobookshelf \
  -p 127.0.0.1:13378:80 \
  -v /home/user/audiobooks:/audiobooks:Z \
  -v /home/user/podcasts:/podcasts:Z \
  -v /home/user/audiobookshelf/config:/config:Z \
  --restart unless-stopped \
  ghcr.io/advplyr/audiobookshelf:latest

# Calibre-Web
podman run -d \
  --name calibre-web \
  -p 127.0.0.1:8083:8083 \
  -e PUID=1000 -e PGID=1000 \
  -v /home/user/calibre-web/config:/config:Z \
  -v /home/user/Calibre:/books:ro,Z \
  --restart unless-stopped \
  lscr.io/linuxserver/calibre-web:latest
```

## PhotoPrism
**Purpose**: AI-powered photo management with automatic tagging, geolocation mapping, duplicate detection, and timeline browsing.
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
