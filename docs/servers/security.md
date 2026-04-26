---
title: Security & Identity
section: Self-Hosting & Servers
updated: 2026-04-22
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.


# Security & Identity

Password management, identity providers, secrets management, and threat detection.

> All services in this section require HTTPS to function correctly. Use Caddy (`tls internal` for private access, Let's Encrypt for public). Never expose security-sensitive services over plain HTTP.

---

## Job-Ready Concepts

### Security Interview Essentials

**Zero Trust principles:** "Never trust, always verify." Traditional perimeter security trusts anything inside the network. Zero trust verifies every request regardless of source — inside or outside the network — using identity, device posture, and minimal-privilege access. Implementation: mTLS between services, short-lived certificates (not long-lived API keys), device posture checks (is the OS patched?), least-privilege RBAC, and session recording for privileged access (Teleport).

**Principle of least privilege (PoLP):** Every user, process, and service gets only the permissions it needs — nothing more. In Kubernetes: ServiceAccounts with narrow Roles, not cluster-admin. In AWS: IAM roles scoped to specific S3 buckets and actions. In Linux: non-root containers, no `SYS_ADMIN` unless necessary. Violations are the root cause of most lateral movement after a breach.

**Defence in depth:** Multiple layers of security so that no single failure compromises the entire system. Example stack: WAF (Coraza) → reverse proxy authentication (Authelia) → network segmentation (NetworkPolicy) → container sandboxing (seccomp, AppArmor) → runtime detection (Falco) → SIEM (Wazuh). An attacker who defeats one layer still faces the next.

**OAuth2 flows — which to use when:**
- **Authorization Code + PKCE** — for web and mobile apps where a user logs in. The current gold standard. PKCE prevents code interception.
- **Client Credentials** — for machine-to-machine (service-to-service). No user involved. Use for CI/CD tokens and API-to-API calls.
- **Device Code** — for CLI tools and devices without a browser (headless servers, smart TVs).
- **Implicit flow** — deprecated. Do not use.

**JWT structure and common mistakes:**
A JWT has three base64url-encoded parts: `header.payload.signature`. The header declares the algorithm; the payload contains claims (sub, exp, iat, scopes); the signature verifies integrity. Common mistakes: (1) accepting `alg: none` — always reject this; (2) not verifying `exp` — always check expiry; (3) putting sensitive data in the payload — it's encoded, not encrypted (anyone can read it with base64 decode); (4) not rotating signing keys.

**OWASP Top 10 in one line each (for interviews):**
A01 Broken Access Control: users can access data/actions they shouldn't (IDOR, privilege escalation). A02 Cryptographic Failures: sensitive data exposed due to weak/missing encryption. A03 Injection: user input interpreted as code (SQL, command). A04 Insecure Design: security not considered in architecture. A05 Security Misconfiguration: default credentials, unnecessary services. A06 Vulnerable Components: outdated dependencies with CVEs. A07 Auth Failures: weak passwords, no MFA, session fixation. A08 Software Integrity: unsigned updates, compromised CI/CD pipeline. A09 Logging Failures: breaches go undetected. A10 SSRF: server fetches attacker-controlled URLs.

**Hash functions vs encryption vs encoding:**
- **Encoding** (base64, hex) — reversible transformation, no key, provides no security — just a format change
- **Hashing** (SHA-256, bcrypt) — one-way, no key; used for integrity checks and password storage; bcrypt adds a work factor (slow by design)
- **Symmetric encryption** (AES-256-GCM) — reversible with the same key; fast; used for data at rest
- **Asymmetric encryption** (RSA, ECDSA) — public key encrypts/verifies, private key decrypts/signs; used for TLS, JWT signing, SSH keys

**Supply chain security basics:** Three vectors to understand: (1) Source — code in your repo (Semgrep SAST, secret scanning). (2) Build — CI pipeline integrity (Tekton Chains SLSA provenance, cosign signing). (3) Dependency — third-party packages and base images (Trivy, Grype, Renovate, Dependency-Track). The 2020 SolarWinds attack and 2021 Log4Shell are canonical examples of each vector.

**Secrets management anti-patterns:**
- Hardcoded secrets in source code (most common, caught by Semgrep `p/secrets`)
- Secrets in environment variables that get printed to logs
- Long-lived API keys that never rotate
- Sharing credentials across environments (staging DB password = prod DB password)
- Secrets in Kubernetes manifests committed to Git without encryption (use SOPS + age or Sealed Secrets)

**Vulnerability severity levels (CVSS):** CVSS (Common Vulnerability Scoring System) scores 0–10. Critical 9.0–10.0, High 7.0–8.9, Medium 4.0–6.9, Low 0.1–3.9. For triaging: fix Criticals within 24h, Highs within 7 days. Tools (Trivy, Grype, Nuclei) report these severities. In Defect Dojo you set SLA targets per severity.


**Identity provider architecture — LDAP vs OIDC vs SAML:** Three generations of identity federation. LDAP (Lightweight Directory Access Protocol) is the enterprise standard for directory services — Active Directory is LDAP. Applications authenticate by doing a bind to the LDAP server. OIDC (OpenID Connect) is the modern web standard, built on OAuth2 — applications redirect users to an IdP (Authentik, Keycloak), receive a JWT, and verify it locally. SAML is the enterprise web SSO standard (older than OIDC, XML-based) — you'll encounter it when integrating with corporate SSO. Most modern self-hosted apps support OIDC; legacy apps often only support LDAP. Authentik and Keycloak speak all three.

**Certificate lifecycle management:** Certificates expire. Expired certificates cause outages. step-ca and cert-manager automate issuance and renewal — but you still need to understand the concepts. A CA (Certificate Authority) signs certificates with its private key. Clients trust certificates signed by CAs in their trust store. Short-lived certificates (24h–7 days, used by Teleport and service meshes) are more secure than long-lived ones (1 year) because there's less window for a compromised cert to be misused. Intermediate CAs (step-ca creates one automatically) limit blast radius if the root key is compromised.

**SIEM, SOC, and log correlation:** A SIEM (Security Information and Event Management system — Wazuh, Elastic SIEM) collects logs from all sources, normalises them, and applies correlation rules to detect attack patterns. A single failed SSH login is noise; 1000 failed logins from one IP in 10 seconds is a brute-force attempt. SIEM rules encode this logic. A SOC (Security Operations Centre) is the team that watches the SIEM. For self-hosters: Wazuh agents on every host, log forwarding from containers, and alerting to a notification channel gives you >80% of enterprise SOC capability.

**Container and Kubernetes hardening checklist:** The most common misconfigurations, in order of frequency: (1) running as root (`runAsNonRoot: true` fixes this), (2) `hostPID: true` / `hostNetwork: true` (gives container access to host namespaces — almost never needed), (3) `privileged: true` (full host access — equivalent to root on the node), (4) no seccomp profile (allows all ~300+ syscalls — use `RuntimeDefault`), (5) writable root filesystem (`readOnlyRootFilesystem: true` limits malware persistence), (6) no resource limits (a compromised container can consume all host resources).

**Vulnerability management workflow:** Scanning finds vulnerabilities; management decides what to do with them. The workflow: scan (Trivy, Grype) → import to tracker (Defect Dojo) → triage by severity and exploitability → assign owner → fix (update dependency, apply patch, add WAF rule) → rescan to verify. Not all Criticals are equal: a Critical CVE in a library that's never called from your code path is lower priority than a High in your authentication path. Context matters. SLA targets (Critical: 24h, High: 7 days) provide an objective standard.

**Passkeys and WebAuthn — replacing passwords:** WebAuthn (the standard behind passkeys) uses public-key cryptography for authentication. The private key never leaves the device (stored in secure enclave or hardware key). Login: the server sends a challenge, the device signs it with the private key, the server verifies with the stored public key. This eliminates: phishing (the signature is bound to the origin domain), credential stuffing (no reusable password), and password database breaches (only public keys are stored). Pocket ID and Kanidm are purpose-built for passkey-only auth. Vaultwarden supports WebAuthn for 2FA.
---
---

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
# Install via Nix
nix-env -iA nixpkgs.crowdsec
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

**Trust the CA on this system:**
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

# Install the Infisical CLI on the host via Nix
nix-env -iA nixpkgs.infisical

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
# Option A: Install inside a Distrobox container (recommended on this system)
distrobox create --name wazuh-agent --image fedora:latest
distrobox enter wazuh-agent -- bash -c "
  sudo rpm --import https://packages.wazuh.com/key/GPG-KEY-WAZUH
  sudo dnf install -y wazuh-agent
"

# Option B: On a conventional Linux host (not Shani OS)
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

## LLDAP (Lightweight LDAP)

**Purpose:** Minimal LDAP server written in Rust, purpose-built for self-hosters who need a user directory without the complexity of OpenLDAP or Keycloak. LLDAP exposes just enough LDAP to satisfy apps that require it (Nextcloud, Authentik, Gitea, Authelia) and includes a clean web UI for managing users and groups. If you want SSO via Authentik or Authelia but need a proper user store they can federate against, LLDAP is the lightest way to provide one.

```yaml
# ~/lldap/compose.yaml
services:
  lldap:
    image: lldap/lldap:stable
    ports:
      - 127.0.0.1:3890:3890   # LDAP
      - 127.0.0.1:17170:17170 # Web UI
    volumes:
      - /home/user/lldap/data:/data:Z
    environment:
      TZ: Asia/Kolkata
      UID: "1000"
      GID: "1000"
      LLDAP_JWT_SECRET: changeme-run-openssl-rand-hex-32
      LLDAP_KEY_SEED: changeme-run-openssl-rand-hex-32
      LLDAP_LDAP_BASE_DN: dc=home,dc=local
      LLDAP_LDAP_USER_PASS: adminpassword
      LLDAP_LDAP_USER_EMAIL: admin@home.local
    restart: unless-stopped
```

```bash
cd ~/lldap && podman-compose up -d
```

Access the web UI at `http://localhost:17170`. Create users and groups via the dashboard.

**Connect Authelia to LLDAP:**
```yaml
# In Authelia configuration.yml
authentication_backend:
  ldap:
    implementation: custom
    url: ldap://host.containers.internal:3890
    base_dn: DC=home,DC=local
    username_attribute: uid
    additional_users_dn: OU=people
    users_filter: (&({username_attribute}={input})(objectclass=person))
    additional_groups_dn: OU=groups
    groups_filter: (member={dn})
    group_name_attribute: cn
    mail_attribute: mail
    display_name_attribute: displayName
    user: uid=admin,ou=people,dc=home,dc=local
    password: adminpassword
```

**Connect Nextcloud to LLDAP:**
```bash
podman exec nextcloud php occ app:enable user_ldap
podman exec nextcloud php occ ldap:set-config "" ldapHost host.containers.internal
podman exec nextcloud php occ ldap:set-config "" ldapPort 3890
podman exec nextcloud php occ ldap:set-config "" ldapBase dc=home,dc=local
podman exec nextcloud php occ ldap:set-config "" ldapAgentName uid=admin,ou=people,dc=home,dc=local
podman exec nextcloud php occ ldap:set-config "" ldapAgentPassword adminpassword
podman exec nextcloud php occ ldap:set-config "" ldapLoginFilter "(&(objectclass=person)(uid=%uid))"
podman exec nextcloud php occ ldap:test-config ""
```

**Caddy:**
```caddyfile
lldap.home.local { tls internal; reverse_proxy localhost:17170 }
```

---

## Pocket ID (Passkey-Only OIDC Provider)

**Purpose:** Ultra-minimal OIDC provider that uses **passkeys only** — no passwords, no TOTP, no email codes. Users register a passkey (Face ID, Touch ID, Windows Hello, hardware key) and that's their credential. If your goal is SSO for internal services and you want the simplest possible setup without running Keycloak or Authentik, Pocket ID is a single binary with a SQLite database. Supports any OIDC-compatible app.

```yaml
# ~/pocket-id/compose.yaml
services:
  pocket-id:
    image: ghcr.io/pocket-id/pocket-id:latest
    ports:
      - 127.0.0.1:1411:1411
    volumes:
      - /home/user/pocket-id/data:/app/data:Z
    environment:
      PUBLIC_APP_URL: https://auth.home.local
      TRUST_PROXY: "true"
    restart: unless-stopped
```

```bash
cd ~/pocket-id && podman-compose up -d
```

Access at `http://localhost:1411`. On first run, create the admin account by visiting `/admin/setup`. Add OIDC clients for each app you want to protect.

**Register a Gitea OIDC client:**

In Pocket ID Admin → OIDC Clients → Add:
- Callback URL: `https://git.home.local/user/oauth2/pocket-id/callback`

Then in Gitea Admin → Authentication Sources → Add OAuth2:
- Provider: OpenID Connect
- Discovery URL: `https://auth.home.local/.well-known/openid-configuration`

**Caddy:**
```caddyfile
auth.home.local { tls internal; reverse_proxy localhost:1411 }
```

> Pocket ID is the right choice when you want SSO for a small number of internal services, all users are trusted (family/team), and you want zero password management overhead. For external-facing or enterprise setups, use Authentik or Keycloak.

---

## Kanidm (Modern Rust Identity Server)

**Purpose:** Modern, opinionated identity management server built in Rust. Provides LDAP, RADIUS, OAuth2/OIDC, and SSH key management with strong security defaults — accounts auto-lock on repeated failures, credential compromise detection is built in, and everything is append-only for auditability. Enforces MFA and passkeys by default rather than making them optional.

```yaml
# ~/kanidm/compose.yaml
services:
  kanidm:
    image: kanidm/server:latest
    ports:
      - 127.0.0.1:8443:8443
      - 127.0.0.1:3636:3636   # LDAPS
    volumes:
      - /home/user/kanidm/data:/data:Z
      - /home/user/kanidm/server.toml:/data/server.toml:ro,Z
    restart: unless-stopped
```

**Minimal `server.toml`:**
```toml
bindaddress = "0.0.0.0:8443"
ldapbindaddress = "0.0.0.0:3636"
origin = "https://idm.home.local"
domain = "home.local"
db_path = "/data/kanidm.db"
tls_chain = "/data/chain.pem"
tls_key = "/data/key.pem"
log_level = "info"
```

```bash
cd ~/kanidm && podman-compose up -d

# Install Kanidm CLI via Nix
nix-env -iA nixpkgs.kanidm

# Log in as admin
kanidm login -D idm_admin -H https://localhost:8443

# Create a user and group
kanidm account create -D idm_admin myuser "My User" myuser@home.local
kanidm group create -D idm_admin homelab-users
kanidm group add-members -D idm_admin homelab-users myuser

# Create an OAuth2 client (e.g. Gitea)
kanidm system oauth2 create -D idm_admin gitea "Gitea" https://git.home.local/user/oauth2/kanidm/callback
kanidm system oauth2 show-basic-secret -D idm_admin gitea
```

**Caddy:**
```caddyfile
idm.home.local { tls internal; reverse_proxy localhost:8443 { transport http { tls_insecure_skip_verify } } }
```

---

## Syft + Grype (SBOM & Vulnerability Scanning)

**Purpose:** Syft generates a Software Bill of Materials (SBOM) — a complete inventory of every package, library, and binary in a container image or directory. Grype scans that SBOM against vulnerability databases (NVD, GitHub Advisory, OSV) to find known CVEs. The two-step Syft → Grype workflow is preferred when you want to store SBOMs as artefacts and scan them separately, or feed them to Dependency-Track for continuous monitoring.

```bash
# Install via Nix
nix-env -iA nixpkgs.syft nixpkgs.grype
```

**Generate an SBOM:**
```bash
# SBOM for a container image (CycloneDX JSON)
syft jellyfin/jellyfin:latest -o cyclonedx-json > jellyfin-sbom.cdx.json

# SBOM for a local directory
syft dir:/home/user/myapp -o spdx-json > myapp-sbom.spdx.json

# Quick package list (table format)
syft nginx:alpine -o table
```

**Scan for CVEs:**
```bash
# Scan an image directly
grype jellyfin/jellyfin:latest

# Scan a previously generated SBOM
grype sbom:jellyfin-sbom.cdx.json

# Fail CI on critical CVEs
grype nginx:alpine --fail-on critical

# JSON output for automation
grype nginx:alpine -o json > nginx-vulns.json
```

**CI integration:**
```yaml
# .forgejo/workflows/sbom.yml
steps:
  - name: Generate SBOM
    image: anchore/syft:latest
    commands:
      - syft . -o cyclonedx-json > sbom.cdx.json

  - name: Scan CVEs
    image: anchore/grype:latest
    commands:
      - grype sbom:sbom.cdx.json --fail-on critical
```

---

## Dependency-Track (SBOM Management Platform)

**Purpose:** Continuous SBOM analysis platform. Ingest SBOMs from Syft, Trivy, or your CI pipeline, and Dependency-Track continuously monitors them against NVD, OSV, GitHub Advisory, and VulnDB — alerting you when a new CVE is published that affects a component in any registered project. Unlike point-in-time CI scans, Dependency-Track gives ongoing visibility: a CVE disclosed today against a library ingested a month ago triggers an alert automatically.

```yaml
# ~/dependency-track/compose.yaml
services:
  dtrack-apiserver:
    image: dependencytrack/apiserver:latest
    ports:
      - 127.0.0.1:8081:8080
    volumes:
      - /home/user/dependency-track/data:/data:Z
    environment:
      ALPINE_DATABASE_MODE: internal
    restart: unless-stopped

  dtrack-frontend:
    image: dependencytrack/frontend:latest
    ports:
      - 127.0.0.1:8082:8080
    environment:
      API_BASE_URL: http://localhost:8081
    depends_on: [dtrack-apiserver]
    restart: unless-stopped
```

```bash
cd ~/dependency-track && podman-compose up -d
```

Access at `http://localhost:8082`. Default credentials: `admin` / `admin` — change immediately.

**Upload an SBOM via API:**
```bash
SBOM_B64=$(base64 -w 0 myapp-sbom.cdx.json)
curl -X PUT http://localhost:8081/api/v1/bom \
  -H "X-Api-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"projectName\":\"myapp\",\"projectVersion\":\"1.0\",\"autoCreate\":true,\"bom\":\"${SBOM_B64}\"}"
```

**CI — auto-upload SBOM on every build:**
```yaml
# .woodpecker.yml
steps:
  sbom:
    image: anchore/syft:latest
    commands:
      - syft . -o cyclonedx-json > sbom.cdx.json
  upload:
    image: curlimages/curl:latest
    secrets: [DTRACK_API_KEY]
    commands:
      - |
        curl -X PUT http://dtrack.home.local/api/v1/bom \
          -H "X-Api-Key: $DTRACK_API_KEY" -H "Content-Type: application/json" \
          -d "{\"projectName\":\"${CI_REPO_NAME}\",\"projectVersion\":\"${CI_COMMIT_SHA:0:8}\",\"autoCreate\":true,\"bom\":\"$(base64 -w 0 sbom.cdx.json)\"}"
```

**Caddy:**
```caddyfile
dtrack.home.local { tls internal; reverse_proxy localhost:8082 }
```

---

## Fail2ban (Intrusion Prevention)

**Purpose:** Monitors log files for repeated authentication failures and bans the source IP via firewall rules. Protects SSH, Caddy, Authelia, Vaultwarden, and any service that logs failed login attempts — automatically blocking brute-force attacks without manual intervention. Integrates with `firewalld` (used on this system) natively.

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

## Checkov + tfsec (IaC Security Scanning)

**Purpose:** Static analysis for Infrastructure as Code files — Terraform, Kubernetes YAML, Dockerfiles, Helm charts, GitHub Actions, and Compose files. Catches misconfigurations before they reach production: containers running as root, missing resource limits, secrets in environment variables, public S3 buckets, overly permissive IAM, and hundreds of other checks. Part of a DevSecOps pipeline alongside Trivy (images) and Semgrep (code).

```bash
# Install Checkov via pip (multi-framework: Terraform, K8s, Dockerfile, Helm, GHA, Compose)
pip install checkov --break-system-packages

# Install tfsec via Nix (Terraform-focused, fast, no Python dep — good for pre-commit)
nix-env -iA nixpkgs.tfsec
```

**Scan Terraform:**
```bash
# Full scan with CLI + JSON output
checkov -d terraform/ -o cli -o json --output-file-path /dev/null,checkov-results.json

# Fail only on HIGH and CRITICAL
checkov -d terraform/ --soft-fail-on LOW,MEDIUM

# Fast tfsec gate before checkov
tfsec terraform/
tfsec terraform/ --severity CRITICAL --format json --out tfsec-results.json
```

**Scan Kubernetes manifests and Helm charts:**
```bash
# Scan raw YAML manifests
checkov -d k8s/ --framework kubernetes

# Scan a Helm chart (renders first, then checks)
checkov -d charts/myapp --framework helm

# Specific checks relevant to K8s security hardening:
# CKV_K8S_6   — do not admit root containers
# CKV_K8S_8   — liveness probe must be defined
# CKV_K8S_9   — readiness probe must be defined
# CKV_K8S_14  — image tag must not be 'latest'
# CKV_K8S_28  — do not allow privileged containers
# CKV_K8S_30  — do not allow privilege escalation
# CKV_K8S_35  — secrets must not be in environment variables
# CKV_K8S_37  — minimise the admission of containers with added capabilities
```

**Scan Compose files:**
```bash
# Check compose.yaml for security issues (privileged mode, host network, writable mounts)
checkov -f compose.yaml --framework dockerfile
```

**CI integration (Forgejo Actions / Woodpecker):**
```yaml
# .forgejo/workflows/iac-scan.yml
on: [push]
jobs:
  iac-security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Checkov IaC scan
        uses: bridgecrewio/checkov-action@master
        with:
          directory: .
          soft_fail: true          # set to false to block PRs on findings
          output_format: cli,sarif
          output_file_path: console,results.sarif

      - name: tfsec scan
        run: |
          docker run --rm -v "$(pwd):/src" aquasec/tfsec /src/terraform \
            --format json --out /src/tfsec.json || true
```

**Send findings to Defect Dojo:**
```bash
# After CI scan, upload JSON results to Defect Dojo for centralised triage
curl -X POST https://defectdojo.home.local/api/v2/import-scan/ \
  -H "Authorization: Token $DEFECTDOJO_API_TOKEN" \
  -F "scan_type=Checkov Scan" \
  -F "file=@checkov-results.json" \
  -F "engagement=$ENGAGEMENT_ID" \
  -F "product_name=infra"
```

> **Checkov vs tfsec:** Use both. Checkov is multi-framework (Terraform + K8s + Dockerfile + Helm + Compose + GHA) and integrates with Defect Dojo natively. tfsec is Terraform-only but faster — run it as a pre-commit gate, Checkov as the full CI scan. Both catch different findings; overlap is intentional.

---

## SLSA Provenance (Supply Chain Security)

**Purpose:** SLSA (Supply chain Levels for Software Artifacts) is a framework for securing your build pipeline. SLSA Level 2 requires that every build produces a signed provenance attestation — a cryptographically signed record of *what was built, from what source, by what pipeline, on what system*. This prevents tampering between source and deployed image. On Shani OS the implementation path is: **Tekton Chains** (provenance generation) + **cosign** (signing) + **Rekor** (transparency log) + **Syft** (SBOM) + **Grype** (vulnerability check on the SBOM).

```bash
# Install cosign via Nix
nix-env -iA nixpkgs.cosign

# Generate a cosign key pair (store private key in OpenBao/Infisical)
cosign generate-key-pair
# Outputs: cosign.key (private — keep secret) and cosign.pub (public — commit to repo)

# Sign an image after pushing to your registry
cosign sign --key cosign.key registry.home.local/myapp:v1.2.3

# Verify a signed image before deploying
cosign verify --key cosign.pub registry.home.local/myapp:v1.2.3

# Attach an SBOM to the image (pairs with Syft)
syft registry.home.local/myapp:v1.2.3 -o cyclonedx-json > sbom.json
cosign attach sbom --sbom sbom.json registry.home.local/myapp:v1.2.3

# Verify the attached SBOM
cosign verify-attestation --key cosign.pub registry.home.local/myapp:v1.2.3
```

**Tekton Chains (SLSA Level 2 provenance — requires k3s/k0s):**
```bash
# Install Tekton Pipelines first (see CI/CD section)
kubectl apply -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml

# Install Tekton Chains
kubectl apply -f https://storage.googleapis.com/tekton-releases/chains/latest/release.yaml

# Configure Chains to sign with cosign and store provenance in the OCI registry
kubectl patch configmap chains-config -n tekton-chains -p='{"data":{
  "artifacts.oci.format": "simplesigning",
  "artifacts.oci.storage": "oci",
  "artifacts.taskrun.format": "slsa/v1",
  "artifacts.taskrun.storage": "oci",
  "signers.x509.fulcio.enabled": "false"
}}'

# Create a secret with your cosign key
kubectl create secret generic signing-secrets \
  --from-file=cosign.key=./cosign.key \
  --from-literal=cosign.password="" \
  -n tekton-chains

# After any TaskRun that builds and pushes an image, Chains automatically:
# 1. Captures the build inputs (git commit, Dockerfile, pipeline params)
# 2. Signs the provenance with your cosign key
# 3. Pushes the signed attestation alongside the image in the registry
```

**Verify provenance in a Kyverno policy (block unsigned images cluster-wide):**
```yaml
# ~/k8s/kyverno-verify-image.yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-image-signature
spec:
  validationFailureAction: Enforce
  rules:
    - name: check-image-signature
      match:
        any:
          - resources:
              kinds: [Pod]
      verifyImages:
        - imageReferences:
            - "registry.home.local/*"
          attestors:
            - entries:
                - keys:
                    publicKeys: |-
                      -----BEGIN PUBLIC KEY-----
                      <paste contents of cosign.pub here>
                      -----END PUBLIC KEY-----
```

```bash
kubectl apply -f ~/k8s/kyverno-verify-image.yaml

# Test: try deploying an unsigned image — should be blocked
kubectl run test --image=registry.home.local/myapp:unsigned
# Error: image signature verification failed
```

> **SLSA levels in practice:** Level 1 = build script (you probably have this). Level 2 = hosted build + signed provenance (achievable with Tekton Chains + cosign). Level 3 = hardened build platform (Talos + isolated build pods). Start with Level 2 — cosign sign in CI + Kyverno enforce in the cluster — before pursuing Level 3.

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

## osquery (Host Security Monitoring & Query Language)

**Purpose:** Treats your OS as a relational database — query processes, network connections, users, kernel modules, cron jobs, loaded kernel extensions, open files, and hardware state using plain SQL. Used by security teams for threat hunting, compliance auditing, and incident response. Feeds into Wazuh, Elastic SIEM, and Splunk for centralised host visibility.

```bash
# Install osquery via Nix (installs osqueryi + osqueryd)
nix-env -iA nixpkgs.osquery

# Or via the official RPM/DEB on non-immutable systems
# On Shani OS: Nix only (OS root is read-only)
```

**Interactive queries (`osqueryi`):**
```sql
-- Running processes and their open network connections
SELECT p.pid, p.name, p.cmdline, lp.port, lp.protocol, lp.address
FROM processes AS p JOIN listening_ports AS lp USING (pid)
WHERE lp.port > 0;

-- All users with a valid login shell (spot rogue accounts)
SELECT username, uid, gid, description, directory, shell
FROM users WHERE shell NOT LIKE '%nologin%' AND shell NOT LIKE '%false%';

-- Currently established outbound connections (threat hunting)
SELECT pid, remote_address, remote_port, local_port, state
FROM process_open_sockets
WHERE remote_address NOT IN ('0.0.0.0', '::')
  AND state = 'ESTABLISHED';

-- Cron jobs (detect persistence mechanisms)
SELECT event, minute, hour, day_of_month, month, day_of_week, command, path
FROM crontab;

-- Loaded kernel modules (detect rootkits)
SELECT name, size, used_by FROM kernel_modules ORDER BY name;

-- Recently modified files in /etc (detect config tampering)
SELECT path, mtime, atime, ctime, sha256
FROM file
WHERE path LIKE '/etc/%' AND mtime > (strftime('%s', 'now') - 3600);

-- Listening ports and processes (quick attack surface audit)
SELECT DISTINCT lp.port, lp.protocol, lp.address, p.name, p.cmdline
FROM listening_ports AS lp JOIN processes AS p USING (pid)
ORDER BY lp.port;

-- Docker/Podman containers (detect container escapes)
SELECT id, name, image, status, created
FROM docker_containers;

-- SSH authorized keys (audit backdoor keys)
SELECT username, key_file, key, comment FROM user_ssh_keys;

-- Installed packages (software inventory for CVE mapping)
SELECT name, version, arch FROM deb_packages;   -- Debian/Ubuntu
-- or
SELECT name, version, arch FROM rpm_packages;   -- RHEL/Fedora

-- Processes with root UID not launched by root
SELECT pid, name, uid, gid, root, cmdline
FROM processes WHERE uid = 0 AND parent != 1;
```

**Continuous monitoring with `osqueryd` (daemon mode):**
```bash
# /etc/osquery/osquery.conf
{
  "options": {
    "logger_plugin": "filesystem",
    "logger_path": "/var/log/osquery",
    "disable_logging": "false",
    "log_result_events": "true",
    "schedule_splay_percent": "10",
    "utc": "true"
  },
  "schedule": {
    "process_events": {
      "query": "SELECT pid, name, cmdline, uid, gid FROM process_events;",
      "interval": 60
    },
    "listening_ports": {
      "query": "SELECT pid, port, protocol, address FROM listening_ports;",
      "interval": 300,
      "removed": false
    },
    "socket_events": {
      "query": "SELECT action, auid, family, remote_address, remote_port, local_address, local_port, path FROM socket_events WHERE action = 'connect';",
      "interval": 60
    },
    "file_events": {
      "query": "SELECT path, action, transaction_id FROM file_events WHERE path LIKE '/etc/%' OR path LIKE '/home/%/.ssh/%';",
      "interval": 30
    },
    "users": {
      "query": "SELECT uid, username, description, shell FROM users;",
      "interval": 600,
      "removed": false
    }
  },
  "file_paths": {
    "config_files": ["/etc/%%"],
    "ssh_keys": ["/home/%/.ssh/%%"]
  }
}
```

```bash
# Start osqueryd
sudo systemctl enable --now osqueryd

# View osquery logs
sudo tail -f /var/log/osquery/osqueryd.results.log | python3 -m json.tool

# Forward osquery logs to Wazuh (add to wazuh-agent config)
# /var/ossec/etc/ossec.conf — add a localfile block:
# <localfile>
#   <log_format>json</log_format>
#   <location>/var/log/osquery/osqueryd.results.log</location>
# </localfile>
```

**Fleet (Multi-host osquery management UI):**
```yaml
# ~/fleet/compose.yaml
services:
  fleet:
    image: fleetdm/fleet:latest
    ports: ["127.0.0.1:8412:8080"]
    environment:
      FLEET_MYSQL_ADDRESS: mysql:3306
      FLEET_MYSQL_DATABASE: fleet
      FLEET_MYSQL_USERNAME: fleet
      FLEET_MYSQL_PASSWORD: changeme
      FLEET_REDIS_ADDRESS: redis:6379
      FLEET_SERVER_ADDRESS: 0.0.0.0:8080
      FLEET_LOGGING_JSON: "true"
    depends_on: [mysql, redis]
    restart: unless-stopped

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: fleet
      MYSQL_USER: fleet
      MYSQL_PASSWORD: changeme
    volumes: [mysql_data:/var/lib/mysql]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  mysql_data:
```

```bash
cd ~/fleet && podman-compose up -d
# Initialise Fleet DB
podman-compose run --rm fleet fleet prepare db --config /etc/fleet/fleet.yml
```

---

## Nuclei (Fast Vulnerability & Exposure Scanner)

**Purpose:** Template-based vulnerability scanner — runs 9,000+ community-maintained YAML templates against HTTP/HTTPS targets, detecting misconfigurations, CVEs, exposed panels, default credentials, path traversal, SSRF, CORS misconfig, and hundreds of other issues. Faster and more scriptable than OWASP ZAP for specific CVE checks and exposure detection. Feed results into Defect Dojo.

```bash
# Install via Nix
nix-env -iA nixpkgs.nuclei

# Or install the latest binary directly
sh -c "$(curl -fsSL https://nuclei.projectdiscovery.io/install.sh)"

# Update templates (run before first scan and weekly)
nuclei -update-templates
```

**Common scan patterns:**
```bash
# Scan a single target with all templates
nuclei -u https://app.example.com

# Scan only for critical and high severity findings
nuclei -u https://app.example.com -s critical,high

# Scan for specific CVEs (e.g., recently published)
nuclei -u https://app.example.com -tags cve -s critical,high

# Scan multiple targets from a file
nuclei -l targets.txt -s critical,high -o findings.json -j

# Scan with specific technology templates (e.g., nginx, wordpress)
nuclei -u https://example.com -tags nginx,apache

# Scan for exposed admin panels and default credentials
nuclei -u https://example.com -tags panel,default-login

# Scan internal services (homelab sweep)
nuclei -l internal-hosts.txt -tags misconfig,exposure,default-login \
  -s medium,high,critical -o internal-scan.json -j

# Run a fast sweep with concurrency controls
nuclei -l targets.txt -c 20 -rate-limit 100 -timeout 10 \
  -s high,critical -j -o output.json

# Template-specific scan (single CVE check)
nuclei -u https://example.com \
  -t cves/2023/CVE-2023-44487.yaml   # HTTP/2 Rapid Reset

# Silent mode + JSON (for CI pipeline output)
nuclei -u https://staging.example.com \
  -s critical,high -silent -j -o nuclei-report.json

# Fail CI if any critical findings
[ "$(jq '[.[] | select(.info.severity=="critical")] | length' nuclei-report.json)" -eq 0 ] \
  || { echo "Critical findings detected!"; exit 1; }
```

**Woodpecker CI integration:**
```yaml
# .woodpecker.yml — add Nuclei scan after deployment to staging
- name: security-scan
  image: projectdiscovery/nuclei:latest
  commands:
    - nuclei -u https://staging.example.com
        -s critical,high -silent -j -o /tmp/nuclei.json
    - |
      CRITS=$(jq '[.[] | select(.info.severity=="critical")] | length' /tmp/nuclei.json)
      if [ "$CRITS" -gt 0 ]; then
        echo "FAIL: $CRITS critical findings"; cat /tmp/nuclei.json | jq '.info.name, .info.severity, .matched-at'; exit 1
      fi
```

**Key template categories for DevOps/homelab:**

| Tag | What it detects |
|-----|----------------|
| `misconfig` | CORS, security header gaps, path traversal |
| `default-login` | Admin/admin, admin/password on 1,000+ apps |
| `exposure` | Exposed `.git`, `.env`, backup files, debug endpoints |
| `cve` | Known CVEs with public PoCs |
| `panel` | Admin panels exposed without auth |
| `takeover` | Subdomain/dangling DNS takeover opportunities |
| `tech` | Technology fingerprinting |
| `ssl` | TLS misconfigurations, expired certs, weak ciphers |

---

## Semgrep (SAST — Static Application Security Testing)

**Purpose:** Fast, pattern-based static analysis for code and IaC. Finds real bugs and security vulnerabilities in Python, Go, JavaScript, TypeScript, Java, Ruby, PHP, and 30+ other languages using declarative rules. Unlike compiler-aware SASTs (Checkmarx, Coverity), Semgrep is fast enough to run in CI on every push. Use for: OWASP A03 (injection), A05 (misconfiguration), A08 (integrity), and custom business logic rules. Output feeds into Defect Dojo as SARIF.

```bash
# Install via Nix
nix-env -iA nixpkgs.semgrep

# Or via pip
pip install semgrep --break-system-packages
```

**Common scan patterns:**
```bash
# Scan with the auto ruleset (recommended default — curated OSS rules)
semgrep --config=auto .

# Scan with the security-focused OWASP ruleset
semgrep --config=p/owasp-top-ten .

# Scan with community Go rules (language-specific)
semgrep --config=p/golang .

# Scan with Python security rules
semgrep --config=p/python .

# CI scan — output SARIF for upload to GitHub/Defect Dojo
semgrep --config=auto --sarif --output=semgrep.sarif .

# CI scan — JSON output
semgrep --config=p/security-audit --json --output=semgrep.json .

# Only show error-severity findings (fail CI on these)
semgrep --config=auto --severity=ERROR --error .

# Scan IaC files (Terraform, Dockerfiles)
semgrep --config=p/terraform --config=p/dockerfile .

# Scan secrets (hardcoded API keys, tokens, passwords)
semgrep --config=p/secrets .

# Custom rule (inline — detect SQL string concatenation)
semgrep --pattern 'query = "..." + $X' --lang python .
```

**Writing custom Semgrep rules:**
```yaml
# ~/.semgrep/custom-rules.yaml
rules:
  - id: hardcoded-db-password
    patterns:
      - pattern: |
          DB_PASSWORD = "$PASS"
      - pattern-not: |
          DB_PASSWORD = os.environ[...]
    message: "Hardcoded database password — use environment variables"
    languages: [python]
    severity: ERROR
    metadata:
      cwe: "CWE-798"
      owasp: "A02:2021"

  - id: subprocess-shell-true
    pattern: subprocess.run(..., shell=True, ...)
    message: "shell=True with subprocess is a command injection risk — use a list"
    languages: [python]
    severity: WARNING
    metadata:
      cwe: "CWE-78"

  - id: jwt-none-alg
    pattern: jwt.decode($TOKEN, options={"verify_signature": False, ...})
    message: "JWT signature verification disabled — attacker can forge tokens"
    languages: [python]
    severity: ERROR
```

```bash
# Run custom rules
semgrep --config=~/.semgrep/custom-rules.yaml .

# Combine auto with custom
semgrep --config=auto --config=~/.semgrep/custom-rules.yaml .
```

**Woodpecker CI integration (SAST gate on every PR):**
```yaml
# .woodpecker.yml
- name: sast-semgrep
  image: returntocorp/semgrep:latest
  commands:
    - semgrep --config=p/security-audit --config=p/secrets
        --severity=ERROR --error
        --sarif --output=semgrep.sarif .
  when:
    event: [push, pull_request]
```

**Semgrep vs Checkov vs tfsec:**

| Tool | Focus | Best for |
|------|-------|---------|
| Semgrep | Application code + IaC | Python/Go/JS bugs, injection, secrets in code |
| Checkov | IaC (multi-framework) | Terraform, K8s YAML, Dockerfile, Helm policy |
| tfsec | Terraform-only | Fast Terraform security gate |

Use all three in CI: Semgrep for code, Checkov for IaC policy, tfsec for Terraform speed gate. Feed SARIF output from all three into Defect Dojo.

---

## SOPS + age (Secrets Encryption for Git)

**Purpose:** SOPS (Secrets OPerationS) encrypts specific values in YAML/JSON/ENV/TOML/INI files — the keys remain readable (for diffs and reviews) but values are ciphertext. Committed to Git safely. `age` is the modern, simple encryption backend (replaces GPG). Used to store Kubernetes Secrets, Terraform variables, Ansible vault alternatives, and `.env` files in Git without exposing secrets. Works natively with FluxCD and ArgoCD via the KSOPS or flux-system plugins.

```bash
# Install SOPS + age via Nix
nix-env -iA nixpkgs.sops nixpkgs.age
```

**Key setup:**
```bash
# Generate an age key pair (one per person/machine)
age-keygen -o ~/.config/sops/age/keys.txt
# Public key output: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p

# Set the env var so SOPS can find your private key
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
# Add to ~/.bashrc or ~/.zshrc to persist

# Create a .sops.yaml in your repo root to define who can decrypt
cat > .sops.yaml << 'EOF'
creation_rules:
  - path_regex: .*\.secrets\.yaml$
    age: >-
      age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p,
      age1another_teammate_public_key_here
  - path_regex: k8s/.*secrets.*\.yaml$
    age: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p
EOF
```

**Encrypting and editing secrets:**
```bash
# Encrypt a new secrets file (SOPS reads .sops.yaml for the key config)
sops --encrypt --in-place secrets.yaml
# or equivalently (SOPS detects .sops.yaml automatically):
sops -e -i secrets.yaml

# Edit an encrypted file in-place (decrypts to $EDITOR, re-encrypts on save)
sops secrets.yaml

# Decrypt to stdout (pipe to kubectl apply)
sops -d secrets.yaml | kubectl apply -f -

# Decrypt to a file (for local testing — never commit the decrypted file!)
sops -d secrets.yaml > /tmp/secrets-plain.yaml

# Encrypt a single value on the command line
sops -e --input-type raw --output-type raw <(echo "my-secret-value")

# Encrypt a Kubernetes Secret manifest
sops -e -i k8s/myapp-secret.yaml

# Apply encrypted K8s secret directly
sops -d k8s/myapp-secret.yaml | kubectl apply -f -
```

**Example encrypted YAML structure:**
```yaml
# app.secrets.yaml (after sops -e -i)
database:
    host: db.home.local          # not encrypted — key only
    password: ENC[AES256_GCM,data:xyz123...,type:str]
    port: 5432                   # not encrypted — not sensitive
api_keys:
    stripe: ENC[AES256_GCM,data:abc456...,type:str]
    sendgrid: ENC[AES256_GCM,data:def789...,type:str]
sops:
    age:
        - recipient: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p
          enc: |
            -----BEGIN AGE ENCRYPTED FILE-----
            ...
```

**SOPS with Flux CD (GitOps secrets decryption in-cluster):**
```bash
# Create a Flux decryption secret from your age private key
cat ~/.config/sops/age/keys.txt | kubectl create secret generic sops-age \
  --namespace=flux-system \
  --from-file=age.agekey=/dev/stdin

# Add a .sops.yaml to your GitOps repo root (as above)

# Add a Kustomization with decryption enabled
cat > k8s/flux-system/kustomization.yaml << 'EOF'
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: myapp
  namespace: flux-system
spec:
  interval: 10m
  path: ./k8s/myapp
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  decryption:
    provider: sops
    secretRef:
      name: sops-age
EOF
```

**SOPS with Ansible (replace ansible-vault):**
```bash
# Encrypt your vars file
sops -e -i group_vars/all/vault.yaml

# Decrypt before running playbook (or pipe directly)
sops -d group_vars/all/vault.yaml > /tmp/vault-plain.yaml
ansible-playbook -i inventory.ini playbook.yaml \
  -e @/tmp/vault-plain.yaml; rm /tmp/vault-plain.yaml

# Or use sops exec-env to inject vars as environment variables
sops exec-env secrets.env ansible-playbook playbook.yaml
```

**SOPS with Terraform / OpenTofu:**
```bash
# Decrypt a .tfvars secrets file, pass to tofu
sops -d prod.secrets.tfvars.enc > /tmp/prod.secrets.tfvars
tofu apply -var-file=prod.secrets.tfvars -var-file=/tmp/prod.secrets.tfvars
rm /tmp/prod.secrets.tfvars

# Or use the terraform-sops provider
# In main.tf:
# data "sops_file" "secrets" { source_file = "secrets.sops.yaml" }
# resource "..." { password = data.sops_file.secrets.data["db_password"] }
```

**`.gitignore` additions when using SOPS:**
```gitignore
# Never commit decrypted secrets — only commit *.sops.yaml or *.enc.yaml
*-plain.yaml
*-decrypted.yaml
/tmp/*.yaml
```

> **Key rotation:** When a team member leaves, re-encrypt all SOPS files with their key removed from `.sops.yaml`. Run `sops updatekeys secrets.yaml` to rotate encryption without decrypting/re-encrypting manually — SOPS re-encrypts the data key for the new recipient set.


## Caddy Configuration

```caddyfile
secrets.home.local    { tls internal; reverse_proxy localhost:8090 }
trivy.home.local      { tls internal; reverse_proxy localhost:4954 }
teleport.example.com  { reverse_proxy localhost:3080 }
zap.home.local        { tls internal; reverse_proxy localhost:8088 }
safeline.home.local   { tls internal; reverse_proxy localhost:9443 }
fleet.home.local      { tls internal; reverse_proxy localhost:8412 }
defectdojo.home.local { tls internal; reverse_proxy localhost:8081 }
```

---

## OWASP Top 10 Quick Reference

The OWASP Top 10 is the standard framework for web application security risk. Understanding what each category means helps you configure your scanning tools (ZAP, Semgrep, Trivy) with appropriate scope:

| # | Category | What it means | How to address |
|---|----------|--------------|----------------|
| A01 | **Broken Access Control** | Users can act outside their intended permissions (IDOR, privilege escalation) | Enforce role-based access; deny by default; test all endpoints |
| A02 | **Cryptographic Failures** | Sensitive data exposed due to weak/missing encryption | TLS everywhere; use modern cipher suites; never MD5/SHA1 for passwords |
| A03 | **Injection** | Untrusted data interpreted as code (SQL, LDAP, command injection) | Parameterised queries; input validation; Semgrep SAST rules |
| A04 | **Insecure Design** | Missing security controls at the design level | Threat modelling before building; security requirements in design docs |
| A05 | **Security Misconfiguration** | Default credentials, unnecessary services, verbose error messages | Hardened defaults; remove unused services; ZAP scanner |
| A06 | **Vulnerable Components** | Outdated libraries with known CVEs | Trivy scanning; Renovate for dependency updates; Dependabot |
| A07 | **Auth & Session Failures** | Weak passwords, missing MFA, session fixation | Authelia/Authentik; strong session cookies; MFA everywhere |
| A08 | **Software & Data Integrity** | Untrusted updates, CI/CD pipeline compromise | SLSA provenance; cosign image signing; Kyverno verification |
| A09 | **Logging & Monitoring Failures** | Attacks go undetected due to insufficient logging | Audit logging; Graylog/OpenSearch; Grafana alerts on anomalies |
| A10 | **Server-Side Request Forgery** | Server fetches attacker-controlled URLs, bypassing firewalls | Validate and restrict outbound URLs; network egress controls |

ZAP (below) tests for A01, A02, A03, A05, A07, A10. Semgrep covers A03, A05, A08. Trivy covers A06.

---

## mTLS (Mutual TLS) with Caddy

Standard TLS proves the server's identity to the client. **Mutual TLS (mTLS)** requires the client to also present a certificate, so the server can verify the client's identity. This is the foundation of zero-trust service-to-service authentication.

Use cases on a homelab: restricting an internal API to specific clients (e.g., only your monitoring server can call `/metrics`), protecting admin endpoints without a username/password flow, or securing inter-service communication.

**Generate a CA and client certificate with Step-CA:**
```bash
# Install step CLI
nix-env -iA nixpkgs.step-cli

# Create a local CA
step certificate create "Home Lab CA" ca.crt ca.key --profile root-ca --no-password --insecure

# Issue a client certificate valid for 1 year
step certificate create "grafana-client" client.crt client.key \
  --profile leaf --ca ca.crt --ca-key ca.key \
  --not-after 8760h --no-password --insecure
```

**Configure Caddy to require a client certificate:**
```caddyfile
# ~/caddy/Caddyfile
api.home.local {
  tls internal
  tls {
    client_auth {
      mode require_and_verify
      trusted_ca_cert_file /etc/caddy/client-ca.crt
    }
  }
  reverse_proxy localhost:8080
}
```

```bash
# Copy the CA cert into the Caddy config directory
cp ca.crt ~/caddy/client-ca.crt
cd ~/caddy && podman-compose restart
```

**Test with the client certificate:**
```bash
# Without cert — rejected
curl https://api.home.local/health

# With cert — allowed
curl --cert client.crt --key client.key https://api.home.local/health
```

---

## Pod Security Standards

Pod Security Standards (PSS) replaced PodSecurityPolicies in Kubernetes 1.25. PSS defines three policy levels enforced at the namespace level via labels — no webhook or CRD required.

| Level | What it restricts |
|-------|------------------|
| **Privileged** | No restrictions — for trusted system workloads |
| **Baseline** | Blocks the most dangerous configurations (privileged containers, hostNetwork, hostPID) |
| **Restricted** | Requires non-root user, drops all capabilities, enforces read-only root filesystem |

```yaml
# Label a namespace to enforce the restricted policy
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted     # reject violating pods
    pod-security.kubernetes.io/warn: restricted        # warn even if not enforced
    pod-security.kubernetes.io/audit: restricted       # log violations to audit log
```

```bash
# Check which namespaces have PSS labels
kubectl get namespaces -o json | jq -r '.items[] | select(.metadata.labels | has("pod-security.kubernetes.io/enforce")) | "\(.metadata.name): \(.metadata.labels["pod-security.kubernetes.io/enforce"])"'

# Dry-run: what would be blocked in this namespace?
kubectl label namespace myapp \
  pod-security.kubernetes.io/enforce=restricted \
  --dry-run=server
```

Start with `warn` mode on existing namespaces to discover violations without breaking anything, then migrate to `enforce` once pods are compliant. Use Kyverno policies (documented elsewhere in the Kubernetes wiki) for more granular control beyond what PSS provides.

---

## Secrets Rotation Workflow

Rotating a secret without restarting every pod that uses it requires a coordinated flow between your secrets store and the Kubernetes secrets layer. With External Secrets Operator (ESO):

1. **Rotate the secret in OpenBao or Infisical** — update the value in the secrets engine. The old value is no longer valid.

2. **ESO syncs automatically** — ESO polls the external store on the `refreshInterval` (default: 1h, configurable per `ExternalSecret`). To force immediate sync:
   ```bash
   kubectl annotate externalsecret myapp-secret \
     force-sync=$(date +%s) \
     --overwrite -n myapp
   ```

3. **Kubernetes Secret is updated** — ESO updates the `Secret` object in Kubernetes with the new value.

4. **Application picks up the new value** — depends on how the secret is consumed:
   - **Volume mount** — Kubernetes updates the mounted file automatically within 60–90 seconds (kubelet sync period). The application must watch the file for changes or be restarted.
   - **Environment variable** — environment variables are set at pod startup. The pod must be restarted to see the new value: `kubectl rollout restart deployment/myapp`
   - **Reloader** — use [Reloader](https://github.com/stakater/Reloader) to automatically restart pods when their referenced Secret changes:
     ```yaml
     # Add annotation to your Deployment
     annotations:
       reloader.stakater.com/auto: "true"
     ```

The full flow from rotate to running with new value takes: ESO sync interval + Kubernetes propagation delay + pod restart time. Reduce `refreshInterval` on high-sensitivity secrets.

---

## Supply Chain Attack Vectors

The SLSA provenance and cosign signing setup (documented above) defends against specific supply chain attacks. Understanding the vectors helps you prioritise:

**Typosquatting** — a malicious image `ngiinx:latest` or package `lodahs` waiting for a typo. Mitigation: use a private registry mirror that only allows approved images; pin images to digests (`nginx@sha256:abc123`) not tags.

**Dependency confusion** — an attacker publishes a public package with the same name as your internal private package, betting that the build tool resolves the public one. Mitigation: scope all internal packages (e.g., `@mycompany/utils`), configure package managers to only resolve scoped packages from your internal registry.

**Base image poisoning** — a compromised upstream base image (`FROM node:20`) introduces malware before your build runs. Mitigation: pin base images to their digest; Trivy scan every build; use images from verified publishers; consider distroless bases (smaller surface).

**CI/CD pipeline compromise** — an attacker gains write access to your CI system and injects malicious build steps. Mitigation: separate build credentials from deployment credentials; use OIDC short-lived tokens instead of long-lived secrets in CI; audit pipeline logs; use Tekton Chains for SLSA attestations.

---

## Vaultwarden Emergency Kit

If you lose access to your Vaultwarden vault (lost 2FA device, forgotten master password), you need recovery options set up *before* the emergency. Bitwarden/Vaultwarden provides two:

**Emergency Access** — grant a trusted contact the ability to request access to your vault. You have a configurable window (1–90 days) to deny the request. If you don't deny it, they gain read or takeover access. Set this up under *Settings → Emergency Access* while you have normal access.

**Printed Recovery Code (Two-Factor Recovery)** — if you lose your 2FA device, you need a recovery code to bypass 2FA. In Vaultwarden: *Settings → Two-step Login → View Recovery Code*. Print this code or store it in a fireproof safe offline. Without this code and without your 2FA device, your vault is locked permanently — there is no admin bypass.

```bash
# Admin: view all users (confirm emergency access is configured)
curl -H "Authorization: Bearer $VAULTWARDEN_ADMIN_TOKEN" \
  http://localhost:8222/admin/users

# Admin: if a user is completely locked out, disable 2FA for their account
# Go to /admin → Users → [username] → Deactivate two-factor authentication
# Then have the user set up 2FA again from scratch
```

Store recovery codes separately from the device and separately from the password manager itself. A paper copy in a fireproof safe, or a laminated card in a safety deposit box, are both valid options.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Vaultwarden WebSocket not working | Ensure the `/notifications/hub` path is proxied to port `3012` in Caddy |
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
