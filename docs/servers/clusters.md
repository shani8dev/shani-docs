---
title: Clusters & High Availability
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Clusters & High Availability

Multi-node, replicated, and highly available deployments. All compose files use rootless Podman with `:Z` volume labels on bind mounts. Named volumes omit `:Z` — Podman manages their labels automatically.

---

## HA Concepts (Industry Context)

These patterns appear across every company that runs production infrastructure. Understanding them is the difference between someone who follows runbooks and someone who can write them.

**Replication vs. clustering:** *Replication* copies data from one node to others (primary → replicas). *Clustering* distributes both data and responsibility across nodes. PostgreSQL streaming replication is replication; Cassandra ring is clustering. Many systems combine both — MongoDB replica sets replicate within each shard, while a sharded cluster distributes across shards.

**Leader election:** When a primary fails, surviving nodes must agree on a new one without split-brain (two nodes both believing they are primary). This requires a consensus algorithm — Raft (etcd, Kafka KRaft) or Paxos variants. The protocol guarantees that only one node can be elected, even under network partition. You don't need to implement this; you need to understand *why* etcd is a dependency for Patroni, and *why* Kafka removed ZooKeeper.

**Fencing (STONITH — Shoot The Other Node In The Head):** In bare-metal HA setups, when a primary node stops responding, the cluster can't be certain whether it crashed or just lost network connectivity. A fencing device (IPMI/BMC, PDU, or cloud API) forcibly powers off or reboots the unresponsive node before promoting a standby — preventing split-brain writes. On cloud and container deployments, fencing is usually handled by the orchestrator (Kubernetes, etcd TTLs, cloud instance termination APIs). Every infrastructure engineer will encounter this concept.

**Replication lag:** Async replicas apply writes with a delay. During normal operation this might be milliseconds; under load it can grow to seconds or minutes. Reads from a replica during lag return stale data. This is the fundamental trade-off behind `readPreference=secondary` (MongoDB), reading from a Postgres standby, and `CONSISTENCY LOCAL_ONE` (Cassandra). Always know your acceptable staleness before sending reads to replicas.

**HAProxy health check model:** HAProxy doesn't connect to the database to check health — it hits a REST endpoint on the HA agent (Patroni port 8008). This is intentional: probing the database port only tells you TCP is open, not whether the node is a writable primary. The agent's REST endpoint knows cluster role and reports it explicitly. This REST-based health check pattern appears across many HA stacks (Consul health checks, Kubernetes liveness/readiness probes, AWS target group health checks).


**Quorum mathematics — why odd-numbered clusters:** A cluster with N nodes requires ⌊N/2⌋ + 1 nodes for quorum (a majority). With 3 nodes: quorum = 2, can tolerate 1 failure. With 5 nodes: quorum = 3, can tolerate 2 failures. With 4 nodes: quorum = 3, can still only tolerate 1 failure — same as 3 nodes but with more cost. Even-numbered clusters waste a node. A 2-node cluster can't achieve quorum after any single failure — this is why you should never run a 2-node etcd, Patroni, or Elasticsearch cluster in production.

**Raft consensus in practice:** Raft (used by etcd, Kafka KRaft, CockroachDB) works in three roles: Leader (one per cluster, handles all writes), Follower (replicates from leader), Candidate (transitional during election). A leader sends heartbeats; if followers don't hear one within the election timeout, they become candidates and request votes. A candidate wins if it gets votes from a majority of nodes. Raft guarantees: (1) at most one leader at a time, (2) a leader has all committed entries, (3) committed entries are never lost. The practical implication: writes require a majority acknowledgment before committing — if you lose quorum, the cluster stops accepting writes.

**Kafka partitions and consumer groups:** A Kafka topic is divided into partitions — the unit of parallelism and ordering. Messages within a partition are strictly ordered; across partitions they are not. A consumer group is a set of consumers that jointly consume all partitions of a topic — each partition is assigned to exactly one consumer in the group at any time. Scaling throughput: add partitions (more parallelism) and consumers (up to the number of partitions — extra consumers idle). This model is why Kafka is "pull-based": consumers control their own offset, enabling replay and independent progress for different consumer groups on the same data.

**RabbitMQ exchange types — routing patterns:** RabbitMQ's exchange is the router between producers and queues. Four types: **Direct** — routes to queues whose binding key exactly matches the message routing key (point-to-point). **Fanout** — broadcasts to all bound queues regardless of routing key (pub/sub). **Topic** — routes based on wildcard pattern matching (`*.error`, `logs.#`) — the most flexible. **Headers** — routes based on message headers rather than routing key (rarely used). Knowing these lets you design message routing without application-level filtering: a Topic exchange with `*.error` bound to an alert queue handles error routing at the broker.

**VictoriaMetrics vs Prometheus — architectural differences:** Prometheus is single-node — one binary, local disk, bounded retention. VictoriaMetrics is Prometheus-compatible (speaks the same scrape format, query language, and remote write API) but designed for higher throughput and longer retention: better compression (10x vs Prometheus), faster ingest, and a cluster mode for horizontal scaling. The key operational difference: VictoriaMetrics accepts Prometheus remote write, so you can run Prometheus for scraping and service discovery while using VictoriaMetrics as the long-term storage backend (the same role as Thanos, but simpler to operate).

**Cassandra consistent hashing and the ring:** Cassandra distributes data using consistent hashing — each node owns a range of the token ring (a 64-bit integer space). A row's partition key is hashed to a token, and the node owning that token range stores it. With `replication_factor=3`, the three consecutive nodes on the ring each store a copy. This means: (1) adding a node only moves ~1/N of data, not all of it, (2) there's no primary — any replica can serve reads/writes, (3) `CONSISTENCY QUORUM` requires a majority of replicas to agree, moving Cassandra toward CP at the cost of availability during node failures.
---

## Elasticsearch Cluster (3-Node)

**Purpose:** Production ELK cluster with 3 master-eligible/data nodes for quorum-based split-brain prevention. Survives loss of 1 node. Pair with the Logstash and Beats configs in the [Monitoring wiki](https://docs.shani.dev/doc/servers/monitoring).

```yaml
# ~/elk-cluster/compose.yaml
services:
  es01:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.4
    ports:
      - 127.0.0.1:9200:9200
    environment:
      node.name: es01
      cluster.name: homelab-logs
      node.roles: master,data
      discovery.seed_hosts: es02,es03
      cluster.initial_master_nodes: es01,es02,es03
      xpack.security.enabled: "false"
      ES_JAVA_OPTS: "-Xms1g -Xmx1g"
      bootstrap.memory_lock: "true"
    volumes:
      - es01_data:/usr/share/elasticsearch/data
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    restart: unless-stopped

  es02:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.4
    environment:
      node.name: es02
      cluster.name: homelab-logs
      node.roles: master,data
      discovery.seed_hosts: es01,es03
      cluster.initial_master_nodes: es01,es02,es03
      xpack.security.enabled: "false"
      ES_JAVA_OPTS: "-Xms1g -Xmx1g"
      bootstrap.memory_lock: "true"
    volumes:
      - es02_data:/usr/share/elasticsearch/data
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    restart: unless-stopped

  es03:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.4
    environment:
      node.name: es03
      cluster.name: homelab-logs
      node.roles: master,data
      discovery.seed_hosts: es01,es02
      cluster.initial_master_nodes: es01,es02,es03
      xpack.security.enabled: "false"
      ES_JAVA_OPTS: "-Xms1g -Xmx1g"
      bootstrap.memory_lock: "true"
    volumes:
      - es03_data:/usr/share/elasticsearch/data
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    restart: unless-stopped

  # Coordinating / ingest node — routes requests, no data stored
  es-ingest:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.4
    environment:
      node.name: es-ingest
      cluster.name: homelab-logs
      node.roles: ingest,coordinating
      discovery.seed_hosts: es01,es02,es03
      cluster.initial_master_nodes: es01,es02,es03
      xpack.security.enabled: "false"
      ES_JAVA_OPTS: "-Xms512m -Xmx512m"
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    restart: unless-stopped

  kibana:
    image: docker.elastic.co/kibana/kibana:8.13.4
    ports:
      - 127.0.0.1:5601:5601
    environment:
      ELASTICSEARCH_HOSTS: '["http://es01:9200","http://es02:9200","http://es03:9200"]'
    depends_on: [es01, es02, es03]
    restart: unless-stopped

  logstash:
    image: docker.elastic.co/logstash/logstash:8.13.4
    ports:
      - 127.0.0.1:5044:5044
      - 127.0.0.1:5000:5000/tcp
      - 127.0.0.1:5000:5000/udp
    volumes:
      - /home/user/elk-cluster/logstash/pipeline:/usr/share/logstash/pipeline:ro,Z
      - /home/user/elk-cluster/logstash/config/logstash.yml:/usr/share/logstash/config/logstash.yml:ro,Z
    environment:
      LS_JAVA_OPTS: "-Xms512m -Xmx512m"
    depends_on: [es01]
    restart: unless-stopped

volumes:
  es01_data:
  es02_data:
  es03_data:
```

```bash
# Required on every host node before starting
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee /etc/sysctl.d/99-elasticsearch.conf

cd ~/elk-cluster && podman-compose up -d

# Verify cluster health
curl http://localhost:9200/_cluster/health?pretty
curl "http://localhost:9200/_cat/nodes?v&h=name,role,heap.percent,disk.used_percent,load_1m"
```

**Node roles reference:**

| Role | Responsibilities |
|------|-----------------|
| `master` | Cluster state, index creation/deletion, shard allocation |
| `data` | Store shards, handle search and indexing requests |
| `ingest` | Pre-process documents via pipelines before indexing |
| `coordinating` | Route requests, merge results — no data stored |

> **Split-brain prevention:** Always deploy an odd number of master-eligible nodes (3 or 5). With 3 masters the cluster survives loss of 1; with 5, loss of 2. Remove `cluster.initial_master_nodes` from node configs after first cluster formation or nodes will refuse to rejoin after a full restart.

---

## How Quorum and Split-Brain Prevention Work

Every distributed system in this wiki — Elasticsearch, etcd, Kafka, Patroni, Redis Sentinel — relies on the same underlying idea: a **quorum**.

A cluster of N nodes requires ⌊N/2⌋ + 1 nodes to agree before making any decision (electing a leader, accepting a write, allocating a shard). With 3 nodes, quorum = 2. If 1 node fails, the remaining 2 can still reach agreement — the cluster stays available. If 2 nodes fail, the 1 remaining node can't form a quorum alone, so it refuses to make decisions rather than risk acting on stale or inconsistent data.

**Why odd numbers:** A 4-node cluster has quorum = 3, so it can only tolerate 1 failure — same as a 3-node cluster, but at higher cost. Even-numbered clusters also create a risk of a 2-2 split where neither partition can reach quorum, leaving the whole system stuck. Odd numbers are not required, but they give you the best fault tolerance per node.

**What split-brain means in practice:** If a network partition divides a cluster into two halves that can't communicate, and both halves could independently elect a leader and accept writes, you'd end up with two diverged datasets with no way to reconcile them. Quorum prevents this: only the partition with enough nodes to reach quorum can continue operating. The minority partition refuses to act.

**Why Patroni uses etcd:** The leader election process requires a distributed consensus store that is itself fault-tolerant. Patroni nodes race to write a leader lock key in etcd. The node that succeeds becomes primary. The lock has a TTL (time-to-live); if the primary fails to renew it before expiry, etcd expires the key and a new election begins. The health check HAProxy hits (port 8008) is the Patroni REST API, not PostgreSQL directly — HAProxy asks Patroni "are you the primary?" rather than probing the database port.

---

## OpenSearch Cluster (3-Node)

**Purpose:** Apache 2.0-licensed ELK alternative. Drop-in API compatible with Elasticsearch — any Logstash output, Filebeat, or Metricbeat works without changes. Includes Data Prepper, OpenSearch's native log pipeline (Logstash equivalent).

```yaml
# ~/opensearch-cluster/compose.yaml
services:
  os01:
    image: opensearchproject/opensearch:2
    environment:
      cluster.name: os-logs
      node.name: os01
      discovery.seed_hosts: os02,os03
      cluster.initial_cluster_manager_nodes: os01,os02,os03
      DISABLE_SECURITY_PLUGIN: "true"
      OPENSEARCH_JAVA_OPTS: "-Xms1g -Xmx1g"
      bootstrap.memory_lock: "true"
    volumes:
      - os01_data:/usr/share/opensearch/data
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    restart: unless-stopped

  os02:
    image: opensearchproject/opensearch:2
    environment:
      cluster.name: os-logs
      node.name: os02
      discovery.seed_hosts: os01,os03
      cluster.initial_cluster_manager_nodes: os01,os02,os03
      DISABLE_SECURITY_PLUGIN: "true"
      OPENSEARCH_JAVA_OPTS: "-Xms1g -Xmx1g"
      bootstrap.memory_lock: "true"
    volumes:
      - os02_data:/usr/share/opensearch/data
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    restart: unless-stopped

  os03:
    image: opensearchproject/opensearch:2
    environment:
      cluster.name: os-logs
      node.name: os03
      discovery.seed_hosts: os01,os02
      cluster.initial_cluster_manager_nodes: os01,os02,os03
      DISABLE_SECURITY_PLUGIN: "true"
      OPENSEARCH_JAVA_OPTS: "-Xms1g -Xmx1g"
      bootstrap.memory_lock: "true"
    volumes:
      - os03_data:/usr/share/opensearch/data
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    restart: unless-stopped

  opensearch-dashboards:
    image: opensearchproject/opensearch-dashboards:2
    ports:
      - 127.0.0.1:5601:5601
    environment:
      OPENSEARCH_HOSTS: '["http://os01:9200","http://os02:9200","http://os03:9200"]'
      DISABLE_SECURITY_DASHBOARDS_PLUGIN: "true"
    depends_on: [os01]
    restart: unless-stopped

  # Data Prepper — OpenSearch's native log processing pipeline
  data-prepper:
    image: opensearchproject/data-prepper:latest
    ports:
      - 127.0.0.1:21890:21890   # OTLP gRPC
      - 127.0.0.1:2021:2021     # HTTP source
      - 127.0.0.1:4900:4900     # Server API
    volumes:
      - /home/user/opensearch-cluster/data-prepper/pipelines.yaml:/usr/share/data-prepper/pipelines/pipelines.yaml:ro,Z
      - /home/user/opensearch-cluster/data-prepper/data-prepper-config.yaml:/usr/share/data-prepper/config/data-prepper-config.yaml:ro,Z
    depends_on: [os01]
    restart: unless-stopped

volumes:
  os01_data:
  os02_data:
  os03_data:
```

```bash
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee /etc/sysctl.d/99-elasticsearch.conf

cd ~/opensearch-cluster && podman-compose up -d

curl http://localhost:9200/_cluster/health?pretty
curl "http://localhost:9200/_cat/nodes?v"
```

**Data Prepper pipeline config:**
```yaml
# ~/opensearch-cluster/data-prepper/pipelines.yaml
log-pipeline:
  source:
    http:
      port: 2021
  processor:
    - grok:
        match:
          message: ['%{COMMONAPACHELOG}']
    - date:
        from_time_received: true
        destination: "@timestamp"
  sink:
    - opensearch:
        hosts: ["http://os01:9200", "http://os02:9200"]
        insecure: true
        index: logs-%{yyyy.MM.dd}

otel-trace-pipeline:
  source:
    otel_trace_source:
      port: 21890
  processor:
    - otel_traces: ~
  sink:
    - opensearch:
        hosts: ["http://os01:9200"]
        insecure: true
        index: otel-traces-%{yyyy.MM.dd}
```

**OpenSearch ISM — daily rollover, delete after 30 days:**
```bash
curl -X PUT http://localhost:9200/_plugins/_ism/policies/logs-policy \
  -H "Content-Type: application/json" -d '
{
  "policy": {
    "description": "Daily rollover, delete after 30d",
    "default_state": "hot",
    "states": [
      {
        "name": "hot",
        "actions": [{ "rollover": { "min_index_age": "1d", "min_primary_shard_size": "25gb" } }],
        "transitions": [{ "state_name": "delete", "conditions": { "min_index_age": "30d" } }]
      },
      {
        "name": "delete",
        "actions": [{ "delete": {} }],
        "transitions": []
      }
    ],
    "ism_template": [{ "index_patterns": ["logs-*"], "priority": 100 }]
  }
}'
```

---

## Kafka Cluster (KRaft, 3-Node)

**Purpose:** Production Kafka cluster using KRaft mode (ZooKeeper removed in Kafka 4.0). Three nodes each act as both broker and controller, giving quorum-based fault tolerance — survives loss of 1 node.

```yaml
# ~/kafka-cluster/compose.yaml
services:
  kafka1:
    image: confluentinc/cp-kafka:latest
    ports:
      - 127.0.0.1:9092:9092
    environment:
      CLUSTER_ID: "MkU3OEVBNTcwNTJENDM2Qk"
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
      KAFKA_LISTENERS: PLAINTEXT://kafka1:29092,CONTROLLER://kafka1:9093,PLAINTEXT_HOST://0.0.0.0:9092
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka1:29092,PLAINTEXT_HOST://localhost:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
      KAFKA_MIN_INSYNC_REPLICAS: 2
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
      KAFKA_LOG_RETENTION_HOURS: 168
    volumes:
      - kafka1_data:/var/lib/kafka/data
    restart: unless-stopped

  kafka2:
    image: confluentinc/cp-kafka:latest
    environment:
      CLUSTER_ID: "MkU3OEVBNTcwNTJENDM2Qk"
      KAFKA_NODE_ID: 2
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
      KAFKA_LISTENERS: PLAINTEXT://kafka2:29092,CONTROLLER://kafka2:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka2:29092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
      KAFKA_MIN_INSYNC_REPLICAS: 2
    volumes:
      - kafka2_data:/var/lib/kafka/data
    restart: unless-stopped

  kafka3:
    image: confluentinc/cp-kafka:latest
    environment:
      CLUSTER_ID: "MkU3OEVBNTcwNTJENDM2Qk"
      KAFKA_NODE_ID: 3
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
      KAFKA_LISTENERS: PLAINTEXT://kafka3:29092,CONTROLLER://kafka3:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka3:29092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
      KAFKA_MIN_INSYNC_REPLICAS: 2
    volumes:
      - kafka3_data:/var/lib/kafka/data
    restart: unless-stopped

  kafka-ui:
    image: ghcr.io/kafbat/kafka-ui:latest
    ports:
      - 127.0.0.1:8080:8080
    environment:
      KAFKA_CLUSTERS_0_NAME: homelab
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka1:29092,kafka2:29092,kafka3:29092
    depends_on: [kafka1, kafka2, kafka3]
    restart: unless-stopped

volumes:
  kafka1_data:
  kafka2_data:
  kafka3_data:
```

```bash
cd ~/kafka-cluster && podman-compose up -d

# Verify all brokers are visible
podman exec kafka1 kafka-broker-api-versions \
  --bootstrap-server kafka1:29092,kafka2:29092,kafka3:29092

# Create a topic with replication
podman exec kafka1 kafka-topics \
  --bootstrap-server kafka1:29092 \
  --create --topic my-topic --partitions 6 --replication-factor 3

# Check topic replication state
podman exec kafka1 kafka-topics \
  --bootstrap-server kafka1:29092 --describe --topic my-topic
```

> `KAFKA_MIN_INSYNC_REPLICAS: 2` means a producer with `acks=all` requires at least 2 replicas to acknowledge a write — preventing data loss if a node fails mid-write. The cluster tolerates the loss of 1 broker.

### How Kafka Consumer Groups Work

A **consumer group** is a set of consumers that collectively read a topic. Kafka assigns each partition to exactly one consumer in the group at a time. If a topic has 6 partitions and your consumer group has 3 instances, each instance gets 2 partitions. If you scale to 6 instances, each gets 1. If you add a 7th, it sits idle — you can't have more active consumers than partitions.

**Rebalancing** happens when a consumer joins or leaves the group. During a rebalance, all partition assignments are renegotiated — no consumer processes messages until the rebalance completes. This is the "rebalance storm" problem: if consumers join/leave frequently (e.g., due to crashlooping pods), the group never stabilises and consumer lag grows continuously.

`max.poll.interval.ms` controls how long Kafka waits between calls to `poll()` before declaring a consumer dead and triggering a rebalance. If your processing logic is slow (e.g., calling an external API per message), increase this value — otherwise Kafka will evict the consumer mid-processing, causing messages to be redelivered.

```bash
# Check consumer group lag — how far behind each consumer is
podman exec kafka1 kafka-consumer-groups \
  --bootstrap-server kafka1:29092 \
  --describe --group my-consumer-group

# Reset offsets to re-process from beginning (use with caution)
podman exec kafka1 kafka-consumer-groups \
  --bootstrap-server kafka1:29092 \
  --group my-consumer-group \
  --topic my-topic \
  --reset-offsets --to-earliest --execute
```

---

## Patroni + etcd + HAProxy (PostgreSQL HA)

**Purpose:** Patroni is the industry-standard PostgreSQL HA solution. It manages automatic failover: if the primary goes down, Patroni promotes a standby to primary within seconds. etcd stores cluster state and is used for distributed leader election.

```yaml
# ~/patroni/compose.yaml
services:
  # etcd — distributed consensus store for Patroni
  etcd:
    image: bitnami/etcd:latest
    ports:
      - 127.0.0.1:2379:2379
    environment:
      ETCD_NAME: etcd0
      ETCD_DATA_DIR: /etcd-data
      ETCD_LISTEN_CLIENT_URLS: http://0.0.0.0:2379
      ETCD_ADVERTISE_CLIENT_URLS: http://etcd:2379
      ETCD_LISTEN_PEER_URLS: http://0.0.0.0:2380
      ETCD_INITIAL_ADVERTISE_PEER_URLS: http://etcd:2380
      ETCD_INITIAL_CLUSTER: etcd0=http://etcd:2380
      ETCD_INITIAL_CLUSTER_STATE: new
      ALLOW_NONE_AUTHENTICATION: "yes"
    volumes:
      - etcd_data:/etcd-data
    restart: unless-stopped

  patroni1:
    image: patroni/patroni:latest
    ports:
      - 127.0.0.1:5432:5432
      - 127.0.0.1:8008:8008    # Patroni REST API
    environment:
      PATRONI_NAME: patroni1
      PATRONI_POSTGRESQL_CONNECT_ADDRESS: patroni1:5432
      PATRONI_RESTAPI_CONNECT_ADDRESS: patroni1:8008
      PATRONI_ETCD3_HOSTS: etcd:2379
      PATRONI_SUPERUSER_USERNAME: postgres
      PATRONI_SUPERUSER_PASSWORD: strongpassword
      PATRONI_REPLICATION_USERNAME: replicator
      PATRONI_REPLICATION_PASSWORD: replpass
    volumes:
      - patroni1_data:/var/lib/postgresql/data
    depends_on: [etcd]
    restart: unless-stopped

  patroni2:
    image: patroni/patroni:latest
    ports:
      - 127.0.0.1:5433:5432
      - 127.0.0.1:8009:8008
    environment:
      PATRONI_NAME: patroni2
      PATRONI_POSTGRESQL_CONNECT_ADDRESS: patroni2:5432
      PATRONI_RESTAPI_CONNECT_ADDRESS: patroni2:8008
      PATRONI_ETCD3_HOSTS: etcd:2379
      PATRONI_SUPERUSER_USERNAME: postgres
      PATRONI_SUPERUSER_PASSWORD: strongpassword
      PATRONI_REPLICATION_USERNAME: replicator
      PATRONI_REPLICATION_PASSWORD: replpass
    volumes:
      - patroni2_data:/var/lib/postgresql/data
    depends_on: [etcd]
    restart: unless-stopped

  # HAProxy — single connection endpoint, routes to current primary
  haproxy:
    image: haproxy:alpine
    ports:
      - 127.0.0.1:5000:5000    # read/write — primary only
      - 127.0.0.1:5001:5001    # read-only — all replicas
      - 127.0.0.1:7000:7000    # HAProxy stats
    volumes:
      - /home/user/patroni/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro,Z
    depends_on: [patroni1, patroni2]
    restart: unless-stopped

volumes:
  etcd_data:
  patroni1_data:
  patroni2_data:
```

**`haproxy.cfg` — routes to Patroni REST API for health checks:**
```
global
    maxconn 100

defaults
    log global
    mode tcp
    retries 2
    timeout client 30m
    timeout connect 4s
    timeout server 30m
    timeout check 5s

listen stats
    mode http
    bind *:7000
    stats enable
    stats uri /

listen postgres_primary
    bind *:5000
    option httpchk OPTIONS /primary
    http-check expect status 200
    default-server inter 3s fall 3 rise 2 on-marked-down shutdown-sessions
    server patroni1 patroni1:5432 maxconn 100 check port 8008
    server patroni2 patroni2:5432 maxconn 100 check port 8008

listen postgres_replicas
    bind *:5001
    option httpchk OPTIONS /replica
    http-check expect status 200
    default-server inter 3s fall 3 rise 2 on-marked-down shutdown-sessions
    server patroni1 patroni1:5432 maxconn 100 check port 8008
    server patroni2 patroni2:5432 maxconn 100 check port 8008
```

```bash
cd ~/patroni && podman-compose up -d

# Check cluster state
curl http://localhost:8008/cluster | python3 -m json.tool

# Force a manual failover
curl -X POST http://localhost:8008/failover -d '{"leader": "patroni1"}'

# Connect to the current primary (always via HAProxy port 5000)
psql -h localhost -p 5000 -U postgres
```

---

## Redis Sentinel (3-Node HA)

**Purpose:** Redis Sentinel provides automatic failover for a Redis primary + replicas. Sentinel processes monitor the primary, agree via quorum when it has failed, and promote a replica to primary — all without manual intervention.

```yaml
# ~/redis-sentinel/compose.yaml
services:
  redis-primary:
    image: redis:7-alpine
    ports:
      - 127.0.0.1:6379:6379
    volumes:
      - redis_primary_data:/data
    command: redis-server --appendonly yes --requirepass changeme
    restart: unless-stopped

  redis-replica1:
    image: redis:7-alpine
    ports:
      - 127.0.0.1:6380:6379
    volumes:
      - redis_replica1_data:/data
    command: >
      redis-server
      --replicaof redis-primary 6379
      --requirepass changeme
      --masterauth changeme
      --appendonly yes
    depends_on: [redis-primary]
    restart: unless-stopped

  redis-replica2:
    image: redis:7-alpine
    ports:
      - 127.0.0.1:6381:6379
    volumes:
      - redis_replica2_data:/data
    command: >
      redis-server
      --replicaof redis-primary 6379
      --requirepass changeme
      --masterauth changeme
      --appendonly yes
    depends_on: [redis-primary]
    restart: unless-stopped

  sentinel1:
    image: redis:7-alpine
    ports:
      - 127.0.0.1:26379:26379
    volumes:
      - /home/user/redis-sentinel/sentinel.conf:/etc/redis/sentinel.conf:Z
    command: redis-sentinel /etc/redis/sentinel.conf
    depends_on: [redis-primary]
    restart: unless-stopped

  sentinel2:
    image: redis:7-alpine
    ports:
      - 127.0.0.1:26380:26379
    volumes:
      - /home/user/redis-sentinel/sentinel.conf:/etc/redis/sentinel.conf:Z
    command: redis-sentinel /etc/redis/sentinel.conf
    depends_on: [redis-primary]
    restart: unless-stopped

  sentinel3:
    image: redis:7-alpine
    ports:
      - 127.0.0.1:26381:26379
    volumes:
      - /home/user/redis-sentinel/sentinel.conf:/etc/redis/sentinel.conf:Z
    command: redis-sentinel /etc/redis/sentinel.conf
    depends_on: [redis-primary]
    restart: unless-stopped

volumes:
  redis_primary_data:
  redis_replica1_data:
  redis_replica2_data:
```

**`sentinel.conf`:**
```conf
port 26379
sentinel monitor mymaster redis-primary 6379 2
sentinel auth-pass mymaster changeme
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 60000
sentinel parallel-syncs mymaster 1
```

```bash
cd ~/redis-sentinel && podman-compose up -d

# Check sentinel state
podman exec redis-sentinel-sentinel1-1 redis-cli -p 26379 sentinel masters

# Check which node is current primary
podman exec redis-sentinel-sentinel1-1 redis-cli -p 26379 \
  sentinel get-master-addr-by-name mymaster

# Check replication state on primary
podman exec redis-sentinel-redis-primary-1 redis-cli -a changeme info replication
```

> Connect your app to the **Sentinel ports** (26379–26381), not the Redis ports directly. The Sentinel-aware client library (redis-py, ioredis, Jedis) queries Sentinel for the current primary address and reconnects automatically after failover.

---

## Valkey Cluster (6-Node, Native Redis Cluster Protocol)

**Purpose:** Native Redis Cluster (hash-slot sharding) using Valkey — the Linux Foundation's open-source Redis fork. Data is automatically sharded across 3 primary nodes with 1 replica each. Survives loss of up to 3 nodes (1 per shard). Unlike Sentinel, Redis Cluster is also horizontally scalable.

```yaml
# ~/valkey-cluster/compose.yaml
services:
  valkey1:
    image: valkey/valkey:8-alpine
    ports:
      - 127.0.0.1:7001:6379
      - 127.0.0.1:17001:16379
    volumes:
      - valkey1_data:/data
    command: >
      valkey-server
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
    restart: unless-stopped

  valkey2:
    image: valkey/valkey:8-alpine
    ports:
      - 127.0.0.1:7002:6379
      - 127.0.0.1:17002:16379
    volumes:
      - valkey2_data:/data
    command: >
      valkey-server
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
    restart: unless-stopped

  valkey3:
    image: valkey/valkey:8-alpine
    ports:
      - 127.0.0.1:7003:6379
      - 127.0.0.1:17003:16379
    volumes:
      - valkey3_data:/data
    command: >
      valkey-server
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
    restart: unless-stopped

  valkey4:
    image: valkey/valkey:8-alpine
    ports:
      - 127.0.0.1:7004:6379
      - 127.0.0.1:17004:16379
    volumes:
      - valkey4_data:/data
    command: >
      valkey-server
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
    restart: unless-stopped

  valkey5:
    image: valkey/valkey:8-alpine
    ports:
      - 127.0.0.1:7005:6379
      - 127.0.0.1:17005:16379
    volumes:
      - valkey5_data:/data
    command: >
      valkey-server
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
    restart: unless-stopped

  valkey6:
    image: valkey/valkey:8-alpine
    ports:
      - 127.0.0.1:7006:6379
      - 127.0.0.1:17006:16379
    volumes:
      - valkey6_data:/data
    command: >
      valkey-server
      --cluster-enabled yes
      --cluster-config-file nodes.conf
      --cluster-node-timeout 5000
      --appendonly yes
    restart: unless-stopped

volumes:
  valkey1_data:
  valkey2_data:
  valkey3_data:
  valkey4_data:
  valkey5_data:
  valkey6_data:
```

```bash
cd ~/valkey-cluster && podman-compose up -d

# Bootstrap the cluster (3 primaries + 3 replicas, 1 replica per primary)
podman exec valkey-cluster-valkey1-1 valkey-cli --cluster create \
  valkey1:6379 valkey2:6379 valkey3:6379 \
  valkey4:6379 valkey5:6379 valkey6:6379 \
  --cluster-replicas 1 --cluster-yes

# Verify cluster state
podman exec valkey-cluster-valkey1-1 valkey-cli cluster info
podman exec valkey-cluster-valkey1-1 valkey-cli cluster nodes
```

> The cluster bus port is always `Redis port + 10000` — that's why port `17001` (=7001+10000) is exposed alongside `7001`. Your application connects to any node using a cluster-aware client; the client handles slot routing automatically.

---

## Cassandra / ScyllaDB Cluster (3-Node)

**Purpose:** Multi-node wide-column cluster for IoT telemetry and event logs at scale. The seed node bootstraps the ring; additional nodes discover and join through gossip. No single point of failure — survives loss of 1 node with `replication_factor=3`.

### Cassandra

```yaml
# ~/cassandra-cluster/compose.yaml
services:
  cassandra1:
    image: cassandra:5
    ports:
      - 127.0.0.1:9042:9042
    environment:
      CASSANDRA_CLUSTER_NAME: HomeCluster
      CASSANDRA_DC: dc1
      CASSANDRA_RACK: rack1
      CASSANDRA_SEEDS: cassandra1
      HEAP_NEWSIZE: 128m
      MAX_HEAP_SIZE: 1g
    volumes:
      - cassandra1_data:/var/lib/cassandra
    restart: unless-stopped

  cassandra2:
    image: cassandra:5
    environment:
      CASSANDRA_CLUSTER_NAME: HomeCluster
      CASSANDRA_DC: dc1
      CASSANDRA_RACK: rack1
      CASSANDRA_SEEDS: cassandra1
      HEAP_NEWSIZE: 128m
      MAX_HEAP_SIZE: 1g
    volumes:
      - cassandra2_data:/var/lib/cassandra
    depends_on: [cassandra1]
    restart: unless-stopped

  cassandra3:
    image: cassandra:5
    environment:
      CASSANDRA_CLUSTER_NAME: HomeCluster
      CASSANDRA_DC: dc1
      CASSANDRA_RACK: rack1
      CASSANDRA_SEEDS: cassandra1
      HEAP_NEWSIZE: 128m
      MAX_HEAP_SIZE: 1g
    volumes:
      - cassandra3_data:/var/lib/cassandra
    depends_on: [cassandra1]
    restart: unless-stopped

volumes:
  cassandra1_data:
  cassandra2_data:
  cassandra3_data:
```

```bash
cd ~/cassandra-cluster && podman-compose up -d

# Wait 60s for cassandra1 to fully start, then bring up the rest
# Check ring status
podman exec cassandra-cluster-cassandra1-1 nodetool status

# Create a keyspace with replication across all 3 nodes
podman exec -it cassandra-cluster-cassandra1-1 cqlsh -e "
CREATE KEYSPACE iot WITH replication = {
  'class': 'NetworkTopologyStrategy', 'dc1': 3
};"
```

### ScyllaDB (recommended for new deployments)

```yaml
# ~/scylladb-cluster/compose.yaml
services:
  scylla1:
    image: scylladb/scylla:6
    ports:
      - 127.0.0.1:9042:9042
      - 127.0.0.1:10000:10000
    volumes:
      - scylla1_data:/var/lib/scylla
    command: --seeds=scylla1 --developer-mode 0
    restart: unless-stopped

  scylla2:
    image: scylladb/scylla:6
    volumes:
      - scylla2_data:/var/lib/scylla
    command: --seeds=scylla1 --developer-mode 0
    depends_on: [scylla1]
    restart: unless-stopped

  scylla3:
    image: scylladb/scylla:6
    volumes:
      - scylla3_data:/var/lib/scylla
    command: --seeds=scylla1 --developer-mode 0
    depends_on: [scylla1]
    restart: unless-stopped

volumes:
  scylla1_data:
  scylla2_data:
  scylla3_data:
```

```bash
cd ~/scylladb-cluster && podman-compose up -d

# Check ring (ScyllaDB uses the same nodetool as Cassandra)
podman exec scylladb-cluster-scylla1-1 nodetool status

# Repair after adding a node
podman exec scylladb-cluster-scylla1-1 nodetool repair
```

> Remove `--developer-mode 0` to enable developer mode (skips disk/CPU checks, suitable for testing). Always use `developer-mode 0` (off) in production — with it on ScyllaDB skips performance optimisations.

---

## MongoDB Replica Set (3-Node)

**Purpose:** MongoDB replica set with 1 primary and 2 secondaries. Provides automatic failover and read scaling. All writes go to the primary; reads can be distributed across secondaries with `readPreference=secondary`.

```yaml
# ~/mongodb-rs/compose.yaml
services:
  mongo1:
    image: mongo:7
    ports:
      - 127.0.0.1:27017:27017
    volumes:
      - mongo1_data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: strongpassword
    command: mongod --replSet rs0 --bind_ip_all
    restart: unless-stopped

  mongo2:
    image: mongo:7
    ports:
      - 127.0.0.1:27018:27017
    volumes:
      - mongo2_data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: strongpassword
    command: mongod --replSet rs0 --bind_ip_all
    restart: unless-stopped

  mongo3:
    image: mongo:7
    ports:
      - 127.0.0.1:27019:27017
    volumes:
      - mongo3_data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: strongpassword
    command: mongod --replSet rs0 --bind_ip_all
    restart: unless-stopped

volumes:
  mongo1_data:
  mongo2_data:
  mongo3_data:
```

```bash
cd ~/mongodb-rs && podman-compose up -d

# Initiate the replica set (run once after all 3 nodes are up)
podman exec mongodb-rs-mongo1-1 mongosh \
  -u admin -p strongpassword --authenticationDatabase admin --eval '
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongo1:27017" },
    { _id: 1, host: "mongo2:27017" },
    { _id: 2, host: "mongo3:27017" }
  ]
})'

# Check replica set status
podman exec mongodb-rs-mongo1-1 mongosh \
  -u admin -p strongpassword --authenticationDatabase admin \
  --eval "rs.status()"

# Connect with replica set URI (use host.containers.internal for host-side access)
# mongodb://admin:strongpassword@localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0&authSource=admin
```

---

## RabbitMQ Cluster (3-Node)

**Purpose:** RabbitMQ cluster for high-availability task queues. All nodes share queue metadata; with quorum queues enabled, message data is also replicated across nodes. Survives loss of 1 node.

```yaml
# ~/rabbitmq-cluster/compose.yaml
services:
  rabbitmq1:
    image: rabbitmq:3-management-alpine
    hostname: rabbitmq1
    ports:
      - 127.0.0.1:5672:5672
      - 127.0.0.1:15672:15672
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: changeme
      RABBITMQ_ERLANG_COOKIE: "SECRET_COOKIE_CHANGE_ME"
    volumes:
      - rabbitmq1_data:/var/lib/rabbitmq
    restart: unless-stopped

  rabbitmq2:
    image: rabbitmq:3-management-alpine
    hostname: rabbitmq2
    ports:
      - 127.0.0.1:5673:5672
      - 127.0.0.1:15673:15672
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: changeme
      RABBITMQ_ERLANG_COOKIE: "SECRET_COOKIE_CHANGE_ME"
    volumes:
      - rabbitmq2_data:/var/lib/rabbitmq
    depends_on: [rabbitmq1]
    restart: unless-stopped

  rabbitmq3:
    image: rabbitmq:3-management-alpine
    hostname: rabbitmq3
    ports:
      - 127.0.0.1:5674:5672
      - 127.0.0.1:15674:15672
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: changeme
      RABBITMQ_ERLANG_COOKIE: "SECRET_COOKIE_CHANGE_ME"
    volumes:
      - rabbitmq3_data:/var/lib/rabbitmq
    depends_on: [rabbitmq1]
    restart: unless-stopped

volumes:
  rabbitmq1_data:
  rabbitmq2_data:
  rabbitmq3_data:
```

```bash
cd ~/rabbitmq-cluster && podman-compose up -d

# Join nodes 2 and 3 to node 1
podman exec rabbitmq-cluster-rabbitmq2-1 rabbitmqctl stop_app
podman exec rabbitmq-cluster-rabbitmq2-1 rabbitmqctl reset
podman exec rabbitmq-cluster-rabbitmq2-1 rabbitmqctl join_cluster rabbit@rabbitmq1
podman exec rabbitmq-cluster-rabbitmq2-1 rabbitmqctl start_app

podman exec rabbitmq-cluster-rabbitmq3-1 rabbitmqctl stop_app
podman exec rabbitmq-cluster-rabbitmq3-1 rabbitmqctl reset
podman exec rabbitmq-cluster-rabbitmq3-1 rabbitmqctl join_cluster rabbit@rabbitmq1
podman exec rabbitmq-cluster-rabbitmq3-1 rabbitmqctl start_app

# Verify cluster membership
podman exec rabbitmq-cluster-rabbitmq1-1 rabbitmqctl cluster_status

# Create a quorum queue (replicated across all 3 nodes)
podman exec rabbitmq-cluster-rabbitmq1-1 rabbitmqadmin \
  -u admin -p changeme declare queue name=my-queue \
  durable=true arguments='{"x-queue-type":"quorum"}'
```

> The `RABBITMQ_ERLANG_COOKIE` must be **identical** on all nodes — this is how RabbitMQ authenticates cluster members. Change the value to something secret before deploying.

---

## VictoriaMetrics Cluster

**Purpose:** Horizontally scalable VictoriaMetrics deployment. Separates storage, ingestion, and query into dedicated components — vminsert handles writes, vmselect handles reads, vmstorage holds the data. Each component scales independently.

```yaml
# ~/victoriametrics-cluster/compose.yaml
services:
  vmstorage1:
    image: victoriametrics/vmstorage:latest
    ports:
      - 127.0.0.1:8482:8482
      - 127.0.0.1:8400:8400
      - 127.0.0.1:8401:8401
    volumes:
      - vmstorage1_data:/storage
    command:
      - --storageDataPath=/storage
      - --retentionPeriod=12
    restart: unless-stopped

  vmstorage2:
    image: victoriametrics/vmstorage:latest
    ports:
      - 127.0.0.1:8483:8482
      - 127.0.0.1:8402:8400
      - 127.0.0.1:8403:8401
    volumes:
      - vmstorage2_data:/storage
    command:
      - --storageDataPath=/storage
      - --retentionPeriod=12
    restart: unless-stopped

  vminsert:
    image: victoriametrics/vminsert:latest
    ports:
      - 127.0.0.1:8480:8480
    command:
      - --storageNode=vmstorage1:8400
      - --storageNode=vmstorage2:8400
    depends_on: [vmstorage1, vmstorage2]
    restart: unless-stopped

  vmselect:
    image: victoriametrics/vmselect:latest
    ports:
      - 127.0.0.1:8481:8481
    command:
      - --storageNode=vmstorage1:8401
      - --storageNode=vmstorage2:8401
    depends_on: [vmstorage1, vmstorage2]
    restart: unless-stopped

  # vmagent — scrapes Prometheus targets and sends to vminsert
  vmagent:
    image: victoriametrics/vmagent:latest
    ports:
      - 127.0.0.1:8429:8429
    volumes:
      - /home/user/victoriametrics-cluster/prometheus.yml:/etc/prometheus/prometheus.yml:ro,Z
      - vmagent_data:/vmagentdata
    command:
      - --promscrape.config=/etc/prometheus/prometheus.yml
      - --remoteWrite.url=http://vminsert:8480/insert/0/prometheus/api/v1/write
    depends_on: [vminsert]
    restart: unless-stopped

volumes:
  vmstorage1_data:
  vmstorage2_data:
  vmagent_data:
```

```bash
cd ~/victoriametrics-cluster && podman-compose up -d

# Write endpoint (Prometheus remote-write target)
# http://localhost:8480/insert/0/prometheus/api/v1/write

# Query endpoint (use in Grafana datasource)
# http://localhost:8481/select/0/prometheus

# Check storage health
curl http://localhost:8482/health
curl http://localhost:8483/health
```

**Reconfigure Grafana to use the cluster:**
- Data Sources → Prometheus → URL: `http://host.containers.internal:8481/select/0/prometheus`

---

## Etcd Cluster (3-Node)

**Purpose:** Distributed key-value store used for distributed coordination, service discovery, and leader election. Powers Patroni (PostgreSQL HA), Kubernetes, CoreDNS, and many other systems. A 3-node cluster tolerates loss of 1 node.

```yaml
# ~/etcd-cluster/compose.yaml
services:
  etcd1:
    image: bitnami/etcd:latest
    ports:
      - 127.0.0.1:2379:2379
      - 127.0.0.1:2380:2380
    environment:
      ETCD_NAME: etcd1
      ETCD_DATA_DIR: /etcd-data
      ETCD_LISTEN_CLIENT_URLS: http://0.0.0.0:2379
      ETCD_ADVERTISE_CLIENT_URLS: http://etcd1:2379
      ETCD_LISTEN_PEER_URLS: http://0.0.0.0:2380
      ETCD_INITIAL_ADVERTISE_PEER_URLS: http://etcd1:2380
      ETCD_INITIAL_CLUSTER: etcd1=http://etcd1:2380,etcd2=http://etcd2:2380,etcd3=http://etcd3:2380
      ETCD_INITIAL_CLUSTER_STATE: new
      ALLOW_NONE_AUTHENTICATION: "yes"
    volumes:
      - etcd1_data:/etcd-data
    restart: unless-stopped

  etcd2:
    image: bitnami/etcd:latest
    ports:
      - 127.0.0.1:2381:2379
      - 127.0.0.1:2382:2380
    environment:
      ETCD_NAME: etcd2
      ETCD_DATA_DIR: /etcd-data
      ETCD_LISTEN_CLIENT_URLS: http://0.0.0.0:2379
      ETCD_ADVERTISE_CLIENT_URLS: http://etcd2:2379
      ETCD_LISTEN_PEER_URLS: http://0.0.0.0:2380
      ETCD_INITIAL_ADVERTISE_PEER_URLS: http://etcd2:2380
      ETCD_INITIAL_CLUSTER: etcd1=http://etcd1:2380,etcd2=http://etcd2:2380,etcd3=http://etcd3:2380
      ETCD_INITIAL_CLUSTER_STATE: new
      ALLOW_NONE_AUTHENTICATION: "yes"
    volumes:
      - etcd2_data:/etcd-data
    restart: unless-stopped

  etcd3:
    image: bitnami/etcd:latest
    ports:
      - 127.0.0.1:2383:2379
      - 127.0.0.1:2384:2380
    environment:
      ETCD_NAME: etcd3
      ETCD_DATA_DIR: /etcd-data
      ETCD_LISTEN_CLIENT_URLS: http://0.0.0.0:2379
      ETCD_ADVERTISE_CLIENT_URLS: http://etcd3:2379
      ETCD_LISTEN_PEER_URLS: http://0.0.0.0:2380
      ETCD_INITIAL_ADVERTISE_PEER_URLS: http://etcd3:2380
      ETCD_INITIAL_CLUSTER: etcd1=http://etcd1:2380,etcd2=http://etcd2:2380,etcd3=http://etcd3:2380
      ETCD_INITIAL_CLUSTER_STATE: new
      ALLOW_NONE_AUTHENTICATION: "yes"
    volumes:
      - etcd3_data:/etcd-data
    restart: unless-stopped

volumes:
  etcd1_data:
  etcd2_data:
  etcd3_data:
```

```bash
cd ~/etcd-cluster && podman-compose up -d

# Check member list
podman exec etcd-cluster-etcd1-1 etcdctl \
  --endpoints=http://etcd1:2379,http://etcd2:2379,http://etcd3:2379 \
  member list

# Check cluster health
podman exec etcd-cluster-etcd1-1 etcdctl \
  --endpoints=http://etcd1:2379,http://etcd2:2379,http://etcd3:2379 \
  endpoint health

# Put and get a key
podman exec etcd-cluster-etcd1-1 etcdctl \
  --endpoints=http://etcd1:2379 put /mykey "hello"
podman exec etcd-cluster-etcd1-1 etcdctl \
  --endpoints=http://etcd1:2379 get /mykey
```

---

## Choosing the Right HA Strategy

| Service | Strategy | Compose File | Tolerates Node Loss |
|---------|----------|-------------|---------------------|
| PostgreSQL | Patroni + etcd + HAProxy | `~/patroni/` | 1 of 2 |
| Redis / Valkey | Sentinel (3 sentinels + replicas) | `~/redis-sentinel/` | 1 of 3 |
| Redis / Valkey | Native Cluster (6 nodes, 3+3) | `~/valkey-cluster/` | 1 per shard |
| MongoDB | Replica Set (3 nodes) | `~/mongodb-rs/` | 1 of 3 |
| Kafka | KRaft (3 nodes) | `~/kafka-cluster/` | 1 of 3 |
| Cassandra | Ring (3 nodes, RF=3) | `~/cassandra-cluster/` | 1 of 3 |
| ScyllaDB | Ring (3 nodes, RF=3) | `~/scylladb-cluster/` | 1 of 3 |
| RabbitMQ | Cluster + Quorum Queues | `~/rabbitmq-cluster/` | 1 of 3 |
| Elasticsearch | 3-node master/data | `~/elk-cluster/` | 1 of 3 |
| OpenSearch | 3-node cluster manager | `~/opensearch-cluster/` | 1 of 3 |
| VictoriaMetrics | vminsert/vmselect/vmstorage | `~/victoriametrics-cluster/` | 1 of 2 storage |
| etcd | 3-node Raft | `~/etcd-cluster/` | 1 of 3 |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Elasticsearch / OpenSearch `vm.max_map_count too low` | Run `sudo sysctl -w vm.max_map_count=262144` on the host and persist in `/etc/sysctl.d/99-elasticsearch.conf` — required on all nodes |
| Elasticsearch cluster status RED | Check unassigned shards: `curl localhost:9200/_cat/shards?v \| grep UNASSIGNED`; caused by a data node being down or replicas exceeding available nodes |
| Elasticsearch `master not discovered` on start | `cluster.initial_master_nodes` must list all master-eligible node names exactly; remove this setting after first cluster formation |
| Elasticsearch split-brain | Use exactly 3 or 5 master-eligible nodes; verify all nodes can reach each other on port `9300`; confirm `cluster.name` is identical across nodes |
| OpenSearch `cluster_manager not discovered` | OpenSearch renamed `master` → `cluster_manager`; set `cluster.initial_cluster_manager_nodes` (not `initial_master_nodes`) |
| OpenSearch UNASSIGNED shards | For single-node test clusters set `number_of_replicas: 0`; a single node cannot host its own replicas |
| Kafka brokers not forming cluster | Confirm all nodes share the same `CLUSTER_ID`; generate once with `kafka-storage random-uuid`; verify `KAFKA_CONTROLLER_QUORUM_VOTERS` lists all node IDs and hostnames correctly |
| Kafka consumer lag growing | Increase partition count or add consumer instances; verify no consumer is crashing on startup with `podman logs` |
| Patroni `no leader` after start | etcd must be fully healthy before Patroni starts; check `curl http://etcd:2379/health`; verify all Patroni nodes can reach etcd |
| Patroni failover not triggering | Check `podman logs` on all Patroni nodes; verify `PATRONI_ETCD3_HOSTS` is reachable; confirm `down-after-milliseconds` hasn't been set too high |
| Redis Sentinel not promoting | Quorum requires at least 2 of 3 sentinels to agree the primary is down; ensure all 3 sentinel containers are running; check `sentinel masters` for the current primary state |
| Valkey Cluster `MOVED` errors | Your client is not cluster-aware; use a Redis Cluster client (redis-py with `RedisCluster`, ioredis in cluster mode) — plain clients don't follow slot redirects |
| Valkey Cluster `CLUSTERDOWN` | At least one shard has no available primary; check `cluster nodes` for failed nodes; recover or remove the failed node with `cluster forget` |
| MongoDB replica set not electing primary | Needs 3 nodes for majority quorum (2 of 3); verify all 3 mongod processes are running and can reach each other on port `27017` |
| MongoDB `rs.initiate()` fails | Run only from mongo1 once all 3 containers are fully started (check `podman logs`); the hostnames in `members[].host` must resolve inside the compose network |
| RabbitMQ nodes not joining cluster | `RABBITMQ_ERLANG_COOKIE` must be byte-for-byte identical on all nodes; verify with `podman exec rabbitmq1 cat /var/lib/rabbitmq/.erlang.cookie` |
| RabbitMQ `mnesia` partition after restart | Run `rabbitmqctl cluster_status` on all nodes; resolve with `rabbitmqctl forget_cluster_node <node>` and re-join the stale node |
| Cassandra / ScyllaDB node not joining | Cassandra takes 30–60 s to fully start; bring up the seed node first and wait before starting additional nodes; check `nodetool status` for the token ring |
| etcd cluster not reaching quorum | All 3 members must be able to reach each other on peer port `2380`; verify `ETCD_INITIAL_CLUSTER` lists the same URLs on all nodes |
| VictoriaMetrics vminsert rejected writes | Verify `--storageNode` addresses resolve from the vminsert container; check `podman logs vminsert` for connectivity errors to vmstorage nodes |
