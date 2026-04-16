---
title: Mail Servers
section: Self-Hosting & Servers
updated: 2026-04-16
---

# Mail Servers

Production-ready email solutions for full data control and privacy.

> ⚠️ **Prerequisite**: Requires static public IP, reverse DNS (PTR), and correct DNS records (MX, SPF, DKIM, DMARC). Residential ISPs often block port 25. Use a VPS or outbound relay if needed.

## Mailcow (Full-Featured)
**Purpose**: Complete mail suite: Postfix, Dovecot, SOGo, Rspamd, ClamAV, admin UI, and ActiveSync.
```yaml
# Clone: git clone https://github.com/mailcow/mailcow-dockerized
# Edit mailcow.conf, then run: sudo docker compose up -d
```
Ports: `25`, `465/587`, `143/993`, `80/443`. Firewall: `sudo firewall-cmd --add-service=smtp --add-service=smtps --add-service=imap --add-service=imaps --add-service=http --add-service=https --permanent && reload`.

## Mailu (Lightweight & Modular)
**Purpose**: Modular, Alpine-based stack with Roundcube/SnappyMail, easy to deploy via compose.
```yaml
services:
  front: { image: mailu/nginx:2.0, ports: ["25:25", "465:465", "587:587", "143:143", "993:993", "80:80", "443:443"], volumes: [/home/user/mailu/data:/data:Z, /home/user/mailu/dkim:/dkim:Z, /home/user/mailu/certs:/certs:Z] }
  admin: { image: mailu/admin:2.0, environment: {HOSTNAME: mail.example.com, SECRET_KEY: $(openssl rand -hex 32)}, volumes: [/home/user/mailu/data:/data:Z], depends_on: [db] }
  db: { image: postgres:15-alpine, environment: {POSTGRES_USER: mailu, POSTGRES_PASSWORD: secret, POSTGRES_DB: mailu}, volumes: [pg_data:/var/lib/postgresql/data] }
  imap: { image: mailu/dovecot:2.0, volumes: [/home/user/mailu/data:/data:Z] }
  smtp: { image: mailu/postfix:2.0, volumes: [/home/user/mailu/data:/data:Z] }
  antispam: { image: mailu/rspamd:2.0, volumes: [/home/user/mailu/filter:/var/lib/rspamd:Z] }
volumes: {pg_data: {}}
```

## Stalwart Mail Server
**Purpose**: Next-gen, single-binary Rust mail server. JMAP, IMAP, SMTP, Sieve, webmail built-in. Extremely low resource usage.
```bash
podman run -d \
  --name stalwart \
  -p 127.0.0.1:25:25 \
  -p 127.0.0.1:465:465 \
  -p 127.0.0.1:587:587 \
  -p 127.0.0.1:143:143 \
  -p 127.0.0.1:993:993 \
  -p 127.0.0.1:8080:8080 \
  -v /home/user/stalwart:/stalwart:Z \
  -e STALWART_SERVER__LISTENERS__HTTPS__ADDRESS=0.0.0.0:8080 \
  --restart unless-stopped \
  stalwartlabs/mail-server:latest
```

## DNS & Deliverability Checklist
| Record | Purpose | Example |
|--------|---------|---------|
| `MX` | Routes inbound email | `10 mail.example.com.` |
| `PTR` | ISP maps IP → hostname | Set via VPS/ISP panel |
| `SPF` | Authorizes sending IPs | `v=spf1 mx ip4:203.0.113.50 -all` |
| `DKIM` | Cryptographic outbound signature | Generated via admin UI |
| `DMARC` | Policy for failed auth | `v=DMARC1; p=reject; rua=mailto:dmarc@example.com` |

> 💡 **Backup**: `restic backup /home/user/mailcow /home/user/mailu /home/user/stalwart`.

# Mail Clients

Web, desktop, mobile, and terminal clients for secure IMAP/SMTP access.

## Roundcube / SnappyMail / SOGo
**Purpose**: Roundcube is a mature, plugin-rich webmail client. SnappyMail is a modern, lightweight fork. SOGo is a groupware with ActiveSync.
```yaml
# ~/roundcube/compose.yml
services:
  roundcube: { image: roundcube/roundcubemail:latest, ports: ["127.0.0.1:8080:80"], environment: {ROUNDCUBE_DEFAULT_HOST: tls://mail.example.com}, depends_on: [db] }
  db: { image: postgres:15-alpine, environment: {POSTGRES_USER: roundcube, POSTGRES_PASSWORD: secret, POSTGRES_DB: roundcubemail}, volumes: [pg_data:/var/lib/postgresql/data] }
volumes: {pg_data: {}}
```
```bash
podman run -d --name snappymail -p 127.0.0.1:8888:8888 -v /home/user/snappymail/data:/var/lib/snappymail:Z --restart unless-stopped teohhanhui/snappymail
podman run -d --name sogo -p 127.0.0.1:20000:20000 -v /home/user/sogo/config:/etc/sogo:Z -v /home/user/sogo/lib:/var/lib/sogo:Z --restart unless-stopped sogo/sogo
```

## Thunderbird / KMail / Evolution
**Purpose**: Feature-rich desktop clients with PGP, CalDAV, and Exchange/ActiveSync support. Install via Flatpak or `pacman`.
- **Thunderbird**: `flatpak install flathub org.mozilla.Thunderbird`
- **KMail**: `sudo pacman -S kmail kontact` (KDE)
- **Evolution**: `flatpak install flathub org.gnome.Evolution` (GNOME)

## FairEmail / K-9 Mail
**Purpose**: Privacy-focused Android clients. K-9 will become official Thunderbird Mobile. Enable IMAP IDLE for push-like sync.
- **FairEmail**: F-Droid or Play Store
- **K-9**: F-Droid or Play Store

## Configuration & Security Tips
- Always use IMAPS (`993`) and SMTPS (`465`/`587` with STARTTLS).
- Disable plaintext auth. Use App Passwords if 2FA is enabled.
- Enable IMAP IDLE for instant notifications.
- Train server-side spam filters via "Mark as Spam/Not Spam".
- Never store plain-text passwords in configs. Use GPG or client-native managers.
