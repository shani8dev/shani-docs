---
title: Security & Identity — SSO, Directory & Passwordless (Authelia, Authentik, Keycloak, Zitadel, LLDAP, Kanidm)
section: Self-Hosting & Servers
updated: 2026-08-28
---

## Key Concepts

#### Zero Trust principles
"Never trust, always verify." Traditional perimeter security trusts anything inside the network. Zero trust verifies every request regardless of source — inside or outside the network — using identity, device posture, and minimal-privilege access. Implementation: mTLS between services, short-lived certificates (not long-lived API keys), device posture checks (is the OS patched?), least-privilege RBAC, and session recording for privileged access (Teleport).

#### Principle of least privilege (PoLP)
Every user, process, and service gets only the permissions it needs — nothing more. In Kubernetes: ServiceAccounts with narrow Roles, not cluster-admin. In AWS: IAM roles scoped to specific S3 buckets and actions. In Linux: non-root containers, no `SYS_ADMIN` unless necessary. Violations are the root cause of most lateral movement after a breach.

#### Defence in depth
Multiple layers of security so that no single failure compromises the entire system. Example stack: WAF (Coraza) → reverse proxy authentication (Authelia) → network segmentation (NetworkPolicy) → container sandboxing (seccomp, AppArmor) → runtime detection (Falco) → SIEM (Wazuh). An attacker who defeats one layer still faces the next.

#### OAuth2 flows — which to use when
- **Authorization Code + PKCE** — for web and mobile apps where a user logs in. The current gold standard. PKCE prevents code interception.
- **Client Credentials** — for machine-to-machine (service-to-service). No user involved. Use for CI/CD tokens and API-to-API calls.
- **Device Code** — for CLI tools and devices without a browser (headless servers, smart TVs).
- **Implicit flow** — deprecated. Do not use.

#### JWT structure and common mistakes
A JWT has three base64url-encoded parts: `header.payload.signature`. The header declares the algorithm; the payload contains claims (sub, exp, iat, scopes); the signature verifies integrity. Common mistakes: (1) accepting `alg: none` — always reject this; (2) not verifying `exp` — always check expiry; (3) putting sensitive data in the payload — it's encoded, not encrypted (anyone can read it with base64 decode); (4) not rotating signing keys.

#### OWASP Top 10 in one line each (for interviews)
A01 Broken Access Control: users can access data/actions they shouldn't (IDOR, privilege escalation). A02 Cryptographic Failures: sensitive data exposed due to weak/missing encryption. A03 Injection: user input interpreted as code (SQL, command). A04 Insecure Design: security not considered in architecture. A05 Security Misconfiguration: default credentials, unnecessary services. A06 Vulnerable Components: outdated dependencies with CVEs. A07 Auth Failures: weak passwords, no MFA, session fixation. A08 Software Integrity: unsigned updates, compromised CI/CD pipeline. A09 Logging Failures: breaches go undetected. A10 SSRF: server fetches attacker-controlled URLs.

#### Hash functions vs encryption vs encoding
- **Encoding** (base64, hex) — reversible transformation, no key, provides no security — just a format change
- **Hashing** (SHA-256, bcrypt) — one-way, no key; used for integrity checks and password storage; bcrypt adds a work factor (slow by design)
- **Symmetric encryption** (AES-256-GCM) — reversible with the same key; fast; used for data at rest
- **Asymmetric encryption** (RSA, ECDSA) — public key encrypts/verifies, private key decrypts/signs; used for TLS, JWT signing, SSH keys

#### Supply chain security basics
Three vectors to understand: (1) Source — code in your repo (Semgrep SAST, secret scanning). (2) Build — CI pipeline integrity (Tekton Chains SLSA provenance, cosign signing). (3) Dependency — third-party packages and base images (Trivy, Grype, Renovate, Dependency-Track). The 2020 SolarWinds attack and 2021 Log4Shell are canonical examples of each vector.

#### Secrets management anti-patterns
- Hardcoded secrets in source code (most common, caught by Semgrep `p/secrets`)
- Secrets in environment variables that get printed to logs
- Long-lived API keys that never rotate
- Sharing credentials across environments (staging DB password = prod DB password)
- Secrets in Kubernetes manifests committed to Git without encryption (use SOPS + age or Sealed Secrets)

#### Vulnerability severity levels (CVSS)
CVSS (Common Vulnerability Scoring System) scores 0–10. Critical 9.0–10.0, High 7.0–8.9, Medium 4.0–6.9, Low 0.1–3.9. For triaging: fix Criticals within 24h, Highs within 7 days. Tools (Trivy, Grype, Nuclei) report these severities. In Defect Dojo you set SLA targets per severity.

#### Identity provider architecture — LDAP vs OIDC vs SAML
Three generations of identity federation. LDAP (Lightweight Directory Access Protocol) is the enterprise standard for directory services — Active Directory is LDAP. Applications authenticate by doing a bind to the LDAP server. OIDC (OpenID Connect) is the modern web standard, built on OAuth2 — applications redirect users to an IdP (Authentik, Keycloak), receive a JWT, and verify it locally. SAML is the enterprise web SSO standard (older than OIDC, XML-based) — you'll encounter it when integrating with corporate SSO. Most modern self-hosted apps support OIDC; legacy apps often only support LDAP. Authentik and Keycloak speak all three.

#### Certificate lifecycle management
Certificates expire. Expired certificates cause outages. step-ca and cert-manager automate issuance and renewal — but you still need to understand the concepts. A CA (Certificate Authority) signs certificates with its private key. Clients trust certificates signed by CAs in their trust store. Short-lived certificates (24h–7 days, used by Teleport and service meshes) are more secure than long-lived ones (1 year) because there's less window for a compromised cert to be misused. Intermediate CAs (step-ca creates one automatically) limit blast radius if the root key is compromised.

#### SIEM, SOC, and log correlation
A SIEM (Security Information and Event Management system — Wazuh, Elastic SIEM) collects logs from all sources, normalises them, and applies correlation rules to detect attack patterns. A single failed SSH login is noise; 1000 failed logins from one IP in 10 seconds is a brute-force attempt. SIEM rules encode this logic. A SOC (Security Operations Centre) is the team that watches the SIEM. For self-hosters: Wazuh agents on every host, log forwarding from containers, and alerting to a notification channel gives you >80% of enterprise SOC capability.

#### Container and Kubernetes hardening checklist
The most common misconfigurations, in order of frequency: (1) running as root (`runAsNonRoot: true` fixes this), (2) `hostPID: true` / `hostNetwork: true` (gives container access to host namespaces — almost never needed), (3) `privileged: true` (full host access — equivalent to root on the node), (4) no seccomp profile (allows all ~300+ syscalls — use `RuntimeDefault`), (5) writable root filesystem (`readOnlyRootFilesystem: true` limits malware persistence), (6) no resource limits (a compromised container can consume all host resources).

#### Vulnerability management workflow
Scanning finds vulnerabilities; management decides what to do with them. The workflow: scan (Trivy, Grype) → import to tracker (Defect Dojo) → triage by severity and exploitability → assign owner → fix (update dependency, apply patch, add WAF rule) → rescan to verify. Not all Criticals are equal: a Critical CVE in a library that's never called from your code path is lower priority than a High in your authentication path. Context matters. SLA targets (Critical: 24h, High: 7 days) provide an objective standard.

#### Passkeys and WebAuthn — replacing passwords
WebAuthn (the standard behind passkeys) uses public-key cryptography for authentication. The private key never leaves the device (stored in secure enclave or hardware key). Login: the server sends a challenge, the device signs it with the private key, the server verifies with the stored public key. This eliminates: phishing (the signature is bound to the origin domain), credential stuffing (no reusable password), and password database breaches (only public keys are stored). Pocket ID and Kanidm are purpose-built for passkey-only auth. Vaultwarden supports WebAuthn for 2FA.
---

---

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

##### Minimal `configuration.yml`

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

##### Create a user

```bash
podman exec authelia authelia crypto hash generate argon2 --password 'yourpassword'
# Add the hash to /home/user/authelia/config/users_database.yml
```

#### Common operations
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

#### Caddy integration (protect any service)
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

#### Connect Authelia to LLDAP
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

#### Connect Nextcloud to LLDAP
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

##### Register a Gitea OIDC client

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

##### Minimal `server.toml`

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
