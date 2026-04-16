---
title: Security & Identity
section: Self-Hosting & Servers
updated: 2026-04-16
---

# Security & Identity

Password management, identity providers, object storage, and collaborative intrusion prevention systems.

## Vaultwarden
**Purpose**: Lightweight, unofficial Bitwarden-compatible server. Provides password management, 2FA, secure notes, and organization sharing with minimal resource usage.
> ⚠️ **Note**: Requires HTTPS (via Caddy) to function correctly.
```bash
podman run -d \
  --name vaultwarden \
  -p 127.0.0.1:8180:80 \
  -v /home/user/vaultwarden/data:/Z \
  -e WEBSOCKET_ENABLED=true \
  -e ADMIN_TOKEN=$(openssl rand -base64 48) \
  --restart unless-stopped \
  vaultwarden/server:latest
```

## Authelia
**Purpose**: Lightweight authentication server providing 2FA (TOTP, WebAuthn) and single sign-on (SSO) for reverse-proxied applications.
```yaml
# ~/authelia/compose.yml
services:
  authelia:
    image: authelia/authelia:latest
    ports: ["127.0.0.1:9091:9091"]
    volumes:
      - /home/user/authelia/config:/config:Z
    environment: { TZ: Asia/Kolkata }
    restart: unless-stopped
  redis:
    image: redis:7-alpine
    restart: unless-stopped
```
> **Caddy Integration**:
> ```caddyfile
> service.example.com {
>     forward_auth localhost:9091 {
>         uri /api/verify?rd=https://auth.example.com
>         copy_headers Remote-User Remote-Groups Remote-Name Remote-Email
>     }
>     reverse_proxy localhost:SERVICEPORT
> }
> ```

## Authentik
**Purpose**: Full-featured identity and access management (IAM) platform. Supports OIDC, SAML, LDAP proxy, and advanced policy-based access control.
```yaml
# ~/authentik/compose.yml
services:
  server:
    image: ghcr.io/goauthentik/server:latest
    command: server
    ports: ["127.0.0.1:9000:9000"]
    environment:
      AUTHENTIK_REDIS__HOST: redis
      AUTHENTIK_POSTGRESQL__HOST: db
      AUTHENTIK_POSTGRESQL__USER: authentik
      AUTHENTIK_POSTGRESQL__PASSWORD: authentik
      AUTHENTIK_POSTGRESQL__NAME: authentik
      AUTHENTIK_SECRET_KEY: $(openssl rand -base64 50)
    depends_on: [db, redis]
    restart: unless-stopped
  worker:
    image: ghcr.io/goauthentik/server:latest
    command: worker
    environment: *server_env
    depends_on: [db, redis]
    restart: unless-stopped
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: authentik
      POSTGRES_PASSWORD: authentik
      POSTGRES_DB: authentik
    volumes: [pg_/var/lib/postgresql/data]
  redis:
    image: redis:7-alpine
```

## MinIO
**Purpose**: High-performance, S3-compatible object storage server. Ideal for backups, media archives, and as storage backend for other self-hosted apps.
```bash
podman run -d \
  --name minio \
  -p 127.0.0.1:9000:9000 \
  -p 127.0.0.1:9001:9001 \
  -e MINIO_ROOT_USER=admin \
  -e MINIO_ROOT_PASSWORD=changeme123 \
  -v /home/user/minio/data:/Z \
  --restart unless-stopped \
  quay.io/minio/minio server /data --console-address ":9001"
```

## CrowdSec
**Purpose**: Collaborative IPS/IDS that analyzes logs, detects malicious behavior, and automatically blocks offending IPs via bouncers (firewalld, nftables, Traefik, etc.).
```bash
podman run -d \
  --name crowdsec \
  -p 127.0.0.1:8080:8080 \
  -v /home/user/crowdsec/config:/etc/crowdsec:Z \
  -v /var/log:/var/log:ro \
  -e GID=1000 \
  --restart unless-stopped \
  crowdsecurity/crowdsec:latest
```
