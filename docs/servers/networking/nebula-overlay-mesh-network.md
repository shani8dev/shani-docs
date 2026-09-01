---
title: Nebula (Overlay Mesh Network)
section: Self-Hosting & Servers
updated: 2026-08-28
---

> **Part of the VPN & Tunnels series:** See [all networking docs](../networking)

## Nebula (Overlay Mesh Network)

**Purpose:** A scalable, decentralised overlay network developed by Slack. Nodes communicate directly using certificate-based PKI. Designed for GitOps-style config management — no web UI.

### 1. Generate Certificates

```bash
# Generate CA
nebula-cert ca -name "Home Network CA"

# Generate lighthouse (coordination node) certificate
nebula-cert sign -name "lighthouse" -ip "192.168.100.1/24"

# Generate client certificate
nebula-cert sign -name "shani-server" -ip "192.168.100.2/24"
```

### 2. Lighthouse Config (`config.yml`)

```yaml
pki:
  ca: /etc/nebula/ca.crt
  cert: /etc/nebula/lighthouse.crt
  key: /etc/nebula/lighthouse.key

static_host_map:
  "192.168.100.1": ["your-vps-public-ip:4242"]

lighthouse:
  am_lighthouse: true

listen:
  host: 0.0.0.0
  port: 4242

firewall:
  outbound: [{ port: any, proto: any, host: any }]
  inbound: [{ port: any, proto: any, host: any }]
```

### 3. Run Container

```yaml
# ~/nebula/compose.yaml
services:
  nebula:
    image: slacktechnologiesllc/nebula:latest
    ports:
      - 0.0.0.0:4242:4242/udp
    volumes:
      - /home/user/nebula:/etc/nebula:Z
    devices:
      - /dev/net/tun
    cap_add:
      - NET_ADMIN
    restart: unless-stopped
```

```bash
cd ~/nebula && podman-compose up -d
```

**Firewall:** `sudo firewall-cmd --add-port=4242/udp --permanent && sudo firewall-cmd --reload`

> Nebula has no official web UI. Manage configs via Git and distribute with `scp` or Ansible.

---



---

## See Also

- [Networking](../networking) — all networking docs
