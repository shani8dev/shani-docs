---
title: Game Servers
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Game Servers

Dedicated game servers for multiplayer gaming — hosted on your own hardware, on your own terms. No monthly fees, no player limits imposed by third parties, full control over mods, difficulty, and world data.

> **Network note:** Game servers need ports reachable by players. For LAN-only play, no port forwarding is needed. For internet play, either forward the game port on your router to your server's LAN IP, or reach players via Tailscale — every player installs Tailscale and connects to your server's Tailscale IP, no public port forwarding required.

> **RAM guidance:** Minecraft Java needs ~2–6 GB per server depending on mods and player count. Valheim needs ~2 GB. Factorio is surprisingly lean at ~500 MB. Always allocate headroom above the minimum.

---

## Minecraft Java Edition

**Purpose:** The definitive self-hosted game server. Supports vanilla, Paper (performance-optimised), Fabric (mod loader), Forge (mod loader), and Spigot. The `itzg/minecraft-server` image is the community standard — it handles any server type via environment variables and supports auto-updating.

```bash
podman run -d \
  --name minecraft \
  -p 25565:25565 \
  -v /home/user/minecraft/data:/data:Z \
  -e EULA=TRUE \
  -e TYPE=PAPER \
  -e VERSION=LATEST \
  -e MEMORY=4G \
  -e DIFFICULTY=normal \
  -e OPS=YourUsername \
  -e MOTD="Home Server" \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  itzg/minecraft-server:latest
```

**Common environment variables:**

| Variable | Values | Effect |
|----------|--------|--------|
| `TYPE` | `VANILLA`, `PAPER`, `FABRIC`, `FORGE`, `SPIGOT` | Server software |
| `VERSION` | `LATEST`, `1.21.4`, `1.20.1` | Game version |
| `MEMORY` | `2G`, `4G`, `8G` | JVM heap size |
| `DIFFICULTY` | `peaceful`, `easy`, `normal`, `hard` | World difficulty |
| `MAX_PLAYERS` | `20` | Player cap |
| `VIEW_DISTANCE` | `10` | Chunk render distance |
| `WHITELIST` | `player1,player2` | Whitelist players |
| `OPS` | `YourUsername` | Server operators |
| `SEED` | any string | World generation seed |
| `MODE` | `survival`, `creative`, `adventure` | Game mode |

**Install mods (Fabric/Forge):**
```bash
# Drop .jar mod files into the mods directory
mkdir -p /home/user/minecraft/data/mods
# Then restart the container — mods are loaded on startup
podman restart minecraft
```

**RCON (remote console):**
```bash
# Enable RCON in the container
-e ENABLE_RCON=true \
-e RCON_PASSWORD=changeme \
-e RCON_PORT=25575

# Connect via mcrcon
podman exec minecraft rcon-cli say "Hello from server console"
```

**Firewall:**
```bash
sudo firewall-cmd --add-port=25565/tcp --permanent && sudo firewall-cmd --reload
```

---

## Minecraft Bedrock Edition

**Purpose:** Bedrock-edition dedicated server for players on Windows 10/11, Xbox, PlayStation, Switch, iOS, and Android. Supports cross-platform play. Uses the same `itzg` image family.

```bash
podman run -d \
  --name minecraft-bedrock \
  -p 19132:19132/udp \
  -p 19133:19133/udp \
  -v /home/user/minecraft-bedrock/data:/data:Z \
  -e EULA=TRUE \
  -e SERVER_NAME="Home Bedrock Server" \
  -e GAMEMODE=survival \
  -e DIFFICULTY=normal \
  -e MAX_PLAYERS=10 \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  itzg/minecraft-bedrock-server:latest
```

**Firewall:**
```bash
sudo firewall-cmd --add-port=19132/udp --add-port=19133/udp --permanent && sudo firewall-cmd --reload
```

---

## Minecraft Network: Velocity Proxy

**Purpose:** Run multiple Minecraft servers (e.g., a survival world, a creative world, a minigames server) behind a single IP and port. Players connect to the proxy and `/server survival` to switch between backends. Velocity is the modern, actively maintained replacement for BungeeCord.

```bash
podman run -d \
  --name velocity \
  -p 25577:25577 \
  -v /home/user/velocity/config:/config:Z \
  -e MEMORY=512M \
  --restart unless-stopped \
  itzg/bungeecord:latest
```

**Minimal `velocity.toml`:**
```toml
bind = "0.0.0.0:25577"
motd = "&aHome Network"
show-max-players = 100
player-info-forwarding-mode = "modern"

[servers]
survival = "localhost:25565"
creative = "localhost:25566"
try = ["survival"]

[forced-hosts]
```

> Each backend Paper server must have `velocity-secret` configured and `online-mode=false` in `server.properties` — Velocity handles authentication.

---

## Valheim

**Purpose:** Dedicated server for the Viking survival game. Fully configurable world name, password, and modding support via BepInEx. Automatically updates on container restart.

```bash
podman run -d \
  --name valheim \
  -p 2456:2456/udp \
  -p 2457:2457/udp \
  -p 2458:2458/udp \
  -v /home/user/valheim/data:/opt/valheim:Z \
  -v /home/user/valheim/config:/config:Z \
  -e SERVER_NAME="Home Valheim" \
  -e WORLD_NAME="Midgard" \
  -e SERVER_PASS=changeme \
  -e SERVER_PUBLIC=false \
  -e UPDATE_ON_STARTUP=true \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  lloesche/valheim-server:latest
```

> Set `SERVER_PUBLIC=false` to hide from the public server list — players connect by direct IP. Set a password of at least 5 characters.

**Install BepInEx mods:**
```bash
# Create BepInEx plugins directory
mkdir -p /home/user/valheim/config/BepInEx/plugins
# Drop mod .dll files here — they load on server restart
```

**Firewall:**
```bash
sudo firewall-cmd --add-port=2456-2458/udp --permanent && sudo firewall-cmd --reload
```

---

## Terraria

**Purpose:** Dedicated server for the 2D sandbox game. Supports vanilla and TModLoader (modded) builds, world selection, password protection, and server-side characters.

```bash
# Create a world first (run interactively)
podman run -it --rm \
  -v /home/user/terraria/data:/root/.local/share/Terraria:Z \
  ryshe/terraria:latest \
  -world /root/.local/share/Terraria/Worlds/MyWorld.wld \
  -autocreate 2

# Run the dedicated server
podman run -d \
  --name terraria \
  -p 7777:7777 \
  -v /home/user/terraria/data:/root/.local/share/Terraria:Z \
  -e world=/root/.local/share/Terraria/Worlds/MyWorld.wld \
  --restart unless-stopped \
  ryshe/terraria:latest
```

**TModLoader (modded Terraria):**
```bash
podman run -d \
  --name tmodloader \
  -p 7777:7777 \
  -v /home/user/terraria/data:/root/.local/share/Terraria:Z \
  -v /home/user/terraria/mods:/root/.local/share/Terraria/ModLoader/Mods:Z \
  --restart unless-stopped \
  jacobsmile/tmodloader1449:latest
```

**Firewall:**
```bash
sudo firewall-cmd --add-port=7777/tcp --permanent && sudo firewall-cmd --reload
```

---

## Factorio

**Purpose:** Dedicated server for the factory automation game. Supports headless operation, saves management, and mod synchronisation. Factorio's dedicated server is exceptionally well-engineered — it runs on ~500 MB RAM and handles 50+ players on modest hardware.

```bash
podman run -d \
  --name factorio \
  -p 34197:34197/udp \
  -p 27015:27015/tcp \
  -v /home/user/factorio/data:/factorio:Z \
  -e SAVE_NAME=my-factory \
  -e GENERATE_NEW_SAVE=true \
  -e USERNAME=your-factorio-username \
  -e TOKEN=your-factorio-token \
  --restart unless-stopped \
  factoriotools/factorio:stable
```

> Get your token from [factorio.com](https://factorio.com) → Profile → Token. This enables the server to appear on the server browser and handles authentication.

**Mods:**
```bash
# Mods go in the mods subdirectory
mkdir -p /home/user/factorio/data/mods
# Download .zip mod files from mods.factorio.com and drop them here
# The server downloads mods to clients automatically on join
```

**Server settings (`/home/user/factorio/data/server-settings.json`):**
```json
{
  "name": "My Factorio Server",
  "description": "Home server",
  "visibility": { "public": false, "lan": true },
  "require_user_verification": true,
  "max_players": 10,
  "autosave_interval": 10,
  "autosave_slots": 5
}
```

**Firewall:**
```bash
sudo firewall-cmd --add-port=34197/udp --add-port=27015/tcp --permanent && sudo firewall-cmd --reload
```

---

## Satisfactory

**Purpose:** Dedicated server for the 3D open-world factory game. Supports persistent world saves, auto-updates via SteamCMD, and HTTPS API for server management.

```bash
podman run -d \
  --name satisfactory \
  -p 7777:7777/udp \
  -p 7777:7777/tcp \
  -v /home/user/satisfactory/data:/home/steam/SatisfactoryDedicatedServer:Z \
  -e MAXPLAYERS=4 \
  -e STEAMBETA=false \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  wolveix/satisfactory-server:latest
```

> First startup downloads the full game (~15 GB) via SteamCMD — allow 10–30 minutes depending on connection speed. Watch progress with `podman logs -f satisfactory`.

**Firewall:**
```bash
sudo firewall-cmd --add-port=7777/udp --add-port=7777/tcp --permanent && sudo firewall-cmd --reload
```

---

## CS2 / Counter-Strike Dedicated Server

**Purpose:** Dedicated server for Counter-Strike 2 (and CS:GO legacy). Supports custom maps, plugins via MetaMod + CounterStrikeSharp, and competitive/casual game modes.

```bash
podman run -d \
  --name cs2 \
  -p 27015:27015/tcp \
  -p 27015:27015/udp \
  -p 27020:27020/udp \
  -v /home/user/cs2/data:/home/steam/cs2-dedicated:Z \
  -e STEAMAPPID=730 \
  -e CS2_SERVERNAME="Home CS2 Server" \
  -e CS2_CHEATS=0 \
  -e CS2_PORT=27015 \
  -e CS2_MAXPLAYERS=12 \
  -e CS2_GAMETYPE=0 \
  -e CS2_GAMEMODE=1 \
  -e CS2_MAPGROUP=mg_active \
  -e CS2_STARTMAP=de_dust2 \
  -e CS2_RCON_PASSWORD=changeme \
  --restart unless-stopped \
  joedwards32/cs2:latest
```

> First run downloads the full server files (~30 GB) via SteamCMD. A fast disk is helpful here — NVMe significantly reduces startup time.

**Add plugins (CounterStrikeSharp):**
```bash
# MetaMod and CounterStrikeSharp go into the game directory
# Download releases from github.com/roflmuffin/CounterStrikeSharp
# Extract to /home/user/cs2/data/game/csgo/addons/
```

**Firewall:**
```bash
sudo firewall-cmd --add-port=27015/tcp --add-port=27015/udp --add-port=27020/udp --permanent && sudo firewall-cmd --reload
```

---

## Pterodactyl (Game Server Management Panel)

**Purpose:** The most widely used self-hosted game server management panel. Run multiple game servers with different users, resource quotas, and isolated environments from a single web UI. Supports 50+ games out of the box via "eggs" (server type definitions). Has a clean admin panel, per-user file manager, console access, and a public REST API.

```yaml
# ~/pterodactyl/compose.yml
services:
  panel:
    image: ghcr.io/pterodactyl/panel:latest
    ports: ["127.0.0.1:80:80", "127.0.0.1:443:443"]
    environment:
      APP_URL: https://panel.home.local
      APP_KEY: base64:changeme-run-php-artisan-key-generate
      DB_HOST: db
      DB_DATABASE: panel
      DB_USERNAME: pterodactyl
      DB_PASSWORD: changeme
      REDIS_HOST: redis
      CACHE_DRIVER: redis
      SESSION_DRIVER: redis
      QUEUE_DRIVER: redis
      APP_TIMEZONE: Asia/Kolkata
      MAIL_DRIVER: log
    volumes:
      - /home/user/pterodactyl/var:/app/var:Z
      - /home/user/pterodactyl/logs:/app/storage/logs:Z
      - /home/user/pterodactyl/nginx:/etc/nginx/http.d:Z
    depends_on: [db, redis]
    restart: unless-stopped

  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: panel
      MYSQL_USER: pterodactyl
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  db_data:
```

**Create admin user:**
```bash
podman exec -it pterodactyl-panel-1 php artisan p:user:make
```

> Pterodactyl uses a separate **Wings** daemon that runs on the same or different hosts to actually manage game server containers. Install Wings on each game server host following the [official Wings guide](https://pterodactyl.io/wings/1.0/installing.html).

**Caddy:**
```caddyfile
panel.home.local { tls internal; reverse_proxy localhost:80 }
```

---

## Crafty Controller (Minecraft Panel)

**Purpose:** Lightweight Minecraft-focused management panel. Simpler than Pterodactyl — designed specifically for Minecraft server management with a clean UI, auto-backup scheduling, RCON console, player stats, and CPU/RAM graphs per server. Ideal when you only run Minecraft and want something simpler than Pterodactyl.

```bash
podman run -d \
  --name crafty \
  -p 127.0.0.1:8000:8000 \
  -p 127.0.0.1:8443:8443 \
  -p 25500-25600:25500-25600 \
  -v /home/user/crafty/backups:/var/opt/minecraft/backups:Z \
  -v /home/user/crafty/logs:/var/opt/minecraft/logs:Z \
  -v /home/user/crafty/servers:/var/opt/minecraft/servers:Z \
  -v /home/user/crafty/config:/var/opt/minecraft/config:Z \
  --restart unless-stopped \
  registry.gitlab.com/crafty-controller/crafty-4:latest
```

Access at `https://localhost:8443`. Default login: `admin` / `crafty` — change immediately. Create servers from the panel and let Crafty download the correct server jar.

**Caddy:**
```caddyfile
crafty.home.local { tls internal; reverse_proxy localhost:8443 }
```

---

## Port Reference

| Game | Protocol | Port(s) |
|------|----------|---------|
| Minecraft Java | TCP | 25565 |
| Minecraft Bedrock | UDP | 19132–19133 |
| Velocity Proxy | TCP | 25577 |
| Valheim | UDP | 2456–2458 |
| Terraria | TCP | 7777 |
| Factorio | UDP | 34197 |
| CS2 | TCP+UDP | 27015, 27020 UDP |
| Satisfactory | TCP+UDP | 7777 |
| Pterodactyl Panel | TCP | 80, 443 |
| Pterodactyl Wings | TCP | 8080, 2022 |
| Crafty Controller | TCP | 8443 |

---

## Backups

Game world data is irreplaceable — back it up with Restic on a schedule:

```bash
# ~/.config/systemd/user/gameserver-backup.service
[Unit]
Description=Game Server Backup

[Service]
Type=oneshot
ExecStart=podman exec restic restic backup \
  /home/user/minecraft/data/world \
  /home/user/valheim/data/worlds_local \
  /home/user/factorio/data/saves
ExecStartPost=curl -d "Game server backup done ✅" https://ntfy.sh/your-topic
```

```bash
# ~/.config/systemd/user/gameserver-backup.timer
[Unit]
Description=Daily game server backup

[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Players can't connect from internet | Verify port is forwarded on router to server LAN IP; confirm `firewall-cmd` rule is in place; test with `nc -zv your-public-ip port` |
| Minecraft server crashes on startup | Check `podman logs minecraft`; most crashes are missing EULA (`EULA=TRUE`), insufficient memory (`MEMORY=4G`), or a corrupt world |
| Valheim `ERROR: No map seed` on new world | Ensure `WORLD_NAME` is set and the data volume has write permissions |
| Terraria world not found | The world file path inside the container must match the `-e world=` path exactly; verify with `podman exec terraria ls /root/.local/share/Terraria/Worlds/` |
| Factorio can't authenticate players | `USERNAME` and `TOKEN` must match your factorio.com account exactly; generate a fresh token on the website if needed |
| CS2 stuck downloading | SteamCMD can be slow — watch with `podman logs -f cs2`; ensure the data volume has 40 GB free |
| Satisfactory clients can't find server | Ensure both TCP and UDP 7777 are open; Satisfactory uses both protocols |
| Pterodactyl Wings not connecting to panel | Ensure the Wings daemon's `config.yml` has the correct panel URL and token; check Wings logs with `journalctl -u wings` |
| High CPU on Minecraft server | Switch from vanilla to Paper — it patches performance issues and runs 2–5× more efficiently at high player counts |
| Minecraft world corruption after crash | Always stop cleanly before server maintenance: `podman exec minecraft rcon-cli stop`; never force-kill a running Minecraft server |
| Modded server fails to start | Mod version mismatch — ensure all mods target the same Minecraft and mod-loader version; check logs for `ClassNotFoundException` |
| Velocity players see wrong server | Ensure backend servers have `online-mode=false` and the matching `velocity-secret` set in `paper.yml` |

> 💡 **Performance tip:** For Minecraft, use **Paper** instead of vanilla — it uses async chunk loading, mob AI optimisations, and dozens of performance patches. At 10+ players on modded servers, also look at **Aikar's JVM flags** which are available at aikar.co/2018/07/02/tuning-the-jvm-g1gc-garbage-collector-flags-for-minecraft.
