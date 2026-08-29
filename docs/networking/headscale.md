---
title: Headscale (Self-Hosted Tailscale Alternative)
section: Self-Hosted Networking
updated: 2026-08-28
---

**Purpose:** Zero-config mesh VPN built on WireGuard. Tailscale uses managed coordination; Headscale is the fully open-source self-hosted control server — giving you the same experience with no third-party dependency.

### Tailscale (Managed)

```bash
# Tailscale is pre-installed on this system — just run:
sudo tailscale up

# Enable SSH over Tailscale
sudo tailscale up --ssh

# Advertise as an exit node
sudo tailscale up --advertise-exit-node

# Advertise local subnets (share your LAN with other tailnet devices)
sudo tailscale up --advertise-routes=192.168.1.0/24
```

Or run as a container:
```yaml
# ~/tailscale/compose.yaml
services:
  tailscale:
    image: tailscale/tailscale
    command: tailscaled --tun=userspace-networking --socks5-server=:1080
    volumes:
      - /home/user/tailscale:/var/lib:Z
    devices:
      - /dev/net/tun
    cap_add:
      - NET_ADMIN
      - NET_RAW
    restart: unless-stopped
```

```bash
cd ~/tailscale && podman-compose up -d
```

### Tailscale ACL Policies

By default, all devices in a Tailscale network can reach all other devices. ACL policies (in HuJSON format) let you control exactly which devices can talk to which — essential for separating personal devices from servers, or restricting access to sensitive ports.

Configure ACLs in the Tailscale admin console under **Access Controls**, or for Headscale via the `policy.hujson` config:

```jsonc
{
  // Tags are assigned to devices — servers get "tag:server", laptops get "tag:laptop"
  "tagOwners": {
    "tag:server": ["autogroup:admin"],
    "tag:laptop": ["autogroup:admin"]
  },

  "acls": [
    // Laptops can SSH to servers
    {"action": "accept", "src": ["tag:laptop"], "dst": ["tag:server:22"]},
    // Servers can reach each other on any port (internal service mesh)
    {"action": "accept", "src": ["tag:server"], "dst": ["tag:server:*"]},
    // Laptops can reach Grafana dashboard on servers
    {"action": "accept", "src": ["tag:laptop"], "dst": ["tag:server:3001"]},
    // All other traffic denied (implicit deny at end of list)
  ],

  // Tailscale SSH — which users can SSH to which tags
  "ssh": [
    {
      "action": "accept",
      "src": ["autogroup:admin"],
      "dst": ["tag:server"],
      "users": ["autogroup:nonroot"]
    }
  ]
}
```

```bash
# Apply policy to Headscale
headscale policy set -f policy.hujson

# Verify policy was applied
headscale policy get
```

### Headscale (Self-Hosted Control Server)

Headscale reimplements Tailscale's coordination server, so any Tailscale-compatible client can connect to it instead of Tailscale's managed service — no third-party dependency, full control over ACLs and DNS.

#### 1. Create config directory and config file
```bash
mkdir -p /home/user/headscale/{config,data}
```

`/home/user/headscale/config/config.yaml`:
```yaml
server_url: https://headscale.example.com
listen_addr: 0.0.0.0:8080
grpc_listen_addr: 0.0.0.0:9090
database:
  type: sqlite3
  sqlite:
    path: /var/lib/headscale/db.sqlite
dns:
  base_domain: headscale.lan
  magic_dns: true
  nameservers:
    - 1.1.1.1
    - 8.8.8.8
```

#### 2. Run the container
```yaml
# ~/headscale/compose.yaml
services:
  headscale:
    image: headscale/headscale:latest
    ports:
      - 127.0.0.1:8080:8080
      - 127.0.0.1:9090:9090
    volumes:
      - /home/user/headscale/config:/etc/headscale:Z
      - /home/user/headscale/data:/var/lib/headscale:Z
    restart: unless-stopped
```

```bash
cd ~/headscale && podman-compose up -d
```

#### 3. Create a user and connect devices
```bash
# Create a namespace
podman exec headscale headscale users create home

# Generate a reusable pre-auth key (valid 30 days)
podman exec headscale headscale preauthkeys create --user home --reusable --expiration 30d

# Connect any Tailscale-compatible device to your Headscale server
tailscale up --login-server https://headscale.example.com --authkey <key>

# List connected nodes
podman exec headscale headscale nodes list
```

### Headplane (Web UI for Headscale)

```yaml
# ~/headplane/compose.yaml
services:
  headplane:
    image: ghcr.io/tale/headplane:latest
    ports:
      - 127.0.0.1:3001:3000
    volumes:
      - /home/user/headscale/config:/etc/headscale:ro,Z
    restart: unless-stopped
```

```bash
cd ~/headplane && podman-compose up -d
```

#### Common operations
```bash
# Create a user (namespace)
podman exec headscale headscale users create myuser

# List users
podman exec headscale headscale users list

# Generate a reusable pre-auth key (30 days)
podman exec headscale headscale preauthkeys create --user myuser --reusable --expiration 30d

# List pre-auth keys
podman exec headscale headscale preauthkeys list --user myuser

# List all connected nodes
podman exec headscale headscale nodes list

# Expire (force-disconnect) a node
podman exec headscale headscale nodes expire --identifier NODE_ID

# Delete a node
podman exec headscale headscale nodes delete --identifier NODE_ID

# Get debug info for a node
podman exec headscale headscale nodes --output json list | python3 -m json.tool

# Generate an API key for Headplane
podman exec headscale headscale apikeys create

# Check server version
podman exec headscale headscale version
```

## See Also

- [WireGuard / WG-Easy](./wireguard-easy.md)
- [NetBird](./netbird.md)
- [Tailscale](../networking/tailscale.md)
