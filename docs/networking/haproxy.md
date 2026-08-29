---
title: HAProxy
section: Self-Hosted Networking
updated: 2026-08-28
---

> **Portability note:** Compose examples use rootless **Podman** and `host.containers.internal` (the host gateway from a container). When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service). All concepts, architecture patterns, and CLI commands are container-runtime-agnostic.

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

## See Also

- [Traefik](traefik.md)
- [Nginx Proxy Manager](nginx-proxy-manager.md)
- [Caddy](../networking/caddy.md)
