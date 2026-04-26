---
title: Mail Servers
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Mail Servers

Production-ready email solutions for full data control and privacy.

> ⚠️ **Prerequisite**: Requires static public IP, reverse DNS (PTR), and correct DNS records (MX, SPF, DKIM, DMARC). Residential ISPs often block port 25. Use a VPS or outbound relay if needed.

---

## How Email Actually Works

Understanding the protocol stack is essential for any sysadmin or DevOps role — interviewers expect you to trace a message end-to-end.

#### The three server roles

| Role | Protocol | Port | What it does |
|------|----------|------|-------------|
| MTA (Mail Transfer Agent) | SMTP | 25 | Server-to-server delivery (Postfix, Exim, Stalwart) |
| MSA (Mail Submission Agent) | SMTP submission | 587 / 465 | Authenticated client → server handoff |
| MDA (Mail Delivery Agent) | IMAP / POP3 | 143/993, 110/995 | User retrieval from mailbox (Dovecot) |

#### Outbound delivery flow
```
Mail client (MUA)
  → port 587 STARTTLS  →  Your MSA  (auth required)
  → port 25 SMTP       →  Recipient's MTA  (DNS MX lookup)
  → LMTP / maildir     →  Recipient's MDA
  → port 993 IMAPS     →  Recipient's mail client
```

#### Relay vs. direct delivery
A *relay* (SendGrid, AWS SES, Mailgun) accepts your mail and delivers it under their IP reputation — useful when your IP is new or blocked. *Direct delivery* sends from your server straight to the recipient's MX — requires a clean IP, correct PTR, and passing SPF/DKIM checks.

#### IP warming
When sending from a new IP, receiving servers rate-limit or reject you until your IP builds a reputation. Start with low volumes, ramp up over weeks, and monitor bounce/spam complaint rates. This is a real operational concern for any newsletter or transactional mail setup.

---

## Mailcow (Full-Featured)
**Purpose**: Complete mail suite: Postfix, Dovecot, SOGo, Rspamd, ClamAV, admin UI, and ActiveSync.
```yaml
# Clone: git clone https://github.com/mailcow/mailcow-dockerized
# Edit mailcow.conf, then run: podman-compose up -d
```
Ports: `25`, `465/587`, `143/993`, `80/443`.

**Firewall:**
```bash
sudo firewall-cmd --add-service=smtp --add-service=smtps \
  --add-service=imap --add-service=imaps \
  --add-service=http --add-service=https --permanent
sudo firewall-cmd --reload
```

## Mailu (Lightweight & Modular)
**Purpose**: Modular, Alpine-based stack with Roundcube/SnappyMail, easy to deploy via compose.
```yaml
services:
  front:
    image: ghcr.io/mailu/nginx:2024.06
    ports: ["25:25", "465:465", "587:587", "143:143", "993:993", "80:80", "443:443"]
    volumes:
      - /home/user/mailu/data:/data:Z
      - /home/user/mailu/dkim:/dkim:Z
      - /home/user/mailu/certs:/certs:Z
  admin:
    image: ghcr.io/mailu/admin:2024.06
    environment:
      HOSTNAME: mail.example.com
      SECRET_KEY: changeme-replace-with-openssl-rand-hex-32
    volumes:
      - /home/user/mailu/data:/data:Z
    depends_on: [db]
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: mailu
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: mailu
    volumes: [pg_data:/var/lib/postgresql/data]
  imap:
    image: ghcr.io/mailu/dovecot:2024.06
    volumes: [/home/user/mailu/data:/data:Z]
  smtp:
    image: ghcr.io/mailu/postfix:2024.06
    volumes: [/home/user/mailu/data:/data:Z]
  antispam:
    image: ghcr.io/mailu/rspamd:2024.06
    volumes: [/home/user/mailu/filter:/var/lib/rspamd:Z]
volumes:
  pg_data:
```

## Stalwart Mail Server
**Purpose**: Next-gen, single-binary Rust mail server. JMAP, IMAP, SMTP, Sieve, webmail built-in. Extremely low resource usage.
```yaml
# ~/stalwart/compose.yaml
services:
  stalwart:
    image: stalwartlabs/mail-server:latest
    ports:
      - 0.0.0.0:25:25       # SMTP — must be publicly reachable for inbound mail
      - 0.0.0.0:465:465     # SMTPS (implicit TLS)
      - 0.0.0.0:587:587     # SMTP submission (STARTTLS)
      - 0.0.0.0:143:143     # IMAP
      - 0.0.0.0:993:993     # IMAPS
      - 127.0.0.1:8080:8080 # Admin web UI (proxied through Caddy)
    volumes:
      - /home/user/stalwart:/stalwart:Z
    restart: unless-stopped
```

```bash
cd ~/stalwart && podman-compose up -d
```

**Firewall:**
```bash
sudo firewall-cmd --add-service=smtp --add-service=smtps \
  --add-service=imap --add-service=imaps --permanent
sudo firewall-cmd --reload
```

#### Common operations
```bash
# View logs
podman logs -f stalwart

# Add an admin domain
podman exec stalwart stalwart-cli domain create example.com

# Add a user account
podman exec stalwart stalwart-cli account create user@example.com --secret changeme

# List all accounts
podman exec stalwart stalwart-cli account list

# Generate DKIM key for a domain
podman exec stalwart stalwart-cli dkim generate example.com

# Check mail queue
podman exec stalwart stalwart-cli queue list

# Flush the mail queue
podman exec stalwart stalwart-cli queue flush
```

---

## DNS & Deliverability

### Record Reference

| Record | Purpose | Example |
|--------|---------|---------|
| `MX` | Routes inbound email | `10 mail.example.com.` |
| `PTR` | ISP maps IP → hostname | Set via VPS/ISP panel |
| `SPF` | Authorizes sending IPs | `v=spf1 mx ip4:203.0.113.50 -all` |
| `DKIM` | Cryptographic outbound signature | Generated via admin UI |
| `DMARC` | Policy for failed auth | `v=DMARC1; p=reject; rua=mailto:dmarc@example.com` |

### What these actually do (industry context)

**SPF** lists the IPs permitted to send as your domain. `-all` means hard-reject anything unlisted. Know the difference between `~all` (softfail — delivered but flagged) and `-all` (hardfail — rejected outright). Interviewers ask this.

**DKIM** signs outbound messages with a private key stored on your server. The public key lives in DNS at `selector._domainkey.example.com`. Recipients verify the signature to confirm the message body was not tampered with in transit. DKIM can pass even when SPF fails (e.g. forwarded mail), which is why DMARC *alignment* — not just individual pass/fail — is what actually matters for deliverability.

**DMARC** ties SPF and DKIM together and instructs receivers what to do when *both* fail: `p=none` (monitor only), `p=quarantine` (spam folder), or `p=reject` (drop). The `rua=` tag sends aggregate XML reports to your inbox — parse these to identify misconfigured senders on your domain.

### SMTP debugging (essential sysadmin skill)

Test delivery without a mail client using `swaks`:

```bash
# Install
sudo dnf install swaks

# Test submission — port 587, authenticated, STARTTLS
swaks --to recipient@example.com \
      --from sender@yourdomain.com \
      --server mail.yourdomain.com \
      --port 587 --starttls \
      --auth LOGIN \
      --auth-user sender@yourdomain.com \
      --auth-password changeme

# Test direct MX delivery (simulates another mail server, no auth)
swaks --to recipient@example.com \
      --server $(dig +short MX example.com | awk '{print $2}')
```

Raw SMTP/IMAP session (useful on minimal servers with no tools installed):

```bash
# Verify SMTP banner and capability list
telnet mail.example.com 25
# EHLO yourdomain.com
# QUIT

# SMTPS handshake check (port 465, implicit TLS)
openssl s_client -connect mail.example.com:465

# IMAP login test (port 993)
openssl s_client -connect mail.example.com:993
# a1 LOGIN user@example.com password
# a2 LIST "" "*"
# a3 LOGOUT
```

### Reading mail logs

The queue ID ties every log line for a single message together. Find it and grep for it:

```bash
# Follow live
journalctl -u postfix -f

# Trace one message end-to-end by queue ID
journalctl -u postfix | grep ABC123DEF456
```

Key status values: `sent` (delivered), `bounced` (5xx permanent failure — fix DNS or auth), `deferred` (4xx temporary — will retry), `expired` (retry time exceeded, message discarded).

---

## Backup

Back up the data volumes for whichever servers you run:

```bash
restic backup /home/user/mailcow /home/user/mailu /home/user/stalwart
```

For Stalwart specifically, `/home/user/stalwart` contains the embedded RocksDB store, config, and DKIM keys — this single path is sufficient for a full restore.

---

# Mailing Lists, Newsletters & Aliases

## listmonk (Newsletter & Mailing Lists)

**Purpose:** High-performance self-hosted newsletter and mailing list manager. Send campaign and transactional emails, manage subscribers, run automated sequences, and track opens/clicks — all from a clean web UI. A self-hosted Mailchimp/ConvertKit alternative that handles millions of emails with a tiny resource footprint.

```yaml
# ~/listmonk/compose.yaml
services:
  listmonk:
    image: listmonk/listmonk:latest
    ports: ["127.0.0.1:9000:9000"]
    command: "./listmonk --config /listmonk/config.toml"
    volumes:
      - /home/user/listmonk/config.toml:/listmonk/config.toml:ro,Z
      - /home/user/listmonk/uploads:/listmonk/uploads:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: listmonk
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: listmonk
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/listmonk && podman-compose up -d
```

**Minimal `config.toml`:**
```toml
[app]
address = "0.0.0.0:9000"
admin_username = "admin"
admin_password = "changeme"

[db]
host = "db"
port = 5432
user = "listmonk"
password = "changeme"
database = "listmonk"
```

> 💡 SMTP settings are configured through the web UI under **Settings → SMTP** — do not add an `[[smtp]]` block to `config.toml`; that syntax is removed in v5+.

**Initialise and start:**
```bash
# --idempotent --yes makes install safe to re-run; no separate manual step needed on upgrades
podman-compose run --rm listmonk ./listmonk --config /listmonk/config.toml --install --idempotent --yes
podman-compose up -d
```

Access at `http://localhost:9000`. Create subscriber lists, design email templates, schedule campaigns, and view delivery analytics.

**Caddy:**
```caddyfile
newsletter.example.com { reverse_proxy localhost:9000 }
```

---

## SimpleLogin (Email Aliasing)

**Purpose:** Self-hosted email alias service. Create unlimited `random@yourdomain.com` aliases that forward to your real inbox. Aliases can send replies — your real address is never exposed. The self-hosted alternative to SimpleLogin.io, Apple Hide My Email, or DuckDuckGo Email Protection.

```yaml
# ~/simplelogin/compose.yaml
services:
  app:
    image: simplelogin/app:latest
    ports: ["127.0.0.1:7777:7777"]
    environment:
      URL: https://sl.example.com
      EMAIL_DOMAIN: sl.example.com
      SUPPORT_EMAIL: support@sl.example.com
      DB_URI: postgresql://sl:changeme@db:5432/sl
      FLASK_SECRET: changeme-run-openssl-rand-hex-32
      POSTFIX_SERVER: postfix
    volumes:
      - /home/user/simplelogin/data:/sl/upload:Z
    depends_on: [db]
    restart: unless-stopped

  postfix:
    image: simplelogin/postfix:latest
    ports:
      - "0.0.0.0:25:25"
      - "0.0.0.0:465:465"
    environment:
      ALIASES_DEFAULT_DOMAIN: sl.example.com
      DB_HOST: db
      DB_USER: sl
      DB_PASSWORD: changeme
      DB_NAME: sl
      FLASK_SECRET: changeme-run-openssl-rand-hex-32
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: sl
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: sl
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/simplelogin && podman-compose up -d
```

> Requires a public-facing mail server with MX, SPF, DKIM, and DMARC DNS records for the alias domain. Port 25 must be open and not blocked by your ISP — a VPS is strongly recommended.

#### Initialise
```bash
podman-compose run --rm app flask db upgrade
podman-compose run --rm app python init_app.py
```

---

## addy.io (AnonAddy — Lightweight Email Aliasing)

**Purpose:** Lighter-weight email aliasing server. Create aliases on custom domains, forward to your real inbox, and reply anonymously. Similar to SimpleLogin but simpler to operate.

```yaml
# ~/anonaddy/compose.yaml
services:
  anonaddy:
    image: anonaddy/anonaddy:latest
    ports: ["127.0.0.1:8000:8000"]
    environment:
      APP_KEY: base64:changeme-run-php-artisan-key-generate
      APP_URL: https://alias.example.com
      DB_HOST: db
      DB_DATABASE: anonaddy
      DB_USERNAME: anonaddy
      DB_PASSWORD: changeme
      REDIS_HOST: redis
      ANONADDY_DOMAIN: alias.example.com
      ANONADDY_SECRET: changeme-run-openssl-rand-hex-32
    volumes:
      - /home/user/anonaddy/config:/config:Z
    depends_on: [db, redis]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: anonaddy
      MYSQL_USER: anonaddy
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/anonaddy && podman-compose up -d
```

---

## Postal (Transactional Email Server)

**Purpose:** Full-featured transactional email sending platform with delivery tracking, bounce handling, webhooks, and an HTTP API. Use Postal when your applications need to send sign-up confirmations, password resets, and notifications through your own infrastructure. The self-hosted SendGrid/Postmark alternative.

```yaml
# ~/postal/compose.yaml
services:
  postal:
    image: ghcr.io/postalserver/postal:latest
    ports:
      - "0.0.0.0:25:25"
      - "127.0.0.1:5000:5000"
    volumes:
      - /home/user/postal/config:/config:Z
    depends_on: [mariadb, rabbitmq]
    restart: unless-stopped

  worker:
    image: ghcr.io/postalserver/postal:latest
    command: worker
    volumes:
      - /home/user/postal/config:/config:Z
    depends_on: [mariadb, rabbitmq]
    restart: unless-stopped

  mariadb:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: postal
      MYSQL_USER: postal
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

  rabbitmq:
    image: rabbitmq:3-alpine
    volumes: [rabbit_data:/var/lib/rabbitmq]
    restart: unless-stopped

volumes:
  db_data:
  rabbit_data:
```

```bash
cd ~/postal && podman-compose up -d
```

**Initialise and create admin:**
```bash
podman-compose run --rm postal initialize
podman-compose run --rm postal make-user
```

Access the web UI at `http://localhost:5000`. Create a mail server, configure DKIM keys, and retrieve SMTP credentials for your apps.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| listmonk `pq: role does not exist` | Run `./listmonk --install --idempotent --yes` first; add `--upgrade` on version bumps to migrate the schema |
| listmonk emails not delivering | Verify SMTP config in the web UI under **Settings → SMTP**; test with a one-subscriber campaign; check SPF/DKIM on your sending domain |
| SimpleLogin alias forwarding fails | Verify MX records for the alias domain point at your server; check `podman logs postfix` for SMTP errors |
| SimpleLogin `Flask secret mismatch` | Ensure `FLASK_SECRET` is identical in both `app` and `postfix` containers |
| AnonAddy `APP_KEY` missing | Generate with `podman exec anonaddy php artisan key:generate --show` |
| Postal `initialize` fails | Ensure MariaDB is fully started before running init; check root password matches across containers |
| Postal DKIM not working | Generate keys in the Postal web UI and add the DNS TXT record for the returned selector |
| Stalwart OOM crash on incoming email | Upgrade to v0.15.5+ — CVE-2026-26312: malformed nested MIME messages cause memory exhaustion on older versions |
| Stalwart — New Outlook (Store app) IMAP login fails | New Outlook for Windows has known TLS handshake issues with self-hosted IMAP servers; use Outlook Classic (Win32) or Thunderbird instead |
| Deferred mail piling up | Check queue for 5xx vs 4xx — 5xx means fix DNS/auth now; 4xx means wait and investigate rate limiting or blocklists |
| Good mail landing in spam | Run through mail-tester.com or MXToolbox; verify PTR resolves correctly, SPF alignment passes, DKIM signature validates, DMARC is not `p=none` |

---

# Mail Clients

Web, desktop, mobile, and terminal clients for secure IMAP/SMTP access.

## Roundcube
**Purpose**: Mature, plugin-rich webmail client.
```yaml
# ~/roundcube/compose.yaml
services:
  roundcube:
    image: roundcube/roundcubemail:latest
    ports: ["127.0.0.1:8082:80"]
    environment:
      ROUNDCUBE_DEFAULT_HOST: tls://mail.example.com
    depends_on: [db]
    restart: unless-stopped
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: roundcube
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: roundcubemail
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped
volumes:
  pg_data:
```

```bash
cd ~/roundcube && podman-compose up -d
```

## SnappyMail & SOGo
**Purpose**: SnappyMail is a modern lightweight webmail fork. SOGo is a groupware server with CalDAV, CardDAV, and ActiveSync support — they serve different purposes and should be deployed separately.

```yaml
# ~/snappymail/compose.yaml
services:
  snappymail:
    image: teohhanhui/snappymail
    ports:
      - 127.0.0.1:8888:8888
    volumes:
      - /home/user/snappymail/data:/var/lib/snappymail:Z
    restart: unless-stopped
```

```yaml
# ~/sogo/compose.yaml
services:
  sogo:
    image: sogo/sogo
    ports:
      - 127.0.0.1:20000:20000
    volumes:
      - /home/user/sogo/config:/etc/sogo:Z
      - /home/user/sogo/lib:/var/lib/sogo:Z
    restart: unless-stopped
```

```bash
cd ~/snappymail && podman-compose up -d
cd ~/sogo && podman-compose up -d
```

## Thunderbird / KMail / Evolution
**Purpose**: Feature-rich desktop clients with PGP, CalDAV, and Exchange/ActiveSync support. Install via Flatpak.
- **Thunderbird**: `flatpak install flathub org.mozilla.Thunderbird`
- **KMail**: `flatpak install flathub org.kde.kmail2` (KDE — or pre-installed on Shani OS KDE edition)
- **Evolution**: `flatpak install flathub org.gnome.Evolution` (GNOME)

## FairEmail / K-9 Mail
**Purpose**: Privacy-focused Android clients. K-9 will become official Thunderbird Mobile. Enable IMAP IDLE for push-like sync.
- **FairEmail**: F-Droid or Play Store
- **K-9**: F-Droid or Play Store

## Configuration & Security Tips
- Always use IMAPS (`993`) and SMTPS (`465`/`587` with STARTTLS). Never allow plaintext on port 143/25 from clients.
- Disable plaintext auth. Use App Passwords if 2FA is enabled on the account.
- Enable IMAP IDLE for instant server-push notifications — avoids polling and reduces battery drain on mobile.
- Train server-side spam filters via "Mark as Spam/Not Spam". Rspamd and SpamAssassin use Bayesian learning; your feedback improves accuracy over time.
- Never store plain-text passwords in config files. Use GPG or client-native secret managers.
- Thunderbird has native OpenPGP support since v78 — no Enigmail plugin needed. Use it for sensitive mail end-to-end.
