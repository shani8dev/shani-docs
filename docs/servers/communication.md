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

## Caddy Configuration

```caddyfile
chat.example.com      { reverse_proxy localhost:8448 }
mattermost.home.local { tls internal; reverse_proxy localhost:8065 }
rocketchat.home.local { tls internal; reverse_proxy localhost:3000 }
ntfy.home.local       { tls internal; reverse_proxy localhost:8090 }
gotify.home.local     { tls internal; reverse_proxy localhost:8070 }
jitsi.example.com     { reverse_proxy localhost:8080 }
conduit.example.com   { reverse_proxy localhost:6167 }
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
