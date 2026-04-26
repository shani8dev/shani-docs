---
title: IoT & Monitoring
section: Self-Hosting & Servers
updated: 2026-04-22
---

# IoT & Monitoring

Sensor data pipelines, MQTT brokers, time-series ingestion, industrial protocols, dashboards, alerting, and network monitoring. Everything from a single temperature sensor to a multi-site SCADA system.

> This page covers the *data infrastructure* layer — brokers, pipelines, storage, and visualisation. For smart home automation (Home Assistant, Zigbee2MQTT, ESPHome), see the [Home Automation wiki](https://docs.shani.dev/doc/servers/home-automation). Those tools and the ones here are complementary and frequently used together.

---

---

## Job-Ready Concepts

#### MQTT protocol internals — brokers, topics, QoS
MQTT is a publish-subscribe protocol where a broker (Mosquitto, EMQX) routes messages between publishers and subscribers using topic hierarchies (`factory/line1/sensor/temperature`). Wildcard subscriptions: `+` matches a single level (`home/+/temperature` matches all rooms), `#` matches all remaining levels (`home/#` matches everything under home). QoS 0 (fire-and-forget) has no delivery guarantee — correct for high-frequency sensor readings where losing one reading is acceptable. QoS 1 (at-least-once) retransmits until acknowledged — correct for commands or alerts. QoS 2 (exactly-once) uses a four-way handshake — rarely used due to overhead. Retained messages: the broker stores the last retained message per topic and delivers it to new subscribers immediately — essential for device state (current temperature) that must be available without waiting for the next publish cycle.

#### Time-series data model and storage engines
IoT sensor data has specific characteristics: append-only (readings are never updated), high write throughput (thousands of sensors × multiple readings per second), range queries (last 24 hours of temperature), and eventual deletion (retain for 90 days). Regular relational databases handle this poorly — unbounded table growth, slow range scans without time-based partitioning, no native downsampling. InfluxDB's TSM (Time-Structured Merge Tree) storage engine, TimescaleDB's hypertables (automatic PostgreSQL partitioning by time), and Prometheus's TSDB are all optimised for this pattern. The key concept: continuous queries or recording rules that pre-aggregate raw data into hourly/daily summaries, keeping the database from growing unboundedly.

#### Prometheus pull model vs MQTT push model
Prometheus scrapes (pulls) metrics from HTTP `/metrics` endpoints on a schedule. This is counter-intuitive for IoT — a temperature sensor can't run an HTTP server. The bridge pattern solves this: Telegraf subscribes to MQTT topics and exposes the received values as a Prometheus metrics endpoint (`/metrics`); Prometheus scrapes Telegraf. Alternatively, Pushgateway accepts metrics pushed from batch jobs and short-lived processes. Understanding the pull vs push architecture trade-off comes up in SRE and platform engineering interviews: pull is simpler operationally (one scrape config, no push coordination), push is necessary for ephemeral or network-constrained targets.

#### Industrial protocols — Modbus and OPC-UA
Modbus (1979) is the most widely deployed industrial protocol. Modbus RTU runs over RS-485 serial (legacy hardware, still common); Modbus TCP runs over Ethernet (modern PLCs). A Modbus device exposes registers at numbered addresses; the master polls them by address. Every energy meter, VFD (Variable Frequency Drive), and PLC from the last 40 years likely speaks Modbus. OPC-UA is the modern replacement: encrypted, authenticated, self-describing (devices publish their own information model), and supports subscriptions (push) rather than polling. Knowing that OPC-UA uses certificates for authentication and can expose complex object hierarchies (not just flat registers) distinguishes it from Modbus for any industrial IoT role.

#### Edge computing and the IoT data pipeline
The full IoT pipeline from sensor to dashboard: Device → MQTT broker → Telegraf/Node-RED (transform, filter, enrich) → InfluxDB/TimescaleDB (store) → Grafana (visualise) → Prometheus/Alertmanager (alert). Edge computing moves the transformation step closer to the device — a Raspberry Pi running Node-RED at the factory edge aggregates 100 PLCs locally and sends only summary data to the cloud, reducing bandwidth and adding resilience (local processing continues during internet outages). This architecture pattern — edge gateway aggregating local devices, centralised cloud receiving summaries — is a standard IoT reference architecture asked about in IoT engineering and cloud architecture interviews.


## EMQX (High-Scale MQTT Broker)

**Purpose:** Enterprise-grade MQTT 5.0 broker. Handles millions of concurrent connections, supports cluster mode, has a built-in SQL rule engine for message routing and transformation, and a web dashboard for managing clients, subscriptions, and rules. Use EMQX when Mosquitto's single-process model becomes a bottleneck or when you need the rule engine.

```yaml
# ~/emqx/compose.yaml
services:
  emqx:
    image: emqx/emqx:5
    ports:
      - 127.0.0.1:1883:1883
      - 127.0.0.1:8083:8083
      - 127.0.0.1:8084:8084
      - 127.0.0.1:8883:8883
      - 127.0.0.1:18083:18083
    volumes:
      - /home/user/emqx/data:/opt/emqx/data:Z
      - /home/user/emqx/log:/opt/emqx/log:Z
    environment:
      EMQX_NODE__NAME: emqx@127.0.0.1
    restart: unless-stopped
```

```bash
cd ~/emqx && podman-compose up -d
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

## Telegraf (Universal Metrics Collector)

**Purpose:** Plugin-based metrics agent from InfluxData. Collects from 300+ input sources — MQTT topics, SNMP, Modbus, OPC-UA, system metrics, Docker stats, database queries, REST APIs, JVM, and more — and writes to 50+ output destinations including InfluxDB, Prometheus, TimescaleDB, and Kafka. The Swiss Army knife of metrics collection.

```yaml
# ~/telegraf/compose.yaml
services:
  telegraf:
    image: telegraf:latest
    network_mode: host
    volumes:
      - /home/user/telegraf/telegraf.conf:/etc/telegraf/telegraf.conf:ro,Z
      - /run/user/${UID}/podman/podman.sock:/var/run/docker.sock:ro
    restart: unless-stopped
```

```bash
cd ~/telegraf && podman-compose up -d
```

#### Common operations
```bash
# Test config and show what would be collected
podman exec telegraf telegraf --config /etc/telegraf/telegraf.conf --test

# Validate config
podman exec telegraf telegraf --config /etc/telegraf/telegraf.conf --config-directory /etc/telegraf/telegraf.d --test --input-filter cpu

# View logs
podman logs -f telegraf

# List available input plugins
podman exec telegraf telegraf --input-list

# List available output plugins
podman exec telegraf telegraf --output-list

# Reload config (restart container)
podman restart telegraf
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

# Podman container stats (uses Podman socket mounted above)
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

## Prometheus + Alertmanager (Pull-Based Metrics)

**Purpose:** Pull-based metrics system. Prometheus scrapes HTTP `/metrics` endpoints on a schedule, stores the time-series data, and evaluates alerting rules. Alertmanager routes firing alerts to Slack, email, PagerDuty, ntfy, and more.

```yaml
# ~/prometheus/compose.yaml
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - 127.0.0.1:9090:9090
    volumes:
      - /home/user/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro,Z
      - prometheus_data:/prometheus
    restart: unless-stopped
  alertmanager:
    image: prom/alertmanager:latest
    ports:
      - 127.0.0.1:9093:9093
    volumes:
      - /home/user/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro,Z
    restart: unless-stopped

volumes:
  prometheus_data:
```

```bash
cd ~/prometheus && podman-compose up -d
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

#### Route alerts to ntfy via Alertmanager
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

```yaml
# ~/mqtt-exporter/compose.yaml
services:
  mqtt-exporter:
    image: ghcr.io/hikhvar/mqtt2prometheus:latest
    ports:
      - 127.0.0.1:9234:9234
    volumes:
      - /home/user/mqtt-exporter/config.yml:/config.yml:ro,Z
    command: -config /config.yml
    restart: unless-stopped
```

```bash
cd ~/mqtt-exporter && podman-compose up -d
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

```yaml
# ~/modbus-mqtt/compose.yaml
services:
  modbus-mqtt:
    image: ghcr.io/cloud-solutions-group/modbus-mqtt-bridge:latest
    volumes:
      - /home/user/modbus-mqtt/config.json:/app/config.json:ro,Z
    devices:
      - /dev/ttyUSB0:/dev/ttyUSB0
    restart: unless-stopped
```

```bash
cd ~/modbus-mqtt && podman-compose up -d
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

```yaml
# ~/opcua-mqtt/compose.yaml
services:
  opcua-mqtt:
    image: ghcr.io/united-manufacturing-hub/opcua-simulator:latest
    volumes:
      - /home/user/opcua-mqtt/config.yaml:/app/config.yaml:ro,Z
    restart: unless-stopped
```

```bash
cd ~/opcua-mqtt && podman-compose up -d
```

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

```yaml
# ~/owntracks-recorder/compose.yaml
services:
  owntracks-recorder:
    image: owntracks/recorder:latest
    ports:
      - 127.0.0.1:8086:8083
      - 127.0.0.1:8087:8084
    volumes:
      - /home/user/owntracks/store:/store:Z
    environment:
      OTR_HOST: host.containers.internal
      OTR_PORT: 1883
      OTR_USER: iot_user
      OTR_PASS: yourpassword
    restart: unless-stopped
```

```bash
cd ~/owntracks-recorder && podman-compose up -d
```

Access the web frontend at `http://localhost:8086`. OwnTracks Recorder connects to your Mosquitto broker and stores location history in a flat-file database.

#### OwnTracks Frontend (map UI)
```yaml
# ~/owntracks-frontend/compose.yaml
services:
  owntracks-frontend:
    image: owntracks/frontend:latest
    ports:
      - 127.0.0.1:8085:80
    environment:
      SERVER_HOST: host.containers.internal
      SERVER_PORT: 8086
    restart: unless-stopped
```

```bash
cd ~/owntracks-frontend && podman-compose up -d
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
owntracks.home.local { tls internal; reverse_proxy localhost:8086 }
```

---

## Caddy Configuration

```caddyfile
nodered.home.local    { tls internal; reverse_proxy localhost:1880 }
grafana.home.local    { tls internal; reverse_proxy localhost:3001 }
prometheus.home.local { tls internal; reverse_proxy localhost:9090 }
alerts.home.local     { tls internal; reverse_proxy localhost:9093 }
emqx.home.local       { tls internal; reverse_proxy localhost:18083 }
owntracks.home.local  { tls internal; reverse_proxy localhost:8086 }
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
| OwnTracks app not reporting location | Verify the HTTP endpoint URL is correct in the app; check `podman logs owntracks-recorder` for connection errors; ensure Caddy is forwarding to port `8086` |

> 💡 **Tip:** For sensor devices with unreliable Wi-Fi, set MQTT QoS to 1 (at least once) and enable `persistence true` in Mosquitto. Messages published when the broker is temporarily unreachable will be delivered when reconnected.
