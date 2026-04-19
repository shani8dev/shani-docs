---
title: Communication
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Communication

Self-hosted chat, push notifications, VoIP, and team collaboration platforms.

---

## Matrix / Synapse

**Purpose:** Federated, open-source real-time communication protocol. Powers Element, Schildi, FluffyChat, and other secure messengers. Messages are end-to-end encrypted, decentralised, and stored on your own server.

```yaml
# ~/matrix/compose.yml
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

**Generate initial config:**
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

---

## Mattermost

**Purpose:** Slack alternative for developer and engineering teams. Threads, channels, file sharing, built-in code snippets, webhooks, and bot integrations. GDPR-compliant; all data stays on your server.

```bash
podman run -d \
  --name mattermost \
  -p 127.0.0.1:8065:8065 \
  -v /home/user/mattermost/config:/mattermost/config:Z \
  -v /home/user/mattermost/data:/mattermost/data:Z \
  -v /home/user/mattermost/logs:/mattermost/logs:Z \
  -e MM_SQLSETTINGS_DRIVERNAME=postgres \
  -e MM_SQLSETTINGS_DATASOURCE="postgres://mattermost:changeme@localhost/mattermost?sslmode=disable" \
  --restart unless-stopped \
  mattermost/mattermost-team-edition
```

> Mattermost requires PostgreSQL. Run it from the [Databases wiki](https://docs.shani.dev/doc/servers/databases) first.

---

## Rocket.Chat

**Purpose:** Omnichannel communication platform with live chat, email, social media, and WhatsApp integration. Better than Mattermost for customer-facing teams; heavier resource footprint.

```yaml
# ~/rocketchat/compose.yml
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
    image: mongo:6
    command: mongod --oplogSize 128 --replSet rs0
    volumes: [mongo_data:/data/db]
    restart: unless-stopped

volumes:
  mongo_data:
```

---

## Ntfy

**Purpose:** Lightweight push notification server with a mobile app (iOS and Android), browser notifications, and pub/sub topics. Send alerts from any script, cron job, or service to your phone with a single `curl` command.

```bash
podman run -d \
  --name ntfy \
  -p 127.0.0.1:8090:80 \
  -v /home/user/ntfy/cache:/var/cache/ntfy:Z \
  -v /home/user/ntfy/config:/etc/ntfy:Z \
  --restart unless-stopped \
  binwiederhier/ntfy serve
```

**Send a notification:**
```bash
# Simple message
curl -d "Backup complete" ntfy.sh/your-topic

# With title, priority and emoji tag
curl \
  -H "Title: Home Server Alert" \
  -H "Priority: high" \
  -H "Tags: warning" \
  -d "Disk usage is above 90%" \
  ntfy.sh/your-topic
```

> For private notifications, self-host Ntfy and set `AUTH_DEFAULT_ACCESS=deny-all` in the config, then create user accounts.

---

## Gotify

**Purpose:** Simple self-hosted push notification server with REST API, WebSocket stream, and an Android app. All notifications stay on your server — no cloud routing.

```bash
podman run -d \
  --name gotify \
  -p 127.0.0.1:8070:80 \
  -v /home/user/gotify/data:/app/data:Z \
  --restart unless-stopped \
  gotify/server
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
# ~/jitsi/compose.yml — use the official quick-install from github.com/jitsi/docker-jitsi-meet
# Run: wget $(curl -s https://api.github.com/repos/jitsi/docker-jitsi-meet/releases/latest | grep 'tarball' | cut -d'"' -f4) -O jitsi.tar.gz
# Extract and run: cp env.example .env && ./gen-passwords.sh && docker-compose up -d
```

Ports required: `80/tcp`, `443/tcp`, `10000/udp` (media). Caddy should proxy 80/443 and pass through the media port.

---

## Conduit (Lightweight Matrix Server)

**Purpose:** A Matrix homeserver written in Rust. Uses significantly less RAM than Synapse (~50 MB vs ~500 MB). Ideal for personal or small family use where Synapse's federation features are not needed.

```bash
podman run -d \
  --name conduit \
  -p 127.0.0.1:6167:6167 \
  -v /home/user/conduit/data:/var/lib/matrix-conduit:Z \
  -e CONDUIT_SERVER_NAME=chat.example.com \
  -e CONDUIT_DATABASE_BACKEND=rocksdb \
  -e CONDUIT_ALLOW_REGISTRATION=false \
  -e CONDUIT_TRUSTED_SERVERS='["matrix.org"]' \
  --restart unless-stopped \
  matrixconduit/matrix-conduit:latest
```

> Choose Conduit for personal use on low-RAM hardware. Choose Synapse for full federation, bridges, and admin features.

---

## Discourse (Community Forum)

**Purpose:** The gold-standard self-hosted community discussion platform. Threaded topics, real-time notifications, badges, trust levels, rich embeds, email-in replies, and an extensive plugin ecosystem. Used by GitHub, Rust, Docker, and thousands of open-source projects. If your community currently lives on a subreddit, Facebook group, or Google Group, Discourse is the self-hosted replacement.

```yaml
# ~/discourse/compose.yml — use the official launcher (recommended)
# git clone https://github.com/discourse/discourse_docker
# cd discourse_docker && cp samples/standalone.yml containers/app.yml
# Edit containers/app.yml, then:
# ./launcher bootstrap app
# ./launcher start app
```

For a containerised quickstart with Podman:

```bash
podman run -d \
  --name discourse \
  -p 127.0.0.1:3100:3000 \
  -v /home/user/discourse/data:/shared:Z \
  -e DISCOURSE_DB_HOST=host.containers.internal \
  -e DISCOURSE_DB_NAME=discourse \
  -e DISCOURSE_DB_USERNAME=discourse \
  -e DISCOURSE_DB_PASSWORD=changeme \
  -e DISCOURSE_REDIS_HOST=host.containers.internal \
  -e DISCOURSE_HOSTNAME=forum.example.com \
  -e DISCOURSE_DEVELOPER_EMAILS=admin@example.com \
  -e DISCOURSE_SMTP_ADDRESS=localhost \
  -e DISCOURSE_SMTP_PORT=25 \
  --restart unless-stopped \
  bitnami/discourse:latest
```

> Discourse requires PostgreSQL and Redis. Run both from the [Databases wiki](https://docs.shani.dev/doc/servers/databases) first. It also requires outbound email (SMTP) for account activation — use Mailpit in development.

**First-time setup:** Visit `http://localhost:3100/finish-installation` to create the admin account.

**Caddy:**
```caddyfile
forum.example.com { reverse_proxy localhost:3100 }
```

---

## Mastodon (Federated Microblogging)

**Purpose:** Self-hosted, ActivityPub-federated microblogging. Your users have accounts like `@alice@social.example.com` and can follow and be followed by users on any other Mastodon, Misskey, or compatible ActivityPub server. Full Twitter/X replacement that federates with the global fediverse.

```yaml
# ~/mastodon/compose.yml
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

**Initial setup:**
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
# ~/lemmy/compose.yml
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
    image: pgvecto-rs/pgvecto-rs:pg16-v0.2.0
    environment:
      POSTGRES_USER: lemmy
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: lemmy
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

**Minimal `config.hjson`:**
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
# ~/pixelfed/compose.yml
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

---

## PeerTube (Federated Video Platform)

**Purpose:** Self-hosted YouTube alternative with ActivityPub federation. Upload and stream videos, live stream, create playlists, and federate with other PeerTube instances. Uses WebTorrent/HLS for peer-assisted streaming to reduce bandwidth costs. Viewers can subscribe to your channel from Mastodon.

```yaml
# ~/peertube/compose.yml
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

> PeerTube requires a public-facing HTTPS domain for federation and HLS video delivery. Open port `1935/tcp` in your firewall for live streaming ingestion.

**Firewall:**
```bash
sudo firewall-cmd --add-port=1935/tcp --permanent && sudo firewall-cmd --reload
```

---

## Zulip (Threaded Team Chat)

**Purpose:** Conversation-threaded team messaging that keeps discussions organised at scale. Unlike Slack/Mattermost where channels become walls of noise, Zulip's topic model means every message lives in a named thread within a stream — you can catch up on only what matters. Used by many open-source communities as their primary async communication platform.

```yaml
# ~/zulip/compose.yml
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
    image: redis:alpine
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

---

## Mumble (Low-Latency Voice Chat)

**Purpose:** Open-source, low-latency voice over IP (VoIP) server. Designed for gaming and real-time voice communication — sub-10ms latency, positional audio, per-channel and per-user permission trees, and excellent audio quality. A self-hosted Discord voice alternative for teams who need reliable, private voice communication.

```bash
podman run -d \
  --name mumble \
  -p 64738:64738/tcp \
  -p 64738:64738/udp \
  -v /home/user/mumble/data:/data:Z \
  -e SUPERUSER_PASSWORD=changeme \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  mumblevoip/mumble-server:latest
```

**Firewall:**
```bash
sudo firewall-cmd --add-port=64738/tcp --add-port=64738/udp --permanent && sudo firewall-cmd --reload
```

Connect with any Mumble client (Mumble desktop, Mumla for Android). The server is accessible via your Tailscale IP — no public port forwarding needed for private use.

> **Web-based access:** Run [Mumble Web](https://github.com/Johni0702/mumble-web) alongside the server for browser-based voice without installing a client: `podman run -d --name mumble-web -p 127.0.0.1:64737:64737 -e MUMBLE_SERVER=host.containers.internal:64738 --restart unless-stopped johni0702/mumble-web`.

---

## FreePBX / Asterisk (Self-Hosted VoIP PBX)

**Purpose:** Full-featured private branch exchange (PBX) running on Asterisk. Supports SIP trunks from VoIP providers (Twilio, Vonage, local SIP carriers), internal extensions, auto-attendants (IVR), voicemail to email, call recording, ring groups, and conferencing. Replace a commercial phone system with something entirely on your hardware — useful for home offices and small businesses.

```bash
podman run -d \
  --name freepbx \
  --network host \
  -v /home/user/freepbx/data:/data:Z \
  -e MYSQL_ROOT_PASSWORD=changeme \
  -e RTP_START=10000 \
  -e RTP_FINISH=10200 \
  --restart unless-stopped \
  tiredofit/freepbx:latest
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

```bash
# SMP Relay (message queuing)
podman run -d \
  --name simplex-smp \
  -p 5223:5223 \
  -v /home/user/simplex/smp:/etc/opt/simplex:Z \
  -v /home/user/simplex/smp-data:/var/opt/simplex:Z \
  --restart unless-stopped \
  simplexchat/smp-server:latest

# XFTP Server (file transfers)
podman run -d \
  --name simplex-xftp \
  -p 443:443 \
  -v /home/user/simplex/xftp:/etc/opt/simplex-xftp:Z \
  -v /home/user/simplex/xftp-data:/var/opt/simplex-xftp:Z \
  --restart unless-stopped \
  simplexchat/xftp-server:latest
```

**Initialise the server (first run):**
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
# ~/chatwoot/compose.yml
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

**Prepare database and create admin:**
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
