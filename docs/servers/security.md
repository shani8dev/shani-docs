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

```yaml
# ~/vaultwarden/compose.yaml
services:
  vaultwarden:
    image: vaultwarden/server:latest
    ports:
      - 127.0.0.1:8180:80
      - 127.0.0.1:3012:3012
    volumes:
      - /home/user/vaultwarden/data:/data:Z
    environment:
      WEBSOCKET_ENABLED: "true"
      ADMIN_TOKEN: changeme-run-openssl-rand-base64-48
      SIGNUPS_ALLOWED: "false"
      ROCKET_ENV: production
    restart: unless-stopped
```

```bash
cd ~/vaultwarden && podman-compose up -d
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

**Common operations:**
```bash
# View logs
podman logs -f vaultwarden

# Backup vault data (SQLite DB + attachments)
tar -czf vaultwarden-backup-$(date +%Y%m%d).tar.gz /home/user/vaultwarden/data

# Export all ciphers via the admin panel
# Visit https://vault.home.local/admin → Import/Export

# Test WebSocket connectivity
curl -i http://localhost:3012/notifications/hub

# Verify admin token works
curl -X POST http://localhost:8180/admin   -d "token=YOUR_ADMIN_TOKEN"
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

```bash
cd ~/authelia && podman-compose up -d
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

**Common operations:**
```bash
# Generate a password hash for users_database.yml
podman exec authelia authelia crypto hash generate argon2 --password 'mypassword'

# Validate config
podman exec authelia authelia validate-config --config /config/configuration.yml

# View logs
podman logs -f authelia

# Test authentication (dry run)
curl -X POST http://localhost:9091/api/firstfactor   -H "Content-Type: application/json"   -d '{"username":"myuser","password":"mypassword","keepMeLoggedIn":false}'

# Reload users database (no restart needed)
podman kill --signal=HUP authelia
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

> **PostgreSQL backend (multi-instance / HA):** The default `storage.local` uses SQLite, which is fine for a single instance. For multiple Authelia replicas or if you want a more robust backend, switch to PostgreSQL:
> ```yaml
> storage:
>   postgres:
>     host: host.containers.internal
>     port: 5432
>     database: authelia
>     schema: public
>     username: authelia
>     password: changeme
> ```
> Add a `db` service using `postgres:16-alpine` to the compose stack (same pattern as Authentik below) and remove the `storage.local` block.

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

```bash
cd ~/authentik && podman-compose up -d
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

```bash
cd ~/keycloak && podman-compose up -d
```

> ⚠️ **Production:** Replace `start-dev` with `start` before exposing Keycloak publicly. `start-dev` disables HTTPS enforcement, TLS verification, and production-grade caches — it is for initial setup only.

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
      # Must be exactly 32 characters. Generate with: openssl rand -base64 24 | tr -d '=' | head -c 32
      ZITADEL_MASTERKEY: changeme-exactly-32-chars-here
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

```bash
cd ~/zitadel && podman-compose up -d
```

---

## CrowdSec

**Purpose:** Collaborative intrusion prevention system. Analyses your logs for attack patterns, blocks malicious IPs via a firewall bouncer, and shares threat intelligence with the CrowdSec community network.

```yaml
# ~/crowdsec/compose.yaml
services:
  crowdsec:
    image: crowdsecurity/crowdsec:latest
    ports:
      - 127.0.0.1:8080:8080
    volumes:
      - /home/user/crowdsec/config:/etc/crowdsec:Z
      - /home/user/crowdsec/data:/var/lib/crowdsec/data:Z
      - /var/log:/var/log:ro
    environment:
      GID: "1000"
    restart: unless-stopped
```

```bash
cd ~/crowdsec && podman-compose up -d
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

**Common operations:**
```bash
# View active alerts
podman exec crowdsec cscli alerts list

# View current bans/decisions
podman exec crowdsec cscli decisions list

# Manually ban an IP for 24 hours
podman exec crowdsec cscli decisions add --ip 1.2.3.4 --duration 24h --reason "manual ban"

# Remove a ban
podman exec crowdsec cscli decisions delete --ip 1.2.3.4

# List installed collections (parsers + scenarios)
podman exec crowdsec cscli collections list

# Install a new collection (e.g., for Caddy)
podman exec crowdsec cscli collections install crowdsecurity/caddy

# Update hub (get latest scenarios and parsers)
podman exec crowdsec cscli hub update
podman exec crowdsec cscli hub upgrade

# Show metrics
podman exec crowdsec cscli metrics

# View parsed log lines for debugging
podman exec crowdsec cscli parsers inspect crowdsecurity/sshd-logs
```

---

## Step-CA (Internal Certificate Authority)

**Purpose:** Issues internal TLS certificates via ACME protocol. Configure Caddy and other services to use Step-CA for automatic cert provisioning on private domains — without trusting Let's Encrypt for internal services.

```yaml
# ~/step-ca/compose.yaml
services:
  step-ca:
    image: smallstep/step-ca
    ports:
      - 127.0.0.1:8443:8443
    volumes:
      - /home/user/stepca:/home/step:Z
    environment:
      DOCKER_STEPCA_INIT_NAME: Home Server CA
      DOCKER_STEPCA_INIT_DNS_NAMES: step-ca.home.local,localhost
      DOCKER_STEPCA_INIT_REMOTE_MANAGEMENT: true
    restart: unless-stopped
```

```bash
cd ~/step-ca && podman-compose up -d
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
# ~/infisical/compose.yaml
services:
  infisical:
    image: infisical/infisical:latest-postgres
    ports:
      - 127.0.0.1:8090:8080
    environment:
      ENCRYPTION_KEY: changeme-run-openssl-rand-hex-16
      AUTH_SECRET: changeme-run-openssl-rand-base64-32
      DB_CONNECTION_URI: postgresql://infisical:changeme@db:5432/infisical
      REDIS_URL: redis://redis:6379
      SITE_URL: https://secrets.home.local
      TELEMETRY_ENABLED: "false"
    depends_on: [db, redis]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: infisical
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: infisical
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/infisical && podman-compose up -d
```

**Common operations:**
```bash
# View logs
podman logs -f infisical

# Install the Infisical CLI on the host
curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.rpm.sh' | sudo bash
sudo dnf install infisical

# Login from the CLI
infisical login --domain https://secrets.home.local

# Pull secrets into a shell session
infisical run --projectId YOUR_PROJECT_ID -- env

# Export secrets to a .env file
infisical export --projectId YOUR_PROJECT_ID --format dotenv > .env
```

Access at `http://localhost:8090`. Create an account on first visit, then create a project and add secrets via the web UI or CLI.

**Caddy:**
```caddyfile
secrets.home.local { tls internal; reverse_proxy localhost:8090 }
```

---

## Passbolt (Team Password Manager)

**Purpose:** Open-source, end-to-end encrypted password manager built for teams. Unlike Vaultwarden (which is Bitwarden-compatible and individual-focused), Passbolt is designed around sharing — granular permissions per password, group-based sharing, and an audit log of who accessed what. Uses OpenPGP for encryption. Ideal for IT teams sharing infrastructure credentials.

```yaml
# ~/passbolt/compose.yml
services:
  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: passbolt
      MYSQL_USER: passbolt
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

  passbolt:
    image: passbolt/passbolt:latest-ce
    ports: ["127.0.0.1:8290:80", "127.0.0.1:8291:443"]
    environment:
      APP_FULL_BASE_URL: https://pass.home.local
      DATASOURCES_DEFAULT_HOST: db
      DATASOURCES_DEFAULT_USERNAME: passbolt
      DATASOURCES_DEFAULT_PASSWORD: changeme
      DATASOURCES_DEFAULT_DATABASE: passbolt
      EMAIL_DEFAULT_FROM: passbolt@home.local
      EMAIL_TRANSPORT_DEFAULT_HOST: localhost
      EMAIL_TRANSPORT_DEFAULT_PORT: 25
    volumes:
      - /home/user/passbolt/gpg:/etc/passbolt/gpg:Z
      - /home/user/passbolt/jwt:/etc/passbolt/jwt:Z
    depends_on: [db]
    command: ["/usr/bin/wait-for.sh", "-t", "0", "db:3306", "--", "/docker-entrypoint.sh"]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/passbolt && podman-compose up -d
```

**Create the first admin user:**
```bash
podman exec passbolt su -m -c \
  "/var/www/passbolt/bin/cake passbolt register_user \
   -u admin@home.local -f Admin -l User -r admin" \
  -s /bin/sh www-data
```

**Caddy:**
```caddyfile
pass.home.local { tls internal; reverse_proxy localhost:8290 }
```

---

## OpenBao (Secrets Management)

**Purpose:** The Linux Foundation's open-source fork of HashiCorp Vault. Stores and manages secrets, API keys, TLS certificates, and database credentials with fine-grained access control, audit logging, dynamic secret generation, and encryption-as-a-service. The right choice when Infisical's ENV-file model isn't granular enough — OpenBao treats every secret as an addressable path with its own policy.

```yaml
# ~/openbao/compose.yaml
services:
  openbao:
    image: quay.io/openbao/openbao:latest
    ports:
      - 127.0.0.1:8200:8200
    volumes:
      - /home/user/openbao/data:/openbao/data:Z
      - /home/user/openbao/config:/openbao/config:Z
    environment:
      VAULT_ADDR: http://0.0.0.0:8200
    cap_add:
      - IPC_LOCK
    command: server -config=/openbao/config/openbao.hcl
    restart: unless-stopped
```

```bash
cd ~/openbao && podman-compose up -d
```

**Minimal `openbao.hcl`:**
```hcl
storage "raft" {
  path    = "/openbao/data"
  node_id = "node1"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true  # Use TLS in production via Caddy
}

api_addr     = "http://localhost:8200"
cluster_addr = "https://localhost:8201"
ui           = true
```

**Initialise and unseal:**
```bash
export BAO_ADDR=http://localhost:8200

# Initialise (generates unseal keys + root token)
podman exec openbao bao operator init

# Unseal with 3 of the 5 generated keys
podman exec openbao bao operator unseal <key1>
podman exec openbao bao operator unseal <key2>
podman exec openbao bao operator unseal <key3>

# Login with root token
podman exec openbao bao login <root-token>

# Write and read a secret
podman exec openbao bao kv put secret/myapp db_password=changeme
podman exec openbao bao kv get secret/myapp
```

> Store the unseal keys and root token in a secure location — losing them means losing access to all stored secrets permanently.

**Caddy:**
```caddyfile
vault.home.local { tls internal; reverse_proxy localhost:8200 }
```

---

## Wazuh (SIEM & Threat Detection)

**Purpose:** Open-source Security Information and Event Management (SIEM) platform. Wazuh agents run on every server, collecting logs, monitoring file integrity, detecting rootkits, and scanning for vulnerabilities. The Wazuh server correlates events, applies detection rules, and generates alerts. OpenSearch and a Kibana-style dashboard visualise everything. A full-stack SOC-in-a-box for self-hosters who take security seriously.

```yaml
# ~/wazuh/compose.yml — use the official single-node compose
# wget https://packages.wazuh.com/4.x/docker/single-node.tar.gz
# tar -xvf single-node.tar.gz && cd single-node
# docker-compose -f generate-indexer-certs.yml run --rm generator
# docker-compose up -d

# Minimal single-node overview:
services:
  wazuh.manager:
    image: wazuh/wazuh-manager:4.13.1
    ports:
      - "127.0.0.1:55000:55000"  # API
      - "0.0.0.0:1514:1514/udp"  # Agent
      - "0.0.0.0:1515:1515"      # Enrollment
    volumes:
      - wazuh_api_configuration:/var/ossec/api/configuration
      - wazuh_etc:/var/ossec/etc
      - wazuh_logs:/var/ossec/logs
      - wazuh_queue:/var/ossec/queue
      - wazuh_var_multigroups:/var/ossec/var/multigroups
      - wazuh_integrations:/var/ossec/integrations
      - wazuh_active_response:/var/ossec/active-response/bin
      - wazuh_agentless:/var/ossec/agentless
      - wazuh_wodles:/var/ossec/wodles
      - filebeat_etc:/etc/filebeat
      - filebeat_var:/var/lib/filebeat
    restart: unless-stopped

  wazuh.indexer:
    image: wazuh/wazuh-indexer:4.13.1
    ports: ["127.0.0.1:9200:9200"]
    volumes:
      - wazuh-indexer-data:/var/lib/wazuh-indexer
    restart: unless-stopped

  wazuh.dashboard:
    image: wazuh/wazuh-dashboard:4.13.1
    ports: ["127.0.0.1:443:5601"]
    depends_on: [wazuh.indexer]
    restart: unless-stopped
```

```bash
cd ~/wazuh && podman-compose up -d
```

> The official `single-node` compose is the recommended deployment path — it handles certificate generation and service wiring. Download from `packages.wazuh.com`.

**Install agent on a monitored server:**
```bash
# On each server you want to monitor
sudo rpm --import https://packages.wazuh.com/key/GPG-KEY-WAZUH
sudo dnf install wazuh-agent
sudo WAZUH_MANAGER=wazuh.home.local \
  WAZUH_AGENT_NAME=myserver \
  systemctl enable --now wazuh-agent
```

**Firewall (for agent communication):**
```bash
sudo firewall-cmd --add-port=1514/udp --add-port=1515/tcp --permanent
sudo firewall-cmd --reload
```

---

## Greenbone (Vulnerability Scanner)

**Purpose:** Open-source vulnerability management. Greenbone Community Edition (OpenVAS) scans your hosts for known CVEs, misconfigurations, and exposed services, then produces prioritised reports. Run periodic scans of your home server and any other hosts on your network to catch vulnerabilities before attackers do.

```yaml
# ~/greenbone/compose.yml
services:
  vulnerability-tests:
    image: greenbone/vulnerability-tests
    volumes: [vt_data_vol:/mnt]
    restart: unless-stopped

  notus-data:
    image: greenbone/notus-data
    volumes: [notus_data_vol:/mnt]
    restart: unless-stopped

  nasl-data:
    image: greenbone/nasl-data
    volumes: [nasl_data_vol:/mnt]
    restart: unless-stopped

  redis-server:
    image: greenbone/redis-server
    volumes: [redis_socket_vol:/run/redis/]
    restart: unless-stopped

  pg-gvm:
    image: greenbone/pg-gvm:stable
    volumes: [psql_data_vol:/var/lib/postgresql, psql_socket_vol:/var/run/postgresql]
    restart: unless-stopped

  gvmd:
    image: greenbone/gvmd:stable
    volumes:
      - gvmd_data_vol:/var/lib/gvm
      - vt_data_vol:/var/lib/openvas/plugins
      - notus_data_vol:/var/lib/notus
      - psql_data_vol:/var/lib/postgresql
      - psql_socket_vol:/var/run/postgresql
      - gvmd_socket_vol:/run/gvmd
      - ospd_openvas_socket_vol:/run/ospd
    depends_on: [pg-gvm]
    restart: unless-stopped

  gsa:
    image: greenbone/gsa:stable
    ports: ["127.0.0.1:9392:80"]
    volumes: [gvmd_socket_vol:/run/gvmd]
    depends_on: [gvmd]
    restart: unless-stopped

  ospd-openvas:
    image: greenbone/ospd-openvas:stable
    cap_add: [NET_ADMIN, NET_RAW]
    volumes:
      - gpg_data_vol:/etc/openvas/gnupg
      - vt_data_vol:/var/lib/openvas/plugins
      - notus_data_vol:/var/lib/notus
      - ospd_openvas_socket_vol:/run/ospd
      - redis_socket_vol:/run/redis/
    restart: unless-stopped

volumes:
  vt_data_vol: {}
  notus_data_vol: {}
  nasl_data_vol: {}
  redis_socket_vol: {}
  psql_data_vol: {}
  psql_socket_vol: {}
  gvmd_data_vol: {}
  gvmd_socket_vol: {}
  ospd_openvas_socket_vol: {}
  gpg_data_vol: {}
```

```bash
cd ~/greenbone && podman-compose up -d
```

Access the dashboard at `http://localhost:9392`. On first run, create a scan target (your server's LAN IP), run a full and fast scan, and review the findings.

> Initial feed synchronisation takes 15–30 minutes. The container will show as loading until feeds are downloaded.

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

## Fail2ban (Intrusion Prevention)

**Purpose:** Monitors log files for repeated authentication failures and bans the source IP via firewall rules. Protects SSH, Caddy, Authelia, Vaultwarden, and any service that logs failed login attempts — automatically blocking brute-force attacks without manual intervention. Integrates with `firewalld` (used on Shani OS) natively.

```yaml
# ~/fail2ban/compose.yaml
services:
  fail2ban:
    image: crazymax/fail2ban:latest
    network_mode: host
    volumes:
      - /home/user/fail2ban/config:/data:Z
      - /var/log:/var/log:ro
      - /run/firewalld:/run/firewalld:Z
    environment:
      TZ: Asia/Kolkata
    cap_add:
      - NET_ADMIN
      - NET_RAW
    restart: unless-stopped
```

```bash
cd ~/fail2ban && podman-compose up -d
```

**Example jail config (`/home/user/fail2ban/config/jail.d/caddy.conf`):**
```ini
[caddy-auth]
enabled  = true
port     = http,https
filter   = caddy-auth
logpath  = /var/log/caddy/access.log
maxretry = 5
bantime  = 1h
findtime = 10m
action   = firewallcmd-rich-rules[actiontype=<multiport>]
```

**Useful commands:**
```bash
# List banned IPs
podman exec fail2ban fail2ban-client status caddy-auth

# Unban an IP
podman exec fail2ban fail2ban-client set caddy-auth unbanip 1.2.3.4

# Test a filter against a log file
podman exec fail2ban fail2ban-regex /var/log/caddy/access.log caddy-auth
```

> Fail2ban complements CrowdSec — CrowdSec uses community threat intelligence, Fail2ban reacts to your own logs. Run both for defence in depth.

---

## Trivy (Container & Code Security Scanner)

**Purpose:** Comprehensive vulnerability scanner for container images, filesystems, Git repositories, and Kubernetes manifests. Detects known CVEs in OS packages, language libraries (pip, npm, go, cargo), misconfigurations (Dockerfile, Terraform, Helm), and secrets accidentally committed to code. Run it in CI/CD pipelines to gate deployments on security findings.

```bash
# Pull and run Trivy as a one-shot scanner (no persistent container needed)
podman run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /home/user/trivy-cache:/root/.cache/trivy:Z \
  aquasec/trivy:latest image jellyfin/jellyfin:latest

# Scan a local filesystem or Git repo
podman run --rm \
  -v /home/user/myproject:/repo:ro,Z \
  -v /home/user/trivy-cache:/root/.cache/trivy:Z \
  aquasec/trivy:latest fs /repo

# Scan a running container's filesystem
podman run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /home/user/trivy-cache:/root/.cache/trivy:Z \
  aquasec/trivy:latest image --input jellyfin
```

**Run as a server for CI integration:**
```yaml
# ~/trivy-server/compose.yaml
services:
  trivy-server:
    image: aquasec/trivy:latest
    ports:
      - 127.0.0.1:4954:4954
    volumes:
      - /home/user/trivy-cache:/root/.cache/trivy:Z
    command: server --listen 0.0.0.0:4954
    restart: unless-stopped
```

```bash
cd ~/trivy-server && podman-compose up -d
```

Then scan from CI with: `trivy image --server http://trivy.home.local:4954 myapp:latest`

> Run Trivy as a weekly scheduled scan across all your container images to catch newly disclosed CVEs before attackers do. Pipe the JSON output to a Grafana dashboard or ntfy alert.

---

## Teleport (Zero-Trust Access Platform)

**Purpose:** Self-hosted zero-trust access platform for SSH, Kubernetes, databases, and web applications. Teleport replaces VPN + bastion host setups with identity-aware, audited access — every session is recorded, every login requires a certificate issued for a short TTL, and access can be conditioned on MFA, device trust, and role-based policies. The self-hosted alternative to HashiCorp Boundary or commercial PAM solutions.

```yaml
# ~/teleport/compose.yml
services:
  teleport:
    image: public.ecr.aws/gravitational/teleport:latest
    ports:
      - "0.0.0.0:3023:3023"   # SSH proxy
      - "0.0.0.0:3024:3024"   # SSH tunnel
      - "0.0.0.0:3025:3025"   # Auth server
      - "0.0.0.0:3080:3080"   # HTTPS Web UI + API
    volumes:
      - /home/user/teleport/config:/etc/teleport:Z
      - /home/user/teleport/data:/var/lib/teleport:Z
    command: teleport start --config=/etc/teleport/teleport.yaml
    restart: unless-stopped
```

```bash
cd ~/teleport && podman-compose up -d
```

**Generate initial config:**
```bash
podman run --rm \
  -v /home/user/teleport/config:/etc/teleport:Z \
  public.ecr.aws/gravitational/teleport:latest \
  teleport configure \
    --cluster-name=home.example.com \
    --public-addr=teleport.example.com:3080 \
    --data-dir=/var/lib/teleport \
    -o /etc/teleport/teleport.yaml
```

**Minimal `teleport.yaml`:**
```yaml
teleport:
  data_dir: /var/lib/teleport
  log:
    output: stderr
    severity: INFO

auth_service:
  enabled: true
  cluster_name: home.example.com
  listen_addr: 0.0.0.0:3025
  tokens:
    - "node:your-join-token"

ssh_service:
  enabled: true
  listen_addr: 0.0.0.0:3022

proxy_service:
  enabled: true
  listen_addr: 0.0.0.0:3023
  web_listen_addr: 0.0.0.0:3080
  public_addr: teleport.example.com:3080
  https_cert: /etc/teleport/certs/fullchain.pem
  https_key: /etc/teleport/certs/privkey.pem
```

**Create the first admin user:**
```bash
podman exec teleport tctl users add admin --roles=editor,access --logins=root,user
# Follow the invite URL printed to set a password and enrol MFA
```

**Add a server node (install Teleport agent on target host):**
```bash
# On the target server
curl https://goteleport.com/static/install.sh | bash
teleport node configure \
  --auth-server=teleport.example.com:3025 \
  --token=your-join-token \
  --output=/etc/teleport.yaml
systemctl enable --now teleport
```

**Connect via `tsh` (Teleport shell client):**
```bash
# Login
tsh login --proxy=teleport.example.com:3080 --user=admin

# List registered nodes
tsh ls

# SSH to a registered node
tsh ssh root@my-server

# Forward a database port
tsh db connect my-postgres

# Session is recorded and viewable in the web UI
```

**Firewall:**
```bash
sudo firewall-cmd --add-port=3023-3025/tcp --add-port=3080/tcp --permanent
sudo firewall-cmd --reload
```

> For homelab use, Teleport Community Edition is free and covers SSH access, session recording, and web application proxy. Run it on a small public VPS (not on your home server) so it stays reachable even if your home connection goes down.

---

## Coraza WAF (Embedded WAF for Caddy)

**Purpose:** OWASP-compliant Web Application Firewall embedded directly in Caddy as a plugin. Runs the OWASP Core Rule Set (CRS) — the industry-standard ruleset that blocks SQL injection, XSS, command injection, path traversal, and hundreds of other attack classes — without an extra reverse proxy hop. Coraza is the modern, Go-native successor to ModSecurity and the recommended WAF for Shani OS because it integrates with the Caddy you are already running.

**Build a Caddy image with Coraza:**
```bash
podman build -t caddy-coraza - << 'EOF'
FROM caddy:builder AS builder
RUN xcaddy build \
    --with github.com/corazawaf/coraza-caddy/v2

FROM caddy:latest
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
EOF
```

**Download the OWASP CRS ruleset:**
```bash
mkdir -p /home/user/caddy/waf/crs
curl -L https://github.com/coreruleset/coreruleset/archive/refs/tags/v4.7.0.tar.gz \
  | tar -xz -C /home/user/caddy/waf/crs --strip-components=1
```

**Run the custom Caddy image:**
```yaml
# ~/caddy/compose.yaml
services:
  caddy:
    image: caddy-coraza
    ports:
      - 80:80
      - 443:443
    volumes:
      - /home/user/caddy/Caddyfile:/etc/caddy/Caddyfile:ro,Z
      - /home/user/caddy/data:/data:Z
      - /home/user/caddy/config:/config:Z
      - /home/user/caddy/waf:/etc/coraza-waf:Z
    restart: unless-stopped
```

```bash
cd ~/caddy && podman-compose up -d
```

**Caddyfile with WAF enabled for a specific service:**
```caddyfile
{
  order coraza_waf first
}

app.example.com {
  coraza_waf {
    load_owasp_crs
    directives `
      Include /etc/coraza-waf/crs/crs-setup.conf.example
      Include /etc/coraza-waf/crs/rules/*.conf
      SecRuleEngine On
      SecRequestBodyAccess On
      SecResponseBodyAccess On
      SecAuditEngine RelevantOnly
      SecAuditLog /var/log/caddy/coraza-audit.log
      SecAuditLogFormat JSON
      SecDefaultAction "phase:2,log,auditlog,deny,status:403"
    `
  }
  reverse_proxy localhost:8080
}
```

**Tune detection sensitivity** — start at paranoia level 1 and raise gradually after reviewing false positives:
```
# In crs-setup.conf.example — set the paranoia level
SecAction "id:900000,phase:1,nolog,pass,t:none,setvar:tx.paranoia_level=1"
```

**Suppress a rule causing false positives:**
```
SecRuleRemoveById 941100         # Remove a specific rule by ID
SecRuleRemoveByTag "attack-sqli" # Remove all SQLi rules
```

> Set `SecRuleEngine DetectionOnly` while tuning — this logs violations without blocking, so you can identify false positives before going live. Switch to `SecRuleEngine On` once stable.

---

## SafeLine WAF (Standalone WAF with Web UI)

**Purpose:** Self-contained WAF with a polished dashboard, sitting in front of your apps as its own reverse proxy. Built on nginx with a semantic detection engine. Easier to configure than Coraza for users who prefer a GUI. Use it when you want WAF + reverse proxy in one product rather than Coraza embedded in Caddy.

```yaml
# ~/safeline/compose.yml
services:
  safeline-mgt:
    image: chaitin/safeline-mgt:latest
    ports: ["127.0.0.1:9443:1443"]
    environment:
      MGT_PG: "host=safeline-pg port=5432 user=safeline password=changeme dbname=safeline_mgt sslmode=disable"
      DISABLE_SIGNUP: "true"
    volumes:
      - /home/user/safeline/resources:/resources:Z
      - /home/user/safeline/logs:/logs:Z
      - /home/user/safeline/nginx:/etc/nginx:Z
    depends_on: [safeline-pg]
    restart: unless-stopped

  safeline-tengine:
    image: chaitin/safeline-tengine:latest
    ports:
      - "0.0.0.0:80:80"
      - "0.0.0.0:443:443"
    environment:
      TCD_MGT_API: https://safeline-mgt:1443
    volumes:
      - /home/user/safeline/resources:/resources:Z
      - /home/user/safeline/logs:/logs:Z
      - /home/user/safeline/nginx:/etc/nginx:Z
    depends_on: [safeline-mgt]
    restart: unless-stopped

  safeline-detector:
    image: chaitin/safeline-detector:latest
    volumes:
      - /home/user/safeline/resources:/resources:Z
      - /home/user/safeline/logs/detector:/logs/detector:Z
    restart: unless-stopped

  safeline-pg:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: safeline
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: safeline_mgt
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/safeline && podman-compose up -d
```

Access the admin UI at `https://localhost:9443`. Add your upstream services as protected sites and configure detection sensitivity per service.

---

## Suricata (Network IDS/IPS)

**Purpose:** High-performance Network Intrusion Detection and Prevention System (IDS/IPS). Suricata inspects raw network traffic using the Emerging Threats and ETPRO rule sets to detect port scans, exploit attempts, C2 beaconing, DNS tunnelling, and malware traffic patterns — not just failed logins like Fail2ban and CrowdSec, but actual wire-level attack signatures. In IPS mode it drops malicious packets before they reach your services. In IDS mode it logs and alerts without blocking, which is safer to start with.

```yaml
# ~/suricata/compose.yaml
services:
  suricata:
    image: jasonish/suricata:latest
    network_mode: host
    volumes:
      - /home/user/suricata/config:/etc/suricata:Z
      - /home/user/suricata/logs:/var/log/suricata:Z
      - /home/user/suricata/rules:/var/lib/suricata/rules:Z
    environment:
      SURICATA_OPTIONS: -i eth0
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_NICE
    restart: unless-stopped
```

```bash
cd ~/suricata && podman-compose up -d
```

> Replace `eth0` with your primary interface (`ip link show`). `--network host` is required to see actual traffic.

**Update rules (Emerging Threats Open — free):**
```bash
podman exec suricata suricata-update update-sources
podman exec suricata suricata-update enable-source et/open
podman exec suricata suricata-update
podman exec suricata kill -USR2 1  # Reload rules live
```

**Minimal `suricata.yaml` additions for homelab:**
```yaml
# /home/user/suricata/config/suricata.yaml
outputs:
  - eve-log:
      enabled: yes
      filename: /var/log/suricata/eve.json
      types:
        - alert
        - dns
        - http
        - tls

af-packet:
  - interface: eth0
    threads: auto
    cluster-id: 99
    cluster-type: cluster_flow
    defrag: yes

# IDS mode (detection only — safe to start)
# For IPS mode, switch to nfqueue and set drop policy
detect:
  profile: medium
  custom-values:
    toclient-groups: 3
    toserver-groups: 25
```

**Forward alerts to CrowdSec or ntfy:**
```bash
# Watch eve.json and forward critical alerts to ntfy
tail -f /home/user/suricata/logs/eve.json | \
  jq -c 'select(.event_type=="alert" and .alert.severity==1)' | \
  while read -r line; do
    curl -s -d "Suricata alert: $(echo $line | jq -r '.alert.signature')" \
      http://localhost:8090/suricata-alerts
  done
```

> Pair Suricata (network-level IDS) with Wazuh (host-level SIEM) and CrowdSec (IP reputation + blocking) for layered defence. Suricata sees what's happening on the wire; Wazuh sees what's happening inside your hosts.

---

## osquery (Host Intrusion Detection & Visibility)

**Purpose:** Exposes your operating system as a relational database — you query running processes, network connections, installed packages, file integrity, users, cron jobs, kernel modules, and hardware as SQL tables. Use it for host-based intrusion detection, compliance checking, and forensics. Integrates with Wazuh, Kolide Fleet, and Grafana for continuous monitoring.

```bash
# Install osquery on the host (not containerised — needs host kernel access)
sudo dnf install osquery

sudo systemctl enable --now osqueryd
```

**Useful osquery queries:**
```sql
-- All processes listening on network ports
SELECT pid, name, port, protocol FROM listening_ports
JOIN processes USING (pid);

-- Unusual cron jobs (not from system paths)
SELECT command, path FROM crontab
WHERE path NOT LIKE '/etc/%';

-- SUID binaries (privilege escalation risk)
SELECT path, permissions FROM file
WHERE path LIKE '/usr/%' AND permissions LIKE '%s%';

-- Recently modified files in /etc
SELECT path, mtime FROM file
WHERE path LIKE '/etc/%'
AND mtime > (SELECT strftime('%s','now','-1 day'));

-- Active network connections to non-LAN IPs
SELECT pid, name, remote_address, remote_port
FROM process_open_sockets
JOIN processes USING (pid)
WHERE remote_address NOT LIKE '192.168.%'
AND remote_address NOT LIKE '127.%'
AND remote_address != '';
```

**Configure continuous monitoring via `osquery.conf`:**
```json
{
  "schedule": {
    "listening_ports": {
      "query": "SELECT pid, name, port FROM listening_ports JOIN processes USING (pid);",
      "interval": 60
    },
    "new_suid_binaries": {
      "query": "SELECT path FROM file WHERE path LIKE '/usr/%' AND permissions LIKE '%s%';",
      "interval": 3600
    }
  },
  "file_paths": {
    "system_binaries": ["/usr/bin/%%", "/usr/sbin/%%"],
    "config_files": ["/etc/%%"]
  }
}
```

> Results from scheduled queries are written to `/var/log/osquery/osqueryd.results.log`. Feed this to Loki (via Grafana Alloy) or Wazuh for centralised alerting.

---

## OWASP ZAP (Web Application Scanner)

**Purpose:** OWASP's flagship dynamic application security testing (DAST) tool. ZAP proxies traffic between your browser and your apps, passively analysing every request, and can actively probe for SQLi, XSS, SSRF, broken auth, insecure redirects, and 100+ other vulnerabilities. Use it to audit your self-hosted services before exposing them publicly, and in CI/CD pipelines to catch regressions.

# Run as a daemon with REST API
```yaml
# ~/zap/compose.yaml
services:
  zap:
    image: ghcr.io/zaproxy/zaproxy:stable
    ports:
      - 127.0.0.1:8088:8080
    volumes:
      - /home/user/zap:/zap/wrk:Z
    command: >
      zap.sh -daemon -port 8080 -host 0.0.0.0
      -config api.addrs.addr.name=.*
      -config api.addrs.addr.regex=true
      -config api.key=changeme
    restart: unless-stopped
```

```bash
cd ~/zap && podman-compose up -d
```

**Scan types:**
```bash
# Baseline scan — passive only, safe to run against production
podman run --rm \
  -v /home/user/zap/reports:/zap/wrk:Z \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t https://app.home.local \
    -r /zap/wrk/baseline-report.html

# Full active scan — probes for vulnerabilities, run against test/staging only
podman run --rm \
  -v /home/user/zap/reports:/zap/wrk:Z \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-full-scan.py -t https://app.home.local \
    -r /zap/wrk/full-report.html

# API scan — OpenAPI/Swagger-aware
podman run --rm \
  -v /home/user/zap/reports:/zap/wrk:Z \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-api-scan.py -t https://app.home.local/openapi.json \
    -f openapi -r /zap/wrk/api-report.html
```

> Run baseline scans in CI/CD on every deployment to staging. Reserve full active scans for dedicated security review cycles — they generate significant traffic and may disrupt services.

---

## Nuclei (Fast CVE & Misconfiguration Scanner)

**Purpose:** Template-based vulnerability scanner from ProjectDiscovery. Fires targeted HTTP/TCP/DNS probes from a large community library of templates covering known CVEs, exposed admin panels, default credentials, misconfigured headers, and OWASP Top 10 findings. Faster and broader than ZAP for sweeping many services — complement ZAP (deep single-app analysis) with Nuclei (wide multi-service sweeping).

```bash
# Update templates and scan a target
podman run --rm \
  -v /home/user/nuclei/templates:/root/nuclei-templates:Z \
  -v /home/user/nuclei/output:/output:Z \
  projectdiscovery/nuclei:latest \
  -u https://app.home.local \
  -severity critical,high,medium \
  -o /output/scan.json -json \
  -update-templates

# Scan all your services from a target list
podman run --rm \
  -v /home/user/nuclei/templates:/root/nuclei-templates:Z \
  -v /home/user/nuclei/output:/output:Z \
  -v /home/user/nuclei/targets.txt:/targets.txt:ro \
  projectdiscovery/nuclei:latest \
  -l /targets.txt \
  -t /root/nuclei-templates/http/ \
  -o /output/results.json -json
```

**Useful template categories:**
```bash
-t /root/nuclei-templates/http/cves/              # Known CVEs by number
-t /root/nuclei-templates/http/exposures/         # Exposed files and admin panels
-t /root/nuclei-templates/http/misconfiguration/  # Security misconfigurations
-t /root/nuclei-templates/http/default-logins/    # Default credentials
-t /root/nuclei-templates/http/technologies/      # Technology fingerprinting
```

> Schedule a weekly Nuclei sweep across all exposed services with a systemd timer and pipe the JSON output to ntfy for critical/high findings. Keep a `targets.txt` file with every Caddy subdomain you expose.

---

---

## SOPS (Secrets in Git)

**Purpose:** Encrypt secrets stored in YAML, JSON, ENV, and INI files so they can be safely committed to Git. Works with Age keys (recommended for self-hosting) or GPG. The practical complement to Infisical for GitOps workflows — your compose `.env` files and Kubernetes manifests stay in version control but remain encrypted at rest. Only the authorised key can decrypt them.

**Install SOPS and Age:**
```bash
# Install SOPS
sudo wget -O /usr/local/bin/sops \
  https://github.com/getsops/sops/releases/latest/download/sops-v3.9.5.linux.amd64
sudo chmod +x /usr/local/bin/sops

# Install Age
sudo pacman -S age    # Arch / Shani OS
# or: sudo apt install age
```

**Generate an Age key pair:**
```bash
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt
# Outputs: public key  age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Configure SOPS to use your Age key (project-level `.sops.yaml`):**
```yaml
# .sops.yaml — commit this file to your repo root
creation_rules:
  - path_regex: .*\.enc\.yaml$
    age: age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  - path_regex: .*\.env\.enc$
    age: age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Encrypt and decrypt secrets:**
```bash
# Encrypt a .env file
sops --encrypt .env > .env.enc
# .env.enc is safe to commit; .env stays in .gitignore

# Edit encrypted file in-place (decrypts, opens $EDITOR, re-encrypts on save)
sops .env.enc

# Decrypt to stdout for use in scripts
sops --decrypt .env.enc

# Decrypt to a file (e.g. before podman-compose)
sops --decrypt .env.enc > .env && podman-compose up -d && rm .env
```

**Encrypt only specific keys in a YAML file:**
```yaml
# secrets.yaml (before encryption)
db_password: mysecretpassword
db_host: localhost          # not secret — encrypt selectively
```
```bash
# Encrypt only db_password, leave db_host in plaintext
sops --encrypt --encrypted-regex '^db_password$' secrets.yaml > secrets.enc.yaml
```

**Use in CI/CD (Woodpecker / Forgejo Actions):**
```yaml
# .woodpecker.yml
steps:
  deploy:
    image: alpine
    secrets: [SOPS_AGE_KEY]   # inject Age private key as CI secret
    commands:
      - apk add sops age
      - export SOPS_AGE_KEY_FILE=/dev/stdin <<< "$SOPS_AGE_KEY"
      - sops --decrypt .env.enc > .env
      - podman-compose up -d
```

> ⚠️ **Key backup:** Your Age private key (`~/.config/sops/age/keys.txt`) is the only way to decrypt your secrets. Back it up to an offline location (password manager, encrypted USB). If you lose it, all SOPS-encrypted files are permanently unrecoverable.

---

## Semgrep CE (Static Analysis / SAST)

**Purpose:** Open-source static application security testing (SAST) tool. Scans source code for security bugs, vulnerable patterns, and misconfigurations using a large library of community rules. Runs in CI pipelines alongside Trivy (container scanning) and ZAP (dynamic scanning) to catch issues at the code level before they ship. Supports 30+ languages — Python, JavaScript, Go, Java, Ruby, PHP, and more.

```bash
# Run as a one-shot scanner — no persistent container needed
podman run --rm \
  -v /home/user/myproject:/src:ro,Z \
  returntocorp/semgrep:latest \
  semgrep scan \
    --config=auto \
    --sarif \
    --output /src/semgrep-results.sarif \
    /src
```

**Run in Woodpecker / Forgejo Actions CI:**
```yaml
# .forgejo/workflows/security.yml
steps:
  - name: semgrep
    image: returntocorp/semgrep:latest
    commands:
      - semgrep scan --config=auto --error .
```

**Scan with a specific ruleset:**
```bash
# OWASP top-10 rules
podman run --rm -v $(pwd):/src:ro,Z returntocorp/semgrep:latest \
  semgrep scan --config=p/owasp-top-ten /src

# Secrets detection
podman run --rm -v $(pwd):/src:ro,Z returntocorp/semgrep:latest \
  semgrep scan --config=p/secrets /src
```

> Semgrep CE is the open-source core. The cloud Semgrep platform adds cross-file analysis and a UI, but the CLI tool produces actionable results entirely offline. Feed SARIF output into Defect Dojo (below) to triage findings centrally.

---

## Defect Dojo (Vulnerability Management)

**Purpose:** Centralised vulnerability management platform. Aggregates security findings from Trivy, Semgrep, OWASP ZAP, Nuclei, Greenbone, and other scanners into one triage dashboard with deduplication, risk scoring, SLA tracking, and JIRA/Slack integration. The self-hosted alternative to paying for a dedicated AppSec platform.

```yaml
# ~/defectdojo/compose.yaml
services:
  django:
    image: defectdojo/defectdojo-django:latest
    ports:
      - 127.0.0.1:8080:8080
    environment:
      DD_DATABASE_URL: postgresql://defectdojo:changeme@postgres:5432/defectdojo
      DD_SECRET_KEY: changeme-run-openssl-rand-base64-42
      DD_CREDENTIAL_AES_256_KEY: changeme-16chars
      DD_ALLOWED_HOSTS: defectdojo.home.local
      DD_CELERY_BROKER_URL: redis://redis:6379/0
      DD_SOCIAL_AUTH_KEYCLOAK_ENABLED: "False"
    volumes:
      - /home/user/defectdojo/media:/app/media:Z
    depends_on: [postgres, redis]
    restart: unless-stopped

  celeryworker:
    image: defectdojo/defectdojo-django:latest
    command: /entrypoint-celery-worker.sh
    environment:
      DD_DATABASE_URL: postgresql://defectdojo:changeme@postgres:5432/defectdojo
      DD_SECRET_KEY: changeme-run-openssl-rand-base64-42
      DD_CELERY_BROKER_URL: redis://redis:6379/0
    depends_on: [postgres, redis]
    restart: unless-stopped

  nginx:
    image: defectdojo/defectdojo-nginx:latest
    ports:
      - 127.0.0.1:8081:8080
    depends_on: [django]
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: defectdojo
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: defectdojo
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/defectdojo && podman-compose up -d
```

**Initialise the database (first run):**
```bash
podman-compose run --rm django bash -c "python manage.py migrate && python manage.py createsuperuser"
```

Access at `http://localhost:8081`. Create a Product, then import scanner results under Findings → Import Scan Results — select the scanner type (Trivy, Semgrep SARIF, ZAP XML, Nuclei JSON) and upload the output file.

**Caddy:**
```caddyfile
defectdojo.home.local { tls internal; reverse_proxy localhost:8081 }
```

---

## Caddy Configuration

```caddyfile
secrets.home.local    { tls internal; reverse_proxy localhost:8090 }
trivy.home.local      { tls internal; reverse_proxy localhost:4954 }
teleport.example.com  { reverse_proxy localhost:3080 }
zap.home.local        { tls internal; reverse_proxy localhost:8088 }
safeline.home.local   { tls internal; reverse_proxy localhost:9443 }
```

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
| Passbolt blank after first load | Ensure `APP_FULL_BASE_URL` includes `https://` and matches your Caddy domain exactly |
| Teleport node not joining | Verify the join token matches exactly and hasn't expired; check port `3025/tcp` is reachable from the node |
| Teleport SSH connection refused | Ensure the Teleport agent is running on the target node (`systemctl status teleport`); check `tsh ls` shows the node as online |
| Passbolt GPG key error | The `/etc/passbolt/gpg` volume must be writable; Passbolt generates its server key on first boot |
| OpenBao sealed after restart | OpenBao must be manually unsealed after every restart; automate with a startup script using stored unseal keys in a secure location |
| OpenBao `permission denied` | Each path requires an explicit policy; run `bao policy write myapp-policy policy.hcl` to grant access |
| Wazuh agent not connecting | Verify port `1514/udp` and `1515/tcp` are open; check `WAZUH_MANAGER` env var points at the correct host |
| Wazuh dashboard blank | Feed sync takes 15–30 min after first boot; check `podman logs wazuh.manager` for sync progress |
| Greenbone scan shows no results | Wait for VT feed sync to complete (check `podman logs gvmd`); ensure the scan target IP is reachable |
| Greenbone `ospd not running` | The `ospd-openvas` container needs `NET_ADMIN` and `NET_RAW` capabilities; verify they are in the compose file |
| Fail2ban not banning IPs | Confirm `cap-add NET_ADMIN` and `NET_RAW` are set; verify the log path inside the container matches the volume mount; test the filter with `fail2ban-regex` |
| Fail2ban banning legitimate users | Whitelist trusted IPs in `jail.d/` with `ignoreip = 127.0.0.1/8 192.168.1.0/24 100.64.0.0/10` (last range covers Tailscale) |
| Trivy CVE database stale | The database auto-updates on each scan run; for the server mode, restart the container to force a refresh or set `--cache-ttl 1h` |
| Trivy scan very slow on first run | The first run downloads the full vulnerability database (~200 MB); subsequent runs use the cache mounted at `/root/.cache/trivy` |
| Coraza WAF blocking legitimate requests | Switch to `SecRuleEngine DetectionOnly`, review the audit log at `/var/log/caddy/coraza-audit.log`, suppress false positives with `SecRuleRemoveById`, then re-enable blocking |
| Coraza Caddy build fails | Ensure the host has Go and `xcaddy` in the builder stage; verify the Coraza plugin version is compatible with the Caddy version |
| SafeLine detector not starting | Check `podman logs safeline-detector` for shared memory errors; add `--shm-size 256m` to the container if needed; verify the `/resources` volume is writable |
| Suricata not detecting traffic | Verify `--network host` is set and the correct interface name is used (`ip link show`); confirm `af-packet` interface in `suricata.yaml` matches |
| Suricata rules not updating | Check internet access from the container; run `suricata-update list-sources` to confirm the source is registered; verify `/var/lib/suricata/rules` is writable |
| osquery not starting | Confirm `osqueryd` is enabled (`systemctl status osqueryd`); check `/var/log/osquery/osqueryd.ERROR` for config parse errors |
| osquery queries return no rows | Some tables require root or specific capabilities; run `sudo osqueryi` to test interactively |
| ZAP scan returns no findings | Ensure the target is reachable from within the container; for internal services use `--network host`; verify the API key matches |
| Nuclei templates out of date | Add `-update-templates` flag to the scan command, or run `nuclei -update-templates` explicitly before scanning |
| SOPS `age: no identity found` | Ensure `SOPS_AGE_KEY_FILE` points to your Age private key file, or set `SOPS_AGE_KEY` env var with the key contents |
| SOPS decrypt fails with `mac check failed` | The encrypted file was modified outside SOPS (e.g. a Git merge conflict marker was introduced); restore the original encrypted file from Git history |

> 🔒 **Security checklist:**
> - Disable Vaultwarden signups after creating your account
> - Rotate the Vaultwarden `ADMIN_TOKEN` after initial setup
> - Back up `/home/user/vaultwarden/data` daily — losing your password vault is catastrophic
> - Use Authelia or Authentik in front of any service exposed via Cloudflare Tunnel or Pangolin
> - Keep Fail2ban active and configured to watch Caddy logs
> - Review CrowdSec decisions weekly to catch false positives before they affect real users
> - Run a Nuclei sweep weekly across all exposed subdomains; schedule it via a systemd timer
> - Run a ZAP baseline scan before making any service publicly accessible
> - Start Suricata in IDS (detection-only) mode before switching to IPS (blocking) mode
> - Run `osquery` on every server and feed results to Wazuh or Loki for centralised host visibility
