---
title: IoT & Monitoring
section: Self-Hosting & Servers
updated: 2026-04-22
---

# IoT & Monitoring

Sensor data pipelines, MQTT brokers, time-series ingestion, industrial protocols, dashboards, alerting, and network monitoring. Everything from a single temperature sensor to a multi-site SCADA system.

> This page covers the *data infrastructure* layer — brokers, pipelines, storage, and visualisation. For smart home automation (Home Assistant, Zigbee2MQTT, ESPHome), see the [Home Automation wiki](https://docs.shani.dev/doc/servers/home-automation). Those tools and the ones here are complementary and frequently used together.

---

## MQTT Broker: Mosquitto

Mosquitto setup is covered in the [Home Automation wiki](https://docs.shani.dev/doc/servers/home-automation#mosquitto-mqtt-broker). For IoT-specific configuration — WebSocket listener, TLS listener, and QoS tuning — add the following to your `mosquitto.conf`:

```conf
# WebSocket listener (for browser-based dashboards)
listener 9001
protocol websockets

# TLS listener (for remote devices)
listener 8883
protocol mqtt
cafile /mosquitto/config/ca.crt
certfile /mosquitto/config/server.crt
keyfile /mosquitto/config/server.key

# Limit queues
max_queued_messages 1000
```

---

## EMQX (High-Scale MQTT Broker)

**Purpose:** Enterprise-grade MQTT 5.0 broker. Handles millions of concurrent connections, supports cluster mode, has a built-in SQL rule engine for message routing and transformation, and a web dashboard for managing clients, subscriptions, and rules. Use EMQX when Mosquitto's single-process model becomes a bottleneck or when you need the rule engine.

```bash
podman run -d \
  --name emqx \
  -p 127.0.0.1:1883:1883 \
  -p 127.0.0.1:8083:8083 \
  -p 127.0.0.1:8084:8084 \
  -p 127.0.0.1:8883:8883 \
  -p 127.0.0.1:18083:18083 \
  -v /home/user/emqx/data:/opt/emqx/data:Z \
  -v /home/user/emqx/log:/opt/emqx/log:Z \
  -e EMQX_NODE__NAME=emqx@127.0.0.1 \
  --restart unless-stopped \
  emqx/emqx:5
```

> **Dashboard:** `http://localhost:18083` — default login `admin` / `public` (change immediately).

**EMQX Rule Engine example** — route sensor messages to InfluxDB:
```sql
-- In the EMQX dashboard → Rules → Create
SELECT
  payload.temperature AS temperature,
  payload.humidity AS humidity,
  payload.device_id AS device
FROM "home/+/sensors"
```
Then add an InfluxDB action to write the matched fields as a measurement.

---

## Node-RED (Visual IoT Wiring)

Node-RED is covered in the [Home Automation wiki](https://docs.shani.dev/doc/servers/home-automation#node-red). Install the `node-red-contrib-influxdb` and `node-red-contrib-modbus` palettes from within Node-RED to extend it for IoT pipelines.

---

## Telegraf (Universal Metrics Collector)

**Purpose:** Plugin-based metrics agent from InfluxData. Collects from 300+ input sources — MQTT topics, SNMP, Modbus, OPC-UA, system metrics, Docker stats, database queries, REST APIs, JVM, and more — and writes to 50+ output destinations including InfluxDB, Prometheus, TimescaleDB, and Kafka. The Swiss Army knife of metrics collection.

```bash
podman run -d \
  --name telegraf \
  --network host \
  -v /home/user/telegraf/telegraf.conf:/etc/telegraf/telegraf.conf:ro,Z \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  --restart unless-stopped \
  telegraf:latest
```

**Example `telegraf.conf` — MQTT → InfluxDB pipeline:**
```toml
[agent]
  interval = "10s"
  flush_interval = "10s"

# Read from MQTT topics
[[inputs.mqtt_consumer]]
  servers = ["tcp://localhost:1883"]
  topics = ["home/#"]
  username = "iot_user"
  password = "yourpassword"
  data_format = "json"
  json_time_key = "timestamp"
  json_time_format = "unix"

# System metrics
[[inputs.cpu]]
  percpu = true
[[inputs.mem]]
[[inputs.disk]]
  ignore_fs = ["tmpfs", "devtmpfs"]
[[inputs.net]]

# Docker container stats
[[inputs.docker]]
  endpoint = "unix:///var/run/docker.sock"

# Write to InfluxDB
[[outputs.influxdb_v2]]
  urls = ["http://localhost:8086"]
  token = "your-influxdb-token"
  organization = "home"
  bucket = "iot"

# Also write to Prometheus for Grafana
[[outputs.prometheus_client]]
  listen = ":9273"
```

---

## InfluxDB + Grafana (Time-Series Stack)

The canonical IoT data storage and visualisation stack. See the [Databases wiki](https://docs.shani.dev/doc/servers/databases#influxdb) for the InfluxDB setup and the [Monitoring wiki](https://docs.shani.dev/doc/servers/monitoring) for Grafana.

**Connect Grafana to InfluxDB:**
1. Grafana → Configuration → Data Sources → Add InfluxDB
2. Query Language: Flux
3. URL: `http://host.containers.internal:8086`
4. Auth: Token → paste your InfluxDB token
5. Organisation: `home`, Default Bucket: `iot`

**Useful Grafana dashboard IDs for IoT:**
- `12378` — InfluxDB 2.x system metrics
- `11990` — MQTT statistics
- `15141` — Home sensor dashboard template

---

## Prometheus + Alertmanager (Pull-Based Metrics)

**Purpose:** Pull-based metrics system. Prometheus scrapes HTTP `/metrics` endpoints on a schedule, stores the time-series data, and evaluates alerting rules. Alertmanager routes firing alerts to Slack, email, PagerDuty, ntfy, and more.

```bash
# Prometheus
podman run -d \
  --name prometheus \
  -p 127.0.0.1:9090:9090 \
  -v /home/user/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro,Z \
  -v prometheus_data:/prometheus \
  --restart unless-stopped \
  prom/prometheus:latest

# Alertmanager
podman run -d \
  --name alertmanager \
  -p 127.0.0.1:9093:9093 \
  -v /home/user/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro,Z \
  --restart unless-stopped \
  prom/alertmanager:latest
```

**Example `prometheus.yml` with IoT scrape targets:**
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - /etc/prometheus/alerts.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

scrape_configs:
  - job_name: node
    static_configs:
      - targets: ['host.containers.internal:9100']

  - job_name: telegraf
    static_configs:
      - targets: ['host.containers.internal:9273']

  - job_name: mqtt_exporter
    static_configs:
      - targets: ['host.containers.internal:9234']
```

**Example alert rules (`alerts.yml`):**
```yaml
groups:
  - name: iot
    rules:
      - alert: HighTemperature
        expr: mqtt_sensor_temperature > 35
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High temperature in {{ $labels.room }}"
          description: "Temperature is {{ $value }}°C"

      - alert: SensorOffline
        expr: time() - mqtt_sensor_last_seen > 300
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "Sensor {{ $labels.device }} offline"
```

**Route alerts to ntfy via Alertmanager:**
```yaml
# alertmanager.yml
route:
  receiver: ntfy

receivers:
  - name: ntfy
    webhook_configs:
      - url: http://localhost:8090/your-topic
        send_resolved: true
```

---

## MQTT Exporter for Prometheus

**Purpose:** Bridges MQTT topics to Prometheus metrics. Subscribes to configured MQTT topics and exposes values as Prometheus gauge/counter metrics — lets Prometheus scrape data from any MQTT-publishing device.

```bash
podman run -d \
  --name mqtt-exporter \
  -p 127.0.0.1:9234:9234 \
  -v /home/user/mqtt-exporter/config.yml:/config.yml:ro,Z \
  --restart unless-stopped \
  ghcr.io/hikhvar/mqtt2prometheus:latest -config /config.yml

```

**Example `config.yml`:**
```yaml
mqtt:
  server: tcp://localhost:1883
  user: iot_user
  password: yourpassword
  topic_path: home/+/+
  device_id_regex: "home/(?P<device>[^/]+)/.+"
  qos: 0
cache:
  timeout: 600s
json_parsing:
  separator: "."
metrics:
  - prom_name: temperature
    mqtt_name: temperature
    help: Temperature in Celsius
    type: gauge
  - prom_name: humidity
    mqtt_name: humidity
    help: Relative humidity percent
    type: gauge
  - prom_name: battery_level
    mqtt_name: battery
    help: Battery level percent
    type: gauge
```

---

## Industrial Protocols: Modbus & OPC-UA

### Modbus (Industry standard RS-485/TCP)

Modbus is the most widely used industrial protocol — PLCs, VFDs, energy meters, and sensors have spoken it for 40 years. Node-RED's Modbus palette handles both RTU (serial) and TCP variants.

```bash
# Install Modbus palette in Node-RED (via UI or CLI)
podman exec node-red npm install node-red-contrib-modbus

# Or use a standalone Modbus → MQTT bridge
podman run -d \
  --name modbus-mqtt \
  -v /home/user/modbus-mqtt/config.json:/app/config.json:ro,Z \
  --device /dev/ttyUSB0:/dev/ttyUSB0 \
  --restart unless-stopped \
  ghcr.io/cloud-solutions-group/modbus-mqtt-bridge:latest
```

**Example Modbus config (reading an energy meter):**
```json
{
  "mqtt": {
    "host": "localhost",
    "port": 1883,
    "username": "iot_user",
    "password": "yourpassword"
  },
  "modbus": {
    "host": "192.168.1.100",
    "port": 502,
    "unitId": 1
  },
  "registers": [
    {"address": 0, "name": "voltage", "topic": "factory/panel1/voltage", "scale": 0.1},
    {"address": 1, "name": "current", "topic": "factory/panel1/current", "scale": 0.01},
    {"address": 2, "name": "power", "topic": "factory/panel1/power", "scale": 1}
  ],
  "pollInterval": 5000
}
```

### OPC-UA (Modern industrial standard)

OPC-UA is the modern, secure replacement for OPC Classic. Supported by Siemens, Rockwell, Beckhoff, and most modern PLCs and SCADA systems.

```bash
# Node-RED OPC-UA palette
podman exec node-red npm install node-red-contrib-opcua

# Standalone OPC-UA → MQTT bridge
podman run -d \
  --name opcua-mqtt \
  -v /home/user/opcua-mqtt/config.yaml:/app/config.yaml:ro,Z \
  --restart unless-stopped \
  ghcr.io/united-manufacturing-hub/opcua-simulator:latest
```

---

## OpenDataBay / Grafana SCADA Dashboard

**Purpose:** Build SCADA-style dashboards in Grafana using the SCADA panel plugin — P&ID diagrams, process flow animations, valve states, and setpoint controls visualised with industrial symbols.

```bash
# Install the SCADA plugin in Grafana
podman exec grafana grafana-cli plugins install volkovlabs-form-panel
podman exec grafana grafana-cli plugins install marcusolsson-dynamictext-panel
podman exec grafana grafana-cli plugins install volkovlabs-echarts-panel

# Restart Grafana to load plugins
podman restart grafana
```

---

---

## Typical IoT Stack Architecture

```
Physical Sensors / ESP32 / Shelly / Tasmota
           │ MQTT publish
           ▼
     Mosquitto / EMQX          ← MQTT broker
           │
    ┌──────┴──────┐
    ▼             ▼
 Node-RED      Telegraf         ← Pipeline / collector
    │             │
    ▼             ▼
 InfluxDB    TimescaleDB        ← Time-series storage
    │             │
    └──────┬──────┘
           ▼
        Grafana                 ← Dashboards
           │
    Prometheus / Alertmanager   ← Alerting
           │
         ntfy                   ← Push notifications
```

---

## OwnTracks (Private Location Tracking)

**Purpose:** Self-hosted location sharing platform. The OwnTracks app (iOS and Android) publishes your GPS location to your own MQTT broker or HTTP endpoint — nobody else's server sees your location. Use it to track your own device over time, share location with family members privately, or trigger Home Assistant automations when you arrive home. A privacy-respecting replacement for Google Maps Timeline or Life360.

```bash
podman run -d \
  --name owntracks-recorder \
  -p 127.0.0.1:8083:8083 \
  -p 127.0.0.1:8084:8084 \
  -v /home/user/owntracks/store:/store:Z \
  -e OTR_HOST=host.containers.internal \
  -e OTR_PORT=1883 \
  -e OTR_USER=iot_user \
  -e OTR_PASS=yourpassword \
  --restart unless-stopped \
  owntracks/recorder:latest
```

Access the web frontend at `http://localhost:8083`. OwnTracks Recorder connects to your Mosquitto broker and stores location history in a flat-file database.

**OwnTracks Frontend (map UI):**
```bash
podman run -d \
  --name owntracks-frontend \
  -p 127.0.0.1:8085:80 \
  -e SERVER_HOST=host.containers.internal \
  -e SERVER_PORT=8083 \
  --restart unless-stopped \
  owntracks/frontend:latest
```

**App configuration (iOS/Android):**
- Mode: HTTP
- Host: `https://owntracks.home.local`
- Port: 443
- Username: your-name
- Device ID: phone

**Integrate with Home Assistant:**
```yaml
# configuration.yaml — add the OwnTracks integration
device_tracker:
  - platform: owntracks_http
```

Or use the built-in Home Assistant OwnTracks integration (Settings → Integrations → OwnTracks) which handles the HTTP endpoint automatically.

**Caddy:**
```caddyfile
owntracks.home.local { tls internal; reverse_proxy localhost:8083 }
```

---

## Caddy Configuration

```caddyfile
nodered.home.local    { tls internal; reverse_proxy localhost:1880 }
grafana.home.local    { tls internal; reverse_proxy localhost:3001 }
prometheus.home.local { tls internal; reverse_proxy localhost:9090 }
alerts.home.local     { tls internal; reverse_proxy localhost:9093 }
emqx.home.local       { tls internal; reverse_proxy localhost:18083 }
owntracks.home.local  { tls internal; reverse_proxy localhost:8083 }
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| MQTT broker connection refused | Check `podman logs mosquitto`; verify port `1883` is not blocked by firewalld; confirm credentials in the config match |
| Sensors publishing but data not reaching InfluxDB | Add a Node-RED debug node after the MQTT input to inspect payloads; check field names match what Telegraf/InfluxDB expects |
| Telegraf not writing to InfluxDB | Verify the token has write access to the bucket; check `podman logs telegraf` for `connection refused` or auth errors |
| Grafana showing no data | Confirm the datasource URL uses `host.containers.internal`; check InfluxDB bucket and org names match exactly |
| Modbus device not responding | Check unit ID (slave address) matches the device; verify TCP port `502` is reachable; for RTU, check baud rate and parity settings |
| OPC-UA authentication error | Verify the server certificate is trusted; some PLCs require client certificate authentication — generate one with Step-CA |
| Prometheus scrape failing | Confirm the target endpoint responds at `/metrics` with a 200; check that the port is bound and reachable from the Prometheus container |
| Alertmanager not sending alerts | Verify the receiver config syntax; test with `amtool alert add` and check logs with `podman logs alertmanager` |
| EMQX dashboard inaccessible | Ensure port `18083` is bound to `127.0.0.1`; default credentials are `admin` / `public` — change them immediately |
| Beszel agent not reporting | Verify the public key from the hub is correctly pasted into the agent; check that port `45876` is reachable from the hub |
| OwnTracks app not reporting location | Verify the HTTP endpoint URL is correct in the app; check `podman logs owntracks-recorder` for connection errors; ensure Caddy is forwarding to port `8083` |

> 💡 **Tip:** For sensor devices with unreliable Wi-Fi, set MQTT QoS to 1 (at least once) and enable `persistence true` in Mosquitto. Messages published when the broker is temporarily unreachable will be delivered when reconnected.
