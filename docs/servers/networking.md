---
title: Network & Analytics
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Network & Analytics

DNS filtering, privacy-friendly analytics, search engines, dashboards, latency monitoring, and network utilities.

---

## Pi-hole

**Purpose:** Network-wide DNS ad and tracker blocker. Runs as your LAN's DNS server and blocks ads, telemetry, and malware domains for every device — phones, smart TVs, IoT — without installing anything on them.

```yaml
# ~/pihole/compose.yaml
services:
  pihole:
    image: pihole/pihole:latest
    ports:
      - 127.0.0.1:8083:80
      - 53:53/tcp
      - 53:53/udp
    volumes:
      - /home/user/pihole/etc-pihole:/etc/pihole:Z
      - /home/user/pihole/etc-dnsmasq.d:/etc/dnsmasq.d:Z
    environment:
      TZ: Asia/Kolkata
      WEBPASSWORD: changeme
    restart: unless-stopped
```

```bash
cd ~/pihole && podman-compose up -d
```

**Firewall** (allow DNS from LAN):
```bash
sudo firewall-cmd --add-service=dns --permanent && sudo firewall-cmd --reload
```
```bash
# Update gravity (blocklists) manually
podman exec pihole pihole -g

# View real-time query log
podman exec pihole pihole -t

# Enable/disable Pi-hole blocking
podman exec pihole pihole enable
podman exec pihole pihole disable 300  # disable for 300 seconds

# Add a domain to whitelist
podman exec pihole pihole -w example.com

# Add a domain to blacklist
podman exec pihole pihole -b ads.example.com

# Remove from whitelist
podman exec pihole pihole -w -d example.com

# View stats summary
podman exec pihole pihole -c

# Flush logs
podman exec pihole pihole flush

# Restart DNS resolver
podman exec pihole pihole restartdns

# Show version info
podman exec pihole pihole version
```

> Set your router's DHCP DNS option to your server's LAN IP. All devices will automatically use Pi-hole.

**Caddy:**
```caddyfile
pihole.home.local { tls internal; reverse_proxy localhost:8083 }
```

---

## AdGuard Home

**Purpose:** Pi-hole alternative with native DNS-over-HTTPS (DoH) and DNS-over-TLS (DoT) support, a cleaner UI, per-client rules, and built-in parental controls.

```yaml
# ~/adguardhome/compose.yaml
services:
  adguardhome:
    image: adguard/adguardhome
    ports:
      - 53:53/tcp
      - 53:53/udp
      - 127.0.0.1:3000:3000
      - 853:853/tcp
    volumes:
      - /home/user/adguard/work:/opt/adguardhome/work:Z
      - /home/user/adguard/conf:/opt/adguardhome/conf:Z
    restart: unless-stopped
```

```bash
cd ~/adguardhome && podman-compose up -d
```

Access the setup wizard at `http://localhost:3000` on first run. After setup, the UI moves to port `80` (or the port you configure).

**Firewall** (for DoT from external devices):
```bash
sudo firewall-cmd --add-port=853/tcp --permanent && sudo firewall-cmd --reload
```

**Common operations:**
```bash
# View logs
podman logs -f adguardhome

# Test DNS resolution via AdGuard
podman exec adguardhome nslookup google.com 127.0.0.1

# Query statistics via API
curl -u admin:changeme http://localhost:3000/control/stats

# Update blocklists
curl -X POST -u admin:changeme http://localhost:3000/control/filtering/refresh   -H "Content-Type: application/json" -d '{"whitelist":false}'

# Add a custom DNS rewrite (internal domain)
curl -X POST -u admin:changeme http://localhost:3000/control/rewrite/add   -H "Content-Type: application/json"   -d '{"domain":"myserver.home.local","answer":"192.168.1.10"}'
```

---

## Unbound (Recursive DNS Resolver)

**Purpose:** Validating, caching, recursive DNS resolver. Use it upstream of Pi-hole or AdGuard Home for DNSSEC validation and to eliminate your ISP's DNS from the picture entirely. Queries go directly to root nameservers.

```yaml
# ~/unbound/compose.yaml
services:
  unbound:
    image: mvance/unbound
    ports:
      - 127.0.0.1:5335:53/tcp
      - 127.0.0.1:5335:53/udp
    volumes:
      - /home/user/unbound/unbound.conf:/opt/unbound/etc/unbound/unbound.conf:ro,Z
    restart: unless-stopped
```

```bash
cd ~/unbound && podman-compose up -d
```

In Pi-hole: Settings → DNS → Custom upstream DNS → `127.0.0.1#5335`. Disable all other upstream DNS entries.

---

## Nginx Proxy Manager

**Purpose:** GUI-based reverse proxy with Let's Encrypt integration. If you find Caddy's Caddyfile syntax unfamiliar, NPM offers a click-through interface for creating proxy hosts, redirects, and SSL termination.

```yaml
# ~/npm/compose.yml
services:
  npm:
    image: jc21/nginx-proxy-manager:latest
    ports:
      - "80:80"
      - "443:443"
      - "127.0.0.1:81:81"
    environment:
      DB_MYSQL_HOST: db
      DB_MYSQL_PORT: 3306
      DB_MYSQL_USER: npm
      DB_MYSQL_PASSWORD: changeme
      DB_MYSQL_NAME: npm
    volumes:
      - /home/user/npm/data:/data:Z
      - /home/user/npm/letsencrypt:/etc/letsencrypt:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: npm
      MYSQL_USER: npm
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/npm && podman-compose up -d
```

Access the admin UI at `http://localhost:81`. Default credentials: `admin@example.com` / `changeme` — change immediately after first login. Add proxy hosts via Dashboard → Proxy Hosts → Add Proxy Host; enable Let's Encrypt in the SSL tab.

---

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

**Expose a service via labels (no Caddyfile edit required):**
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

**Load balancing and middleware via dynamic config (`/home/user/traefik/config/dynamic.yml`):**
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

**Secure the dashboard behind Caddy:**
```caddyfile
traefik.home.local { tls internal; reverse_proxy localhost:8080 }
```

---

## HAProxy (High-Performance Load Balancer)

**Purpose:** The gold-standard TCP and HTTP load balancer. HAProxy has been the backbone of GitHub, Reddit, and Stack Overflow for years. Unlike Traefik (label-driven, auto-discovery) or Caddy (config-file, developer-friendly), HAProxy is purpose-built for raw throughput, advanced health checking, and TCP-layer load balancing — useful for load balancing PostgreSQL replicas, MQTT brokers, Redis, or any non-HTTP protocol alongside web traffic.

```yaml
# ~/haproxy/compose.yaml
services:
  haproxy:
    image: haproxy:3-alpine
    ports:
      - 0.0.0.0:80:80
      - 0.0.0.0:443:443
      - 127.0.0.1:9000:9000
    volumes:
      - /home/user/haproxy/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro,Z
      - /home/user/haproxy/certs:/etc/haproxy/certs:ro,Z
    restart: unless-stopped
```

```bash
cd ~/haproxy && podman-compose up -d
```

**Example `haproxy.cfg` — HTTP load balancing with health checks:**
```
global
  log stdout format raw local0
  maxconn 50000

defaults
  mode http
  log global
  option httplog
  option dontlognull
  option forwardfor
  option http-server-close
  timeout connect 5s
  timeout client  30s
  timeout server  30s
  retries 3

# Stats dashboard
frontend stats
  bind *:9000
  stats enable
  stats uri /
  stats refresh 10s
  stats auth admin:changeme
  stats hide-version

# HTTPS frontend
frontend https_in
  bind *:443 ssl crt /etc/haproxy/certs/combined.pem
  http-request set-header X-Forwarded-Proto https
  default_backend app_servers

# Backend with health checks
backend app_servers
  balance roundrobin
  option httpchk GET /health HTTP/1.1\r\nHost:\ app.example.com
  http-check expect status 200
  server app1 192.168.1.10:8080 check inter 10s fall 3 rise 2
  server app2 192.168.1.11:8080 check inter 10s fall 3 rise 2
  server app3 192.168.1.12:8080 check inter 10s fall 3 rise 2 backup
```

**Load balancing algorithms:**
```
balance roundrobin   # Equal distribution (default)
balance leastconn    # Route to server with fewest active connections
balance source       # Sticky sessions by client IP hash
balance uri          # Sticky by URI hash (useful for caches)
```

**TCP load balancing for databases and MQTT:**
```
frontend postgres_in
  mode tcp
  bind *:5432
  default_backend postgres_servers

backend postgres_servers
  mode tcp
  balance leastconn
  option tcp-check
  server pg-primary 192.168.1.20:5432 check
  server pg-replica 192.168.1.21:5432 check backup

frontend mqtt_in
  mode tcp
  bind *:1883
  default_backend mqtt_brokers

backend mqtt_brokers
  mode tcp
  balance leastconn
  server mqtt1 192.168.1.30:1883 check
  server mqtt2 192.168.1.31:1883 check
```

Access the live stats page at `http://localhost:9000` to see connection counts, request rates, error rates, and per-backend health in real time.

---

## SearXNG

**Purpose:** Privacy-respecting meta-search engine. Aggregates results from Google, Bing, DuckDuckGo, and 70+ other sources without tracking, logging, or profiling users. Run it on your server and use it as your default browser search engine.

```yaml
# ~/searxng/compose.yaml
services:
  searxng:
    image: searxng/searxng:latest
    ports:
      - 127.0.0.1:8091:8080
    volumes:
      - /home/user/searxng/settings:/etc/searxng:Z
    environment:
      SEARXNG_BASE_URL: https://search.home.local
    restart: unless-stopped
```

```bash
cd ~/searxng && podman-compose up -d
```

---

## Technitium DNS Server

**Purpose:** Full-featured authoritative and recursive DNS server with a clean web UI. Goes further than Pi-hole and AdGuard Home — Technitium can host your own DNS zones (split-horizon DNS for `home.local`), act as a DHCP server, supports DNS-over-HTTPS/TLS/QUIC, has advanced conditional forwarding, and includes built-in ad-blocking. The right choice when you need proper DNS zone management alongside ad-blocking.

```yaml
# ~/technitium-dns/compose.yaml
services:
  technitium-dns:
    image: technitium/dns-server:latest
    ports:
      - 53:53/udp
      - 53:53/tcp
      - 127.0.0.1:5380:5380
      - 853:853/tcp
      - 443:443/tcp
    volumes:
      - /home/user/technitium/config:/etc/dns:Z
    environment:
      DNS_SERVER_DOMAIN: dns.home.local
      DNS_SERVER_ADMIN_PASSWORD: changeme
    restart: unless-stopped
```

```bash
cd ~/technitium-dns && podman-compose up -d
```

Access the web UI at `http://localhost:5380`. Configure zones, forwarders, and blocklists in the admin panel.

> **Pi-hole vs AdGuard vs Technitium:** Use Pi-hole or AdGuard for simple network-wide ad-blocking. Use Technitium when you also need to manage DNS zones for internal services or run DHCP from the same interface.

---

## LibreNMS (Network Monitoring)

**Purpose:** Full-featured auto-discovering network monitoring system. Discovers routers, switches, servers, APs, and printers via SNMP, then monitors CPU, memory, interface traffic, BGP, environmental sensors, and more. Generates alerts, bandwidth graphs, and SLA reports. The self-hosted PRTG/SolarWinds alternative.

```yaml
# ~/librenms/compose.yml
services:
  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: librenms
      MYSQL_USER: librenms
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    command: --innodb-file-per-table=1 --lower-case-table-names=0
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  librenms:
    image: librenms/librenms:latest
    ports: ["127.0.0.1:8100:8000"]
    environment:
      DB_HOST: db
      DB_NAME: librenms
      DB_USER: librenms
      DB_PASSWORD: changeme
      REDIS_HOST: redis
      TZ: Asia/Kolkata
      MEMORY_LIMIT: 256M
      UPLOAD_MAX_SIZE: 16M
    volumes:
      - /home/user/librenms/data:/data:Z
    depends_on: [db, redis]
    restart: unless-stopped

  dispatcher:
    image: librenms/librenms:latest
    environment:
      DB_HOST: db
      DB_NAME: librenms
      DB_USER: librenms
      DB_PASSWORD: changeme
      REDIS_HOST: redis
      DISPATCHER_NODE_ID: dispatcher1
      SIDECAR_DISPATCHER: "1"
    volumes:
      - /home/user/librenms/data:/data:Z
    depends_on: [librenms]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/librenms && podman-compose up -d
```

**Common operations:**
```bash
# Add a device via CLI
podman exec librenms lnms device:add 192.168.1.1 --v2c --community public

# Run discovery and polling manually
podman exec librenms lnms device:poll 192.168.1.1

# Validate the install
podman exec librenms lnms validate

# View logs
podman logs -f librenms

# Generate an API token for integrations
podman exec librenms lnms api-token:add mytoken --user admin
```

Access at `http://localhost:8100`. Add devices via Devices → Add Device, specifying SNMP community string and version.

**Caddy:**
```caddyfile
librenms.home.local { tls internal; reverse_proxy localhost:8100 }
```

---

## NetBox (Network Documentation & IPAM)

**Purpose:** Source of truth for your network infrastructure. Document IP address assignments (IPAM), VLAN configurations, rack layouts, cable connections, device inventory, and circuit topology. NetBox is not a monitoring tool — it's the authoritative record of what you have and how it's connected. Integrates with Ansible, Terraform, and LibreNMS.

```yaml
# ~/netbox/compose.yml
services:
  netbox:
    image: netboxcommunity/netbox:latest
    ports: ["127.0.0.1:8101:8080"]
    environment:
      DB_HOST: postgres
      DB_NAME: netbox
      DB_USER: netbox
      DB_PASSWORD: changeme
      REDIS_HOST: redis
      REDIS_PASSWORD: ""
      SECRET_KEY: changeme-run-openssl-rand-base64-50
      ALLOWED_HOSTS: netbox.home.local localhost
      SUPERUSER_EMAIL: admin@home.local
      SUPERUSER_PASSWORD: changeme
    volumes:
      - /home/user/netbox/media:/opt/netbox/netbox/media:Z
    depends_on: [postgres, redis]
    restart: unless-stopped

  netbox-worker:
    image: netboxcommunity/netbox:latest
    command: /opt/netbox/venv/bin/python /opt/netbox/netbox/manage.py rqworker
    environment:
      DB_HOST: postgres
      DB_NAME: netbox
      DB_USER: netbox
      DB_PASSWORD: changeme
      REDIS_HOST: redis
      SECRET_KEY: changeme-run-openssl-rand-base64-50
    depends_on: [postgres, redis]
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: netbox
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: netbox
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/netbox && podman-compose up -d
```

Access at `http://localhost:8101`. Start by defining your IP prefixes and VLANs, then populate devices and rack positions.

---

## Ntopng (Network Traffic Analysis)

**Purpose:** Real-time network traffic monitoring and analysis. Shows active flows, top talkers, protocol breakdown, geo-IP mapping, and historical traffic trends. Can integrate with nProbe for deep packet inspection and with pfSense/OPNsense via NetFlow/sFlow export.

```yaml
# ~/ntopng/compose.yaml
services:
  ntopng:
    image: ntop/ntopng:stable
    network_mode: host
    volumes:
      - /home/user/ntopng/data:/var/lib/ntopng:Z
    environment:
      NTOPNG_COMMUNITY: true
    command: --interface=eth0 --http-port=3000 --data-dir=/var/lib/ntopng --community
    restart: unless-stopped
```

```bash
cd ~/ntopng && podman-compose up -d
```

> Replace `eth0` with your primary network interface name (`ip link show`). `--network host` is required for ntopng to see actual traffic.

---

## Blocky (Fast DNS Ad Blocker)

**Purpose:** High-performance DNS proxy written in Go. Blocks ads and trackers via deny-lists (same blocklists as Pi-hole), supports DNS-over-HTTPS and DNS-over-TLS upstream resolvers, per-client group rules, conditional forwarding, query logging to a database, and response caching with prefetching. Starts in under a second and uses a fraction of Pi-hole's RAM — good choice for low-power hardware or containers where resource efficiency matters.

```yaml
# ~/blocky/compose.yml
services:
  blocky:
    image: spx01/blocky:latest
    ports:
      - "53:53/tcp"
      - "53:53/udp"
      - "127.0.0.1:4000:4000"
    volumes:
      - /home/user/blocky/config.yml:/app/config.yml:ro,Z
    restart: unless-stopped
```

```bash
cd ~/blocky && podman-compose up -d
```

**Example `config.yml`:**
```yaml
upstreams:
  groups:
    default:
      - https://one.one.one.one/dns-query    # Cloudflare DoH
      - https://dns.quad9.net/dns-query      # Quad9 DoH

blocking:
  blackLists:
    ads:
      - https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts
      - https://adaway.org/hosts.txt
  clientGroupsBlock:
    default:
      - ads

caching:
  minTime: 5m
  maxTime: 30m
  prefetching: true

queryLog:
  type: console
  logRetentionDays: 7

ports:
  dns: 53
  http: 4000
```

> **Pi-hole vs Blocky:** Use Pi-hole or AdGuard Home for a dashboard-heavy, click-to-manage experience. Use Blocky when you want a lean, config-file-driven blocker with better performance and no web UI overhead.

---

## Caddy Configuration

```caddyfile
pihole.home.local      { tls internal; reverse_proxy localhost:8083 }
search.home.local      { tls internal; reverse_proxy localhost:8091 }
dns.home.local         { tls internal; reverse_proxy localhost:5380 }
librenms.home.local    { tls internal; reverse_proxy localhost:8100 }
netbox.home.local      { tls internal; reverse_proxy localhost:8101 }
ntopng.home.local      { tls internal; reverse_proxy localhost:3000 }
blocky.home.local      { tls internal; reverse_proxy localhost:4000 }
traefik.home.local     { tls internal; reverse_proxy localhost:8080 }
haproxy.home.local     { tls internal; reverse_proxy localhost:9000 }
npm.home.local         { tls internal; reverse_proxy localhost:81 }
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Pi-hole not blocking ads on some devices | Verify the device's DNS is pointing at the server IP (not 1.1.1.1 hardcoded); check Pi-hole's query log to confirm queries are reaching it |
| AdGuard DoT not working | Ensure `853/tcp` is open in firewalld; some clients need the full TLS hostname in the format `tls://server-ip` |
| Port 53 conflict | `systemd-resolved` may be listening on port 53 — run `sudo systemctl disable --now systemd-resolved` or configure it to use a stub listener only |
| Traefik not picking up containers | Ensure `--providers.docker=true` in the Traefik command args; verify containers have the `traefik.enable=true` label and are on the same network as Traefik |
| Traefik HTTPS cert not issued | Check the ACME email is set; ensure port `80` is publicly reachable for the HTTP challenge; use DNS challenge for wildcard certs |
| HAProxy backend health check fails | Verify the health check path returns HTTP 200 from the backend; confirm `option httpchk` sends the correct `Host` header; check `podman logs haproxy` |
| HAProxy stats page blank | Confirm port `9000` is bound and `stats auth` credentials are correct; the stats URI defaults to `/` |
| NPM SSL certificate fails | Ensure ports `80` and `443` are publicly reachable and DNS points at your server; check Let's Encrypt rate limits if retrying |
| Technitium zones not resolving | Ensure the zone type is set to `Primary` and a valid SOA record exists; test with `dig @localhost home.local` |
| LibreNMS no data after adding device | Verify SNMP community string matches the device; check `podman logs dispatcher` for polling errors; ensure UDP 161 is accessible |
| LibreNMS RRD graphs blank | The dispatcher container must be running; check Redis connectivity between librenms and dispatcher containers |
| NetBox `SECRET_KEY too short` | Generate with `openssl rand -base64 50`; must be at least 50 characters |
| NetBox worker not processing jobs | Ensure the `netbox-worker` container is running; check Redis is reachable; view logs with `podman logs netbox-worker` |
| Ntopng shows no traffic | Ensure `--network host` is set and the correct interface is specified; verify the interface has traffic with `tcpdump -i eth0 -c 5` |
| Blocky not blocking ads | Verify the blocklist URLs are reachable from the container on startup; check `podman logs blocky` for download errors; confirm client DNS points at the server |

