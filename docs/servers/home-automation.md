---
title: Home Automation
section: Self-Hosting & Servers
updated: 2026-04-16
---

# Home Automation

Smart home hubs, IoT bridges, and automation pipelines.

## Home Assistant
**Purpose**: Comprehensive home automation platform. Integrates 2000+ devices, supports automations, dashboards, and voice control.
```bash
podman run -d \
  --name homeassistant \
  --network host \
  -v /home/user/homeassistant/config:/config:Z \
  -e TZ=Europe/London \
  --restart unless-stopped \
  ghcr.io/home-assistant/home-assistant:stable
```

## Zigbee2MQTT + Mosquitto
**Purpose**: Bridge Zigbee devices to MQTT. Enables vendor-agnostic smart device control using cheap USB adapters.
```bash
# Mosquitto (MQTT Broker)
podman run -d \
  --name mosquitto \
  -p 127.0.0.1:1883:1883 \
  -p 127.0.0.1:9001:9001 \
  -v /home/user/mosquitto/config:/mosquitto/config:Z \
  -v /home/user/mosquitto/data:/mosquitto/data:Z \
  --restart unless-stopped \
  eclipse-mosquitto

# Zigbee2MQTT
podman run -d \
  --name zigbee2mqtt \
  -v /home/user/zigbee2mqtt/data:/app/data:Z \
  --device /dev/ttyUSB0:/dev/ttyUSB0 \
  -e TZ=Europe/London \
  --restart unless-stopped \
  koenkk/zigbee2mqtt
```

## Node-RED / ESPHome
**Purpose**: Node-RED is a flow-based programming tool for wiring devices and APIs. ESPHome compiles YAML configs to native firmware for ESP32/ESP8266.
```bash
podman run -d \
  --name node-red \
  -p 127.0.0.1:1880:1880 \
  -v /home/user/nodered/data:/data:Z \
  -e TZ=Europe/London \
  --restart unless-stopped \
  nodered/node-red

podman run -d \
  --name esphome \
  -p 127.0.0.1:6052:6052 \
  -v /home/user/esphome/config:/config:Z \
  --restart unless-stopped \
  esphome/esphome
```

## Frigate
**Purpose**: NVR with real-time object detection (person, car, pet) using local AI. Integrates with cameras, Home Assistant, and MQTT.
```bash
podman run -d \
  --name frigate \
  -p 127.0.0.1:5000:5000 \
  -p 127.0.0.1:8554:8554 \
  -p 127.0.0.1:8555:8555/udp \
  -v /home/user/frigate/config:/config:Z \
  -v /home/user/frigate/media:/media:Z \
  --device /dev/dri:/dev/dri \
  --restart unless-stopped \
  ghcr.io/blakeblackshear/frigate:stable
```
