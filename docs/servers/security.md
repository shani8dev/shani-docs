---
title: Security & Identity
section: Self-Hosting & Servers
updated: 2026-04-16
---

# Security & Identity

Password management, identity providers, secrets management, and threat detection.

## Vaultwarden
**Purpose**: Lightweight, unofficial Bitwarden-compatible server. Provides password management, 2FA, secure notes, and organization sharing with minimal resource usage.
> ⚠️ **Note**: Requires HTTPS (via Caddy) to function correctly.
```bash
podman run -d \
  --name vaultwarden \
  -p 127.0.0.1:8180:80 \
  -v /home/user/vaultwarden/data:/data:Z \
  -e WEBSOCKET_ENABLED=true \
  -e ADMIN_TOKEN=$(openssl rand -base64 48) \
  --restart unless-stopped \
  vaultwarden/server:latest
```

## Authelia / Authentik
**Purpose**: Authelia provides lightweight 2FA (TOTP, WebAuthn) and SSO via reverse proxy forward auth. Authentik is a full-featured IAM/OIDC platform.
```yaml
# ~/authelia/compose.yml
services:
  authelia:
    image: authelia/authelia:latest
    ports: ["127.0.0.1:9091:9091"]
    volumes: [/home/user/authelia/config:/config:Z]
    environment: { TZ: Asia/Kolkata }
    restart: unless-stopped
  redis:
    image: redis:7-alpine
    restart: unless-stopped
```
> **Caddy Integration**:
> ```caddyfile
> service.example.com { forward_auth localhost:9091 { uri /api/verify?rd=https://auth.example.com }; reverse_proxy localhost:SERVICEPORT }
> ```

## Keycloak
**Purpose**: Enterprise-grade Identity & Access Management. OIDC, SAML, LDAP federation, and fine-grained authorization.
```yaml
services:
  keycloak:
    image: quay.io/keycloak/keycloak:latest
    ports: ["127.0.0.1:8080:8080"]
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://db:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: changeme
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: changeme
    command: ["start-dev"]
    depends_on: [db]
    restart: unless-stopped
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: keycloak
    volumes: [pg_data:/var/lib/postgresql/data]
volumes: {pg_data: {}}
```

## MinIO / CrowdSec
**Purpose**: MinIO is high-performance S3-compatible object storage for backups/archives. CrowdSec is a collaborative IPS/IDS that analyzes logs and blocks malicious IPs.
```bash
podman run -d \
  --name minio \
  -p 127.0.0.1:9000:9000 \
  -p 127.0.0.1:9001:9001 \
  -v /home/user/minio/data:/data:Z \
  -e MINIO_ROOT_USER=admin \
  -e MINIO_ROOT_PASSWORD=changeme123 \
  --restart unless-stopped \
  quay.io/minio/minio server /data --console-address ":9001"

podman run -d \
  --name crowdsec \
  -p 127.0.0.1:8080:8080 \
  -v /home/user/crowdsec/config:/etc/crowdsec:Z \
  -v /var/log:/var/log:ro \
  -e GID=1000 \
  --restart unless-stopped \
  crowdsecurity/crowdsec:latest
```

## Step-CA / Infisical / Wazuh
**Purpose**: Step-CA issues internal TLS certs via ACME. Infisical manages secrets securely. Wazuh is an open-source XDR/SIEM for log analysis and vulnerability detection.
```bash
podman run -d \
  --name step-ca \
  -p 127.0.0.1:8443:8443 \
  -v /home/user/stepca:/home/step:Z \
  --restart unless-stopped \
  smallstep/step-ca
```
> Infisical & Wazuh use `podman-compose`. Wazuh requires 8GB+ RAM.
