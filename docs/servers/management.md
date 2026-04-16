---
title: Container Management & Lifecycle
section: Self-Hosting & Servers
updated: 2026-04-16
---

# Container Management & Lifecycle

Best practices for running, updating, and maintaining self-hosted containers on an immutable OS like Shanios.

## Systemd Integration
Containers started via CLI won't survive reboots unless `--restart unless-stopped` is used. For tighter integration, generate native systemd units:
```bash
# 1. Generate unit file for a running container
podman generate systemd --name jellyfin --files --new

# 2. Move to user systemd directory
mv container-jellyfin.service ~/.config/systemd/user/

# 3. Enable & start
systemctl --user daemon-reload
systemctl --user enable --now container-jellyfin.service

# 4. Enable lingering (starts at boot, even without login)
loginctl enable-linger $USER
```

## Auto-Update Containers
Podman can automatically pull new images and recreate containers.
```bash
# Enable auto-update
podman auto-update --all

# Create a systemd timer for weekly updates
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

## Auto-Heal Crashed Containers
Automatically restart containers that fail health checks.
```bash
podman run -d \
  --name autoheal \
  -v /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro \
  --restart unless-stopped \
  willfarrell/autoheal
```

## Portainer CE / Dockge
**Purpose**: Portainer is a visual container management dashboard. Dockge is a lightweight, terminal-friendly compose manager that syncs stacks via Git.
```bash
podman run -d \
  --name portainer \
  -p 127.0.0.1:9443:9443 \
  -v /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro \
  -v portainer_data:/data \
  --restart unless-stopped \
  portainer/portainer-ce:latest

podman run -d \
  --name dockge \
  -p 127.0.0.1:5001:5001 \
  -v /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro \
  -v /home/user/stacks:/home/runner/stacks:Z \
  -e DOCKGE_STACKS_DIR=/home/runner/stacks \
  --restart unless-stopped \
  louislam/dockge:latest
```

## Cleanup & Maintenance
```bash
# Remove stopped containers, unused images, and dangling volumes
podman system prune -a

# Check Btrfs subvolume usage
sudo btrfs filesystem du -s /var/lib/containers

# Run Shanios storage optimization
sudo shani-deploy --optimize
```
