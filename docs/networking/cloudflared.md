---
title: Cloudflared Tunnels
section: Networking
updated: 2026-04-22
---

# Cloudflared — Zero-Trust Tunnels

Cloudflared creates an encrypted, outbound-only tunnel from your Shani OS machine to Cloudflare's global edge network. This lets you expose local services at a real public HTTPS URL — with no static IP, no port forwarding, and no inbound firewall ports. The tunnel connects outward from your server; all traffic flows back through that established connection.

Cloudflared is pre-installed on Shani OS. Tunnel credentials are stored at `/data/varlib/cloudflared` and survive all OS updates and rollbacks. **Inactive until you authenticate.**

---

## When to Use Cloudflared vs Tailscale

| Scenario | Use |
|----------|-----|
| Private access between your own devices | **Tailscale** — zero-config, no public URL |
| Share a service with others via a real internet URL | **Cloudflared** — public HTTPS, no IP needed |
| Full data sovereignty (no third-party cloud) | **Pangolin** — self-hosted tunnel via your own VPS |

You can run both simultaneously: Caddy + Tailscale for internal `.home.local` access; Cloudflared for selectively public services.

---

## 1. Authenticate

```bash
# Opens a browser to log in to your Cloudflare account
cloudflared tunnel login
# Saves credentials to ~/.cloudflared/cert.pem
```

Your Cloudflare account must own at least one domain with DNS managed by Cloudflare (not just registered there — the nameservers must point to Cloudflare).

---

## 2. Create a Tunnel

```bash
# Create a named tunnel — assigns a stable UUID that never changes
cloudflared tunnel create my-home-server

# List your tunnels and their UUIDs
cloudflared tunnel list
```

The tunnel UUID and a JSON credentials file are created at `~/.cloudflared/<UUID>.json`. These are what authenticate your server to the tunnel — back them up.

---

## 3. Configure Ingress

Create `~/.cloudflared/config.yml`. Each `hostname` entry maps a public subdomain to a local service. The order matters — Cloudflared matches rules top to bottom:

```yaml
tunnel: <YOUR-TUNNEL-UUID>
credentials-file: /home/user/.cloudflared/<UUID>.json

ingress:
  # Media server
  - hostname: media.example.com
    service: http://localhost:8096

  # File sync
  - hostname: files.example.com
    service: http://localhost:8384

  # Password manager
  - hostname: vault.example.com
    service: http://localhost:8180
    originRequest:
      noTLSVerify: false

  # Home automation — requires WebSocket support
  - hostname: ha.example.com
    service: http://localhost:8123
    originRequest:
      connectTimeout: 30s

  # Catch-all — required, must be last
  - service: http_status:404
```

> **Note:** You do not need a Caddyfile entry for services exposed via Cloudflared — Cloudflare handles TLS termination at the edge. Caddy is still useful for internal `.home.local` access on Tailscale or the LAN.

### HTTPS Backend

If your local service runs HTTPS (e.g., you've configured Caddy with `tls internal`):

```yaml
ingress:
  - hostname: app.example.com
    service: https://localhost:443
    originRequest:
      noTLSVerify: true   # needed for self-signed / internal CA certs
```

---

## 4. Route DNS

Tell Cloudflare to point your subdomains at the tunnel. This creates CNAME records automatically in your Cloudflare DNS zone — no manual DNS editing required:

```bash
cloudflared tunnel route dns my-home-server media.example.com
cloudflared tunnel route dns my-home-server files.example.com
cloudflared tunnel route dns my-home-server vault.example.com
cloudflared tunnel route dns my-home-server ha.example.com
```

DNS propagation is usually near-instant since Cloudflare controls both sides.

---

## 5. Test Locally

Run the tunnel in the foreground to verify it works before committing to a persistent service:

```bash
cloudflared tunnel run my-home-server
# Open media.example.com in a browser — you should reach Jellyfin
# Ctrl-C to stop
```

---

## 6. Install as a Persistent Service

```bash
# Install the systemd service (runs as root, starts at boot)
sudo cloudflared service install

sudo systemctl enable --now cloudflared
```

The service uses the config at `~/.cloudflared/config.yml` (for the user who ran `cloudflared tunnel login`) or `/etc/cloudflared/config.yml` if you move it there for a system-wide install.

---

## Status & Logs

```bash
# List all tunnels and their current status
cloudflared tunnel list

# Detailed info for a specific tunnel (connection count, regions, uptime)
cloudflared tunnel info my-home-server

# Live logs
sudo journalctl -u cloudflared -f

# Active connections and which Cloudflare edge PoPs they're using
cloudflared tunnel connections my-home-server
```

---

## Access Policies (Zero Trust)

Protect exposed services with Cloudflare Access — require users to log in with email OTP, GitHub, Google, or any OIDC provider before reaching your service. This is particularly useful for services like Grafana or code-server that don't have their own authentication.

Configure in the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/) under **Access → Applications → Add an application → Self-hosted**. No code changes on your side — Cloudflare handles the auth wall.

```yaml
# In config.yml — mark a service as requiring Access authentication
ingress:
  - hostname: grafana.example.com
    service: http://localhost:3000
    # Access policy is applied at the Cloudflare edge — no config changes here needed
    # Just create the Access Application in the Zero Trust dashboard
```

---

## Running via Token (Dashboard-Managed)

If you prefer to manage tunnels entirely from the Cloudflare dashboard without a local config file:

```bash
# Get the token from: Zero Trust Dashboard → Networks → Tunnels → your tunnel → Configure → Run command
sudo cloudflared service install --token <YOUR-TUNNEL-TOKEN>
sudo systemctl enable --now cloudflared
```

Or as a rootless Podman container:

```bash
podman run -d \
  --name cloudflared \
  --restart unless-stopped \
  cloudflare/cloudflared:latest tunnel --no-autoupdate run \
    --token <YOUR-TUNNEL-TOKEN>
```

---

## Multiple Tunnels

You can run multiple tunnels from the same machine — useful for separating concerns or using different Cloudflare accounts:

```bash
# Create a second tunnel
cloudflared tunnel create work-server

# Run with explicit config
cloudflared tunnel --config ~/.cloudflared/work-config.yml run work-server
```

For multiple persistent tunnels via systemd, create separate service files under `/etc/systemd/system/` pointing to different config files.

---

## Removing a Service from the Tunnel

```bash
# 1. Remove the hostname block from config.yml
# 2. Reload the running tunnel
sudo systemctl reload cloudflared

# 3. Delete the CNAME record in the Cloudflare DNS dashboard
#    (cloudflared doesn't auto-delete DNS records when you remove an ingress rule)
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ERR Failed to dial edge` | Check outbound HTTPS connectivity; corporate or ISP firewalls may block Cloudflare edge IPs on port 7844 (the QUIC port) — try `cloudflared tunnel run --protocol http2` |
| Tunnel connects but subdomain returns error 1033 | DNS CNAME hasn't propagated, or `cloudflared tunnel route dns` wasn't run for that hostname — check the Cloudflare DNS dashboard |
| Service returns 502 via tunnel | The local service isn't running or is bound to the wrong port; verify with `curl http://localhost:PORT` on the server |
| WebSocket disconnects | Add `originRequest: { connectTimeout: 30s }` to the ingress rule; some apps (Vaultwarden, Home Assistant, Open WebUI) require WebSocket keep-alives |
| Tunnel not starting after reboot | `sudo systemctl status cloudflared`; verify the credentials file path in config.yml points to the actual file and hasn't moved |
| High latency to the tunnel | Cloudflare connects to the nearest edge PoP — check `cloudflared tunnel connections` to see which regions are being used; opening UDP 7844 enables QUIC (faster than HTTP/2) |
| Access policy not triggering | Ensure the Cloudflare Access application is configured for the exact hostname (no wildcards unless explicitly set); check that the application type is "Self-hosted" |
| `credentials file not found` error | The JSON credentials file path in config.yml must be absolute and match the actual file location; run `cloudflared tunnel list` to confirm the UUID |
