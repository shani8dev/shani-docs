---
title: Network & Analytics
section: Self-Hosting & Servers
updated: 2026-04-22
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.

# Network & Analytics

DNS filtering, privacy-friendly analytics, search engines, dashboards, latency monitoring, and network utilities.

---

## Key Concepts

#### OSI model in practice
Interviewers ask this to test whether you can reason about where a problem is occurring. Useful frames:
- Layer 3 (Network) problem: `ping` fails, wrong route, IP unreachable
- Layer 4 (Transport) problem: TCP connection times out or is refused, wrong port, firewall blocking
- Layer 7 (Application) problem: connection works but HTTP returns wrong status, TLS cert mismatch, wrong Host header

#### DNS resolution chain
Browser checks local cache → OS cache → `/etc/hosts` → configured resolver (Pi-hole, AdGuard) → resolver queries root nameservers → TLD nameserver → authoritative nameserver → response cached at each layer with TTL. `dig +trace` shows the full chain.

#### Subnetting mental model
A `/24` has 256 addresses (254 usable — first is network address, last is broadcast). A `/25` splits a `/24` in half (128 addresses each). Each bit you add to the prefix halves the subnet. Common subnets: `/32` (single host), `/30` (4 addr, 2 usable — point-to-point links), `/29` (8 addr), `/28` (16), `/27` (32), `/26` (64), `/25` (128), `/24` (256), `/16` (65,536).

#### NAT types and VPN implications
- Full-cone NAT: any external host can reach the mapped port (rare, easy for VPNs)
- Symmetric NAT: each outbound connection gets a different external port mapping (common on corporate networks — breaks WireGuard hole-punching, requires TURN relay)
- Port-restricted cone NAT: most home routers; WireGuard hole-punching works with STUN

#### How HTTPS actually works (TLS 1.3 handshake)
1. Client sends `ClientHello` with supported cipher suites and a key share
2. Server responds with `ServerHello`, its certificate, and its key share — in *one round trip* (TLS 1.3 optimisation)
3. Both sides derive the session key from the key exchange (ECDHE)
4. Client verifies the server's certificate against trusted CAs
5. Encrypted application data flows

#### Reverse proxy vs forward proxy
A reverse proxy sits in front of servers — clients talk to the proxy, which forwards to the backend (Caddy, Nginx, Traefik, HAProxy). The client often doesn't know there's a backend at all. A forward proxy sits in front of clients — clients send all traffic to the proxy, which forwards to the internet (Squid, corporate web proxy). VPNs act like forward proxies for encrypted traffic.

#### Load balancing algorithms
- **Round robin** — requests distributed equally in turn
- **Least connections** — new request goes to the backend with fewest active connections (better for varied request lengths)
- **IP hash / source hash** — same client IP always goes to the same backend (sticky sessions without cookies)
- **Weighted** — backends have weights; higher-weight servers get more traffic (useful for canary deployments or mixed instance sizes)

#### BGP (Border Gateway Protocol) basics for interviews
BGP is the routing protocol of the internet — it exchanges reachability information between Autonomous Systems (ASes). Each AS has an AS number (ASN). iBGP (interior) routes within one AS; eBGP (exterior) routes between ASes. BGP is a path-vector protocol — it chooses routes based on AS-path length and policy attributes. Relevant in homelab with FRRouting, and in cloud when advertising VPC routes or Tailscale subnets into your network.

#### VLAN fundamentals
A VLAN (Virtual LAN) segments a physical switch into multiple logical networks. Tagged frames (802.1Q) carry a VLAN ID in the Ethernet header. Trunk ports carry multiple VLANs; access ports carry one. Common segmentation: IoT VLAN (isolated), servers VLAN, management VLAN. VLANs don't cross routers without explicit routing or an SVR (Switched Virtual Router) interface.

#### MTU and fragmentation
Maximum Transmission Unit — the largest packet a link will carry. Ethernet's standard MTU is 1500 bytes. VPN tunnels add overhead (WireGuard adds ~32–60 bytes), which reduces the effective inner MTU. Setting the wrong MTU causes silent data corruption or dropped connections for large packets. Fix: set MSS clamping (`--clamp-mss-to-pmtu` in WireGuard/iptables) or discover the path MTU with `ping -M do -s 1400`.

#### Reverse proxy patterns — Caddy vs Nginx vs Traefik vs HAProxy
Each serves a different primary use case. Caddy: automatic HTTPS (ACME), human-readable config, best for homelab and small deployments. Nginx: highest throughput, battle-tested, extensive module ecosystem, config is verbose. Traefik: auto-discovers routes from container labels — zero-config for Docker/Kubernetes, but harder to reason about in complex setups. HAProxy: the performance and reliability choice for TCP-level load balancing, used in front of databases and Kubernetes control planes. Know which layer each operates at: Caddy/Nginx/Traefik are L7 (HTTP); HAProxy works at L4 and L7.

#### DNS-based service discovery
DNS TTL is the core reliability lever. A low TTL (30–60s) means changes propagate fast but increases DNS query load. A high TTL (3600s) means failures persist until TTL expires. In internal DNS (Technitium, PowerDNS), keep TTLs low for services that change. Health-check-based DNS (Route53 health checks, PowerDNS with health checking) removes failing IPs from DNS automatically — a primitive but effective load balancing and failover mechanism.

#### DHCP and IPAM operational reality
In a managed network, every IP assignment should be intentional. Static DHCP leases (assign a fixed IP based on MAC address) give services predictable addresses without manual configuration on each device. An IPAM tool (NetBox, phpIPAM) is the source of truth — it documents what IP belongs to what device, VLAN, and subnet. Without IPAM, IP conflicts are a matter of when, not if. DHCP servers (Kea, dnsmasq) should feed lease data back to IPAM automatically.

#### Caching proxy and bandwidth management
A caching proxy (Squid) intercepts HTTP/HTTPS requests and serves cached responses. Benefits: reduced bandwidth (shared package mirrors, container image layers), content filtering, access logs, and enforced egress policies. In a homelab, a Squid proxy in front of package managers (apt, pip, npm) dramatically reduces external bandwidth. In enterprises, forward proxies are often mandatory — traffic that doesn't go through the proxy is blocked at the firewall.

#### Dynamic routing protocols — when BGP/OSPF matters
Static routes work until you have more than a handful of subnets or multiple uplinks. OSPF is the internal routing protocol — routers share topology, calculate shortest paths, and converge automatically when a link fails. BGP is the external protocol — used to announce your IP space to an ISP, or to distribute routes between multiple sites. FRRouting brings both to Linux. In a homelab, BGP is used with MetalLB (announce LoadBalancer IPs to a router) or multi-site WireGuard (distribute subnet routes between locations).
---

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

**Firewall:** (allow DNS from LAN):
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

**Firewall:** (for DoT from external devices):
```bash
sudo firewall-cmd --add-port=853/tcp --permanent && sudo firewall-cmd --reload
```

#### Common operations
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

##### Example `haproxy.cfg` — HTTP load balancing with health checks

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

#### Load balancing algorithms
```
balance roundrobin   # Equal distribution (default)
balance leastconn    # Route to server with fewest active connections
balance source       # Sticky sessions by client IP hash
balance uri          # Sticky by URI hash (useful for caches)
```

#### TCP load balancing for databases and MQTT
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

#### Common operations
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

##### Example `config.yml`

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

## PowerDNS + PowerDNS Admin (Authoritative DNS)

**Purpose:** Authoritative DNS server for your own domains. While Pi-hole, AdGuard, and Technitium handle *resolving* DNS queries for your LAN, PowerDNS *answers* authoritative queries — it's what you run when you want `example.com` (or an internal zone like `home.local`) to be served from your own nameserver. PowerDNS Admin provides a web UI for managing zones and records. Common in homelabs that run their own internal PKI or split-horizon DNS.

```yaml
# ~/powerdns/compose.yaml
services:
  pdns:
    image: powerdns/pdns-auth-49:latest
    ports:
      - 0.0.0.0:5300:53/tcp
      - 0.0.0.0:5300:53/udp
      - 127.0.0.1:8053:8081
    volumes:
      - /home/user/powerdns/pdns.conf:/etc/powerdns/pdns.conf:ro,Z
    environment:
      PDNS_AUTH_API_KEY: changeme
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: pdns
      MYSQL_USER: pdns
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

  powerdns-admin:
    image: powerdnsadmin/pda-legacy:latest
    ports:
      - 127.0.0.1:9191:80
    environment:
      SQLALCHEMY_DATABASE_URI: mysql://pdns:changeme@db/pdns
      SECRET_KEY: changeme-run-openssl-rand-hex-32
      PDNS_STATS_URL: http://pdns:8081/
      PDNS_API_KEY: changeme
      PDNS_VERSION: "4.9"
    depends_on: [db, pdns]
    restart: unless-stopped

volumes:
  db_data:
```

##### Minimal `pdns.conf`

```ini
launch=gmysql
gmysql-host=db
gmysql-user=pdns
gmysql-password=changeme
gmysql-dbname=pdns
gmysql-dnssec=yes

api=yes
api-key=changeme
webserver=yes
webserver-address=0.0.0.0
webserver-port=8081
webserver-allow-from=0.0.0.0/0

local-port=53
```

##### Initialise the database schema

```bash
podman exec pdns pdnsutil create-slave-zone home.local 127.0.0.1
# Or use PowerDNS Admin web UI at http://localhost:9191 to create zones and records
```

#### Common operations
```bash
# List all zones
podman exec pdns pdnsutil list-all-zones

# Add a zone
podman exec pdns pdnsutil create-zone home.local ns1.home.local

# Add an A record
podman exec pdns pdnsutil add-record home.local myserver A 192.168.1.50

# Check DNSSEC status
podman exec pdns pdnsutil check-all-zones

# Reload zone after manual DB edits
podman exec pdns pdnsutil rectify-zone home.local

# Test from host
dig @127.0.0.1 -p 5300 myserver.home.local
```

**Caddy:**
```caddyfile
pdnsadmin.home.local { tls internal; reverse_proxy localhost:9191 }
```

---

## Kea DHCP (Modern DHCP Server)

**Purpose:** ISC Kea is the modern replacement for ISC DHCP (`dhcpd`). Provides DHCPv4 and DHCPv6 with a REST API, a lease database (PostgreSQL or MySQL), high-availability failover, host reservations, and a web UI via Stork. Run it alongside Technitium or PowerDNS to control both DHCP and DNS from your server, giving you reliable `hostname → IP` mappings for every device on your LAN.

```yaml
# ~/kea/compose.yaml
services:
  kea-dhcp4:
    image: jonasal/kea-dhcp4:latest
    network_mode: host          # Must see your LAN broadcast domain
    volumes:
      - /home/user/kea/kea-dhcp4.conf:/etc/kea/kea-dhcp4.conf:ro,Z
      - /home/user/kea/leases:/var/lib/kea:Z
    restart: unless-stopped
```

##### Minimal `kea-dhcp4.conf`

```json
{
  "Dhcp4": {
    "interfaces-config": {
      "interfaces": ["eth0"]
    },
    "lease-database": {
      "type": "memfile",
      "persist": true,
      "name": "/var/lib/kea/dhcp4.leases"
    },
    "subnet4": [{
      "id": 1,
      "subnet": "192.168.1.0/24",
      "pools": [{ "pool": "192.168.1.100 - 192.168.1.200" }],
      "option-data": [
        { "name": "routers",              "data": "192.168.1.1" },
        { "name": "domain-name-servers",  "data": "192.168.1.10" },
        { "name": "domain-search",        "data": "home.local" }
      ],
      "reservations": [
        {
          "hw-address": "aa:bb:cc:dd:ee:ff",
          "ip-address":  "192.168.1.50",
          "hostname":    "myserver"
        }
      ]
    }],
    "loggers": [{
      "name": "kea-dhcp4",
      "output_options": [{ "output": "stdout" }],
      "severity": "INFO"
    }]
  }
}
```

```bash
cd ~/kea && podman-compose up -d

# View current leases
cat /home/user/kea/leases/dhcp4.leases

# Firewall — allow DHCP
sudo firewall-cmd --add-service=dhcp --permanent && sudo firewall-cmd --reload
```

> **Kea vs dnsmasq:** dnsmasq (bundled with Pi-hole) is excellent for simple setups. Kea is the right choice when you need HA failover, a REST API, PostgreSQL lease storage, or want to manage DHCP independently of your DNS blocker.

---

## phpIPAM (Lightweight IP Address Management)

**Purpose:** Web-based IP address management tool. Track which IPs are assigned, to what device, who requested the allocation, and which subnets are full. phpIPAM is lighter than NetBox for teams who just need clean IPAM without the full network topology and asset management features. Integrates with PowerDNS for automatic PTR record updates when IPs are assigned.

```yaml
# ~/phpipam/compose.yaml
services:
  phpipam-web:
    image: phpipam/phpipam-www:latest
    ports:
      - 127.0.0.1:8200:80
    environment:
      TZ: Asia/Kolkata
      IPAM_DATABASE_HOST: db
      IPAM_DATABASE_USER: phpipam
      IPAM_DATABASE_PASS: changeme
      IPAM_DATABASE_NAME: phpipam
    volumes:
      - /home/user/phpipam/logo:/phpipam/css/images/logo:Z
    depends_on: [db]
    restart: unless-stopped

  phpipam-cron:
    image: phpipam/phpipam-cron:latest
    environment:
      TZ: Asia/Kolkata
      IPAM_DATABASE_HOST: db
      IPAM_DATABASE_USER: phpipam
      IPAM_DATABASE_PASS: changeme
      IPAM_DATABASE_NAME: phpipam
      SCAN_INTERVAL: 1h
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: phpipam
      MYSQL_USER: phpipam
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/phpipam && podman-compose up -d
```

Access at `http://localhost:8200`. On first run, select **Automatic database installation** and create the admin account. Then define your subnets and start allocating IPs.

**Caddy:**
```caddyfile
ipam.home.local { tls internal; reverse_proxy localhost:8200 }
```

> **NetBox vs phpIPAM:** Use phpIPAM for pure IPAM (subnets, IPs, reservations). Use NetBox when you also need rack diagrams, cable management, VLAN documentation, and device inventory.

---

## Squid (Caching Proxy)

**Purpose:** High-performance HTTP/HTTPS caching proxy. Squid caches web content so repeated requests are served from disk rather than the internet — saving bandwidth, reducing latency, and enabling content filtering by URL, domain, or MIME type. Useful in homelabs with metered internet connections, for caching container image pulls, or as a transparent proxy for auditing outbound HTTP traffic from containers.

```yaml
# ~/squid/compose.yaml
services:
  squid:
    image: ubuntu/squid:latest
    ports:
      - 127.0.0.1:3128:3128
    volumes:
      - /home/user/squid/squid.conf:/etc/squid/squid.conf:ro,Z
      - /home/user/squid/cache:/var/spool/squid:Z
      - /home/user/squid/logs:/var/log/squid:Z
    restart: unless-stopped
```

##### Minimal `squid.conf`

```
# Allow LAN clients
acl localnet src 192.168.0.0/16
acl localnet src 10.0.0.0/8

# Standard safe ports
acl SSL_ports port 443
acl Safe_ports port 80 443 21 70 210 280 488 591 777 1025-65535
acl CONNECT method CONNECT

http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports
http_access allow localnet
http_access allow localhost
http_access deny all

http_port 3128

# Cache configuration
cache_dir ufs /var/spool/squid 10000 16 256   # 10 GB cache
maximum_object_size 512 MB
cache_mem 512 MB
maximum_object_size_in_memory 10 MB

# Access log
access_log /var/log/squid/access.log squid
```

```bash
cd ~/squid && podman-compose up -d

# Initialise the cache directory (first run)
podman exec squid squid -z

# View access log
podman exec squid tail -f /var/log/squid/access.log

# Force cache refresh for a URL
podman exec squid squidclient -m PURGE http://example.com/

# Check cache statistics
podman exec squid squidclient mgr:info
```

#### Use Squid as a proxy for container pulls
```bash
# Set Podman to pull via Squid
export https_proxy=http://localhost:3128
export http_proxy=http://localhost:3128
podman pull nginx:alpine
```

**Caddy:**
```caddyfile
squid.home.local { tls internal; reverse_proxy localhost:3128 }
```

---

## ddns-updater (Dynamic DNS)

**Purpose:** Keeps your DNS records updated when your home/server IP changes. Polls your current public IP on a schedule and updates records via the APIs of 30+ providers — Cloudflare, Namecheap, DuckDNS, Gandi, Porkbun, Hetzner, and more. Essential if you're self-hosting from a residential or dynamic-IP connection without a static IP.

```yaml
# ~/ddns-updater/compose.yaml
services:
  ddns-updater:
    image: qmcgaw/ddns-updater:latest
    ports:
      - 127.0.0.1:8000:8000
    volumes:
      - /home/user/ddns-updater/data:/updater/data:Z
    environment:
      PERIOD: 5m
      UPDATE_COOLDOWN_PERIOD: 5m
      PUBLICIP_FETCHERS: all
      LOG_LEVEL: info
      TZ: Asia/Kolkata
    restart: unless-stopped
```

```bash
cd ~/ddns-updater && podman-compose up -d
```

##### Configure providers in `/home/user/ddns-updater/data/config.json`

```json
{
  "settings": [
    {
      "provider": "cloudflare",
      "zone_identifier": "your-zone-id",
      "domain": "home.example.com",
      "host": "@",
      "ttl": 300,
      "proxied": false,
      "token": "your-cloudflare-api-token",
      "ip_version": "ipv4"
    },
    {
      "provider": "duckdns",
      "domain": "myhome.duckdns.org",
      "token": "your-duckdns-token",
      "ip_version": "ipv4"
    }
  ]
}
```

Access the status dashboard at `http://localhost:8000` — shows last update time, current IP, and success/failure per record.

**Caddy:**
```caddyfile
ddns.home.local { tls internal; reverse_proxy localhost:8000 }
```

> **Tip:** Pair with a short TTL (300 seconds) on the DNS record so clients pick up the new IP quickly after a change.

---

## frp (Fast Reverse Proxy)

**Purpose:** Expose services running behind NAT or a firewall to the internet via a VPS relay — without needing to open ports on your home router or ISP. You run `frps` (server) on a cheap VPS with a public IP, and `frpc` (client) on your home server. The client connects outbound to the VPS; all traffic to `vps-ip:port` is tunnelled back to your local service. A lightweight alternative to Cloudflare Tunnel or Pangolin when you need raw TCP/UDP forwarding or non-HTTP protocols.

```yaml
# On your VPS — ~/frps/compose.yaml
services:
  frps:
    image: snowdreamtech/frps:latest
    network_mode: host
    volumes:
      - /home/user/frps/frps.toml:/etc/frp/frps.toml:ro
    restart: unless-stopped
```

#### `frps.toml` on the VPS
```toml
bindPort = 7000           # frpc connects here
vhostHTTPPort = 8080      # HTTP vhost traffic (optional)
vhostHTTPSPort = 8443     # HTTPS vhost traffic (optional)

auth.method = "token"
auth.token = "changeme-strong-secret"

webServer.addr = "127.0.0.1"
webServer.port = 7500
webServer.user = "admin"
webServer.password = "changeme"
```

```yaml
# On your home server — ~/frpc/compose.yaml
services:
  frpc:
    image: snowdreamtech/frpc:latest
    network_mode: host
    volumes:
      - /home/user/frpc/frpc.toml:/etc/frp/frpc.toml:ro
    restart: unless-stopped
```

#### `frpc.toml` on your home server
```toml
serverAddr = "your.vps.ip"
serverPort = 7000

auth.method = "token"
auth.token = "changeme-strong-secret"

# Expose a local HTTP service
[[proxies]]
name = "homelab-web"
type = "http"
localIP = "127.0.0.1"
localPort = 80
customDomains = ["home.example.com"]

# Expose SSH
[[proxies]]
name = "homelab-ssh"
type = "tcp"
localIP = "127.0.0.1"
localPort = 22
remotePort = 2222          # ssh -p 2222 user@your.vps.ip

# Expose a raw TCP service (e.g. MQTT)
[[proxies]]
name = "mqtt"
type = "tcp"
localIP = "127.0.0.1"
localPort = 1883
remotePort = 1883
```

```bash
# Start on the VPS
cd ~/frps && podman-compose up -d

# Start on the home server
cd ~/frpc && podman-compose up -d
```

**Firewall on the VPS:**
```bash
sudo firewall-cmd --add-port=7000/tcp --permanent   # frpc control
sudo firewall-cmd --add-port=8080/tcp --permanent   # HTTP vhost
sudo firewall-cmd --add-port=8443/tcp --permanent   # HTTPS vhost
sudo firewall-cmd --add-port=2222/tcp --permanent   # SSH forwarding
sudo firewall-cmd --reload
```

> **frp vs Cloudflare Tunnel:** Cloudflare Tunnel is zero-config and free, but traffic passes through Cloudflare's network and requires HTTP/HTTPS. frp works for any TCP/UDP protocol, traffic stays on your VPS, and you keep full control. Use frp when you need to forward MQTT, SSH, game server ports, or any non-HTTP service.

---

## FRRouting (BGP / OSPF / Dynamic Routing)

**Purpose:** Full-featured open-source routing suite implementing BGP, OSPF, IS-IS, RIP, PIM, and BFD — the same protocols running on enterprise and ISP routers. On a homelab or small datacenter, FRR is most useful for: advertising your Tailscale/WireGuard subnets into BGP, running BGP between your Shani OS host and a pfSense/OPNsense router, implementing ECMP load-balancing between uplinks, or learning BGP/OSPF for job preparation. FRR runs as a container alongside your network stack — it doesn't require a separate router appliance.

> **Note:** FRR needs `--network host` and `--cap-add NET_ADMIN,NET_RAW,SYS_ADMIN` to manipulate kernel routing tables. These capabilities are available to rootless Podman containers on this system with `--privileged` or explicit `--cap-add`. The kernel routing changes FRR makes are real — they affect the host's routing table.

```yaml
# ~/frr/compose.yaml
services:
  frr:
    image: frrouting/frr:latest
    network_mode: host
    cap_add: [NET_ADMIN, NET_RAW, SYS_ADMIN]
    volumes:
      - /home/user/frr/etc:/etc/frr:Z
    restart: unless-stopped
```

```bash
mkdir -p ~/frr/etc
cd ~/frr && podman-compose up -d
```

#### Initial FRR config files
```bash
# ~/frr/etc/daemons — enable only what you need
cat > ~/frr/etc/daemons << 'EOF'
zebra=yes      # core routing daemon — always required
bgpd=yes       # enable for BGP
ospfd=yes      # enable for OSPFv2
ospf6d=no
ripd=no
ripngd=no
isisd=no
pimd=no
bfdd=yes       # Bidirectional Forwarding Detection — fast link failure detection
EOF

# ~/frr/etc/vtysh.conf
cat > ~/frr/etc/vtysh.conf << 'EOF'
service integrated-vtysh-config
EOF
```

##### Connect to the FRR CLI (vtysh)

```bash
podman exec -it frr vtysh
```

#### Example: iBGP between Shani OS host and a pfSense/OPNsense router
```
# Inside vtysh:

# Set the router ID (use host's LAN IP)
configure terminal
 router bgp 65001
  bgp router-id 192.168.1.10
  neighbor 192.168.1.1 remote-as 65001          ! pfSense/OPNsense LAN IP, same AS = iBGP
  neighbor 192.168.1.1 description pfsense-router
  !
  address-family ipv4 unicast
   network 10.8.0.0/24                           ! advertise WireGuard VPN subnet into BGP
   network 100.64.0.0/10                         ! advertise Tailscale CGNAT range
   neighbor 192.168.1.1 activate
   neighbor 192.168.1.1 soft-reconfiguration inbound
  exit-address-family
 !
 ip route 10.8.0.0/24 wg0                        ! static route so zebra knows the next-hop
exit
```

#### Example: BGP with a Hetzner cloud server (eBGP over WireGuard)
```
configure terminal
 router bgp 65001
  bgp router-id 192.168.1.10
  neighbor 10.8.0.2 remote-as 65002             ! Hetzner VM, different AS = eBGP
  neighbor 10.8.0.2 ebgp-multihop 2             ! required when peering over a tunnel
  neighbor 10.8.0.2 update-source wg0
  !
  address-family ipv4 unicast
   network 192.168.1.0/24                        ! advertise homelab LAN to the cloud
   neighbor 10.8.0.2 activate
   neighbor 10.8.0.2 route-map EXPORT out
  exit-address-family
 !
 route-map EXPORT permit 10
  match ip address prefix-list HOMELAB
 !
 ip prefix-list HOMELAB seq 5 permit 192.168.1.0/24
exit
```

#### Example: OSPF for automatic route redistribution (all routers learn all subnets)
```
configure terminal
 router ospf
  ospf router-id 192.168.1.10
  network 192.168.1.0/24 area 0.0.0.0
  network 10.8.0.0/24 area 0.0.0.0
  passive-interface default           ! don't send OSPF hellos on all interfaces
  no passive-interface eth0           ! only peer on the LAN interface
  redistribute connected              ! inject directly connected routes
exit
```

#### Useful show commands (inside vtysh)
```
show ip bgp summary          # peer status, uptime, prefixes received
show ip bgp                  # full BGP table
show ip route                # kernel routing table (zebra view)
show ip route bgp            # only BGP-learned routes
show ip ospf neighbor        # OSPF adjacency table
show bfd peers               # BFD session status (sub-second failure detection)
show running-config          # full current config
write memory                 # save config to /etc/frr/frr.conf
```

#### BFD (fast failover in under 1 second)
```
configure terminal
 bfd
  peer 192.168.1.1
   detect-multiplier 3
   receive-interval 300
   transmit-interval 300
  !
 exit
 !
 router bgp 65001
  neighbor 192.168.1.1 bfd       ! attach BFD to the BGP peer
exit
```

> **FRR vs a dedicated router VM:** FRR in a container is appropriate for BGP peering, route redistribution, and learning. For a full home router (DHCP, NAT, firewall, PPPoE), use OPNsense or pfSense on a dedicated machine or VM. FRR and OPNsense complement each other — OPNsense handles the internet edge, FRR handles internal routing between segments.

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
pdnsadmin.home.local   { tls internal; reverse_proxy localhost:9191 }
ipam.home.local        { tls internal; reverse_proxy localhost:8200 }
ddns.home.local        { tls internal; reverse_proxy localhost:8000 }
```

---

## Network Debugging Quick Reference

These commands are the foundation of diagnosing connectivity, DNS, and firewall problems on any Linux host.

```bash
# Show all active connections and their state
ss -s

# Find what process is listening on a specific port
ss -tlnp | grep :443
ss -tlnp | grep :8080

# Show all established TCP connections
ss -tn state established

# Trace the path to a host (TCP, bypasses ICMP blocks)
traceroute -T -p 443 example.com

# Capture packets on an interface (write to file for Wireshark)
sudo tcpdump -i eth0 -n 'port 443' -w /tmp/capture.pcap
sudo tcpdump -i eth0 -n 'host 1.1.1.1'
sudo tcpdump -i podman1 -n 'port 5432'   # capture container traffic

# DNS debugging — full recursive trace
dig +trace example.com

# Query a specific resolver
dig @1.1.1.1 example.com
dig @localhost example.com         # test your Pi-hole / AdGuard

# Check if a port is reachable (without telnet)
curl -v --connect-timeout 5 telnet://192.168.1.100:5432

# Show listening ports and their process
ss -tlnp
# or: lsof -i -P -n | grep LISTEN
```

#### TCP connection states to know

- `ESTABLISHED` — active connection in use
- `TIME_WAIT` — connection closed, waiting for delayed packets to expire (default 60–120s). High TIME_WAIT count on a busy server is normal but can exhaust ephemeral ports — tune `net.ipv4.tcp_tw_reuse` if needed.
- `CLOSE_WAIT` — the remote end closed the connection but the local application hasn't called `close()` yet. Persistent CLOSE_WAIT usually indicates a bug in the application.
- `SYN_SENT` — connection attempt in progress, SYN sent but SYN-ACK not yet received. Stuck connections here usually indicate the remote is unreachable or filtered by a firewall.

---

## TCP/IP Fundamentals

### The TCP Three-Way Handshake

Every TCP connection opens with a three-message exchange:

1. **SYN** — client sends a segment with the SYN flag, picks an initial sequence number
2. **SYN-ACK** — server acknowledges the client's SYN and sends its own SYN
3. **ACK** — client acknowledges the server's SYN. Connection is now established.

This is why connection setup has a minimum latency of 1.5× the round-trip time (RTT) — three messages across two RTTs. TLS 1.3 reduces this further with 0-RTT resumption for known sessions.

### TCP vs UDP

| Property | TCP | UDP |
|----------|-----|-----|
| Reliability | Guaranteed delivery, retransmission on loss | Best-effort, no retransmission |
| Order | Ordered delivery | Out-of-order delivery possible |
| Connection | Connection-oriented (handshake) | Connectionless |
| Overhead | Higher (headers, ACKs, state) | Lower |
| Use cases | HTTP, PostgreSQL, SSH — anything correctness-critical | DNS, VoIP, video streaming, WireGuard |

WireGuard uses UDP specifically because the VPN layer handles its own reliability, and UDP's stateless nature makes it more resilient to brief packet loss and network changes (roaming between WiFi and mobile data).

---

## iptables and nftables Basics

Firewalld (used throughout this wiki) is a high-level interface over `nftables` on modern Linux. Understanding the underlying layer helps when debugging unexpected traffic behaviour.

```bash
# List all current nft rules (the native tool on modern systems)
sudo nft list ruleset

# List iptables rules with packet/byte counts (legacy view of nftables)
sudo iptables -L -n -v
sudo iptables -t nat -L -n -v    # NAT rules — important for container port forwarding

# Show firewalld zones and their services
sudo firewall-cmd --list-all
sudo firewall-cmd --list-all-zones

# Temporarily allow a port (lost on next firewalld reload)
sudo firewall-cmd --add-port=8080/tcp

# Permanently allow a port
sudo firewall-cmd --permanent --add-port=8080/tcp && sudo firewall-cmd --reload

# Trace a packet through iptables (debug mode)
sudo iptables -t raw -A PREROUTING -p tcp --dport 8080 -j TRACE
sudo journalctl -k | grep TRACE   # see which rules the packet hits
sudo iptables -t raw -D PREROUTING -p tcp --dport 8080 -j TRACE  # remove when done
```

---

## How Container Networking Works

Understanding what Podman does under the hood helps debug connectivity issues between containers and the host.

#### When you start a container with `-p 8080:80`

1. Podman creates a **veth pair** — a virtual Ethernet cable with one end in the container's network namespace and one end on the host's bridge.
2. The host end is connected to a **bridge device** (e.g., `podman1` or `cni-podman0`). The bridge acts like a virtual switch.
3. Podman adds an **iptables NAT rule** to forward packets arriving on host port 8080 to the container's IP on port 80.
4. A return NAT rule ensures response packets are masqueraded back through the host IP.

```bash
# See the bridge Podman created
ip link show type bridge
ip addr show podman1    # or cni-podman0

# See veth pairs (one end in container, one on bridge)
ip link show type veth

# See Podman's NAT rules
sudo iptables -t nat -L PODMAN -n -v

# Find a container's IP address
podman inspect jellyfin --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'

# Ping a container from the host using its IP directly
ping $(podman inspect jellyfin --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
```

#### Why `host.containers.internal` exists
when a container needs to reach a service on the host (e.g., a database not in a container), it can't use `localhost` — that resolves to its own network namespace. `host.containers.internal` is a special DNS name Podman provides that resolves to the host's IP as seen from the container.

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
| PowerDNS zone not resolving | Run `pdnsutil check-zone home.local` and `pdnsutil rectify-zone home.local`; confirm the SOA record exists; test with `dig @127.0.0.1 -p 5300 home.local` |
| PowerDNS Admin can't connect to API | Verify `PDNS_API_KEY` matches `api-key` in `pdns.conf`; ensure the `webserver` is enabled and `webserver-allow-from=0.0.0.0/0` is set |
| Kea DHCP leases not assigned | Confirm `network_mode: host` is set; verify the interface name in `interfaces-config` matches your LAN interface (`ip link show`) |
| Kea DHCP conflict with existing DHCP | Disable DHCP on your router before starting Kea; two DHCP servers on the same subnet cause unpredictable address assignment |
| phpIPAM database installation fails | Ensure MariaDB is fully started (`podman logs db`); try refreshing the setup page after 30 seconds |
| Squid `NONE/400 Bad Request` | Confirm the client is sending a proper HTTP proxy request; for HTTPS, the client must send a `CONNECT` request first |
| Squid cache not filling | Verify the cache directory exists and is writable; run `squid -z` inside the container to initialise the cache structure |
| ddns-updater not updating | Check `podman logs ddns-updater`; verify the API token has `Zone:Edit` permission in Cloudflare; check `config.json` syntax with `podman exec ddns-updater ddns-updater --help` |
| ddns-updater shows wrong current IP | The `PUBLICIP_FETCHERS: all` strategy uses multiple sources and picks the majority result; if behind a corporate NAT you may need to set `PUBLICIP_HTTP_PROVIDERS` to a specific provider |
| frp client can't connect to server | Check port `7000/tcp` is open on the VPS firewall; verify `auth.token` matches in both `frps.toml` and `frpc.toml`; check `podman logs frps` for `authentication failed` errors |
| frp HTTP vhost not routing | Ensure the `customDomains` value resolves to your VPS IP; verify `vhostHTTPPort` in `frps.toml` matches the port you're testing; check that `type = "http"` (not `tcp`) is set in `frpc.toml` |

| FRR container exits immediately | Check `~/frr/etc/daemons` exists and `zebra=yes` is set; FRR requires zebra regardless of which other daemons are enabled |
| FRR `permission denied` on routing table | Ensure `cap_add: [NET_ADMIN, NET_RAW, SYS_ADMIN]` is in compose.yaml; verify `network_mode: host` is set |
| BGP peer stuck in `Active` state | Confirm the peer IP is reachable (`ping` from within the container); check both sides have each other's router-id as neighbor; verify AS numbers match the expected iBGP/eBGP setup |
| BGP routes received but not in kernel table | Check `show ip route bgp` vs `show ip bgp` — missing routes may be filtered by a route-map or have a lower admin distance than a static/connected route |
| OSPF neighbor stuck in `Init` | Both sides must be in the same area and have matching hello/dead timers; check `passive-interface` isn't blocking the peering interface |
| `hcloud` command not found after Nix install | Ensure `~/.nix-profile/bin` is on your `PATH`; run `source ~/.nix-profile/etc/profile.d/nix.sh` or add it to `~/.bashrc` |
| AWS CLI `NoCredentialsError` | Run `aws configure` or export `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables |
| cloud-init not running on Hetzner VM | Verify the user-data was passed correctly: `hcloud server describe <name>` shows `User Data: yes`; SSH in and check `cloud-init status` and `journalctl -u cloud-init` |
| cloud-init schema validation fails | Common issues: missing `#cloud-config` header on line 1; YAML indentation errors; `runcmd` items must be lists (use `- command` not `command`) |
