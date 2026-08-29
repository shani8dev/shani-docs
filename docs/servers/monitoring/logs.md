---
title: Monitoring — Log Aggregation (ELK, OpenSearch & Vector)
section: Self-Hosting & Servers
updated: 2026-08-28
---

## Elasticsearch + ELK Stack (Single-Node)

**Purpose:** Distributed search and analytics engine — the `E` in the ELK stack (Elasticsearch + Logstash + Kibana). Stores, indexes, and searches structured and unstructured log data at scale. For multi-node production clusters see the [Clusters wiki](https://docs.shani.dev/doc/servers/clusters).

```yaml
# ~/elk/compose.yaml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.4
    ports:
      - 127.0.0.1:9200:9200
    volumes:
      - es_data:/usr/share/elasticsearch/data
    environment:
      discovery.type: single-node
      xpack.security.enabled: "false"
      ES_JAVA_OPTS: "-Xms512m -Xmx1g"
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    restart: unless-stopped

  kibana:
    image: docker.elastic.co/kibana/kibana:8.13.4
    ports:
      - 127.0.0.1:5601:5601
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200
    depends_on: [elasticsearch]
    restart: unless-stopped

  logstash:
    image: docker.elastic.co/logstash/logstash:8.13.4
    ports:
      - 127.0.0.1:5044:5044    # Beats input
      - 127.0.0.1:5000:5000    # TCP/syslog input
      - 127.0.0.1:9600:9600    # Logstash monitoring API
    volumes:
      - /home/user/elk/logstash/pipeline:/usr/share/logstash/pipeline:ro,Z
      - /home/user/elk/logstash/config/logstash.yml:/usr/share/logstash/config/logstash.yml:ro,Z
    environment:
      LS_JAVA_OPTS: "-Xms256m -Xmx512m"
    depends_on: [elasticsearch]
    restart: unless-stopped

volumes:
  es_data:
```

```bash
# Required on the host before starting
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee /etc/sysctl.d/99-elasticsearch.conf

cd ~/elk && podman-compose up -d
```

#### Kibana
`http://localhost:5601` — create index patterns under Stack Management → Index Patterns.

##### Minimal `logstash.yml`

```yaml
# ~/elk/logstash/config/logstash.yml
http.host: "0.0.0.0"
xpack.monitoring.enabled: false
pipeline.workers: 2
pipeline.batch.size: 125
```

#### Pipeline: Beats → parse → Elasticsearch (`beats-to-es.conf`)
```ruby
# ~/elk/logstash/pipeline/beats-to-es.conf
input {
  beats {
    port => 5044
  }
}

filter {
  if [fields][type] == "nginx" {
    grok {
      match => { "message" => "%{COMBINEDAPACHELOG}" }
    }
    date {
      match => ["timestamp", "dd/MMM/yyyy:HH:mm:ss Z"]
    }
    geoip {
      source => "clientip"
    }
    mutate {
      remove_field => ["message", "timestamp"]
    }
  }

  if [fields][type] == "syslog" {
    grok {
      match => { "message" => "%{SYSLOGTIMESTAMP:syslog_timestamp} %{SYSLOGHOST:syslog_hostname} %{DATA:syslog_program}(?:\\[%{POSINT:syslog_pid}\\])?: %{GREEDYDATA:syslog_message}" }
    }
    date {
      match => ["syslog_timestamp", "MMM  d HH:mm:ss", "MMM dd HH:mm:ss"]
    }
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "logs-%{[fields][type]}-%{+YYYY.MM.dd}"
  }
}
```

#### Common Logstash operations
```bash
# Check pipeline status
curl http://localhost:9600/_node/pipelines?pretty

# Check node stats (throughput, queue depth)
curl http://localhost:9600/_node/stats?pretty | python3 -m json.tool | grep -A5 events

# Validate a pipeline config before deploying
podman exec logstash logstash --config.test_and_exit \
  -f /usr/share/logstash/pipeline/beats-to-es.conf
```

#### Common Elasticsearch operations
```bash
# Cluster health
curl http://localhost:9200/_cluster/health?pretty

# List all indices with size and doc count
curl "http://localhost:9200/_cat/indices?v&s=store.size:desc"

# Delete an index
curl -X DELETE http://localhost:9200/logs-2024.01.01

# Check ILM policy status for an index
curl http://localhost:9200/logs-000001/_ilm/explain?pretty
```

#### Index Lifecycle Management (ILM) — auto-manage index ageing
```bash
curl -X PUT http://localhost:9200/_ilm/policy/logs-policy \
  -H "Content-Type: application/json" -d '
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": { "max_primary_shard_size": "50gb", "max_age": "1d" },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 },
          "set_priority": { "priority": 50 }
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": { "delete": {} }
      }
    }
  }
}'
```

---

## Beats — Lightweight Log & Metric Shippers

**Purpose:** Single-purpose, lightweight agents (Go binaries, no JVM) that run on monitored hosts and ship data to Logstash or Elasticsearch directly.

| Beat | Ships | Use Case |
|------|-------|----------|
| **Filebeat** | Log files | Application logs, access logs, syslog |
| **Metricbeat** | System metrics | CPU, memory, disk, container stats |
| **Packetbeat** | Network traffic | HTTP, DNS, MySQL, Redis protocol analysis |
| **Auditbeat** | Audit events | File integrity monitoring, `auditd` events |
| **Heartbeat** | Uptime | Active monitoring, HTTP/TCP/ICMP checks |
| **Winlogbeat** | Windows Event Log | Windows security and application logs |

#### Filebeat — ship log files to Logstash
```yaml
# ~/filebeat/compose.yaml
services:
  filebeat:
    image: docker.elastic.co/beats/filebeat:8.13.4
    user: root
    volumes:
      - /home/user/filebeat/filebeat.yml:/usr/share/filebeat/filebeat.yml:ro,Z
      - /var/log:/var/log:ro
      - /run/user/1000/podman/podman.sock:/run/podman/podman.sock:ro
      - filebeat_data:/usr/share/filebeat/data
    restart: unless-stopped

volumes:
  filebeat_data:
```

```yaml
# ~/filebeat/filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/*.log
      - /var/log/caddy/*.log
    fields:
      type: syslog
    fields_under_root: true

  - type: log
    enabled: true
    paths:
      - /var/log/nginx/access.log
    fields:
      type: nginx
    fields_under_root: true

output.logstash:
  hosts: ["host.containers.internal:5044"]

processors:
  - add_host_metadata: ~
  - add_cloud_metadata: ~

logging.level: info
```

```bash
cd ~/filebeat && podman-compose up -d
```

#### Metricbeat — ship system metrics
```yaml
# ~/metricbeat/compose.yaml
services:
  metricbeat:
    image: docker.elastic.co/beats/metricbeat:8.13.4
    user: root
    network_mode: host
    volumes:
      - /home/user/metricbeat/metricbeat.yml:/usr/share/metricbeat/metricbeat.yml:ro,Z
      - /proc:/hostfs/proc:ro
      - /sys/fs/cgroup:/hostfs/sys/fs/cgroup:ro
      - /:/hostfs:ro
      - /run/user/1000/podman/podman.sock:/run/podman/podman.sock:ro
    command: metricbeat -e --system.hostfs=/hostfs
    restart: unless-stopped
```

---

## OpenSearch (Single-Node)

**Purpose:** Fully open-source fork of Elasticsearch 7.10 under the Apache 2.0 licence. Drop-in API compatible — any Logstash output, Filebeat, or Metricbeat that targets Elasticsearch works against OpenSearch without changes. For multi-node production clusters see the [Clusters wiki](https://docs.shani.dev/doc/servers/clusters).

```yaml
# ~/opensearch/compose.yaml
services:
  opensearch:
    image: opensearchproject/opensearch:2
    ports:
      - 127.0.0.1:9200:9200
      - 127.0.0.1:9600:9600
    environment:
      discovery.type: single-node
      DISABLE_SECURITY_PLUGIN: "true"
      OPENSEARCH_JAVA_OPTS: "-Xms512m -Xmx1g"
    volumes:
      - opensearch_data:/usr/share/opensearch/data
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    restart: unless-stopped

  opensearch-dashboards:
    image: opensearchproject/opensearch-dashboards:2
    ports:
      - 127.0.0.1:5601:5601
    environment:
      OPENSEARCH_HOSTS: '["http://opensearch:9200"]'
      DISABLE_SECURITY_DASHBOARDS_PLUGIN: "true"
    depends_on: [opensearch]
    restart: unless-stopped

volumes:
  opensearch_data:
```

```bash
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee /etc/sysctl.d/99-elasticsearch.conf

cd ~/opensearch && podman-compose up -d
```

---

## Fluent Bit (Lightweight Log Forwarder)

**Purpose:** Ultra-lightweight (< 1 MB binary, ~1 MB RAM at idle) log and metrics forwarder written in C. The modern replacement for Fluentd in resource-constrained environments. Collects from files, syslog, systemd journal, Docker, and container runtimes; then ships to Elasticsearch, OpenSearch, Loki, ClickHouse, S3, Kafka, and 40+ other outputs.

```yaml
# ~/fluent-bit/compose.yaml
services:
  fluent-bit:
    image: fluent/fluent-bit:latest
    ports:
      - 127.0.0.1:24224:24224/tcp
      - 127.0.0.1:24224:24224/udp
      - 127.0.0.1:2020:2020
    volumes:
      - /home/user/fluent-bit/fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf:ro,Z
      - /home/user/fluent-bit/parsers.conf:/fluent-bit/etc/parsers.conf:ro,Z
      - /var/log:/var/log:ro
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
    restart: unless-stopped
```

#### `fluent-bit.conf` — collect system logs and ship to Elasticsearch + Loki
```ini
[SERVICE]
    Flush         5
    Daemon        Off
    Log_Level     info
    Parsers_File  parsers.conf
    HTTP_Server   On
    HTTP_Listen   0.0.0.0
    HTTP_Port     2020
    storage.type  filesystem
    storage.path  /var/log/fluent-bit-storage/

[INPUT]
    Name              tail
    Path              /var/log/*.log
    Tag               syslog.*
    Parser            syslog-rfc3164
    DB                /var/log/fluent-bit-syslog.db
    Mem_Buf_Limit     5MB
    Skip_Long_Lines   On

[INPUT]
    Name              systemd
    Tag               journal.*
    Systemd_Filter    _SYSTEMD_UNIT=caddy.service
    Strip_Underscores On

[FILTER]
    Name           record_modifier
    Match          *
    Record         hostname ${HOSTNAME}
    Record         environment homelab

[OUTPUT]
    Name                es
    Match               *
    Host                host.containers.internal
    Port                9200
    Logstash_Format     On
    Logstash_Prefix     fluent
    Suppress_Type_Name  On

[OUTPUT]
    Name        loki
    Match       *
    Host        host.containers.internal
    Port        3100
    Labels      job=fluent-bit,host=${HOSTNAME}
    Line_Format json
```

#### Common operations
```bash
# Check pipeline stats
curl http://localhost:2020/api/v1/metrics | python3 -m json.tool

# Test config before deploying
podman exec fluent-bit fluent-bit --config /fluent-bit/etc/fluent-bit.conf --dry-run
```

> **Fluent Bit vs Logstash vs Filebeat:** Use Fluent Bit for a tiny-footprint forwarder (perfect for every container/host to a central aggregator). Use Filebeat when you're in the Elastic ecosystem. Use Logstash for heavy-duty filtering, complex Grok patterns, or multiple conditional outputs.

---

## Vector.dev (High-Performance Log & Metric Pipeline)

**Purpose:** Rust-based observability data pipeline. Collects logs, metrics, and traces; transforms them with a powerful built-in VRL (Vector Remap Language) scripting layer; and routes to any backend. Significantly higher throughput than Logstash or Fluent Bit on multi-core hardware, with end-to-end acknowledgements and disk-backed buffering. A single Vector instance can replace Filebeat + Logstash, or Promtail + Grafana Alloy, in many setups.

```yaml
# ~/vector/compose.yaml
services:
  vector:
    image: timberio/vector:latest-alpine
    ports:
      - 127.0.0.1:8686:8686    # Vector API
      - 127.0.0.1:6000:6000    # Syslog TCP
      - 127.0.0.1:6001:6001/udp
    volumes:
      - /home/user/vector/vector.yaml:/etc/vector/vector.yaml:ro,Z
      - /var/log:/var/log:ro
      - /home/user/vector/data:/var/lib/vector:Z
      - /run/user/1000/podman/podman.sock:/var/run/docker.sock:ro
    restart: unless-stopped
```

#### `vector.yaml` — collect, enrich, and fan out to Elasticsearch and Loki
```yaml
api:
  enabled: true
  address: "0.0.0.0:8686"

data_dir: /var/lib/vector

sources:
  syslog_tcp:
    type: syslog
    address: "0.0.0.0:6000"
    mode: tcp

  host_logs:
    type: file
    include:
      - /var/log/*.log
      - /var/log/caddy/*.log

  docker_logs:
    type: docker_logs
    docker_host: "unix:///run/user/1000/podman/podman.sock"

  host_metrics:
    type: host_metrics
    scrape_interval_secs: 15
    collectors: [cpu, disk, filesystem, load, memory, network]

transforms:
  enrich_all:
    type: remap
    inputs: [syslog_tcp, docker_logs]
    source: |
      .hostname = get_hostname!()
      .environment = "homelab"

  filter_noise:
    type: filter
    inputs: [enrich_all]
    condition: |
      !includes(["debug", "trace"], downcase(string!(.level ?? "")))

sinks:
  elasticsearch_out:
    type: elasticsearch
    inputs: [filter_noise]
    endpoints: ["http://host.containers.internal:9200"]
    mode: bulk
    bulk:
      index: "vector-%Y.%m.%d"
    buffer:
      type: disk
      max_size: 268435456   # 256 MB

  loki_out:
    type: loki
    inputs: [filter_noise]
    endpoint: "http://host.containers.internal:3100"
    labels:
      job: vector
      host: "{{ hostname }}"
    encoding:
      codec: json
    buffer:
      type: disk
      max_size: 134217728   # 128 MB

  prometheus_out:
    type: prometheus_exporter
    inputs: [host_metrics]
    address: "0.0.0.0:9598"
```

#### Common operations
```bash
# Check topology and component health
curl http://localhost:8686/health
curl http://localhost:8686/components | python3 -m json.tool

# Validate config before deploying
podman exec vector vector validate /etc/vector/vector.yaml

# Test VRL expressions interactively
podman run --rm -it timberio/vector:latest-alpine vector vrl
```

> **Vector vs Fluent Bit vs Logstash:** Vector has the highest throughput and most expressive transformation language (VRL). Fluent Bit has the smallest footprint for edge/sidecar deployments. Logstash has the richest plugin ecosystem and best Kibana integration. For a new homelab log pipeline shipping to both Elasticsearch and Loki, Vector is the best starting point.

---

## Graylog (Log Management & SIEM-Lite)

**Purpose:** Centralised log management platform. Where Loki stores logs as compressed streams and queries them with LogQL, Graylog parses, indexes, and makes logs fully searchable via OpenSearch — every field in every message is indexed, so you can query `http_status:500 AND source:caddy` across millions of events in milliseconds. Use Graylog when you need structured, searchable log analysis; use Loki+Grafana when you want lightweight log storage alongside metrics.

```yaml
# ~/graylog/compose.yaml
services:
  mongodb:
    image: mongo:6
    volumes:
      - graylog_mongo_data:/data/db
    restart: unless-stopped

  opensearch:
    image: opensearchproject/opensearch:2
    environment:
      OPENSEARCH_JAVA_OPTS: "-Xms1g -Xmx1g"
      discovery.type: single-node
      plugins.security.disabled: "true"
      action.auto_create_index: "false"
    volumes:
      - graylog_os_data:/usr/share/opensearch/data
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    restart: unless-stopped

  graylog:
    image: graylog/graylog:6.3
    ports:
      - 127.0.0.1:9000:9000       # Web UI
      - 127.0.0.1:12201:12201     # GELF TCP
      - 127.0.0.1:12201:12201/udp # GELF UDP
      - 127.0.0.1:1514:1514       # Syslog TCP
      - 127.0.0.1:1514:1514/udp   # Syslog UDP
    environment:
      GRAYLOG_PASSWORD_SECRET: changeme-run-openssl-rand-base64-48
      # SHA2 of your admin password: echo -n yourpassword | sha256sum | cut -d' ' -f1
      # Value below is the hash of 'admin' — CHANGE IT before deploying
      GRAYLOG_ROOT_PASSWORD_SHA2: "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918"
      GRAYLOG_HTTP_EXTERNAL_URI: https://graylog.home.local/
      GRAYLOG_ELASTICSEARCH_HOSTS: http://opensearch:9200
      GRAYLOG_MONGODB_URI: mongodb://mongodb:27017/graylog
      TZ: Asia/Kolkata
    volumes:
      - /home/user/graylog/data:/usr/share/graylog/data:Z
      - /home/user/graylog/config:/usr/share/graylog/data/config:Z
    depends_on: [mongodb, opensearch]
    restart: unless-stopped

volumes:
  graylog_mongo_data:
  graylog_os_data:
```

```bash
cd ~/graylog && podman-compose up -d
```

Access at `http://localhost:9000`. Login with `admin` / your password. Create inputs under System → Inputs.

#### Send logs from other containers via GELF
```yaml
# Add to any service's compose.yaml
logging:
  driver: gelf
  options:
    gelf-address: "udp://localhost:12201"
    tag: "myapp"
```

#### Send Caddy access logs to Graylog via Syslog
```caddyfile
{
  log {
    output net localhost:1514 {
      dial_timeout 3s
    }
    format json
  }
}
```

#### Ship logs from any Linux host via Filebeat → Graylog
```yaml
# /etc/filebeat/filebeat.yml on remote host
filebeat.inputs:
  - type: log
    paths: ["/var/log/*.log", "/var/log/caddy/*.log"]
    json.keys_under_root: true

output.logstash:
  hosts: ["graylog.home.local:5044"]
```

> **Graylog vs Loki:** Use Loki (via Grafana Alloy) for lightweight log tailing alongside Prometheus metrics. Use Graylog when you need full-text indexing, structured field search, and a dedicated log analysis UI.

---

