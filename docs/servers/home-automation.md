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

## go2rtc (WebRTC Camera Gateway)

**Purpose:** Universal camera streaming gateway. Takes any RTSP, RTMP, ONVIF, USB, or HTTP camera stream and re-serves it as WebRTC (browser-viewable), MSE, HLS, or RTSP. Zero-latency browser previews, multi-stream support, and deep Frigate and Home Assistant integration — go2rtc powers the camera streams in Frigate 0.13+ and Home Assistant's WebRTC camera card.

```bash
podman run -d \
  --name go2rtc \
  -p 127.0.0.1:1984:1984 \
  -p 8554:8554 \
  -p 8555:8555/tcp \
  -p 8555:8555/udp \
  -v /home/user/go2rtc/go2rtc.yaml:/config/go2rtc.yaml:ro,Z \
  --restart unless-stopped \
  alexxit/go2rtc
```

**Example `go2rtc.yaml`:**
```yaml
streams:
  front-door: rtsp://admin:password@192.168.1.101:554/stream1
  back-yard: rtsp://admin:password@192.168.1.102:554/h264Preview_01_main
  doorbell: rtspx://192.168.1.103:7441/api/camera/proxy/...

webrtc:
  candidates:
    - 192.168.1.10:8555  # your server's LAN IP

api:
  listen: ":1984"
```

Access the web UI at `http://localhost:1984` to view live streams in the browser. In Frigate config, set `go2rtc.streams` to reference the same stream names.

---

## Z-Wave JS UI (Z-Wave Device Bridge)

**Purpose:** Full-featured Z-Wave device manager and MQTT bridge. Similar to Zigbee2MQTT but for Z-Wave — manages your Z-Wave USB controller (Aeotec Z-Stick, HUSBZB-1, Zooz ZST10), pairs devices, exposes them to Home Assistant via MQTT or WebSocket, and provides a visual mesh network map. Required for Z-Wave devices like Yale/Schlage smart locks, Fibaro sensors, and Qubino modules.

```bash
podman run -d \
  --name zwave-js-ui \
  -p 127.0.0.1:8091:8091 \
  -p 127.0.0.1:3000:3000 \
  -v /home/user/zwave-js-ui/store:/usr/src/app/store:Z \
  --device /dev/ttyUSB1:/dev/ttyUSB1 \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  zwavejs/zwave-js-ui:latest
```

> Find your Z-Wave stick: `ls /dev/ttyUSB*` after plugging it in (may be `ttyUSB0` or `ttyACM0` depending on the model).

In Home Assistant: Settings → Devices & Services → Add Integration → Z-Wave JS → use WebSocket URL `ws://host.containers.internal:3000`.

---

## Scrypted (Camera Hub & NVR)

**Purpose:** Camera management and NVR platform with a focus on HomeKit Secure Video integration. Supports 40+ camera brands, transcodes streams to HomeKit format, and integrates with Google Home, Alexa, Home Assistant, and Frigate. If you want your RTSP cameras to appear natively in Apple Home or Google Home, Scrypted is the bridge.

```bash
podman run -d \
  --name scrypted \
  --network host \
  -v /home/user/scrypted/volume:/server/volume:Z \
  --restart unless-stopped \
  koush/scrypted
```

> `--network host` is required for mDNS discovery of cameras and HomeKit pairing. Access the UI at `https://localhost:10443` (self-signed cert on first run).

**Caddy:**
```caddyfile
scrypted.home.local { tls internal; reverse_proxy localhost:10443 }
```

---

## AppDaemon (Python Automation Engine)

**Purpose:** Python scripting environment for Home Assistant automations. Write complex automation logic in Python instead of YAML — full access to Home Assistant's state machine, events, and services. Ideal for automations that require loops, data structures, external API calls, or logic that would be unwieldy in HA's built-in automation editor. Also includes HADashboard for building kiosk-style tablet wall panels.

```bash
podman run -d \
  --name appdaemon \
  -p 127.0.0.1:5050:5050 \
  -v /home/user/appdaemon/config:/conf:Z \
  -e HA_URL=http://host.containers.internal:8123 \
  -e TOKEN=your-long-lived-access-token \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  acockburn/appdaemon:latest
```

**Example app (`/conf/apps/notify_on_door.py`):**
```python
import appdaemon.plugins.hass.hassapi as hass

class DoorNotifier(hass.Hass):
    def initialize(self):
        self.listen_state(self.door_opened, "binary_sensor.front_door", new="on")

    def door_opened(self, entity, attribute, old, new, kwargs):
        self.notify("Front door opened!", name="mobile_app_phone")
        self.call_service("light/turn_on", entity_id="light.porch", brightness=255)
```

---

## evcc (EV Charging Optimiser)

**Purpose:** Electric vehicle charging automation — charges your EV using surplus solar power, off-peak tariff windows, or a combination of both. Integrates with 200+ EV chargers (go-e, Wallbox, ABB, etc.), inverters (SMA, Fronius, Huawei, Shelly EM), and energy meters. Displays a real-time dashboard showing solar yield, grid import/export, and charging state.

```yaml
# ~/evcc/compose.yml
services:
  evcc:
    image: evcc/evcc:latest
    ports: ["127.0.0.1:7070:7070"]
    volumes:
      - /home/user/evcc/evcc.yaml:/etc/evcc.yaml:ro,Z
      - /home/user/evcc/data:/root/.evcc:Z
    environment:
      TZ: Asia/Kolkata
    restart: unless-stopped
```

**Minimal `evcc.yaml`:**
```yaml
network:
  schema: http
  host: evcc.home.local
  port: 7070

interval: 30s

meters:
  - name: grid
    type: template
    template: shelly-3em
    host: 192.168.1.50

chargers:
  - name: wallbox
    type: template
    template: go-e
    host: 192.168.1.60

vehicles:
  - name: mycar
    type: template
    template: generic
    title: My EV
    capacity: 60  # kWh
```

Access at `http://localhost:7070`. Set charging mode to **PV** for solar-only charging, **MinPV** for guaranteed minimum current topped up by solar, or **Now** for maximum speed regardless of source.

---

## WLED (LED Controller)

**Purpose:** Open-source firmware and web server for addressable LED strips (WS2812B, SK6812, WS2811, and more) running on ESP8266/ESP32. Flash WLED onto a cheap ESP32 board, wire it to your LED strip, and get a full web UI, Home Assistant integration via MQTT and native API, effects library (100+ built-in animations), segments, palettes, and a JSON API. No cloud — WLED runs entirely on the microcontroller and your LAN.

WLED runs on the ESP32 microcontroller itself — not as a container on your server. Your server hosts the Home Assistant integration and optionally a WLED configuration backup.

**Flash WLED onto an ESP32 (from your server):**
```bash
# Install esptool
pip install esptool --break-system-packages

# Download latest WLED firmware
curl -LO https://github.com/Aircoookie/WLED/releases/latest/download/WLED_0.15.0_ESP32.bin

# Flash (replace /dev/ttyUSB0 with your ESP32 port)
esptool.py --port /dev/ttyUSB0 write_flash 0x0 WLED_0.15.0_ESP32.bin
```

**Or use the browser-based installer at [install.wled.me](https://install.wled.me)** — plug the ESP32 into any computer and flash directly from the browser without installing tools.

**Wire the circuit:**
```
ESP32 GPIO2 (Data) ──► LED Strip Data In
ESP32 GND           ──► LED Strip GND   ──► Power Supply GND
5V Power Supply     ──► LED Strip VCC
                                         (do NOT power strip from ESP32 5V)
```

> For more than ~30 LEDs, always use an external 5V power supply. A 60-LED strip at full white draws ~3.6A — far more than USB can provide.

**Home Assistant integration:**

Once WLED is on your network, Home Assistant auto-discovers it via mDNS. Accept the integration and your LED strip appears as a light entity with brightness, colour, and effect controls.

**Manual WLED config backup (save to your server):**
```bash
# Export WLED config via its HTTP API
curl http://192.168.1.XXX/cfg.json -o /home/user/wled/backups/strip-1-cfg.json
curl http://192.168.1.XXX/presets.json -o /home/user/wled/backups/strip-1-presets.json
```

**Control via JSON API:**
```bash
# Set colour to warm white
curl -X POST http://192.168.1.XXX/json/state \
  -H "Content-Type: application/json" \
  -d '{"on":true,"bri":200,"seg":[{"col":[[255,200,100]]}]}'

# Set a built-in effect (effect ID 9 = "Colorloop")
curl -X POST http://192.168.1.XXX/json/state \
  -d '{"seg":[{"fx":9,"sx":128,"ix":200}]}'

# Turn off
curl -X POST http://192.168.1.XXX/json/state -d '{"on":false}'
```

**MQTT control (integrates with Mosquitto):**

In WLED web UI → Config → Sync → MQTT:
- Server: `192.168.1.X` (your Mosquitto host)
- Port: `1883`
- User/Password: your MQTT credentials
- Topic: `wled/strip1`

```bash
# Control via MQTT
podman exec mosquitto mosquitto_pub -u user -P password \
  -t "wled/strip1" -m "ON"

podman exec mosquitto mosquitto_pub -u user -P password \
  -t "wled/strip1/col" -m "#FF6400"
```

> WLED is one of the most popular DIY smart home projects. A single ESP32 (~$4) + WS2812B strip (~$8/m) gives you full-colour, effect-capable smart lighting at a fraction of the cost of Philips Hue or LIFX.

---

## Caddy Configuration

```caddyfile
homeassistant.home.local  { tls internal; reverse_proxy localhost:8123 }
zigbee.home.local         { tls internal; reverse_proxy localhost:8080 }
esphome.home.local        { tls internal; reverse_proxy localhost:6052 }
nodered.home.local        { tls internal; reverse_proxy localhost:1880 }
frigate.home.local        { tls internal; reverse_proxy localhost:5000 }
doubletake.home.local     { tls internal; reverse_proxy localhost:3000 }
appdaemon.home.local      { tls internal; reverse_proxy localhost:5050 }
evcc.home.local           { tls internal; reverse_proxy localhost:7070 }
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
| WLED not discovered by Home Assistant | Ensure WLED and Home Assistant are on the same LAN/VLAN; mDNS must be allowed between them; try adding via IP manually in the WLED integration |
| WLED LEDs flicker or show wrong colours | Check data wire connection quality; add a 300–500 Ohm resistor on the data line; ensure GND is shared between the ESP32 and LED strip power supply |
