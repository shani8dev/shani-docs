---
title: Home Automation
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Home Automation

Smart home hubs, IoT bridges, camera NVRs, and automation pipelines — all running locally with no cloud dependency.

> **Why local?** Cloud-dependent smart home devices can stop working when manufacturers shut down servers or change APIs. Local automation gives you sub-50ms response times, works during internet outages, and keeps all your sensor data on your own hardware.

---

## Home Assistant

**Purpose:** The leading open-source home automation platform. Integrates with 3,000+ devices and services — lights, sensors, thermostats, cameras, locks, media players, energy monitors. Supports automations, dashboards, voice assistants (local and cloud), and a mobile app.

```bash
podman run -d \
  --name homeassistant \
  --network host \
  -v /home/user/homeassistant/config:/config:Z \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  ghcr.io/home-assistant/home-assistant:stable
```

> `--network host` is required for Home Assistant to discover devices on your local network via mDNS and UPnP.

Access at `http://localhost:8123`. On first run, Home Assistant automatically discovers many devices on your network.

**Backup your config:**
```bash
# The built-in backup tool (Settings → System → Backups) creates .tar archives
# Back them up offsite with Restic
restic backup /home/user/homeassistant/config
```

**Recommended HACS integrations:** Mushroom Cards, Mini Graph Card, Browser Mod, Local Tuya, Adaptive Lighting.

---

## Mosquitto (MQTT Broker)

**Purpose:** Lightweight MQTT message broker. Required for Zigbee2MQTT, ESPHome, and many other IoT integrations. Acts as the communication backbone between devices and Home Assistant.

```bash
# Create a password file
mkdir -p /home/user/mosquitto/config
echo "user:$(openssl passwd -6 yourpassword)" > /home/user/mosquitto/config/passwd

# Create mosquitto.conf
cat > /home/user/mosquitto/config/mosquitto.conf << 'EOF'
listener 1883
allow_anonymous false
password_file /mosquitto/config/passwd
persistence true
persistence_location /mosquitto/data/
log_dest file /mosquitto/log/mosquitto.log
EOF

podman run -d \
  --name mosquitto \
  -p 127.0.0.1:1883:1883 \
  -v /home/user/mosquitto/config:/mosquitto/config:Z \
  -v /home/user/mosquitto/data:/mosquitto/data:Z \
  -v /home/user/mosquitto/log:/mosquitto/log:Z \
  --restart unless-stopped \
  eclipse-mosquitto
```

**Monitor MQTT traffic:**
```bash
# Subscribe to all topics (useful for debugging)
podman exec mosquitto mosquitto_sub -u user -P yourpassword -t '#' -v
```

---

## Zigbee2MQTT

**Purpose:** Bridges Zigbee devices (lights, sensors, plugs, locks) to MQTT using a $10–15 USB Zigbee coordinator. Works with 3,000+ Zigbee devices from any manufacturer — no proprietary hubs, no cloud bridges, no subscriptions.

**Supported coordinators:** Sonoff Zigbee 3.0 USB Dongle Plus, CC2652R/P, HUSBZB-1, Conbee II.

```bash
podman run -d \
  --name zigbee2mqtt \
  -v /home/user/zigbee2mqtt/data:/app/data:Z \
  --device /dev/ttyUSB0:/dev/ttyUSB0 \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  koenkk/zigbee2mqtt
```

> Find your coordinator: `ls /dev/tty*` or `dmesg | grep tty` after plugging it in.

**Minimal `configuration.yaml`:**
```yaml
homeassistant: true
mqtt:
  server: mqtt://localhost:1883
  user: user
  password: yourpassword
serial:
  port: /dev/ttyUSB0
frontend:
  port: 8080
```

Access the web UI at `http://localhost:8080` to pair devices and view the network map.

---

## ESPHome

**Purpose:** Compile and flash YAML-based firmware to ESP32/ESP8266 microcontrollers. Build custom sensors, switches, displays, and automations that integrate directly with Home Assistant over Wi-Fi — no cloud, no pairing apps.

```bash
podman run -d \
  --name esphome \
  -p 127.0.0.1:6052:6052 \
  -v /home/user/esphome/config:/config:Z \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  esphome/esphome
```

**Example device config (temperature + humidity sensor):**
```yaml
# /home/user/esphome/config/bedroom-sensor.yaml
esphome:
  name: bedroom-sensor

esp32:
  board: esp32dev

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password

api:
  encryption:
    key: !secret api_key

ota:
  password: !secret ota_password

sensor:
  - platform: dht
    pin: GPIO4
    temperature:
      name: "Bedroom Temperature"
    humidity:
      name: "Bedroom Humidity"
    update_interval: 60s
```

---

## Node-RED

**Purpose:** Flow-based visual programming for wiring devices, APIs, and automations. Great for complex logic that is easier to build visually than in Home Assistant's YAML automations. Useful for integrating non-HA services (e.g., MQTT → database → notification).

```bash
podman run -d \
  --name node-red \
  -p 127.0.0.1:1880:1880 \
  -v /home/user/nodered/data:/data:Z \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  nodered/node-red
```

Access at `http://localhost:1880`. Install the `node-red-contrib-home-assistant-websocket` palette to connect to Home Assistant. Install `node-red-node-sqlite` to log sensor data locally.

---

## Matter Server

**Purpose:** Bridges Matter/Thread smart home devices to Home Assistant. Matter is the new unified smart home standard supported by Apple, Google, Amazon, and hundreds of device manufacturers — all locally, no cloud required.

```bash
podman run -d \
  --name matter-server \
  --network host \
  -v /home/user/matter-server/data:/data:Z \
  --restart unless-stopped \
  ghcr.io/home-assistant-libs/python-matter-server:stable
```

In Home Assistant: Settings → Devices & Services → Add Integration → Matter (BETA). Point it at `ws://localhost:5580/ws`.

> You need a Thread border router to use Thread devices. Apple HomePod mini, Google Nest Hub, or a dedicated USB Thread dongle all work.

---

## Frigate

**Purpose:** Network Video Recorder (NVR) with real-time AI object detection — people, cars, animals, packages. Runs detection locally using your GPU or a Coral TPU. Integrates deeply with Home Assistant for automations triggered by detections.

```bash
podman run -d \
  --name frigate \
  -p 127.0.0.1:5000:5000 \
  -p 127.0.0.1:8554:8554 \
  -p 127.0.0.1:8555:8555/udp \
  -v /home/user/frigate/config:/config:Z \
  -v /home/user/frigate/media:/media/frigate:Z \
  --device /dev/dri:/dev/dri \
  --shm-size=256m \
  --restart unless-stopped \
  ghcr.io/blakeblackshear/frigate:stable
```

**Minimal `config.yml`:**
```yaml
mqtt:
  enabled: true
  host: localhost
  user: user
  password: yourpassword

cameras:
  front-door:
    ffmpeg:
      inputs:
        - path: rtsp://camera-ip:554/stream
          roles: [detect, record]
    detect:
      width: 1280
      height: 720
      fps: 5

detectors:
  cpu1:
    type: cpu
```

> Add a Google Coral USB TPU (`--device /dev/bus/usb`) for hardware-accelerated detection at 100+ FPS with minimal CPU usage.

---

## Double Take (Facial Recognition)

**Purpose:** Integrates with Frigate to identify specific people by face. When Frigate detects a person, Double Take runs recognition against a library of known faces and publishes the result to MQTT — letting Home Assistant trigger "welcome home" automations by person.

```bash
podman run -d \
  --name double-take \
  -p 127.0.0.1:3000:3000 \
  -v /home/user/double-take/.storage:/.storage:Z \
  --restart unless-stopped \
  jakowenko/double-take
```

Configure recognisers (CompreFace, DeepStack, or CodeProject.AI) in the Double Take UI, then add face images to the library.

---

## Caddy Configuration

```caddyfile
homeassistant.home.local  { tls internal; reverse_proxy localhost:8123 }
zigbee.home.local         { tls internal; reverse_proxy localhost:8080 }
esphome.home.local        { tls internal; reverse_proxy localhost:6052 }
nodered.home.local        { tls internal; reverse_proxy localhost:1880 }
frigate.home.local        { tls internal; reverse_proxy localhost:5000 }
doubletake.home.local     { tls internal; reverse_proxy localhost:3000 }
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Home Assistant can't discover devices | Ensure `--network host` is set; check that mDNS/multicast is not blocked on your LAN |
| Zigbee2MQTT can't open serial port | Verify the device path with `ls /dev/ttyUSB*`; add your user to the `dialout` group: `sudo usermod -aG dialout $USER` |
| MQTT connection refused | Check Mosquitto is running and the password file is correct; verify the port is not blocked by firewalld |
| Frigate using too much CPU | Set `fps: 5` or lower in detect config; add a Coral TPU or use GPU detection with `--device /dev/dri` |
| ESPHome OTA upload fails | Ensure the ESP32 is on the same network as the server; check the API encryption key matches in both config and device |
| Node-RED flows lost after update | Flows are stored in `/home/user/nodered/data/flows.json` — ensure the volume is mounted correctly |
| Home Assistant automations not triggering | Check logs (Settings → System → Logs); verify MQTT messages are arriving with `mosquitto_sub -t '#' -v` |
| Matter pairing fails | Ensure both the Matter Server and Home Assistant are on the same LAN/VLAN; Matter devices need mDNS broadcast to work |
| Double Take not recognising faces | Ensure Frigate is publishing snapshots to MQTT; check the face library has enough reference images per person (5+ recommended) |
