---
title: Firezone
section: Self-Hosting & Servers
updated: 2026-08-28
---

**Purpose:** Zero-trust network access (ZTNA) built on WireGuard. Features SSO (OIDC/SAML), granular access policies, device posture checks, and a unified dashboard.

```yaml
# ~/firezone/compose.yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: firezone
      POSTGRES_PASSWORD: strongpassword
      POSTGRES_DB: firezone
    volumes: [db_data:/var/lib/postgresql/data]
    restart: unless-stopped

  firezone:
    image: firezone/firezone:latest
    ports:
      - "0.0.0.0:4443:443"
      - "0.0.0.0:51820:51820/udp"
    environment:
      DATABASE_URL: postgresql://firezone:strongpassword@db:5432/firezone
      SECRET_KEY_BASE: changeme-generate-with-openssl-rand-base64-64
      DEFAULT_ADMIN_EMAIL: admin@example.com
    cap_add: [NET_ADMIN]
    sysctls:
      net.ipv4.ip_forward: "1"
      net.ipv6.conf.all.disable_ipv6: "0"
    depends_on: [db]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/firezone && podman-compose up -d
```

- **Access:** `https://localhost:4443`
- **Firewall:** `sudo firewall-cmd --add-port=4443/tcp --add-port=51820/udp --permanent && sudo firewall-cmd --reload`

## See Also

- [WireGuard / WG-Easy](./wireguard-easy.md)
- [Pritunl](./pritunl.md)
- [NetBird](./netbird.md)
