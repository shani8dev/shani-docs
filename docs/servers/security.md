---
title: Security & Identity
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Security & Identity

Password management, identity providers, secrets management, and threat detection.

> All services in this section require HTTPS to function correctly. Use Caddy (`tls internal` for private access, Let's Encrypt for public). Never expose security-sensitive services over plain HTTP.

---

## Vaultwarden

**Purpose:** Lightweight, Bitwarden-compatible password server. Your Bitwarden mobile app, browser extension, and desktop app all connect to your own server. Passwords, TOTP codes, secure notes, organisations, and sends — all on your hardware with no Bitwarden cloud subscription.

```bash
podman run -d \
  --name vaultwarden \
  -p 127.0.0.1:8180:80 \
  -p 127.0.0.1:3012:3012 \
  -v /home/user/vaultwarden/data:/data:Z \
  -e WEBSOCKET_ENABLED=true \
  -e ADMIN_TOKEN=$(openssl rand -base64 48) \
  -e SIGNUPS_ALLOWED=false \
  -e ROCKET_ENV=production \
  --restart unless-stopped \
  vaultwarden/server:latest
```

> Set `SIGNUPS_ALLOWED=false` after creating your account to prevent anyone else from registering.

**Caddy configuration:**
```caddyfile
vault.home.local {
  tls internal
  reverse_proxy localhost:8180
  reverse_proxy /notifications/hub localhost:3012
}
```

**Backup your vault data:**
```bash
# Vaultwarden data directory contains the SQLite DB and attachments
restic backup /home/user/vaultwarden/data
```

**Enable 2FA emergency access:** In the web vault, go to Settings → Two-step Login → add TOTP or WebAuthn key. If you lose access to your 2FA device, use the recovery code generated during setup.

---

## Authelia

**Purpose:** Lightweight single sign-on and two-factor authentication (TOTP, WebAuthn/passkeys) via Caddy forward auth. One login page protects your entire self-hosted stack — no per-app configuration needed.

```yaml
# ~/authelia/compose.yml
services:
  authelia:
    image: authelia/authelia:latest
    ports: ["127.0.0.1:9091:9091"]
    volumes:
      - /home/user/authelia/config:/config:Z
    environment:
      TZ: Asia/Kolkata
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped
```

**Minimal `configuration.yml`:**
```yaml
# /home/user/authelia/config/configuration.yml
jwt_secret: changeme-run-openssl-rand-base64-32
session:
  secret: changeme
  domain: example.com
  redis:
    host: redis

authentication_backend:
  file:
    path: /config/users_database.yml

access_control:
  default_policy: deny
  rules:
    - domain: "*.example.com"
      policy: two_factor

storage:
  local:
    path: /config/db.sqlite3
```

**Create a user:**
```bash
podman exec authelia authelia crypto hash generate argon2 --password 'yourpassword'
# Add the hash to /home/user/authelia/config/users_database.yml
```

**Caddy integration (protect any service):**
```caddyfile
auth.example.com {
  reverse_proxy localhost:9091
}

service.example.com {
  forward_auth localhost:9091 {
    uri /api/verify?rd=https://auth.example.com
    copy_headers Remote-User Remote-Groups Remote-Name Remote-Email
  }
  reverse_proxy localhost:SERVICE_PORT
}
```

---

## Authentik

**Purpose:** Full-featured Identity Provider (IdP) with OIDC, SAML, LDAP, and OAuth2 support. Use when you need SSO across many applications, user provisioning, or integration with external identity sources. Powers SSO for NetBird, Gitea, Nextcloud, and more from a single login.

```yaml
# ~/authentik/compose.yml
services:
  postgresql:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: authentik
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: authentik
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  server:
    image: ghcr.io/goauthentik/server:latest
    command: server
    ports: ["127.0.0.1:9000:9000"]
    environment:
      AUTHENTIK_REDIS__HOST: redis
      AUTHENTIK_POSTGRESQL__HOST: postgresql
      AUTHENTIK_POSTGRESQL__USER: authentik
      AUTHENTIK_POSTGRESQL__PASSWORD: changeme
      AUTHENTIK_POSTGRESQL__NAME: authentik
      AUTHENTIK_SECRET_KEY: changeme-generate-with-openssl-rand-base64-60
    volumes:
      - /home/user/authentik/media:/media:Z
      - /home/user/authentik/custom-templates:/templates:Z
    depends_on: [postgresql, redis]
    restart: unless-stopped

  worker:
    image: ghcr.io/goauthentik/server:latest
    command: worker
    environment:
      AUTHENTIK_REDIS__HOST: redis
      AUTHENTIK_POSTGRESQL__HOST: postgresql
      AUTHENTIK_POSTGRESQL__USER: authentik
      AUTHENTIK_POSTGRESQL__PASSWORD: changeme
      AUTHENTIK_POSTGRESQL__NAME: authentik
      AUTHENTIK_SECRET_KEY: changeme-generate-with-openssl-rand-base64-60
    volumes:
      - /home/user/authentik/media:/media:Z
    depends_on: [postgresql, redis]
    restart: unless-stopped

volumes:
  pg_data:
```

Access at `http://localhost:9000/if/flow/initial-setup/` to create the admin account.

---

## Keycloak

**Purpose:** Enterprise-grade Identity & Access Management. OIDC, SAML 2.0, LDAP federation, fine-grained authorisation, and a comprehensive admin UI. The right choice for complex IAM requirements or when integrating with enterprise directory services.

```yaml
# ~/keycloak/compose.yml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: keycloak
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

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
      KC_HOSTNAME: keycloak.example.com
    command: ["start-dev"]
    depends_on: [db]
    restart: unless-stopped

volumes:
  pg_data:
```

> Use `start` (not `start-dev`) for production. `start-dev` disables HTTPS enforcement and some caches.

---

## Zitadel

**Purpose:** Modern, cloud-native identity provider with a clean UI and strong developer experience. Supports OIDC, OAuth2, SAML, and passwordless auth (passkeys). Lighter and easier to operate than Keycloak while being more capable than Authentik.

```yaml
# ~/zitadel/compose.yml
services:
  zitadel:
    image: ghcr.io/zitadel/zitadel:latest
    ports: ["127.0.0.1:8080:8080"]
    command: start-from-init --masterkeyFromEnv
    environment:
      ZITADEL_MASTERKEY: changeme-exactly-32-chars-long!!
      ZITADEL_DATABASE_POSTGRES_HOST: db
      ZITADEL_DATABASE_POSTGRES_PORT: 5432
      ZITADEL_DATABASE_POSTGRES_DATABASE: zitadel
      ZITADEL_DATABASE_POSTGRES_USER_USERNAME: zitadel
      ZITADEL_DATABASE_POSTGRES_USER_PASSWORD: changeme
      ZITADEL_EXTERNALDOMAIN: auth.example.com
      ZITADEL_EXTERNALPORT: 443
      ZITADEL_EXTERNALSECURE: "true"
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: zitadel
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: zitadel
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

---

## CrowdSec

**Purpose:** Collaborative intrusion prevention system. Analyses your logs for attack patterns, blocks malicious IPs via a firewall bouncer, and shares threat intelligence with the CrowdSec community network.

```bash
podman run -d \
  --name crowdsec \
  -p 127.0.0.1:8080:8080 \
  -v /home/user/crowdsec/config:/etc/crowdsec:Z \
  -v /home/user/crowdsec/data:/var/lib/crowdsec/data:Z \
  -v /var/log:/var/log:ro \
  -e GID=$(id -g) \
  --restart unless-stopped \
  crowdsecurity/crowdsec:latest
```

**Install the firewalld bouncer on the host:**
```bash
sudo dnf install crowdsec-firewall-bouncer-iptables
sudo systemctl enable --now crowdsec-firewall-bouncer
```

**Useful CrowdSec commands:**
```bash
# View active alerts/bans
podman exec crowdsec cscli alerts list

# View decisions (banned IPs)
podman exec crowdsec cscli decisions list

# Manually ban an IP
podman exec crowdsec cscli decisions add --ip 1.2.3.4 --duration 24h

# Remove a ban
podman exec crowdsec cscli decisions delete --ip 1.2.3.4

# List installed collections (parsers + scenarios)
podman exec crowdsec cscli collections list
```

---

## Step-CA (Internal Certificate Authority)

**Purpose:** Issues internal TLS certificates via ACME protocol. Configure Caddy and other services to use Step-CA for automatic cert provisioning on private domains — without trusting Let's Encrypt for internal services.

```bash
podman run -d \
  --name step-ca \
  -p 127.0.0.1:8443:8443 \
  -v /home/user/stepca:/home/step:Z \
  -e DOCKER_STEPCA_INIT_NAME="Home Server CA" \
  -e DOCKER_STEPCA_INIT_DNS_NAMES="step-ca.home.local,localhost" \
  -e DOCKER_STEPCA_INIT_REMOTE_MANAGEMENT=true \
  --restart unless-stopped \
  smallstep/step-ca
```

**Trust the CA on Shani OS:**
```bash
step ca root > /tmp/root_ca.crt
sudo trust anchor /tmp/root_ca.crt
sudo update-ca-trust
```

**Issue a certificate manually:**
```bash
step ca certificate myservice.home.local myservice.crt myservice.key \
  --ca-url https://step-ca.home.local \
  --root /tmp/root_ca.crt
```

---

## Infisical (Secrets Management)

**Purpose:** Open-source secrets manager — a self-hosted alternative to HashiCorp Vault and Doppler. Store API keys, database passwords, and environment variables centrally, sync them to containers and CI/CD pipelines via the CLI or SDKs.

```yaml
# ~/infisical/compose.yml — see https://infisical.com/docs/self-hosting/docker-compose
# Requires Postgres and Redis; use the official compose template for production
```

---

## Comparison: Authelia vs Authentik vs Keycloak vs Zitadel

| Feature | Authelia | Authentik | Keycloak | Zitadel |
|---------|----------|-----------|----------|---------|
| Complexity | Low | Medium | High | Medium |
| Resource usage | ~50 MB RAM | ~500 MB RAM | ~1 GB RAM | ~250 MB RAM |
| OIDC provider | ❌ | ✅ | ✅ | ✅ |
| SAML | ❌ | ✅ | ✅ | ✅ |
| LDAP | ✅ Read | ✅ Read/Write | ✅ Full | ✅ Read |
| Passkeys | ✅ WebAuthn | ✅ | ✅ | ✅ Native |
| User provisioning | ❌ | ✅ | ✅ | ✅ |
| Best for | Protecting services with 2FA | SSO for a homelab | Enterprise IAM | Modern IdP with good UX |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Vaultwarden WebSocket errors | Ensure the `/notifications/hub` path is proxied to port `3012` in Caddy |
| Authelia redirect loop | Verify `session.domain` in Authelia config matches the root domain of your services |
| Authentik worker not starting | Check that `AUTHENTIK_SECRET_KEY` is set and consistent across `server` and `worker` services |
| Keycloak `HTTPS required` error | Either enable HTTPS or use `start-dev` mode for local testing only |
| Zitadel masterkey error | `ZITADEL_MASTERKEY` must be exactly 32 characters; generate with `openssl rand -base64 24 \| tr -d '='` |
| CrowdSec not blocking IPs | Confirm the firewall bouncer is installed and running on the host; check `cscli bouncers list` |
| Step-CA cert not trusted by browser | Export and trust the root CA: `step ca root > root.crt && sudo trust anchor root.crt && sudo update-ca-trust` |
| Vaultwarden admin panel 404 | The admin panel is at `/admin` — ensure `ADMIN_TOKEN` is set in the environment |

> 🔒 **Security checklist:**
> - Disable Vaultwarden signups after creating your account
> - Rotate the Vaultwarden `ADMIN_TOKEN` after initial setup
> - Back up `/home/user/vaultwarden/data` daily — losing your password vault is catastrophic
> - Use Authelia or Authentik in front of any service exposed via Cloudflare Tunnel or Pangolin
> - Keep fail2ban (pre-installed on Shani OS) active and configured to watch Caddy logs
> - Review CrowdSec decisions weekly to catch false positives before they affect real users
