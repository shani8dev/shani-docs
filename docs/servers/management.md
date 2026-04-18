---
title: Container Management & Lifecycle
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Container Management & Lifecycle

Best practices for running, updating, and maintaining self-hosted containers on Shani OS.

---

## Systemd Integration

Containers started with `--restart unless-stopped` restart after crashes but not after a clean reboot if systemd doesn't know about them. Generate native systemd user units for tight integration:

```bash
# 1. Generate a unit file from a running container
podman generate systemd --name jellyfin --files --new

# 2. Move it to the user systemd directory
mkdir -p ~/.config/systemd/user
mv container-jellyfin.service ~/.config/systemd/user/

# 3. Reload and enable
systemctl --user daemon-reload
systemctl --user enable --now container-jellyfin.service

# 4. Enable lingering — starts user services at boot even without an active login session
loginctl enable-linger $USER
```

**Verify it's working:**
```bash
systemctl --user status container-jellyfin.service
journalctl --user -u container-jellyfin.service -f
```

---

## Auto-Update Containers

Podman can automatically pull new images and recreate containers on a schedule. Add the label `io.containers.autoupdate=registry` to any container you want updated automatically:

```bash
podman run -d \
  --name jellyfin \
  --label io.containers.autoupdate=registry \
  ... \
  jellyfin/jellyfin
```

**Run or schedule the update:**
```bash
# Update all labelled containers now
podman auto-update --all

# Dry run to preview what would update
podman auto-update --dry-run

# Roll back a failed update
podman auto-update --rollback
```

**Set up a weekly systemd timer:**
```bash
cat > ~/.config/systemd/user/podman-auto-update.timer << 'EOF'
[Unit]
Description=Weekly Podman Container Update

[Timer]
OnCalendar=weekly
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user enable --now podman-auto-update.timer
```

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

```bash
podman run -d \
  --name autoheal \
  -v /run/user/$(id -u)/podman/podman.sock:/var/run/docker.sock:ro \
  -e AUTOHEAL_CONTAINER_LABEL=all \
  -e AUTOHEAL_INTERVAL=30 \
  --restart unless-stopped \
  willfarrell/autoheal
```

Add health checks to containers you want monitored:
```bash
podman run -d \
  --name jellyfin \
  --health-cmd "curl -f http://localhost:8096/health || exit 1" \
  --health-interval 30s \
  --health-retries 3 \
  --health-start-period 60s \
  ... \
  jellyfin/jellyfin
```

---

## Homepage (Service Dashboard)

**Purpose:** Modern, highly customisable application dashboard. Shows live status of all your services, system metrics, weather, RSS feeds, and bookmarks from a single page. Configured via YAML files and integrates directly with Docker/Podman via socket for automatic service discovery.

```bash
podman run -d \
  --name homepage \
  -p 127.0.0.1:3001:3000 \
  -v /home/user/homepage/config:/app/config:Z \
  -v /run/user/$(id -u)/podman/podman.sock:/var/run/docker.sock:ro \
  --restart unless-stopped \
  ghcr.io/gethomepage/homepage:latest
```

Access at `http://localhost:3001`. Configure services, bookmarks, and widgets in `/home/user/homepage/config/services.yaml`.

**Caddy:**
```caddyfile
dashboard.home.local { tls internal; reverse_proxy localhost:3001 }
```

---

## Portainer CE

**Purpose:** Full-featured graphical dashboard for managing containers, images, volumes, networks, and stacks. Supports Podman via socket. Best for users who want a single UI for everything.

```bash
podman run -d \
  --name portainer \
  -p 127.0.0.1:9443:9443 \
  -v /run/user/$(id -u)/podman/podman.sock:/var/run/docker.sock:ro \
  -v portainer_data:/data \
  --restart unless-stopped \
  portainer/portainer-ce:latest
```

Access at `https://localhost:9443`.

---

## Dockge

**Purpose:** Lightweight, compose-stack-focused container manager. Stacks are stored as files and can be synced via Git. Simpler and faster than Portainer if you primarily use compose files.

```bash
podman run -d \
  --name dockge \
  -p 127.0.0.1:5001:5001 \
  -v /run/user/$(id -u)/podman/podman.sock:/var/run/docker.sock:ro \
  -v /home/user/stacks:/home/runner/stacks:Z \
  -e DOCKGE_STACKS_DIR=/home/runner/stacks \
  --restart unless-stopped \
  louislam/dockge:latest
```

Access at `http://localhost:5001`.

---

## Yacht

**Purpose:** Template-driven container manager with a clean dashboard and built-in app store. Good middle ground between the simplicity of Dockge and the full feature set of Portainer.

```bash
podman run -d \
  --name yacht \
  -p 127.0.0.1:8001:8000 \
  -v /run/user/$(id -u)/podman/podman.sock:/var/run/docker.sock:ro \
  -v /home/user/yacht/config:/config:Z \
  --restart unless-stopped \
  selfhostedpro/yacht
```

Default login: `admin@yacht.local` / `pass`. Change immediately after first login.

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
```

---

## Caddy Configuration

```caddyfile
dashboard.home.local  { tls internal; reverse_proxy localhost:3001 }
portainer.home.local  { tls internal; reverse_proxy localhost:9443 }
dockge.home.local     { tls internal; reverse_proxy localhost:5001 }
yacht.home.local      { tls internal; reverse_proxy localhost:8001 }
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Service doesn't start after reboot | Verify `loginctl enable-linger $USER` was run; check `systemctl --user status <service>` |
| `podman.sock: no such file` | Enable the Podman socket: `systemctl --user enable --now podman.socket` |
| Container OOM-killed | Increase host RAM or add a memory limit: `--memory 2g --memory-swap 2g` to cap runaway containers |
| Auto-update not pulling new images | Confirm the `io.containers.autoupdate=registry` label is set; run `podman auto-update --dry-run` to verify |
| Portainer can't connect to Podman | Verify the socket path: use `/run/user/$(id -u)/podman/podman.sock` for rootless containers |
| Disk full from container images | Run `podman system prune -a`; check `podman system df` for what's using space |
| Container keeps restarting | Check logs with `podman logs <container>`; look for startup errors or missing environment variables |
| Autoheal not restarting unhealthy container | Verify the health check command exits with code 1 on failure; check autoheal logs with `podman logs autoheal` |
| Homepage service offline indicators | The Docker socket must be mounted; check socket path for rootless Podman (`/run/user/$(id -u)/podman/podman.sock`) |
