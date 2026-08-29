---
title: Security — CrowdSec, PKI, Secrets & SIEM
section: Self-Hosting & Servers
updated: 2026-08-28
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

##### Install the firewalld bouncer on the host

```bash
# Install via Nix
nix-env -iA nixpkgs.crowdsec
sudo systemctl enable --now crowdsec-firewall-bouncer
```

#### Useful CrowdSec commands
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

#### Common operations
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

#### Trust the CA on this system
```bash
step ca root > /tmp/root_ca.crt
sudo trust anchor /tmp/root_ca.crt
sudo update-ca-trust
```

#### Issue a certificate manually
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

#### Common operations
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

##### Minimal `openbao.hcl`

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

##### Initialise and unseal

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

##### Install agent on a monitored server

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

#### Caddy configuration
```caddyfile
vault.home.local {
  tls internal
  reverse_proxy localhost:8180
  reverse_proxy /notifications/hub localhost:3012
}
```

##### Backup your vault data

```bash
# Vaultwarden data directory contains the SQLite DB and attachments
restic backup /home/user/vaultwarden/data
```

#### Common operations
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

##### Enable 2FA emergency access

In the web vault, go to Settings → Two-step Login → add TOTP or WebAuthn key. If you lose access to your 2FA device, use the recovery code generated during setup.

---
