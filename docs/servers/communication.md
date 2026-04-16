---
title: Communication
section: Self-Hosting & Servers
updated: 2026-04-16
---

# Communication

Self-hosted chat, push notifications, and team collaboration platforms.

## Matrix/Synapse
**Purpose**: Federated, open-source real-time communication protocol. Powering Element, Schildi, and other secure messengers.
```yaml
# ~/matrix/compose.yml
services:
  synapse:
    image: matrixdotorg/synapse:latest
    ports: ["127.0.0.1:8448:8008"]
    volumes: [/home/user/synapse:/data:Z]
    environment: { SYNAPSE_SERVER_NAME: chat.example.com, SYNAPSE_REPORT_STATS: "no" }
    restart: unless-stopped
```

## Mattermost / Rocket.Chat
**Purpose**: Slack/Discord alternatives. Mattermost focuses on developer/enterprise teams; Rocket.Chat offers omnichannel support.
```bash
podman run -d \
  --name mattermost \
  -p 127.0.0.1:8065:8065 \
  -v /home/user/mattermost/config:/mattermost/config:Z \
  --restart unless-stopped \
  mattermost/mattermost-team-edition
```

## Ntfy / Gotify
**Purpose**: Lightweight push notification servers. Send alerts from scripts, cron jobs, or apps to mobile/desktop clients instantly.
```bash
# Ntfy
podman run -d \
  --name ntfy \
  -p 127.0.0.1:8090:80 \
  -v /home/user/ntfy/cache:/var/cache/ntfy:Z \
  -v /home/user/ntfy/config:/etc/ntfy:Z \
  --restart unless-stopped \
  binwiederhier/ntfy serve

# Gotify
podman run -d \
  --name gotify \
  -p 127.0.0.1:8070:80 \
  -v /home/user/gotify/data:/app/data:Z \
  --restart unless-stopped \
  gotify/server
```
