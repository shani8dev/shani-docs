---
title: Home Automation
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Home Automation

Smart home hubs, IoT bridges, camera NVRs, and automation pipelines — all running locally with no cloud dependency.

> **Why local?** Cloud-dependent smart home devices can stop working when manufacturers shut down servers or change APIs. Local automation gives you sub-50ms response times, works during internet outages, and keeps all your sensor data on your own hardware.

---

---

## Job-Ready Concepts

#### MQTT — the IoT messaging backbone
MQTT (Message Queuing Telemetry Transport) is a publish-subscribe protocol designed for constrained devices on unreliable networks. A device (ESP32, Shelly plug, Zigbee sensor via zigbee2mqtt) publishes a message to a topic (`home/livingroom/temperature`); any subscriber (Home Assistant, Node-RED, Telegraf) receives it. The broker (Mosquitto, EMQX) routes messages without the publisher knowing who reads them. Key concepts: QoS levels (0 = fire-and-forget, 1 = at-least-once with acknowledgement, 2 = exactly-once), retained messages (the broker stores the last message on a topic, so new subscribers immediately get the current state), and will messages (sent by the broker when a client disconnects unexpectedly — useful for device-offline detection). MQTT is ubiquitous in IoT engineering roles.

#### Zigbee, Z-Wave, and Matter — wireless protocol comparison
Three competing wireless protocols for smart home devices: Zigbee (2.4 GHz mesh, 250 kbps, up to 65,000 devices, most widely supported, requires a coordinator dongle), Z-Wave (sub-GHz mesh, less interference than Zigbee/WiFi, maximum 232 devices per network, better range through walls, proprietary silicon requires certification), and Matter (IP-based standard on Thread or WiFi, Apple/Google/Amazon/Amazon-endorsed, designed to unify the ecosystem, still maturing). The operational reality: Zigbee has the broadest device support and lowest device cost; Z-Wave is more reliable in RF-noisy environments; Matter is the future but current device selection is limited. Zigbee2MQTT's device database of 3,000+ supported devices makes it the practical choice today.

#### Home Assistant's entity model
Home Assistant's core abstraction is the entity — a representation of a single capability of a device (a smart bulb has entities for brightness, colour temperature, power state, and energy consumption). Entities have states (`on`, `off`, `23.5`) and attributes (additional metadata). Automations, dashboards, and integrations all operate on entities. The entity registry maps entity IDs to their underlying devices and integration source. Understanding this model is essential for debugging: when a device behaves unexpectedly, you inspect the entity's state history in the developer tools to determine whether the problem is in the device, the integration, or the automation.

#### Event-driven automation and state machines
Home Assistant automations are event-driven: a trigger (state change, time, webhook, sunrise) fires the automation; conditions gate whether actions execute; actions change states or call services. Complex automations are state machines — a "good night" script transitions the house from "awake" to "sleeping" mode by setting multiple devices in sequence. The `input_boolean` and `input_select` helpers act as stateful flags for multi-step automations. AppDaemon exposes this same model in Python, enabling loops, timers, and external API calls that YAML automations can't express. Event-driven architecture is a core backend engineering pattern; Home Assistant is a concrete, hands-on implementation.

#### ESPHome and firmware-over-the-air updates
ESPHome compiles YAML device definitions to C++ and flashes them to ESP32/ESP8266 microcontrollers. Once a device has ESPHome flashed, subsequent updates happen over-the-air (OTA) via the WiFi network — no physical access required. ESPHome's native API (a protobuf-based binary protocol) integrates directly with Home Assistant without MQTT. The compilation and OTA update pipeline is a miniature CI/CD system: edit the YAML, compile, push to device, verify. This experience with embedded firmware deployment maps directly to IoT engineering roles dealing with fleet management and OTA update pipelines at scale.

#### WebRTC and zero-latency camera streams
go2rtc introduces the difference between streaming protocols: RTSP (Real-Time Streaming Protocol, used by IP cameras) has 2–10 second latency due to buffering. WebRTC (used by browsers and go2rtc) achieves sub-second latency by using UDP with SRTP (Secure Real-time Transport Protocol) and a direct peer connection to the browser. HLS (HTTP Live Streaming) has the lowest compatibility requirements but highest latency (5–30 seconds). For home security applications, WebRTC is required for live view of camera streams; HLS is acceptable for recorded playback. Frigate uses go2rtc internally for its live view.


## Home Assistant

**Purpose:** The leading open-source home automation platform. Integrates with 3,000+ devices and services — lights, sensors, thermostats, cameras, locks, media players, energy monitors. Supports automations, dashboards, voice assistants (local and cloud), and a mobile app.

```yaml
# ~/homeassistant/compose.yaml
services:
  homeassistant:
    image: ghcr.io/home-assistant/home-assistant:stable
    network_mode: host
    volumes:
      - /home/user/homeassistant/config:/config:Z
    environment:
      TZ: Asia/Kolkata
    restart: unless-stopped
```

```bash
cd ~/homeassistant && podman-compose up -d
```

> `--network host` is required for Home Assistant to discover devices on your local network via mDNS and UPnP.

Access at `http://localhost:8123`. On first run, Home Assistant automatically discovers many devices on your network.

**Backup your config:**
```bash
# The built-in backup tool (Settings → System → Backups) creates .tar archives
# Back them up offsite with Restic
restic backup /home/user/homeassistant/config
```

#### Common operations
```bash
# Check Home Assistant config validity
podman exec homeassistant hass --script check_config -c /config

# Restart Home Assistant (soft restart, keeps docker running)
curl -X POST http://localhost:8123/api/services/homeassistant/restart   -H "Authorization: Bearer YOUR_LONG_LIVED_TOKEN"   -H "Content-Type: application/json"

# View live logs
podman logs -f homeassistant

# Call a service via API
curl -X POST http://localhost:8123/api/services/light/turn_on   -H "Authorization: Bearer YOUR_LONG_LIVED_TOKEN"   -H "Content-Type: application/json"   -d '{"entity_id": "light.living_room"}'

# Get current state of an entity
curl http://localhost:8123/api/states/sensor.bedroom_temperature   -H "Authorization: Bearer YOUR_LONG_LIVED_TOKEN"

# List all entities
curl http://localhost:8123/api/states   -H "Authorization: Bearer YOUR_LONG_LIVED_TOKEN" | python3 -m json.tool

# Run a one-off backup
curl -X POST http://localhost:8123/api/backup   -H "Authorization: Bearer YOUR_LONG_LIVED_TOKEN"
```

#### Recommended HACS integrations
Mushroom Cards, Mini Graph Card, Browser Mod, Local Tuya, Adaptive Lighting.

---

## Mosquitto (MQTT Broker)

**Purpose:** Lightweight MQTT message broker. Required for Zigbee2MQTT, ESPHome, and many other IoT integrations. Acts as the communication backbone between devices and Home Assistant.

```yaml
# ~/mosquitto/compose.yaml
services:
  mosquitto:
    image: eclipse-mosquitto
    ports:
      - 127.0.0.1:1883:1883
    volumes:
      - /home/user/mosquitto/config:/mosquitto/config:Z
      - /home/user/mosquitto/data:/mosquitto/data:Z
      - /home/user/mosquitto/log:/mosquitto/log:Z
    restart: unless-stopped
```

```bash
cd ~/mosquitto && podman-compose up -d
```

#### Monitor MQTT traffic
```bash
# Subscribe to all topics (useful for debugging)
podman exec mosquitto mosquitto_sub -u user -P yourpassword -t '#' -v
```

#### Common operations
```bash
# Subscribe to all topics (debug)
podman exec mosquitto mosquitto_sub -h localhost -u user -P yourpassword -t '#' -v

# Subscribe to a specific topic
podman exec mosquitto mosquitto_sub -h localhost -u user -P yourpassword -t 'home/bedroom/temperature'

# Publish a message
podman exec mosquitto mosquitto_pub -h localhost -u user -P yourpassword   -t 'home/bedroom/temperature' -m '22.5'

# Check broker stats
podman exec mosquitto mosquitto_sub -h localhost -u user -P yourpassword   -t '$SYS/#' -C 10

# View connected clients count
podman exec mosquitto mosquitto_sub -h localhost -u user -P yourpassword   -t '$SYS/broker/clients/connected' -C 1
```

---

## Zigbee2MQTT

**Purpose:** Bridges Zigbee devices (lights, sensors, plugs, locks) to MQTT using a $10–15 USB Zigbee coordinator. Works with 3,000+ Zigbee devices from any manufacturer — no proprietary hubs, no cloud bridges, no subscriptions.

#### Supported coordinators
Sonoff Zigbee 3.0 USB Dongle Plus, CC2652R/P, HUSBZB-1, Conbee II.

```yaml
# ~/zigbee2mqtt/compose.yaml
services:
  zigbee2mqtt:
    image: koenkk/zigbee2mqtt
    volumes:
      - /home/user/zigbee2mqtt/data:/app/data:Z
    devices:
      - /dev/ttyUSB0:/dev/ttyUSB0
    environment:
      TZ: Asia/Kolkata
    restart: unless-stopped
```

```bash
cd ~/zigbee2mqtt && podman-compose up -d
```

#### Common operations
```bash
# Enable pairing mode (permit join for 60 seconds)
podman exec mosquitto mosquitto_pub -h localhost -u user -P yourpassword   -t 'zigbee2mqtt/bridge/request/permit_join' -m '{"value":true,"time":60}'

# List all paired devices
podman exec mosquitto mosquitto_sub -h localhost -u user -P yourpassword   -t 'zigbee2mqtt/bridge/devices' -C 1 | python3 -m json.tool

# Get current state of a device
podman exec mosquitto mosquitto_sub -h localhost -u user -P yourpassword   -t 'zigbee2mqtt/MY_DEVICE' -C 1

# Rename a device
podman exec mosquitto mosquitto_pub -h localhost -u user -P yourpassword   -t 'zigbee2mqtt/bridge/request/device/rename'   -m '{"from":"0x1234abcd5678","to":"bedroom_sensor"}'

# Remove (unlink) a device
podman exec mosquitto mosquitto_pub -h localhost -u user -P yourpassword   -t 'zigbee2mqtt/bridge/request/device/remove' -m '{"id":"bedroom_sensor"}'

# View Z2M logs
podman logs -f zigbee2mqtt
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

```yaml
# ~/esphome/compose.yaml
services:
  esphome:
    image: esphome/esphome
    ports:
      - 127.0.0.1:6052:6052
    volumes:
      - /home/user/esphome/config:/config:Z
    environment:
      TZ: Asia/Kolkata
    restart: unless-stopped
```

```bash
cd ~/esphome && podman-compose up -d
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

```yaml
# ~/node-red/compose.yaml
services:
  node-red:
    image: nodered/node-red
    ports:
      - 127.0.0.1:1880:1880
    volumes:
      - /home/user/nodered/data:/data:Z
    environment:
      TZ: Asia/Kolkata
    restart: unless-stopped
```

```bash
cd ~/node-red && podman-compose up -d
```

Access at `http://localhost:1880`. Install the `node-red-contrib-home-assistant-websocket` palette to connect to Home Assistant. Install `node-red-node-sqlite` to log sensor data locally.

---

## Matter Server

**Purpose:** Bridges Matter/Thread smart home devices to Home Assistant. Matter is the new unified smart home standard supported by Apple, Google, Amazon, and hundreds of device manufacturers — all locally, no cloud required.

```yaml
# ~/matter-server/compose.yaml
services:
  matter-server:
    image: ghcr.io/home-assistant-libs/python-matter-server:stable
    network_mode: host
    volumes:
      - /home/user/matter-server/data:/data:Z
    restart: unless-stopped
```

```bash
cd ~/matter-server && podman-compose up -d
```

In Home Assistant: Settings → Devices & Services → Add Integration → Matter (BETA). Point it at `ws://localhost:5580/ws`.

> You need a Thread border router to use Thread devices. Apple HomePod mini, Google Nest Hub, or a dedicated USB Thread dongle all work.

---

## Frigate

**Purpose:** Network Video Recorder (NVR) with real-time AI object detection — people, cars, animals, packages. Runs detection locally using your GPU or a Coral TPU. Integrates deeply with Home Assistant for automations triggered by detections.

```yaml
# ~/frigate/compose.yaml
services:
  frigate:
    image: ghcr.io/blakeblackshear/frigate:stable
    ports:
      - 127.0.0.1:5000:5000
      - 127.0.0.1:8554:8554
      - 127.0.0.1:8555:8555/udp
    volumes:
      - /home/user/frigate/config:/config:Z
      - /home/user/frigate/media:/media/frigate:Z
    devices:
      - /dev/dri:/dev/dri
    shm_size: 256m
    restart: unless-stopped
```

```bash
cd ~/frigate && podman-compose up -d
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

```yaml
# ~/double-take/compose.yaml
services:
  double-take:
    image: jakowenko/double-take
    ports:
      - 127.0.0.1:3002:3000
    volumes:
      - /home/user/double-take/.storage:/.storage:Z
    restart: unless-stopped
```

```bash
cd ~/double-take && podman-compose up -d
```

Configure recognisers (CompreFace, DeepStack, or CodeProject.AI) in the Double Take UI, then add face images to the library.

---

## go2rtc (WebRTC Camera Gateway)

**Purpose:** Universal camera streaming gateway. Takes any RTSP, RTMP, ONVIF, USB, or HTTP camera stream and re-serves it as WebRTC (browser-viewable), MSE, HLS, or RTSP. Zero-latency browser previews, multi-stream support, and deep Frigate and Home Assistant integration — go2rtc powers the camera streams in Frigate 0.13+ and Home Assistant's WebRTC camera card.

```yaml
# ~/go2rtc/compose.yaml
services:
  go2rtc:
    image: alexxit/go2rtc
    ports:
      - 127.0.0.1:1984:1984
      - 8554:8554
      - 8555:8555/tcp
      - 8555:8555/udp
    volumes:
      - /home/user/go2rtc/go2rtc.yaml:/config/go2rtc.yaml:ro,Z
    restart: unless-stopped
```

```bash
cd ~/go2rtc && podman-compose up -d
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

```yaml
# ~/zwave-js-ui/compose.yaml
services:
  zwave-js-ui:
    image: zwavejs/zwave-js-ui:latest
    ports:
      - 127.0.0.1:8091:8091
      - 127.0.0.1:3002:3000
    volumes:
      - /home/user/zwave-js-ui/store:/usr/src/app/store:Z
    devices:
      - /dev/ttyUSB1:/dev/ttyUSB1
    environment:
      TZ: Asia/Kolkata
    restart: unless-stopped
```

```bash
cd ~/zwave-js-ui && podman-compose up -d
```

> Find your Z-Wave stick: `ls /dev/ttyUSB*` after plugging it in (may be `ttyUSB0` or `ttyACM0` depending on the model).

In Home Assistant: Settings → Devices & Services → Add Integration → Z-Wave JS → use WebSocket URL `ws://host.containers.internal:3000`.

---

## Scrypted (Camera Hub & NVR)

**Purpose:** Camera management and NVR platform with a focus on HomeKit Secure Video integration. Supports 40+ camera brands, transcodes streams to HomeKit format, and integrates with Google Home, Alexa, Home Assistant, and Frigate. If you want your RTSP cameras to appear natively in Apple Home or Google Home, Scrypted is the bridge.

```yaml
# ~/scrypted/compose.yaml
services:
  scrypted:
    image: koush/scrypted
    network_mode: host
    volumes:
      - /home/user/scrypted/volume:/server/volume:Z
    restart: unless-stopped
```

```bash
cd ~/scrypted && podman-compose up -d
```

> `--network host` is required for mDNS discovery of cameras and HomeKit pairing. Access the UI at `https://localhost:10443` (self-signed cert on first run).

**Caddy:**
```caddyfile
scrypted.home.local { tls internal; reverse_proxy localhost:10443 }
```

---

## AppDaemon (Python Automation Engine)

**Purpose:** Python scripting environment for Home Assistant automations. Write complex automation logic in Python instead of YAML — full access to Home Assistant's state machine, events, and services. Ideal for automations that require loops, data structures, external API calls, or logic that would be unwieldy in HA's built-in automation editor. Also includes HADashboard for building kiosk-style tablet wall panels.

```yaml
# ~/appdaemon/compose.yaml
services:
  appdaemon:
    image: acockburn/appdaemon:latest
    ports:
      - 127.0.0.1:5050:5050
    volumes:
      - /home/user/appdaemon/config:/conf:Z
    environment:
      HA_URL: http://host.containers.internal:8123
      TOKEN: your-long-lived-access-token
      TZ: Asia/Kolkata
    restart: unless-stopped
```

```bash
cd ~/appdaemon && podman-compose up -d
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

```bash
cd ~/evcc && podman-compose up -d
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
