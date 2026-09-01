---
title: Traefik
section: Self-Hosting & Servers
updated: 2026-08-28
---

> **Part of the Networking & Infrastructure series:** See [all networking docs](../networking)

## Traefik

**Purpose:** Container-native reverse proxy and load balancer. Auto-discovers services by watching Docker/Podman labels — no config file reload needed when you start a new container. Supports automatic HTTPS via Let's Encrypt, weighted load balancing, sticky sessions, rate limiting, circuit breakers, and middleware chains. Best for setups where containers come and go frequently and you want routing to update automatically.

```yaml
# ~/traefik/compose.yml
services:
  traefik:
    image: traefik:v3
    ports:
      - "0.0.0.0:80:80"
      - "0.0.0.0:443:443"
      - "127.0.0.1:8080:8080"   # Dashboard
    command:
      - --api.dashboard=true
      - --api.insecure=false
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --providers.file.directory=/config
      - --entrypoints.web.address=:80
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.httpchallenge=true
      - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
      - --certificatesresolvers.letsencrypt.acme.email=you@example.com
      - --certificatesresolvers.letsencrypt.acme.storage=/certs/acme.json
      - --log.level=INFO
      - --accesslog=true
    volumes:
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
      - /home/user/traefik/config:/config:Z
      - /home/user/traefik/certs:/certs:Z
    restart: unless-stopped
```

```bash
cd ~/traefik && podman-compose up -d
```

#### Expose a service via labels (no Caddyfile edit required)
```yaml
services:
  myapp:
    image: myapp:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myapp.rule=Host(`app.example.com`)"
      - "traefik.http.routers.myapp.entrypoints=websecure"
      - "traefik.http.routers.myapp.tls.certresolver=letsencrypt"
      - "traefik.http.services.myapp.loadbalancer.server.port=3000"
```

#### Load balancing and middleware via dynamic config (`/home/user/traefik/config/dynamic.yml`)
```yaml
http:
  middlewares:
    rate-limit:
      rateLimit:
        average: 100
        burst: 50

    internal-only:
      ipAllowList:
        sourceRange:
          - "192.168.1.0/24"
          - "100.64.0.0/10"     # Tailscale

  services:
    myapp-weighted:
      weighted:
        services:
          - name: myapp-v1
            weight: 90
          - name: myapp-v2
            weight: 10           # Canary: 10% to new version

  routers:
    myapp:
      rule: Host(`app.example.com`)
      service: myapp-weighted
      entryPoints: [websecure]
      middlewares: [rate-limit]
      tls:
        certResolver: letsencrypt
```

#### Secure the dashboard behind Caddy
```caddyfile
traefik.home.local { tls internal; reverse_proxy localhost:8080 }
```

---



---

## See Also

- [Networking & Infrastructure](networking) — overview
