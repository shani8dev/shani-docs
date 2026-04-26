---
title: Communication
section: Self-Hosting & Servers
updated: 2026-04-22
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.

# Communication

Self-hosted chat, push notifications, VoIP, and team collaboration platforms.

---

## Key Concepts

#### Federation and the fediverse — ActivityPub and Matrix
Two independent federation protocols power the self-hosted social and communication ecosystem. Matrix (used by Synapse, Conduit) federates real-time messaging — your homeserver and another operator's homeserver exchange messages directly, with no central relay. ActivityPub (used by Mastodon, Lemmy, Pixelfed, PeerTube) federates social actions — follows, posts, likes — across servers. Both use a server-to-server API for federation and a client-to-server API for user clients. The critical concept for interviews: federation means data is distributed across many servers with no central authority — this creates challenges for moderation, key verification, and data retention that centralised platforms don't have.

#### End-to-end encryption in messaging — what it protects and what it doesn't
E2EE (used by Matrix with Olm/Megolm, Signal Protocol) encrypts messages on the sender's device and decrypts only on recipient devices — the server relays ciphertext and never sees plaintext. What it protects: message content from server operators, network observers, and data breaches. What it doesn't protect: metadata (who communicated with whom, when, how often), the server itself if the client is compromised, or key verification failures (man-in-the-middle if users don't verify key fingerprints). Matrix's cross-signing and verification process addresses the key verification problem. For security engineering roles, the distinction between transport encryption (TLS) and end-to-end encryption is a standard interview question.

#### XMPP vs Matrix vs IRC — protocol generations
IRC (1988) is stateless, no message history, no encryption in the base protocol. XMPP (1999) adds presence, federation, and a rich extension system (XEPs) but has a fragmented client ecosystem. Matrix (2014) was designed from the start for end-to-end encryption, rich media, bridges to other protocols, and a replicated history model (every homeserver stores a copy of room history it participates in). Matrix's replicated history is its key architectural difference — it provides resilience (the room continues even if the founding server goes offline) but at the cost of storage and complexity. Bridges (mautrix-whatsapp, mautrix-telegram) let Matrix users communicate with users on closed platforms.

#### WebRTC and real-time media
Jitsi Meet and Matrix video calls use WebRTC — the browser standard for real-time audio/video. WebRTC establishes peer-to-peer connections using ICE (Interactive Connectivity Establishment): STUN servers help peers discover their public IP/port; TURN servers relay media when direct P2P fails (symmetric NAT). For group calls, a Selective Forwarding Unit (SFU) like Jitsi's Videobridge receives each participant's stream and selectively forwards it to others — more efficient than full mesh P2P (N² streams) or MCU (transcodes everything). Jitsi Videobridge is an SFU. Understanding this architecture matters for any role involving real-time communication infrastructure.

#### SIP and VoIP fundamentals
SIP (Session Initiation Protocol) is the signalling protocol for VoIP — it negotiates calls (INVITE, 200 OK, BYE) but doesn't carry audio. RTP (Real-time Transport Protocol) carries the actual audio/video. FreePBX is an Asterisk frontend: Asterisk handles SIP signalling, codec negotiation, and RTP media. A SIP trunk connects your PBX to the PSTN (public telephone network) via a VoIP provider. A SIP extension is a phone or softphone registered to your PBX. Common codecs: G.711 (uncompressed, highest quality, most bandwidth), G.729 (compressed, lower bandwidth, slight quality loss), Opus (modern, variable bitrate, used in WebRTC). VoIP engineering roles test on SIP trace reading and NAT traversal.

#### Push notification architecture — APNS, FCM, and self-hosted alternatives
Mobile push notifications (iOS: APNS, Android: FCM) require routing through Apple's and Google's servers — apps can't receive pushes without them. This is why truly server-side push requires a relay: ntfy and Gotify provide an app that maintains a persistent connection to your server and displays notifications without going through Google/Apple. The trade-off: ntfy has an Android app using websockets (no FCM dependency), but on iOS, background delivery still requires APNS. For privacy-focused deployment, understanding what requires a cloud relay versus what's fully local is important.

## Matrix / Synapse

**Purpose:** Federated, open-source real-time communication protocol. Powers Element, Schildi, FluffyChat, and other secure messengers. Messages are end-to-end encrypted, decentralised, and stored on your own server.

```yaml
# ~/matrix/compose.yaml
services:
  synapse:
    image: matrixdotorg/synapse:latest
    ports: ["127.0.0.1:8448:8008"]
    volumes:
      - /home/user/synapse:/data:Z
    environment:
      SYNAPSE_SERVER_NAME: chat.example.com
      SYNAPSE_REPORT_STATS: "no"
    restart: unless-stopped
```

```bash
cd ~/matrix && podman-compose up -d
```

##### Generate initial config

```bash
podman run --rm \
  -v /home/user/synapse:/data:Z \
  -e SYNAPSE_SERVER_NAME=chat.example.com \
  -e SYNAPSE_REPORT_STATS=no \
  matrixdotorg/synapse:latest generate
```

**Create the first admin user:**
```bash
podman exec -it synapse register_new_matrix_user \
  http://localhost:8008 -c /data/homeserver.yaml \
  --admin -u admin -p changeme
```

#### Common operations
```bash
# Create a new user
podman exec -it synapse register_new_matrix_user   http://localhost:8008 -c /data/homeserver.yaml   -u newuser -p newpassword --no-admin

# Make a user admin
podman exec synapse   /bin/bash -c "cd /data && python -m synapse.app.admin_cmd -c homeserver.yaml   modify-user --make-admin @user:chat.example.com"

# View server stats
curl http://localhost:8448/_synapse/admin/v1/server_version   -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# List all registered users
curl http://localhost:8448/_synapse/admin/v2/users?from=0&limit=100   -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Reload config
podman kill --signal=HUP synapse

# Run database maintenance
podman exec synapse python -m synapse.app.admin_cmd   -c /data/homeserver.yaml run-background-updates
```

**Caddy:**
```caddyfile
chat.example.com {
  reverse_proxy localhost:8448
  # Matrix well-known delegation
  handle /.well-known/matrix/* {
    respond `{"m.homeserver":{"base_url":"https://chat.example.com"}}` 200
  }
}
```

#### Matrix architecture — homeservers, federation, and rooms
Matrix is a decentralised protocol. Each user belongs to a homeserver (`@user:yourdomain.com`). Rooms are identified by IDs (`!roomid:originserver.com`) and can federate across homeservers — participants from `matrix.org`, `yourdomain.com`, and any other homeserver can all be in the same room. The homeserver stores all events its users participate in. Federation means your homeserver syncs room history with other participating homeservers. Synapse is the reference implementation; Conduit and Dendrite are lighter alternatives. The trade-off of self-hosting: you control your data and identity, but you're responsible for federation performance and storage growth.

#### End-to-end encryption — what it actually protects
E2EE (as in Signal protocol, Matrix Megolm) means messages are encrypted on the sender's device and decrypted only on recipients' devices. The server sees only ciphertext — it cannot read message contents, even under legal compulsion. What it does NOT protect: metadata (who talked to whom, when, how often), device compromise (if your phone is seized, messages are readable), or forward secrecy failures (if a long-term key leaks and past messages were recorded). Matrix's cross-signing and key verification UI is designed to let users verify that no man-in-the-middle has injected a malicious device into their room.

#### Push notifications in self-hosted messaging
Mobile devices wake up for push notifications via platform-specific channels: APNs for iOS, FCM for Android. A self-hosted Matrix homeserver needs a push gateway (the `sygnal` service) that translates Matrix push events to APNs/FCM API calls. This requires API credentials from Apple (APNs certificate) and Google (FCM project key). Without this, messages only arrive when the app is open. Element Call and other Matrix apps also use this path. The privacy-preserving alternative: Ntfy as a self-hosted push notification server (supports UnifiedPush, bypassing FCM for Android) — several Matrix clients support UnifiedPush.

#### VoIP quality factors — jitter, latency, MOS score
Voice over IP quality is measured by three factors: latency (one-way delay; below 150ms is imperceptible, above 300ms causes conversational overlap), jitter (variation in packet arrival time; should be below 30ms — a jitter buffer compensates but adds latency), and packet loss (above 1% causes audible artefacts; above 5% makes calls unusable). Mean Opinion Score (MOS) is a 1–5 subjective quality rating; codecs trade bandwidth for MOS: Opus at 24kbps scores ~4.0 (near toll quality); G.711 (PSTN-grade) scores ~4.4 at 64kbps. QoS (DSCP marking, priority queuing) on your router ensures VoIP packets are prioritised over bulk downloads.

---

## Mattermost

**Purpose:** Slack alternative for developer and engineering teams. Threads, channels, file sharing, built-in code snippets, webhooks, and bot integrations. GDPR-compliant; all data stays on your server.

```yaml
# ~/mattermost/compose.yaml
services:
  mattermost:
    image: mattermost/mattermost-team-edition
    ports:
      - 127.0.0.1:8065:8065
    volumes:
      - /home/user/mattermost/config:/mattermost/config:Z
      - /home/user/mattermost/data:/mattermost/data:Z
      - /home/user/mattermost/logs:/mattermost/logs:Z
    environment:
      MM_SQLSETTINGS_DRIVERNAME: postgres
      MM_SQLSETTINGS_DATASOURCE: postgres://mattermost:changeme@host.containers.internal/mattermost?sslmode=disable
    restart: unless-stopped
```

```bash
cd ~/mattermost && podman-compose up -d
```

> Mattermost requires PostgreSQL. Run it from the [Databases wiki](https://docs.shani.dev/doc/servers/databases) first.

---

## Rocket.Chat

**Purpose:** Omnichannel communication platform with live chat, email, social media, and WhatsApp integration. Better than Mattermost for customer-facing teams; heavier resource footprint.

```yaml
# ~/rocketchat/compose.yaml
services:
  rocketchat:
    image: rocket.chat:latest
    ports: ["127.0.0.1:3000:3000"]
    environment:
      MONGO_URL: mongodb://mongodb:27017/rocketchat
      MONGO_OPLOG_URL: mongodb://mongodb:27017/local
      ROOT_URL: https://chat.example.com
    depends_on: [mongodb]
    restart: unless-stopped

  mongodb:
    image: mongo:7
    command: mongod --oplogSize 128 --replSet rs0
    volumes: [mongo_data:/data/db]
    restart: unless-stopped

volumes:
  mongo_data:
```

```bash
cd ~/rocketchat && podman-compose up -d
```

##### Initialise the MongoDB replica set (required on first run)

```bash
podman exec mongodb mongosh --eval "rs.initiate()"
```

## Ntfy

**Purpose:** Lightweight push notification server with a mobile app (iOS and Android), browser notifications, and pub/sub topics. Send alerts from any script, cron job, or service to your phone with a single `curl` command.

```yaml
# ~/ntfy/compose.yaml
services:
  ntfy:
    image: binwiederhier/ntfy
    ports:
      - 127.0.0.1:8090:80
    volumes:
      - /home/user/ntfy/cache:/var/cache/ntfy:Z
      - /home/user/ntfy/config:/etc/ntfy:Z
    command: serve
    restart: unless-stopped
```

```bash
cd ~/ntfy && podman-compose up -d
```

#### Common operations
```bash
# Send a simple notification
curl -d "Backup complete" http://localhost:8090/your-topic

# Send to self-hosted instance with priority and title
curl \
  -H "Title: Home Server Alert" \
  -H "Priority: high" \
  -H "Tags: warning,computer" \
  -d "Disk usage is above 90%" \
  http://localhost:8090/your-topic

# Send with attachment
curl -T screenshot.png \
  -H "Filename: screenshot.png" \
  http://localhost:8090/your-topic

# Subscribe and watch (long-poll)
curl -s http://localhost:8090/your-topic/json

# List published messages (last 10)
curl http://localhost:8090/your-topic/json?poll=1

# Create a user (on self-hosted with auth enabled)
podman exec ntfy ntfy user add --role=admin myuser
```

> For private notifications, self-host Ntfy and set `AUTH_DEFAULT_ACCESS=deny-all` in the config, then create user accounts.

---

## Gotify

**Purpose:** Simple self-hosted push notification server with REST API, WebSocket stream, and an Android app. All notifications stay on your server — no cloud routing.

```yaml
# ~/gotify/compose.yaml
services:
  gotify:
    image: gotify/server
    ports:
      - 127.0.0.1:8070:80
    volumes:
      - /home/user/gotify/data:/app/data:Z
    restart: unless-stopped
```

```bash
cd ~/gotify && podman-compose up -d
```

Access at `http://localhost:8070`. Create an app token and use it in your scripts:

```bash
curl "http://localhost:8070/message?token=YOUR_APP_TOKEN" \
  -F "title=Home Server" \
  -F "message=All services running" \
  -F "priority=5"
```

---

## Jitsi Meet (Video Conferencing)

**Purpose:** Self-hosted, open-source video conferencing. No accounts required, no time limits, end-to-end encryption. Drop-in replacement for Zoom or Google Meet for personal or small-team use. For education-specific virtual classrooms with whiteboards, breakout rooms, polling, and LMS integration, see [BigBlueButton in the Education wiki](https://docs.shani.dev/doc/servers/education#bigbluebutton-virtual-classroom).

```yaml
# ~/jitsi/compose.yaml — use the official quick-install from github.com/jitsi/docker-jitsi-meet
# Run: wget $(curl -s https://api.github.com/repos/jitsi/docker-jitsi-meet/releases/latest | grep 'tarball' | cut -d'"' -f4) -O jitsi.tar.gz
# Extract and run: cp env.example .env && ./gen-passwords.sh && podman-compose up -d
```

Ports required: `80/tcp`, `443/tcp`, `10000/udp` (media). Caddy should proxy 80/443 and pass through the media port.

---

## Conduit (Lightweight Matrix Server)

**Purpose:** A Matrix homeserver written in Rust. Uses significantly less RAM than Synapse (~50 MB vs ~500 MB). Ideal for personal or small family use where Synapse's federation features are not needed.

```yaml
# ~/conduit/compose.yaml
services:
  conduit:
    image: matrixconduit/matrix-conduit:latest
    ports:
      - 127.0.0.1:6167:6167
    volumes:
      - /home/user/conduit/data:/var/lib/matrix-conduit:Z
    environment:
      CONDUIT_SERVER_NAME: chat.example.com
      CONDUIT_DATABASE_BACKEND: rocksdb
      CONDUIT_ALLOW_REGISTRATION: false
      CONDUIT_TRUSTED_SERVERS: ["matrix.org"]
    restart: unless-stopped
```

```bash
cd ~/conduit && podman-compose up -d
```

> Choose Conduit for personal use on low-RAM hardware. Choose Synapse for full federation, bridges, and admin features.

---

## Discourse (Community Forum)

**Purpose:** The gold-standard self-hosted community discussion platform. Threaded topics, real-time notifications, badges, trust levels, rich embeds, email-in replies, and an extensive plugin ecosystem. Used by GitHub, Rust, Docker, and thousands of open-source projects. If your community currently lives on a subreddit, Facebook group, or Google Group, Discourse is the self-hosted replacement.

```yaml
# ~/discourse/compose.yaml — use the official launcher (recommended)
# git clone https://github.com/discourse/discourse_docker
# cd discourse_docker && cp samples/standalone.yml containers/app.yml
# Edit containers/app.yml, then:
# ./launcher bootstrap app
# ./launcher start app
```

```bash
cd ~/discourse && podman-compose up -d
```

For a containerised quickstart with Podman:

```yaml
# ~/discourse/compose.yaml
services:
  discourse:
    image: bitnami/discourse:latest
    ports:
      - 127.0.0.1:3100:3000
    volumes:
      - /home/user/discourse/data:/shared:Z
    environment:
      DISCOURSE_DB_HOST: host.containers.internal
      DISCOURSE_DB_NAME: discourse
      DISCOURSE_DB_USERNAME: discourse
      DISCOURSE_DB_PASSWORD: changeme
      DISCOURSE_REDIS_HOST: host.containers.internal
      DISCOURSE_HOSTNAME: forum.example.com
      DISCOURSE_DEVELOPER_EMAILS: admin@example.com
      DISCOURSE_SMTP_ADDRESS: localhost
      DISCOURSE_SMTP_PORT: 25
    restart: unless-stopped
```

```bash
cd ~/discourse && podman-compose up -d
```

> Discourse requires PostgreSQL and Redis. Run both from the [Databases wiki](https://docs.shani.dev/doc/servers/databases) first. It also requires outbound email (SMTP) for account activation — use Mailpit in development.

#### First-time setup
Visit `http://localhost:3100/finish-installation` to create the admin account.

**Caddy:**
```caddyfile
forum.example.com { reverse_proxy localhost:3100 }
```

---

## Mastodon (Federated Microblogging)

**Purpose:** Self-hosted, ActivityPub-federated microblogging. Your users have accounts like `@alice@social.example.com` and can follow and be followed by users on any other Mastodon, Misskey, or compatible ActivityPub server. Full Twitter/X replacement that federates with the global fediverse.

```yaml
# ~/mastodon/compose.yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: mastodon
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: mastodon_production
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  web:
    image: ghcr.io/mastodon/mastodon:latest
    command: bundle exec puma -C config/puma.rb
    ports: ["127.0.0.1:3200:3000"]
    environment:
      LOCAL_DOMAIN: social.example.com
      SECRET_KEY_BASE: changeme-run-rake-secret
      OTP_SECRET: changeme-run-rake-secret
      DB_HOST: db
      DB_NAME: mastodon_production
      DB_USER: mastodon
      DB_PASS: changeme
      REDIS_HOST: redis
      SMTP_SERVER: localhost
      SMTP_PORT: 25
      SMTP_FROM_ADDRESS: notifications@social.example.com
      RAILS_ENV: production
    volumes:
      - /home/user/mastodon/public/system:/mastodon/public/system:Z
    depends_on: [db, redis]
    restart: unless-stopped

  sidekiq:
    image: ghcr.io/mastodon/mastodon:latest
    command: bundle exec sidekiq
    environment:
      LOCAL_DOMAIN: social.example.com
      SECRET_KEY_BASE: changeme-run-rake-secret
      OTP_SECRET: changeme-run-rake-secret
      DB_HOST: db
      DB_USER: mastodon
      DB_PASS: changeme
      DB_NAME: mastodon_production
      REDIS_HOST: redis
      RAILS_ENV: production
    volumes:
      - /home/user/mastodon/public/system:/mastodon/public/system:Z
    depends_on: [db, redis]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/mastodon && podman-compose up -d
```

#### Initial setup
```bash
# Run DB migrations and create admin user
podman-compose run --rm web bundle exec rails db:migrate
podman-compose run --rm web bundle exec rails mastodon:accounts:create \
  USERNAME=admin EMAIL=admin@example.com CONFIRMED=true ROLE=Owner
```

> Mastodon requires a public-facing domain — it federates with other servers using HTTP. Use a Cloudflare Tunnel or ensure port 443 is forwarded.

---

## Lemmy (Federated Link Aggregator)

**Purpose:** Self-hosted Reddit alternative with ActivityPub federation. Communities, upvoting, threaded comments, cross-posting, moderation tools, and federation with the broader fediverse. Your instance can federate with other Lemmy and Kbin instances.

```yaml
# ~/lemmy/compose.yaml
services:
  lemmy:
    image: dessalines/lemmy:latest
    ports: ["127.0.0.1:8536:8536"]
    environment:
      RUST_LOG: warn
    volumes:
      - /home/user/lemmy/config/config.hjson:/config/config.hjson:ro,Z
    depends_on: [postgres]
    restart: unless-stopped

  lemmy-ui:
    image: dessalines/lemmy-ui:latest
    ports: ["127.0.0.1:1234:1234"]
    environment:
      LEMMY_UI_LEMMY_INTERNAL_HOST: lemmy:8536
      LEMMY_UI_LEMMY_EXTERNAL_HOST: lemmy.example.com
      LEMMY_UI_HTTPS: "true"
    depends_on: [lemmy]
    restart: unless-stopped

  postgres:
    image: tensorchord/pgvecto-rs:pg16-v0.2.1
    environment:
      POSTGRES_USER: lemmy
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: lemmy
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/lemmy && podman-compose up -d
```

##### Minimal `config.hjson`

```hjson
{
  hostname: "lemmy.example.com"
  bind: "0.0.0.0"
  port: 8536
  database: {
    host: "postgres"
    user: "lemmy"
    password: "changeme"
    database: "lemmy"
  }
  federation: { enabled: true }
  email: {
    smtp_server: "localhost:25"
    smtp_from_address: "noreply@lemmy.example.com"
  }
}
```

**Caddy:**
```caddyfile
lemmy.example.com {
  handle_path /api/* { reverse_proxy localhost:8536 }
  handle_path /feeds/* { reverse_proxy localhost:8536 }
  handle_path /pictrs/* { reverse_proxy localhost:8536 }
  handle { reverse_proxy localhost:1234 }
}
```

---

## Pixelfed (Federated Photo Sharing)

**Purpose:** Instagram alternative with ActivityPub federation. Share photos, stories, and reels with followers across the fediverse. Completely open-source and ad-free. Pixelfed accounts can follow Mastodon accounts and vice versa.

```yaml
# ~/pixelfed/compose.yaml
services:
  app:
    image: pixelfed/pixelfed:latest
    ports: ["127.0.0.1:8082:80"]
    environment:
      APP_NAME: "My Pixelfed"
      APP_URL: https://photos.example.com
      APP_DOMAIN: photos.example.com
      DB_CONNECTION: pgsql
      DB_HOST: db
      DB_DATABASE: pixelfed
      DB_USERNAME: pixelfed
      DB_PASSWORD: changeme
      REDIS_HOST: redis
      MAIL_DRIVER: smtp
      MAIL_HOST: localhost
      SESSION_DRIVER: redis
      CACHE_DRIVER: redis
      QUEUE_DRIVER: redis
    volumes:
      - /home/user/pixelfed/storage:/var/www/storage:Z
      - /home/user/pixelfed/bootstrap:/var/www/bootstrap/cache:Z
    depends_on: [db, redis]
    restart: unless-stopped

  worker:
    image: pixelfed/pixelfed:latest
    command: gosu www-data php artisan horizon
    environment:
      DB_HOST: db
      DB_DATABASE: pixelfed
      DB_USERNAME: pixelfed
      DB_PASSWORD: changeme
      REDIS_HOST: redis
    volumes:
      - /home/user/pixelfed/storage:/var/www/storage:Z
    depends_on: [db, redis]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: pixelfed
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: pixelfed
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/pixelfed && podman-compose up -d
```

---

## PeerTube (Federated Video Platform)

**Purpose:** Self-hosted YouTube alternative with ActivityPub federation. Upload and stream videos, live stream, create playlists, and federate with other PeerTube instances. Uses WebTorrent/HLS for peer-assisted streaming to reduce bandwidth costs. Viewers can subscribe to your channel from Mastodon.

```yaml
# ~/peertube/compose.yaml
services:
  peertube:
    image: chocobozzz/peertube:production-bookworm
    ports:
      - "127.0.0.1:9000:9000"
      - "0.0.0.0:1935:1935"   # RTMP for live streaming
    environment:
      PEERTUBE_DB_USERNAME: peertube
      PEERTUBE_DB_PASSWORD: changeme
      PEERTUBE_DB_HOSTNAME: postgres
      PEERTUBE_REDIS_HOSTNAME: redis
      PEERTUBE_WEBSERVER_HOSTNAME: videos.example.com
      PEERTUBE_WEBSERVER_PORT: 443
      PEERTUBE_WEBSERVER_HTTPS: "true"
      PEERTUBE_SMTP_HOSTNAME: localhost
      PEERTUBE_SMTP_PORT: 25
      PEERTUBE_ADMIN_EMAIL: admin@example.com
    volumes:
      - /home/user/peertube/data:/data:Z
      - /home/user/peertube/config:/config:Z
    depends_on: [postgres, redis]
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: peertube
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: peertube
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/peertube && podman-compose up -d
```

> PeerTube requires a public-facing HTTPS domain for federation and HLS video delivery. Open port `1935/tcp` in your firewall for live streaming ingestion.

**Firewall:**
```bash
sudo firewall-cmd --add-port=1935/tcp --permanent && sudo firewall-cmd --reload
```

---

## Zulip (Threaded Team Chat)

**Purpose:** Conversation-threaded team messaging that keeps discussions organised at scale. Unlike Slack/Mattermost where channels become walls of noise, Zulip's topic model means every message lives in a named thread within a stream — you can catch up on only what matters. Used by many open-source communities as their primary async communication platform.

```yaml
# ~/zulip/compose.yaml
services:
  zulip:
    image: zulip/docker-zulip:latest
    ports: ["127.0.0.1:8442:443"]
    environment:
      DB_HOST: postgres
      DB_HOST_PORT: 5432
      DB_USER: zulip
      SETTING_MEMCACHED_LOCATION: memcached:11211
      SETTING_REDIS_HOST: redis
      SETTING_REDIS_PORT: 6379
      SECRETS_email_password: changeme
      SECRETS_rabbitmq_password: changeme
      SECRETS_postgres_password: changeme
      SECRETS_secret_key: changeme-run-openssl-rand-base64-64
      SETTING_EXTERNAL_HOST: chat.example.com
      SETTING_ZULIP_ADMINISTRATOR: admin@example.com
      ZULIP_AUTH_BACKENDS: EmailAuthBackend
    volumes:
      - /home/user/zulip/data:/data:Z
    depends_on: [postgres, memcached, redis, rabbitmq]
    restart: unless-stopped

  postgres:
    image: zulip/zulip-postgresql:14
    environment:
      POSTGRES_DB: zulip
      POSTGRES_USER: zulip
      POSTGRES_PASSWORD: changeme
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  memcached:
    image: memcached:alpine
    restart: unless-stopped

  rabbitmq:
    image: rabbitmq:alpine
    environment:
      RABBITMQ_DEFAULT_USER: zulip
      RABBITMQ_DEFAULT_PASS: changeme
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/zulip && podman-compose up -d
```

---

## Mumble (Low-Latency Voice Chat)

**Purpose:** Open-source, low-latency voice over IP (VoIP) server. Designed for gaming and real-time voice communication — sub-10ms latency, positional audio, per-channel and per-user permission trees, and excellent audio quality. A self-hosted Discord voice alternative for teams who need reliable, private voice communication.

```yaml
# ~/mumble/compose.yaml
services:
  mumble:
    image: mumblevoip/mumble-server:latest
    ports:
      - 64738:64738/tcp
      - 64738:64738/udp
    volumes:
      - /home/user/mumble/data:/data:Z
    environment:
      SUPERUSER_PASSWORD: changeme
      TZ: Asia/Kolkata
    restart: unless-stopped
```

```bash
cd ~/mumble && podman-compose up -d
```

**Firewall:**
```bash
sudo firewall-cmd --add-port=64738/tcp --add-port=64738/udp --permanent && sudo firewall-cmd --reload
```

> **Web-based access:** Run [Mumble Web](https://github.com/Johni0702/mumble-web) alongside the server for browser-based voice without installing a client:

```yaml
# ~/mumble-web/compose.yaml
services:
  mumble-web:
    image: johni0702/mumble-web
    ports:
      - "127.0.0.1:64737:64737"
    environment:
      MUMBLE_SERVER: host.containers.internal:64738
    restart: unless-stopped
```

```bash
cd ~/mumble-web && podman-compose up -d
```

---

## FreePBX (SIP PBX & VoIP Server)

**Purpose:** Full-featured open-source PBX built on Asterisk. Manage SIP extensions, IVR menus, call routing, voicemail, and trunks from a web UI. Ideal for self-hosted office phone systems or home VoIP setups.

```yaml
# ~/freepbx/compose.yaml
services:
  freepbx:
    image: tiredofit/freepbx:latest
    network_mode: host
    volumes:
      - /home/user/freepbx/data:/data:Z
    environment:
      MYSQL_ROOT_PASSWORD: changeme
      RTP_START: 10000
      RTP_FINISH: 10200
    restart: unless-stopped
```

```bash
cd ~/freepbx && podman-compose up -d
```

> `--network host` is required for SIP and RTP UDP traffic to work correctly. FreePBX uses ports `5060/udp` (SIP), `5061/tcp` (SIP-TLS), and the RTP range you configure for audio.

**Firewall:**
```bash
sudo firewall-cmd --add-port=5060/udp --add-port=5061/tcp --permanent
sudo firewall-cmd --add-port=10000-10200/udp --permanent
sudo firewall-cmd --reload
```

Access the admin UI at `http://localhost/admin`. Configure a SIP trunk under Connectivity → Trunks, then add extensions under Applications → Extensions.

---

## SimpleX Chat Server (SMP + XFTP)

**Purpose:** The most private self-hosted messaging infrastructure available. SimpleX has no user IDs — not phone numbers, not usernames, not public keys. Messages are routed through SMP (SimpleX Messaging Protocol) relay servers; your server handles message queuing without knowing who is communicating with whom. Run your own relay so all message traffic stays on your hardware. Users connect to your relay by scanning a QR code or entering your server address in the SimpleX iOS/Android app.

```yaml
# ~/simplex/compose.yaml
services:
  # SMP Relay (message queuing)
  simplex-smp:
    image: simplexchat/smp-server:latest
    ports:
      - "5223:5223"
    volumes:
      - /home/user/simplex/smp:/etc/opt/simplex:Z
      - /home/user/simplex/smp-data:/var/opt/simplex:Z
    restart: unless-stopped

  # XFTP Server (file transfers)
  simplex-xftp:
    image: simplexchat/xftp-server:latest
    ports:
      - "443:443"
    volumes:
      - /home/user/simplex/xftp:/etc/opt/simplex-xftp:Z
      - /home/user/simplex/xftp-data:/var/opt/simplex-xftp:Z
    restart: unless-stopped
```

```bash
cd ~/simplex && podman-compose up -d
```

##### Initialise the server (first run)

```bash
# Generate server config and fingerprint
podman run --rm \
  -v /home/user/simplex/smp:/etc/opt/simplex:Z \
  -v /home/user/simplex/smp-data:/var/opt/simplex:Z \
  simplexchat/smp-server:latest \
  smp-server init -l

# The output shows your server address fingerprint:
# smp://FINGERPRINT@your-domain:5223
```

> Port `5223/tcp` must be publicly reachable for the SMP relay. Add your `smp://FINGERPRINT@your-domain:5223` address in the SimpleX app under Settings → Network & servers → SMP servers → Add server.

**Firewall:**
```bash
sudo firewall-cmd --add-port=5223/tcp --permanent && sudo firewall-cmd --reload
```

---

## Chatwoot (Customer Support & Live Chat)

**Purpose:** Open-source customer support platform and live chat inbox. Embed a chat widget on any website, manage conversations across email, WhatsApp, Instagram, Twitter/X, Telegram, and LINE from a single inbox. Supports teams with agent assignments, canned responses, labels, and CSAT surveys. The self-hosted Intercom/Zendesk alternative.

```yaml
# ~/chatwoot/compose.yaml
services:
  chatwoot:
    image: chatwoot/chatwoot:latest
    ports: ["127.0.0.1:3300:3000"]
    command: bundle exec rails s -p 3000 -b 0.0.0.0
    environment:
      SECRET_KEY_BASE: changeme-run-openssl-rand-hex-64
      FRONTEND_URL: https://chat.example.com
      DEFAULT_LOCALE: en
      FORCE_SSL: "false"
      ENABLE_ACCOUNT_SIGNUP: "false"
      REDIS_URL: redis://redis:6379
      POSTGRES_HOST: db
      POSTGRES_DATABASE: chatwoot
      POSTGRES_USERNAME: chatwoot
      POSTGRES_PASSWORD: changeme
      ACTIVE_STORAGE_SERVICE: local
      STORAGE_DIR: /app/storage
      MAILER_SENDER_EMAIL: support@example.com
      SMTP_ADDRESS: localhost
      SMTP_PORT: 25
    volumes:
      - /home/user/chatwoot/storage:/app/storage:Z
      - /home/user/chatwoot/public/packs:/app/public/packs:Z
    depends_on: [db, redis]
    restart: unless-stopped

  sidekiq:
    image: chatwoot/chatwoot:latest
    command: bundle exec sidekiq -C config/sidekiq.yml
    environment:
      SECRET_KEY_BASE: changeme-run-openssl-rand-hex-64
      FRONTEND_URL: https://chat.example.com
      REDIS_URL: redis://redis:6379
      POSTGRES_HOST: db
      POSTGRES_DATABASE: chatwoot
      POSTGRES_USERNAME: chatwoot
      POSTGRES_PASSWORD: changeme
    volumes:
      - /home/user/chatwoot/storage:/app/storage:Z
    depends_on: [db, redis]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: chatwoot
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: chatwoot
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/chatwoot && podman-compose up -d
```

#### Prepare database and create admin
```bash
podman-compose run --rm chatwoot bundle exec rails db:chatwoot_prepare
podman-compose run --rm chatwoot bundle exec rails db:seed
```

Access at `http://localhost:3300`. Complete the setup wizard to create your account and first inbox. Add the live chat widget to any site:

```html
<script>
  (function(d,t) {
    var g=d.createElement(t),s=d.getElementsByTagName(t)[0];
    g.src="https://chat.example.com/packs/js/sdk.js";
    g.defer=true; g.async=true;
    s.parentNode.insertBefore(g,s);
    g.onload=function(){ window.chatwootSDK.run({ websiteToken: 'YOUR_TOKEN', baseUrl: 'https://chat.example.com' }) }
  })(document,"script");
</script>
```

**Caddy:**
```caddyfile
chat.example.com { reverse_proxy localhost:3300 }
```

---

## Caddy Configuration

```caddyfile
chat.example.com      { reverse_proxy localhost:8448 }
mattermost.home.local { tls internal; reverse_proxy localhost:8065 }
rocketchat.home.local { tls internal; reverse_proxy localhost:3000 }
ntfy.home.local       { tls internal; reverse_proxy localhost:8090 }
gotify.home.local     { tls internal; reverse_proxy localhost:8070 }
jitsi.example.com     { reverse_proxy localhost:8080 }
conduit.example.com   { reverse_proxy localhost:6167 }
forum.example.com     { reverse_proxy localhost:3100 }
social.example.com    { reverse_proxy localhost:3200 }
lemmy.example.com     { reverse_proxy localhost:1234 }
photos.example.com    { reverse_proxy localhost:8082 }
videos.example.com    { reverse_proxy localhost:9000 }
zulip.example.com     { reverse_proxy localhost:8442 }
simplex.example.com   { reverse_proxy localhost:5223 }
support.example.com   { reverse_proxy localhost:3300 }
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Matrix clients can't log in | Check `SYNAPSE_SERVER_NAME` matches the domain; verify the well-known delegation in Caddy returns valid JSON |
| Synapse high memory usage | Switch to Conduit for personal use, or tune `caches.global_factor` in `homeserver.yaml` |
| Ntfy notifications not received | Verify the topic name matches on sender and app; check `AUTH_DEFAULT_ACCESS` allows unauthenticated publish |
| Mattermost DB connection refused | Ensure PostgreSQL is running and the `MM_SQLSETTINGS_DATASOURCE` connection string is correct |
| Jitsi video choppy | Ensure `10000/udp` is open in firewalld; Jitsi media relay requires a direct UDP path |
| Rocket.Chat replica set error | Run `rs.initiate()` in the MongoDB shell after first boot: `podman exec mongodb mongosh --eval "rs.initiate()"` |
| Discourse `500 - Missing secret_key_base` | Ensure `DISCOURSE_SECRET_KEY_BASE` is set; generate with `openssl rand -hex 64` |
| Discourse emails not sent | Verify SMTP settings in the admin panel (Admin → Settings → Email); test with the "Send test email" button |
| Mastodon federation not working | Ensure your domain is publicly reachable on port 443; verify the `/.well-known/webfinger` route resolves |
| Mastodon media uploads failing | Check the `public/system` volume has write permissions; ensure disk space is available |
| Lemmy posts not federating | Verify `federation.enabled: true` in config; check that your domain is publicly reachable |
| Pixelfed `500` after setup | Run `podman exec app php artisan storage:link && php artisan config:cache` to rebuild the app cache |
| PeerTube video processing stuck | Check the worker container logs; ensure ffmpeg is available in the image and the data volume has enough space |
| PeerTube live stream not connecting | Verify RTMP port `1935/tcp` is open and the stream key in OBS matches PeerTube's live settings |
| Zulip blank after startup | Zulip takes 60–90 s to initialise; check `podman logs zulip`; verify all dependency containers (postgres, redis, memcached, rabbitmq) are healthy |
| Mumble audio quality poor | Ensure UDP port `64738` is reachable — TCP fallback works but has higher latency; check client codec settings |
| FreePBX no audio on calls (one-way) | Ensure the RTP port range is open in the firewall; verify `nat=yes` is set on SIP trunks behind NAT |
| SimpleX server not reachable | Ensure port `5223/tcp` is publicly reachable; verify the fingerprint in your server address matches what `smp-server` printed during init |
| Chatwoot widget not loading | Verify `FRONTEND_URL` matches the domain the widget is loaded from; check CSP headers aren't blocking the script |
| Chatwoot Sidekiq not processing | Check Redis is running and `REDIS_URL` is correct; view Sidekiq logs with `podman logs chatwoot-sidekiq-1` |
