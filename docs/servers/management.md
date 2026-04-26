---
title: Container Management & Lifecycle
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Container Management & Lifecycle

Best practices for running, updating, and maintaining self-hosted containers on Shani OS.

---

## Container Concepts (Industry Context)

These concepts apply identically whether you're using Podman on Shani OS, Docker on Ubuntu, or Kubernetes at work. Podman is OCI-compliant and drop-in compatible with Docker — `alias docker=podman` works for the vast majority of workflows.

**OCI (Open Container Initiative):** The open standard that defines what a container image is and how a runtime executes it. Docker, Podman, containerd, and CRI-O all implement OCI. This is why images built with `docker build` run unchanged under Podman and in Kubernetes.

**Rootless vs. rootful containers:** Rootless containers run as your user, not root — a security boundary that limits what a compromised container can do to the host. Shani OS defaults to rootless Podman. In most corporate environments you'll encounter both: rootless for application workloads, rootful for system-level tools (network namespaces, privileged devices).

**Image layers and the build cache:** Container images are layered — each `RUN`, `COPY`, and `ADD` instruction in a Dockerfile creates a new layer. Layers are cached. If your `COPY` instruction comes before a large `apt install`, every code change busts the cache and re-downloads packages. Order matters: stable instructions first, frequently changed ones last.

**Container networking:** By default, containers on the same compose stack share a *bridge network* — they reach each other by service name (e.g. `db`, `redis`). The host reaches them only on published ports. *Host networking* (`network_mode: host`) skips isolation but is occasionally needed for performance-sensitive services. *Overlay networks* (Swarm, Kubernetes) span multiple hosts.

**Secrets management:** Environment variables (`environment:` in compose) are readable by anyone who can run `podman inspect`. For production, use a secrets manager — Docker Swarm secrets, Kubernetes Secrets (ideally with external-secrets-operator + Vault), or Podman secrets (`podman secret create`). Never hardcode credentials in compose files that are committed to Git.

```bash
# Create a Podman secret
printf 'mysecretpassword' | podman secret create db_password -

# Reference it in a compose file
# secrets:
#   db_password:
#     external: true
# services:
#   db:
#     secrets: [db_password]
```

**Resource limits (cgroups):** Without limits, a runaway container can OOM the host. Always set limits on untrusted or production workloads:

```yaml
services:
  app:
    image: myapp:latest
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          memory: 128M
```

This maps to cgroup v2 constraints — the same mechanism Kubernetes `requests`/`limits` uses under the hood.

---

## Systemd Integration

Containers started with `--restart unless-stopped` restart after crashes but not after a clean reboot if systemd doesn't know about them. The modern approach on Podman 4.4+ is **Quadlet** — drop a `.container` file and systemd picks it up automatically:

```bash
# Create the Quadlet unit directory
mkdir -p ~/.config/containers/systemd/

# Write a Quadlet unit for jellyfin (example)
cat > ~/.config/containers/systemd/jellyfin.container << 'EOF'
[Unit]
Description=Jellyfin Media Server

[Container]
Image=jellyfin/jellyfin
PublishPort=8096:8096
Volume=/home/user/jellyfin/config:/config:Z
Volume=/home/user/jellyfin/cache:/cache:Z
Environment=TZ=Asia/Kolkata

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF

# Reload and start — systemd auto-generates the service from the .container file
systemctl --user daemon-reload
systemctl --user enable --now jellyfin

# Enable lingering — starts user services at boot even without an active login session
loginctl enable-linger $USER
```

**Verify it's working:**
```bash
systemctl --user status jellyfin
journalctl --user -u jellyfin -f
```

> 💡 For compose-based stacks, continue using `podman-compose up -d` with `restart: unless-stopped`. Quadlet is most useful for single containers you want tight systemd integration with. `podman generate systemd` still works but is deprecated since Podman 4.4 and may be removed in a future release.

---

## Auto-Update Containers

Podman can automatically pull new images and recreate containers on a schedule. Add the label `io.containers.autoupdate=registry` to any container you want updated automatically:

```yaml
# ~/jellyfin/compose.yaml
services:
  jellyfin:
    image: jellyfin/jellyfin
    labels:
      io.containers.autoupdate: registry
    restart: unless-stopped
```

```bash
cd ~/jellyfin && podman-compose up -d
```

**Run or schedule the update:**
```bash
# Update all labelled containers now
podman auto-update

# Dry run to preview what would update
podman auto-update --dry-run

# Roll back a failed update
podman auto-update --rollback
```

**Set up a weekly systemd timer using Podman's built-in service:**

Podman ships `podman-auto-update.service` — just enable the accompanying timer:

```bash
systemctl --user enable --now podman-auto-update.timer
```

> 💡 If the built-in timer is unavailable (older Podman), create one manually targeting the same service rather than running `podman auto-update` directly from `ExecStart` — this preserves rollback support.

---

## OS Updates

Shani OS updates are atomic — the new image is prepared in the background, and activated on next reboot. Your `@containers` Btrfs subvolume is completely separate from the OS and is untouched by updates and rollbacks.

```bash
# Check for and apply updates
sudo shani-deploy

# Roll back to the previous OS generation (leaves containers untouched)
sudo shani-deploy --rollback
```

---

## Auto-Heal Crashed Containers

Autoheal restarts any container that fails its health check — useful for services that hang without crashing outright:

```yaml
# ~/autoheal/compose.yaml
services:
  autoheal:
    image: willfarrell/autoheal
    volumes:
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
    environment:
      AUTOHEAL_CONTAINER_LABEL: all
      AUTOHEAL_INTERVAL: 30
      AUTOHEAL_START_PERIOD: 300
    restart: unless-stopped
```

> Replace `1000` with your actual UID (`id -u`). Unlike compose stacks, the autoheal container needs a literal path here — `${UID}` is not expanded by the container runtime.

```bash
cd ~/autoheal && podman-compose up -d
```

Add health checks to containers you want monitored:
```yaml
# ~/jellyfin/compose.yaml
services:
  jellyfin:
    image: jellyfin/jellyfin
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8096/health"]
      interval: 30s
      retries: 3
      start_period: 60s
    restart: unless-stopped
```

```bash
cd ~/jellyfin && podman-compose up -d
```

---

## Homepage (Service Dashboard)

**Purpose:** Modern, highly customisable application dashboard. Shows live status of all your services, system metrics, weather, RSS feeds, and bookmarks from a single page. Configured via YAML files and integrates directly with Docker/Podman via socket for automatic service discovery.

```yaml
# ~/homepage/compose.yaml
services:
  homepage:
    image: ghcr.io/gethomepage/homepage:latest
    ports:
      - 127.0.0.1:3001:3000
    volumes:
      - /home/user/homepage/config:/app/config:Z
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
    restart: unless-stopped
```

```bash
cd ~/homepage && podman-compose up -d
```

Access at `http://localhost:3001`. Configure services, bookmarks, and widgets in `/home/user/homepage/config/services.yaml`.

**Caddy:**
```caddyfile
dashboard.home.local { tls internal; reverse_proxy localhost:3001 }
```

---

## Portainer CE

**Purpose:** Full-featured graphical dashboard for managing containers, images, volumes, networks, and stacks. Supports Podman via socket. Best for users who want a single UI for everything.

```yaml
# ~/portainer/compose.yaml
services:
  portainer:
    image: portainer/portainer-ce:latest
    ports:
      - 127.0.0.1:9443:9443
    volumes:
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
      - portainer_data:/data
    restart: unless-stopped

volumes:
  portainer_data:
```

```bash
cd ~/portainer && podman-compose up -d
```

Access at `https://localhost:9443`.

---

## Dockge

**Purpose:** Lightweight, compose-stack-focused container manager. Stacks are stored as files and can be synced via Git. Simpler and faster than Portainer if you primarily use compose files.

```yaml
# ~/dockge/compose.yaml
services:
  dockge:
    image: louislam/dockge:latest
    ports:
      - 127.0.0.1:5001:5001
    volumes:
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
      - /home/user/stacks:/home/runner/stacks:Z
    environment:
      DOCKGE_STACKS_DIR: /home/runner/stacks
    restart: unless-stopped
```

```bash
cd ~/dockge && podman-compose up -d
```

Access at `http://localhost:5001`.

---

## Yacht

**Purpose:** Template-driven container manager with a clean dashboard and built-in app store. Good middle ground between the simplicity of Dockge and the full feature set of Portainer.

```yaml
# ~/yacht/compose.yaml
services:
  yacht:
    image: selfhostedpro/yacht
    ports:
      - 127.0.0.1:8001:8000
    volumes:
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
      - /home/user/yacht/config:/config:Z
    restart: unless-stopped
```

```bash
cd ~/yacht && podman-compose up -d
```

Default login: `admin@yacht.local` / `pass`. Change immediately after first login.

---

## Komodo (Modern Container Manager)

**Purpose:** A newer, actively developed alternative to Portainer and Dockge. Komodo manages containers, compose stacks, and deployments across multiple servers from a single dashboard. Supports Git-backed stack deployments (push to Git → auto-deploy), resource monitoring, and a clean role-based UI. Good choice for multi-server homelabs.

```yaml
# ~/komodo/compose.yaml
services:
  komodo:
    image: ghcr.io/moghtech/komodo:latest
    ports:
      - 127.0.0.1:9120:9120
    volumes:
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
      - /home/user/komodo/data:/data:Z
    environment:
      KOMODO_HOST: https://komodo.home.local
      KOMODO_PASSKEY: changeme-run-openssl-rand-hex-32
    restart: unless-stopped
```

```bash
cd ~/komodo && podman-compose up -d
```

**Caddy:**
```caddyfile
komodo.home.local { tls internal; reverse_proxy localhost:9120 }
```

---

## Diun (Image Update Notifier)

**Purpose:** Watches your running containers and notifies you when a new image version is available on the registry — before you auto-update. Supports ntfy, Slack, email, Telegram, and more. Useful for reviewing changelogs before pulling updates, especially for security-sensitive containers.

```yaml
# ~/diun/compose.yml
services:
  diun:
    image: crazymax/diun:latest
    volumes:
      - /home/user/diun/data:/data:Z
      - /home/user/diun/config.yml:/diun.yml:ro,Z
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
    environment:
      TZ: Asia/Kolkata
      LOG_LEVEL: info
    restart: unless-stopped
```

```bash
cd ~/diun && podman-compose up -d
```

**Minimal `config.yml`:**
```yaml
watch:
  workers: 5
  schedule: "0 */6 * * *"
  firstCheckNotif: false

providers:
  docker:
    watchStopped: true

notif:
  ntfy:
    endpoint: http://host.containers.internal:8090
    topic: container-updates
    priority: default
    tags: ["docker", "update"]
```

---

## Cleanup & Maintenance

```bash
# Remove stopped containers, dangling images, and unused build cache
podman system prune

# Also remove all unused images (not just dangling)
podman system prune -a

# Check disk usage of container storage
podman system df

# Check Btrfs subvolume usage for the container store
sudo btrfs filesystem du -s /var/lib/containers

# Remove a specific unused image
podman rmi <image-name>

# Remove all unused volumes
podman volume prune
```

**Set up a monthly cleanup timer:**
```bash
cat > ~/.config/systemd/user/podman-cleanup.service << 'EOF'
[Unit]
Description=Monthly Podman Cleanup

[Service]
Type=oneshot
ExecStart=podman system prune -f

[Install]
WantedBy=default.target
EOF

cat > ~/.config/systemd/user/podman-cleanup.timer << 'EOF'
[Unit]
Description=Monthly Podman Cleanup Timer

[Timer]
OnCalendar=monthly
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now podman-cleanup.timer
```

---

## Useful Daily Commands

```bash
# List all running containers
podman ps

# List all containers including stopped
podman ps -a

# View live logs for a container
podman logs -f jellyfin

# Open a shell inside a running container
podman exec -it jellyfin /bin/bash

# View resource usage for all running containers
podman stats

# Inspect a container's full configuration
podman inspect jellyfin

# Check the Podman socket (needed for management UIs)
systemctl --user status podman.socket
systemctl --user enable --now podman.socket

# Copy a file from a container to the host
podman cp jellyfin:/config/config.xml ./jellyfin-config-backup.xml

# Check effective resource limits on a running container
podman inspect jellyfin | grep -A5 Memory

# Show image layer history (understand what each layer adds)
podman history jellyfin/jellyfin
```

---

## Caddy Configuration

```caddyfile
dashboard.home.local  { tls internal; reverse_proxy localhost:3001 }
portainer.home.local  { tls internal; reverse_proxy localhost:9443 }
dockge.home.local     { tls internal; reverse_proxy localhost:5001 }
yacht.home.local      { tls internal; reverse_proxy localhost:8001 }
komodo.home.local     { tls internal; reverse_proxy localhost:9120 }
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Service doesn't start after reboot | Verify `loginctl enable-linger $USER` was run; check `systemctl --user status <service>` |
| `podman.sock: no such file` | Enable the Podman socket: `systemctl --user enable --now podman.socket` |
| Container OOM-killed | Add resource limits (`deploy.resources.limits.memory`) or increase host RAM; check `podman inspect` for current limits |
| Auto-update not pulling new images | Confirm the `io.containers.autoupdate=registry` label is set; run `podman auto-update --dry-run` to verify |
| Portainer / Komodo / Homepage can't connect to Podman | Use the literal socket path `/run/user/$(id -u)/podman/podman.sock`; verify with `systemctl --user status podman.socket` |
| Disk full from container images | Run `podman system prune -a`; check `podman system df` for what's using space |
| Container keeps restarting | Check logs with `podman logs <container>`; look for startup errors or missing environment variables |
| Autoheal not restarting unhealthy container | Verify the health check command exits with code 1 on failure; check autoheal logs with `podman logs autoheal` |
| Komodo servers show offline after update | `KOMODO_PASSKEY` must be identical between core and any periphery agents; a mismatch shows all servers offline with no clear error message |
| listmonk or Postal broken after auto-update | These apps require a DB migration after image updates — run `./listmonk --upgrade --yes` (listmonk) or `postal initialize` (Postal) before restarting; always back up the database first |
| Diun not sending notifications | Check the ntfy topic and endpoint in `config.yml`; run `podman logs diun` to verify registry polling is working |
| `${UID}` not expanding in compose socket path | Run `export UID` before `podman-compose`, or substitute your literal UID (e.g. `1000`) directly in the path |
