---
title: Caddy
section: Networking
updated: 2026-04-22
---

# Caddy Web Server

[Caddy](https://caddyserver.com/) is a modern web server with automatic HTTPS. It provisions and renews TLS certificates entirely automatically — via Let's Encrypt for public domains and via its own internal CA for private `.home.local` addresses — with no manual certificate management, no OpenSSL commands, and no browser warnings.

On Shani OS, Caddy is pre-installed and is the recommended reverse proxy for all self-hosted services. Always bind container ports to `127.0.0.1` and proxy through Caddy — this ensures every service is accessible only via HTTPS and never directly exposed to the network.

---

## Configuration Context

Caddy's behaviour depends on how it is launched.

### System Service (Recommended)

When managed via systemd, Caddy runs as the `caddy` system user and loads a system-wide config:

- **Config file:** `/etc/caddy/Caddyfile`
- **Certificates & data:** `/var/lib/caddy/.local/share/caddy/`

On Shani OS, `/etc` is managed atomically — your Caddyfile persists across OS updates and rollbacks.

```bash
sudo systemctl enable --now caddy
```

### Manual / Development

Running `caddy run` from a terminal loads the `Caddyfile` from the **current working directory**, or from an explicit path:

```bash
cd ~/projects/my-app/
caddy run                              # loads ./Caddyfile
caddy run --config /path/to/Caddyfile  # explicit path
```

---

## Service Management

```bash
# Enable and start on boot
sudo systemctl enable --now caddy

# Reload config with zero downtime (preferred — no connection drops)
sudo systemctl reload caddy

# Full restart (needed after a Caddy binary update)
sudo systemctl restart caddy

# Check status
systemctl status caddy

# Watch live logs
journalctl -u caddy -f

# Validate Caddyfile syntax before reloading (catches errors before they go live)
caddy validate --config /etc/caddy/Caddyfile

# Auto-format and fix indentation in place
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
```

---

## Caddyfile Reference

### Reverse Proxy

The most common use case — route external traffic to local services running on Podman, Distrobox, or bare ports.

```caddyfile
# /etc/caddy/Caddyfile

# Public domain — HTTPS via Let's Encrypt, auto-renewed
app.example.com {
    reverse_proxy localhost:8080
}

# Private domain — HTTPS via Caddy's internal CA
# Trust the CA once (see TLS section below) and all .home.local sites get valid certs
myapp.home.local {
    tls internal
    reverse_proxy localhost:3000
}

# Multiple subdomains, different backends
api.example.com       { reverse_proxy localhost:8000 }
dashboard.example.com { reverse_proxy localhost:9090 }
grafana.home.local    { tls internal; reverse_proxy localhost:3001 }
```

### Static File Server

```caddyfile
docs.example.com {
    root * /srv/http/docs
    file_server
    encode zstd gzip
}
```

### Load Balancing

```caddyfile
app.example.com {
    reverse_proxy localhost:3001 localhost:3002 localhost:3003 {
        lb_policy round_robin
        health_uri /health
        health_interval 10s
    }
}
```

### Basic Auth & Security Headers

```caddyfile
# Generate the bcrypt hash first:
#   caddy hash-password --plaintext "yourpassword"

secure.example.com {
    basicauth {
        admin $2a$14$YOUR_HASH_HERE
    }
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy no-referrer
        -Server
    }
    reverse_proxy localhost:8080
}
```

### Forward Auth (Authelia / Authentik)

Protect any service behind your SSO provider — one login page guards your entire self-hosted stack:

```caddyfile
# Authelia forward auth
service.example.com {
    forward_auth localhost:9091 {
        uri /api/verify?rd=https://auth.example.com
        copy_headers Remote-User Remote-Groups Remote-Name Remote-Email
    }
    reverse_proxy localhost:SERVICE_PORT
}

# Authentik forward auth
service.example.com {
    forward_auth localhost:9000 {
        uri /outpost.goauthentik.io/auth/caddy
        copy_headers X-authentik-username X-authentik-groups X-authentik-email
        header_up X-Original-URL {scheme}://{host}{uri}
    }
    reverse_proxy localhost:SERVICE_PORT
}
```

### Redirect HTTP → HTTPS (Explicit)

Caddy handles this automatically for public domains. For internal hosts where you want an explicit redirect:

```caddyfile
http://myapp.home.local {
    redir https://{host}{uri} permanent
}
```

### Global Options

```caddyfile
{
    email admin@example.com     # Used for Let's Encrypt notifications
    default_bind 0.0.0.0        # Prefer IPv4; remove if IPv6 works correctly
    # admin off                 # Disable the local admin API if not needed
}

example.com {
    reverse_proxy 192.168.1.50:80
}
```

---

## TLS & Certificates

| Domain type | Configuration | How it works |
|-------------|---------------|--------------|
| Public (`example.com`) | No `tls` directive needed | Caddy auto-provisions via Let's Encrypt ACME (HTTP-01 or TLS-ALPN-01) |
| Private (`.home.local`, `.lan`, `.internal`) | `tls internal` | Caddy issues certificates from its own local CA |
| Custom cert | `tls /path/cert.pem /path/key.pem` | Your own certificate |
| Let's Encrypt staging (testing) | `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` | Avoids rate limits while testing |

### Trust the Internal CA

Run this once on the Shani OS machine so that browsers and command-line tools trust the local CA for all `*.home.local` domains:

```bash
sudo trust anchor \
  /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt
sudo update-ca-trust
```

To trust it on other devices (phones, other laptops), export the certificate and install it in each device's trust store. On Android: Settings → Security → Install from storage. On iOS: Settings → General → VPN & Device Management.

### Wildcard Certificates (DNS-01 Challenge)

For a wildcard cert (`*.home.local`) that works across all subdomains, use the DNS-01 challenge with your DNS provider's plugin. This avoids needing port 80 open:

```caddyfile
{
    acme_dns cloudflare {env.CF_API_TOKEN}
}

*.home.local {
    tls {
        dns cloudflare {env.CF_API_TOKEN}
    }
    @jellyfin host jellyfin.home.local
    handle @jellyfin {
        reverse_proxy localhost:8096
    }
    @nextcloud host nextcloud.home.local
    handle @nextcloud {
        reverse_proxy localhost:8080
    }
}
```

---

## Caddy + Tailscale

Use Caddy with `tls internal` to serve HTTPS on your Tailscale interface. Services become available as `https://hostname.tailnet-name.ts.net` with valid certificates on every tailnet device (after trusting the local CA):

```caddyfile
# Accessible only on your tailnet — not exposed to the internet
jellyfin.home.local {
    tls internal
    reverse_proxy localhost:8096
}

vaultwarden.home.local {
    tls internal
    reverse_proxy localhost:8180
}
```

Services exposed via Tailscale do not need firewall rules — Tailscale handles access control. See the [Tailscale wiki page](https://docs.shani.dev/doc/networking/tailscale) for setup.

---

## Caddy + Cloudflared

When exposing services via Cloudflare Tunnel, you do **not** need a Caddyfile entry — Cloudflare handles TLS termination at the edge. Caddy is still the right choice for internal `.home.local` access on Tailscale, and for any services accessed directly on the LAN.

Use both together: Caddy serves internal traffic; Cloudflared exposes selected services publicly. See the [Cloudflared wiki page](https://docs.shani.dev/doc/networking/cloudflared).

---

## Permissions & File Serving

Caddy runs as the `caddy` system user with restricted privileges. If it needs to read files from your home directory, grant access with ACLs rather than changing ownership:

```bash
# Grant recursive read + execute to the caddy user
sudo setfacl -R -m u:caddy:rx /home/user/www

# Verify
getfacl /home/user/www
```

For SELinux contexts (Shani OS uses SELinux by default):

```bash
# Check the current context
ls -Z /home/user/www

# Relabel if needed
sudo restorecon -Rv /home/user/www
```

---

## Firewall

Open ports 80 and 443 if Caddy is serving public traffic. Let's Encrypt requires port 80 to be reachable for HTTP-01 challenges:

```bash
sudo firewall-cmd --add-service=http --add-service=https --permanent
sudo firewall-cmd --reload
```

For internal-only Caddy serving `.home.local` addresses over Tailscale or the LAN, no firewall changes are needed — ports 80 and 443 do not need to be open to the internet.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `permission denied` serving files | `sudo setfacl -R -m u:caddy:rx /your/path`; check SELinux context with `ls -Z` |
| Browser shows untrusted cert for `.home.local` | Trust the Caddy local CA: `sudo trust anchor /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt && sudo update-ca-trust` |
| `bind: address already in use` | Another process owns port 80 or 443 — `sudo ss -tlnp | grep ':80\|:443'` to identify it |
| Service won't start | Validate syntax first: `caddy validate --config /etc/caddy/Caddyfile`; then check logs: `journalctl -u caddy -f` |
| Let's Encrypt rate limit hit | Switch to staging CA: `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` while testing |
| Reverse proxy returns 502 Bad Gateway | Confirm the backend is running and bound to the right port: `curl -v http://localhost:PORT`; for containers use `host.containers.internal` instead of `localhost` |
| Config change not taking effect | Run `sudo systemctl reload caddy` — Caddy must be explicitly reloaded to pick up Caddyfile changes |
| HTTPS certificate not renewing | Check `journalctl -u caddy` for ACME errors; confirm port 80 is reachable from the internet for HTTP-01 challenges |
| WebSocket connections dropping | Add `@ws { header Connection *Upgrade* }` matcher and `handle @ws { reverse_proxy ... }` with explicit WebSocket header passthrough |
