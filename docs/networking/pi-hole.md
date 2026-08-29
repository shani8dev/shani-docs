---
title: Pi-hole
section: Self-Hosted Networking
updated: 2026-08-28
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

## See Also

- [AdGuard Home](adguard-home.md)
- [Unbound](unbound.md)
- [Blocky](blocky.md)
- [Technitium DNS Server](technitium.md)
