---
title: Databases & Caches
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Databases & Caches

Relational, document, caching, time-series, vector, graph, wide-column, streaming, and full-text search engines. All run rootless with persistent volumes mounted via `:Z`.

---

## MariaDB / MySQL

**Purpose:** Open-source relational database for web apps, CMS platforms, and legacy software stacks.

```bash
podman run -d \
  --name mariadb \
  -p 127.0.0.1:3306:3306 \
  -e MYSQL_ROOT_PASSWORD=strongpassword \
  -e MYSQL_DATABASE=mydb \
  -e MYSQL_USER=myuser \
  -e MYSQL_PASSWORD=myuserpass \
  -v mariadb_data:/var/lib/mysql \
  --restart unless-stopped \
  mariadb:11
```

> **Connect**: `podman exec -it mariadb mariadb -u myuser -p mydb`
> **Backup**: `podman exec mariadb mariadb-dump -u root -p mydb > backup.sql`

---

## PostgreSQL

**Purpose:** Advanced, standards-compliant relational database known for complex queries, JSONB support, full-text search, and extensibility. Preferred database for most modern self-hosted apps.

```bash
podman run -d \
  --name postgres \
  -p 127.0.0.1:5432:5432 \
  -e POSTGRES_USER=myuser \
  -e POSTGRES_PASSWORD=strongpassword \
  -e POSTGRES_DB=mydb \
  -v postgres_data:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16-alpine
```

> **Connect**: `podman exec -it postgres psql -U myuser -d mydb`
> **Backup**: `podman exec postgres pg_dump -U myuser mydb > backup.sql`
> **GUI**: pgAdmin (see below)

**pgAdmin (PostgreSQL GUI):**
```bash
podman run -d \
  --name pgadmin \
  -p 127.0.0.1:5050:80 \
  -e PGADMIN_DEFAULT_EMAIL=admin@example.com \
  -e PGADMIN_DEFAULT_PASSWORD=admin \
  --restart unless-stopped \
  dpage/pgadmin4
```

---

## Redis

**Purpose:** High-performance in-memory data store used for caching, session management, message brokering, and real-time analytics. Used as a dependency by Nextcloud, Immich, Authentik, and many others.

```bash
podman run -d \
  --name redis \
  -p 127.0.0.1:6379:6379 \
  -v redis_data:/data \
  --restart unless-stopped \
  redis:7-alpine redis-server --appendonly yes
```

> **Test**: `podman exec -it redis redis-cli ping`
> **Monitor**: `podman exec -it redis redis-cli monitor`

---

## Valkey

**Purpose:** The Linux Foundation's open-source fork of Redis, created after the Redis licence change. Drop-in compatible with all Redis clients — just swap the image. Recommended if you want fully open-source Redis semantics under the BSD licence going forward.

```bash
podman run -d \
  --name valkey \
  -p 127.0.0.1:6379:6379 \
  -v valkey_data:/data \
  --restart unless-stopped \
  valkey/valkey:8-alpine valkey-server --appendonly yes
```

> Valkey is wire-protocol compatible with Redis 7.2. Any Jedis, redis-py, or ioredis client connects without modification.

---

## KeyDB

**Purpose:** Multithreaded Redis fork optimized for modern multi-core CPUs. Drop-in compatible with all Redis clients — just swap the image. Benchmark: KeyDB typically achieves 2–5× higher throughput than Redis on multi-core hosts.

```bash
podman run -d \
  --name keydb \
  -p 127.0.0.1:6379:6379 \
  -v keydb_data:/data \
  --restart unless-stopped \
  eqalpha/keydb:alpine
```

---

## MongoDB

**Purpose:** Flexible document database optimized for JSON-like storage, rapid development cycles, and unstructured data models.

```bash
podman run -d \
  --name mongodb \
  -p 127.0.0.1:27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=strongpassword \
  -v mongodb_data:/data/db \
  --restart unless-stopped \
  mongo:7
```

> **GUI**: Mongo Express — `podman run -d --name mongo-express -p 127.0.0.1:8081:8081 -e ME_CONFIG_MONGODB_ADMINUSERNAME=admin -e ME_CONFIG_MONGODB_ADMINPASSWORD=strongpassword -e ME_CONFIG_MONGODB_URL="mongodb://admin:strongpassword@host.containers.internal:27017/" --restart unless-stopped mongo-express`

---

## Apache Kafka

**Purpose:** Distributed event streaming platform. Kafka is the backbone of event-driven architectures, real-time data pipelines, log aggregation, and stream processing. Producers publish events to topics; consumers read them with durable, replayable, ordered delivery. Kafka handles millions of events per second and retains them for configurable durations.

```yaml
# ~/kafka/compose.yml
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.6.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    volumes: [zk_data:/var/lib/zookeeper/data, zk_logs:/var/lib/zookeeper/log]
    restart: unless-stopped

  kafka:
    image: confluentinc/cp-kafka:7.6.0
    ports:
      - "127.0.0.1:9092:9092"
      - "127.0.0.1:29092:29092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
      KAFKA_LOG_RETENTION_HOURS: 168
    volumes: [kafka_data:/var/lib/kafka/data]
    depends_on: [zookeeper]
    restart: unless-stopped

  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    ports: ["127.0.0.1:8080:8080"]
    environment:
      KAFKA_CLUSTERS_0_NAME: local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:29092
      KAFKA_CLUSTERS_0_ZOOKEEPER: zookeeper:2181
    depends_on: [kafka]
    restart: unless-stopped

volumes:
  zk_data:
  zk_logs:
  kafka_data:
```

> **Alternative: KRaft mode (no ZooKeeper)** — Kafka 3.3+ supports KRaft for simplified operation. See the `confluentinc/cp-kafka` KRaft examples in the Confluent docs.

**Common operations:**
```bash
# Create a topic
podman exec kafka kafka-topics \
  --bootstrap-server localhost:29092 \
  --create --topic my-topic --partitions 3 --replication-factor 1

# List topics
podman exec kafka kafka-topics \
  --bootstrap-server localhost:29092 --list

# Produce messages
podman exec -it kafka kafka-console-producer \
  --bootstrap-server localhost:29092 --topic my-topic

# Consume messages from the beginning
podman exec -it kafka kafka-console-consumer \
  --bootstrap-server localhost:29092 --topic my-topic --from-beginning

# Check consumer group lag
podman exec kafka kafka-consumer-groups \
  --bootstrap-server localhost:29092 --describe --group my-group
```

**Access Kafka UI** at `http://localhost:8080` for a web-based view of topics, consumer groups, and message browsing.

---

## Redpanda (Kafka-Compatible, No JVM)

**Purpose:** Kafka-compatible event streaming platform written in C++. Runs without ZooKeeper, uses a fraction of the memory and CPU of Kafka, and starts in seconds. Ideal for development, smaller deployments, and self-hosted setups where Kafka's JVM overhead is undesirable.

```bash
podman run -d \
  --name redpanda \
  -p 127.0.0.1:9092:9092 \
  -p 127.0.0.1:9644:9644 \
  -p 127.0.0.1:8081:8081 \
  -v /home/user/redpanda/data:/var/lib/redpanda/data:Z \
  --restart unless-stopped \
  redpandadata/redpanda:latest \
  redpanda start \
    --node-id 0 \
    --kafka-addr 0.0.0.0:9092 \
    --advertise-kafka-addr localhost:9092 \
    --schema-registry-addr 0.0.0.0:8081 \
    --rpc-addr 0.0.0.0:33145 \
    --advertise-rpc-addr redpanda:33145 \
    --mode dev-container

# Redpanda Console (web UI)
podman run -d \
  --name redpanda-console \
  -p 127.0.0.1:8080:8080 \
  -e KAFKA_BROKERS=host.containers.internal:9092 \
  --restart unless-stopped \
  docker.redpanda.com/redpandadata/console:latest
```

> Redpanda is fully compatible with the Kafka API — any Kafka client (Confluent SDK, librdkafka, kafka-python) connects without modification.

---

## Neo4j (Graph Database)

**Purpose:** The leading native graph database. Stores data as nodes and relationships — ideal for social networks, recommendation engines, fraud detection, knowledge graphs, dependency trees, and any domain where connections between data points are as important as the data itself. Queried with the Cypher query language.

```bash
podman run -d \
  --name neo4j \
  -p 127.0.0.1:7474:7474 \
  -p 127.0.0.1:7687:7687 \
  -v /home/user/neo4j/data:/data:Z \
  -v /home/user/neo4j/logs:/logs:Z \
  -v /home/user/neo4j/import:/var/lib/neo4j/import:Z \
  -e NEO4J_AUTH=neo4j/strongpassword \
  -e NEO4J_PLUGINS='["apoc", "graph-data-science"]' \
  -e NEO4J_dbms_memory_heap_initial__size=512m \
  -e NEO4J_dbms_memory_heap_max__size=2g \
  --restart unless-stopped \
  neo4j:5
```

> **Browser UI**: `http://localhost:7474` — interactive graph explorer and Cypher query editor.
> **Bolt driver**: `bolt://localhost:7687`

**Example Cypher queries:**
```cypher
-- Create nodes and a relationship
CREATE (alice:Person {name: 'Alice', age: 30})-[:KNOWS]->(bob:Person {name: 'Bob', age: 25})

-- Find shortest path between two people
MATCH p=shortestPath((a:Person {name:'Alice'})-[*]-(b:Person {name:'Bob'})) RETURN p

-- Recommendation: friends of friends not already known
MATCH (me:Person {name: 'Alice'})-[:KNOWS]-(friend)-[:KNOWS]-(fof)
WHERE NOT (me)-[:KNOWS]-(fof) AND fof <> me
RETURN fof.name, count(*) AS mutual ORDER BY mutual DESC

-- Detect communities (requires GDS plugin)
CALL gds.louvain.stream('myGraph') YIELD nodeId, communityId
RETURN gds.util.asNode(nodeId).name AS name, communityId
ORDER BY communityId
```

**APOC (Awesome Procedures on Cypher)** adds 450+ utility procedures for data import, refactoring, and graph algorithms — included via `NEO4J_PLUGINS` above.

---

## Apache Cassandra

**Purpose:** Wide-column NoSQL database designed for massive write throughput and linear horizontal scalability. No single point of failure. Ideal for IoT telemetry, event logs, time-series data at scale, and any workload where you need to write millions of rows per second across geographically distributed nodes.

```bash
podman run -d \
  --name cassandra \
  -p 127.0.0.1:9042:9042 \
  -v /home/user/cassandra/data:/var/lib/cassandra:Z \
  -e CASSANDRA_CLUSTER_NAME=HomeCluster \
  -e CASSANDRA_DC=dc1 \
  -e CASSANDRA_RACK=rack1 \
  -e HEAP_NEWSIZE=128m \
  -e MAX_HEAP_SIZE=1g \
  --restart unless-stopped \
  cassandra:5
```

**Connect and run CQL:**
```bash
podman exec -it cassandra cqlsh

# Create keyspace and table
CREATE KEYSPACE iot WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};
USE iot;
CREATE TABLE sensor_readings (
  device_id UUID,
  timestamp TIMESTAMP,
  temperature FLOAT,
  humidity FLOAT,
  PRIMARY KEY (device_id, timestamp)
) WITH CLUSTERING ORDER BY (timestamp DESC);

# Insert and query
INSERT INTO sensor_readings (device_id, timestamp, temperature, humidity)
  VALUES (uuid(), toTimestamp(now()), 22.5, 65.0);
SELECT * FROM sensor_readings WHERE device_id = <uuid> LIMIT 100;
```

> Cassandra requires at least 2 GB RAM for a single node. Use `MAX_HEAP_SIZE=512m` on memory-constrained servers.

---

## ScyllaDB (Cassandra-Compatible, C++)

**Purpose:** Drop-in Cassandra replacement written in C++. Uses a shard-per-core architecture to eliminate the JVM, garbage collection pauses, and most Cassandra bottlenecks — delivering 10× better latency and throughput on the same hardware. Fully compatible with the CQL wire protocol and Cassandra client drivers.

```bash
podman run -d \
  --name scylladb \
  -p 127.0.0.1:9042:9042 \
  -p 127.0.0.1:10000:10000 \
  -v /home/user/scylladb/data:/var/lib/scylla:Z \
  --cpuset-cpus 0-3 \
  --restart unless-stopped \
  scylladb/scylla:6 \
    --developer-mode 1 \
    --seeds scylladb

# Connect with cqlsh (same as Cassandra)
podman exec -it scylladb cqlsh
```

> ScyllaDB is the recommended replacement for Cassandra in new deployments. Any code written against the Cassandra CQL API runs unmodified against ScyllaDB.

---

## CockroachDB (Distributed PostgreSQL)

**Purpose:** Distributed SQL database with strong ACID guarantees, automatic sharding, and survivable multi-node operation. Wire-compatible with PostgreSQL — connect with `psql` or any Postgres driver. Ideal for applications that need horizontal write scaling or multi-region data residency while keeping SQL semantics.

```bash
podman run -d \
  --name cockroachdb \
  -p 127.0.0.1:26257:26257 \
  -p 127.0.0.1:8081:8080 \
  -v /home/user/cockroachdb/data:/cockroach/cockroach-data:Z \
  --restart unless-stopped \
  cockroachdb/cockroach:latest start-single-node \
    --insecure \
    --http-addr=0.0.0.0:8080

# Connect with cockroach SQL (PostgreSQL-compatible)
podman exec -it cockroachdb cockroach sql --insecure

# Or with psql
psql -h localhost -p 26257 -U root defaultdb
```

> The Admin UI is at `http://localhost:8081`. It shows query plans, node health, slow queries, and schema inspector in real time.

**Create a database and user:**
```sql
CREATE DATABASE myapp;
CREATE USER myuser WITH PASSWORD 'strongpassword';
GRANT ALL ON DATABASE myapp TO myuser;
```

> For production, use TLS and the `--secure` flag. The insecure mode is suitable for local/internal-only deployments.

---

## TimescaleDB (Time-Series PostgreSQL)

**Purpose:** PostgreSQL extension that adds native time-series storage, hypertables, continuous aggregates, compression, and data retention policies. Query with standard SQL. Because it is just PostgreSQL, all your existing tools (pgAdmin, Grafana, ORMs) work without modification — you just get 100× faster time-series queries.

```bash
podman run -d \
  --name timescaledb \
  -p 127.0.0.1:5433:5432 \
  -e POSTGRES_USER=myuser \
  -e POSTGRES_PASSWORD=strongpassword \
  -e POSTGRES_DB=metrics \
  -v timescale_data:/var/lib/postgresql/data \
  --restart unless-stopped \
  timescale/timescaledb:latest-pg16
```

**Set up a hypertable:**
```sql
-- Connect: psql -h localhost -p 5433 -U myuser -d metrics

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE sensor_data (
  time        TIMESTAMPTZ NOT NULL,
  device_id   TEXT NOT NULL,
  temperature DOUBLE PRECISION,
  humidity    DOUBLE PRECISION
);

-- Convert to hypertable (auto-partitioned by time)
SELECT create_hypertable('sensor_data', 'time');

-- Add automatic compression after 7 days
ALTER TABLE sensor_data SET (timescaledb.compress, timescaledb.compress_segmentby = 'device_id');
SELECT add_compression_policy('sensor_data', INTERVAL '7 days');

-- Add data retention (drop data older than 1 year)
SELECT add_retention_policy('sensor_data', INTERVAL '1 year');

-- Continuous aggregate (materialised 1-hour averages, auto-refreshed)
CREATE MATERIALIZED VIEW sensor_hourly
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', time) AS bucket, device_id,
       AVG(temperature) AS avg_temp, AVG(humidity) AS avg_humidity
FROM sensor_data GROUP BY bucket, device_id;
```

> Connect Grafana's TimescaleDB datasource to this instance for instant time-series dashboards with no extra tooling.

---

## MeiliSearch

**Purpose:** Lightning-fast, typo-tolerant full-text search engine designed for easy integration into web apps and dashboards. Simple REST API, no query language to learn.

```bash
podman run -d \
  --name meilisearch \
  -p 127.0.0.1:7700:7700 \
  -v meilisearch_data:/meili_data \
  -e MEILI_MASTER_KEY=changeme \
  --restart unless-stopped \
  getmeili/meilisearch:latest
```

**Index documents and search:**
```bash
# Add documents to an index
curl -X POST http://localhost:7700/indexes/movies/documents \
  -H "Authorization: Bearer changeme" \
  -H "Content-Type: application/json" \
  -d '[{"id":1,"title":"Inception","genre":"Sci-Fi"},{"id":2,"title":"The Matrix","genre":"Sci-Fi"}]'

# Search (typo-tolerant)
curl "http://localhost:7700/indexes/movies/search?q=inceptoin" \
  -H "Authorization: Bearer changeme"
```

---

## InfluxDB

**Purpose:** High-performance time-series database. Optimised for metrics, IoT telemetry, and real-time analytics. Used with Home Assistant and Grafana dashboards.

```bash
podman run -d \
  --name influxdb \
  -p 127.0.0.1:8086:8086 \
  -v influxdb_data:/var/lib/influxdb2 \
  -e DOCKER_INFLUXDB_INIT_MODE=setup \
  -e DOCKER_INFLUXDB_INIT_USERNAME=admin \
  -e DOCKER_INFLUXDB_INIT_PASSWORD=strongpassword \
  -e DOCKER_INFLUXDB_INIT_ORG=home \
  -e DOCKER_INFLUXDB_INIT_BUCKET=metrics \
  --restart unless-stopped \
  influxdb:2
```

---

## Elasticsearch

**Purpose:** Distributed search and analytics engine powering log analysis, full-text search, and observability (ELK stack).

```bash
podman run -d \
  --name elasticsearch \
  -p 127.0.0.1:9200:9200 \
  -v elasticsearch_data:/usr/share/elasticsearch/data \
  -e discovery.type=single-node \
  -e xpack.security.enabled=false \
  -e ES_JAVA_OPTS="-Xms512m -Xmx1g" \
  --restart unless-stopped \
  docker.elastic.co/elasticsearch/elasticsearch:8.15.0
```

**Kibana (Elasticsearch UI):**
```bash
podman run -d \
  --name kibana \
  -p 127.0.0.1:5601:5601 \
  -e ELASTICSEARCH_HOSTS=http://host.containers.internal:9200 \
  --restart unless-stopped \
  docker.elastic.co/kibana/kibana:8.15.0
```

---

## OpenSearch (AWS Elasticsearch Fork)

**Purpose:** Fully open-source fork of Elasticsearch and Kibana under the Apache 2.0 licence. Drop-in API compatible with Elasticsearch 7.10. Preferred if you need the full ELK-equivalent stack without the Elastic licence restrictions.

```yaml
# ~/opensearch/compose.yml
services:
  opensearch:
    image: opensearchproject/opensearch:2
    ports: ["127.0.0.1:9200:9200", "127.0.0.1:9600:9600"]
    environment:
      discovery.type: single-node
      DISABLE_SECURITY_PLUGIN: "true"
      OPENSEARCH_JAVA_OPTS: "-Xms512m -Xmx1g"
    volumes: [opensearch_data:/usr/share/opensearch/data]
    restart: unless-stopped

  opensearch-dashboards:
    image: opensearchproject/opensearch-dashboards:2
    ports: ["127.0.0.1:5601:5601"]
    environment:
      OPENSEARCH_HOSTS: '["http://opensearch:9200"]'
      DISABLE_SECURITY_DASHBOARDS_PLUGIN: "true"
    depends_on: [opensearch]
    restart: unless-stopped

volumes:
  opensearch_data:
```

---

## Qdrant (Vector Database)

**Purpose:** High-performance vector similarity search engine. Used with AI/LLM applications for semantic search, RAG (Retrieval-Augmented Generation) pipelines, and recommendation systems. Connect to Ollama and Open WebUI for document-aware AI chat. See the [AI & LLMs wiki](https://docs.shani.dev/doc/servers/ai-llms) for the Ollama and Open WebUI setup.

```bash
podman run -d \
  --name qdrant \
  -p 127.0.0.1:6333:6333 \
  -p 127.0.0.1:6334:6334 \
  -v /home/user/qdrant/storage:/qdrant/storage:Z \
  --restart unless-stopped \
  qdrant/qdrant:latest
```

> **REST API**: `http://localhost:6333`
> **gRPC**: `localhost:6334`
> **Web UI**: `http://localhost:6333/dashboard`

---

## Weaviate (Vector Database with Built-In ML)

**Purpose:** Vector database with native modules for text, image, and multi-modal embeddings — no separate embedding service required. Supports hybrid search (vector + BM25 keyword), GraphQL API, and REST. Good choice when you want automatic vectorisation without managing a separate model server. The `text2vec-ollama` module connects directly to a local Ollama instance — see the [AI & LLMs wiki](https://docs.shani.dev/doc/servers/ai-llms).

```yaml
# ~/weaviate/compose.yml
services:
  weaviate:
    image: cr.weaviate.io/semitechnologies/weaviate:latest
    ports: ["127.0.0.1:8080:8080", "127.0.0.1:50051:50051"]
    volumes: [weaviate_data:/var/lib/weaviate]
    environment:
      QUERY_DEFAULTS_LIMIT: 25
      AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED: "true"
      PERSISTENCE_DATA_PATH: /var/lib/weaviate
      DEFAULT_VECTORIZER_MODULE: text2vec-ollama
      ENABLE_MODULES: text2vec-ollama,generative-ollama
      TEXT2VEC_OLLAMA_APIENDPOINT: http://host.containers.internal:11434
      TEXT2VEC_OLLAMA_MODEL: nomic-embed-text
      GENERATIVE_OLLAMA_APIENDPOINT: http://host.containers.internal:11434
    restart: unless-stopped

volumes:
  weaviate_data:
```

> Weaviate's `text2vec-ollama` module connects to your local Ollama for embeddings — no OpenAI API key needed.

---

## SQLite via Litestream

**Purpose:** Streams SQLite WAL changes to S3-compatible storage in real time — continuous off-site replication with sub-second RPO for any app using SQLite, with no code changes required.

See the [Backups & Sync wiki](https://docs.shani.dev/doc/servers/backups-sync#litestream-sqlite-continuous-replication) for the full Litestream setup, including `litestream.yml` configuration, MinIO integration, and restore procedure.

---

## Adminer

**Purpose:** Lightweight, single-file database management interface supporting MySQL, PostgreSQL, SQLite, and Oracle. Useful for quick inspection without installing a full GUI.

```bash
podman run -d \
  --name adminer \
  -p 127.0.0.1:8089:8080 \
  --restart unless-stopped \
  adminer
```

---

## PHP-FPM Stack

**Purpose:** Run PHP applications like WordPress or Laravel with a dedicated FastCGI processor.

```yaml
# ~/php-stack/compose.yml
services:
  nginx:
    image: nginx:alpine
    ports: ["127.0.0.1:8080:80"]
    volumes:
      - ./www:/var/www/html:ro,Z
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro,Z
    depends_on: [php]
  php:
    image: php:8.3-fpm-alpine
    volumes:
      - ./www:/var/www/html:Z
    depends_on: [db]
  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: rootpass
      MYSQL_DATABASE: myapp
      MYSQL_USER: appuser
      MYSQL_PASSWORD: apppass
    volumes: [db_data:/var/lib/mysql]
volumes: {db_data: {}}
```

---

## RabbitMQ (Message Broker)

**Purpose:** The most widely deployed open-source message broker. Implements AMQP, MQTT, and STOMP. Use RabbitMQ when you need reliable task queues, fanout messaging, dead-letter exchanges, message acknowledgement, and per-message TTL — workloads where Kafka's log-based model is overkill and you need traditional queue semantics (messages consumed and deleted). Used by Celery, Sidekiq, and most web framework background job systems.

```bash
podman run -d \
  --name rabbitmq \
  -p 127.0.0.1:5672:5672 \
  -p 127.0.0.1:15672:15672 \
  -v /home/user/rabbitmq/data:/var/lib/rabbitmq:Z \
  -e RABBITMQ_DEFAULT_USER=admin \
  -e RABBITMQ_DEFAULT_PASS=changeme \
  --restart unless-stopped \
  rabbitmq:3-management-alpine
```

> **Management UI:** `http://localhost:15672` — browse queues, exchanges, bindings, and message rates in real time.

**Common operations:**
```bash
# List queues
podman exec rabbitmq rabbitmqctl list_queues name messages consumers

# Declare a queue and publish a test message
podman exec rabbitmq rabbitmqadmin \
  -u admin -p changeme \
  publish exchange=amq.default routing_key=test payload='{"hello": "world"}'

# Purge a queue
podman exec rabbitmq rabbitmqctl purge_queue my-queue
```

> **Kafka vs RabbitMQ:** Use Kafka for high-throughput event streaming where consumers need to replay history. Use RabbitMQ for task queues, RPC patterns, and workloads where each message is processed once and then discarded.

---

## NATS (Lightweight Messaging)

**Purpose:** High-performance, cloud-native messaging system. Core NATS is a simple publish/subscribe with at-most-once delivery. JetStream (built-in) adds persistent streams, at-least-once delivery, key-value store, and object store — all in a single ~20 MB binary with no external dependencies. Much lighter than Kafka or RabbitMQ for most microservice messaging patterns.

```bash
podman run -d \
  --name nats \
  -p 127.0.0.1:4222:4222 \
  -p 127.0.0.1:8222:8222 \
  -v /home/user/nats/data:/data:Z \
  -v /home/user/nats/nats.conf:/etc/nats/nats.conf:ro,Z \
  --restart unless-stopped \
  nats:alpine -c /etc/nats/nats.conf
```

**Minimal `nats.conf` with JetStream:**
```conf
port: 4222
http_port: 8222

jetstream {
  store_dir: /data
  max_memory_store: 1GB
  max_file_store: 10GB
}

authorization {
  user: nats
  password: changeme
}
```

**Publish and subscribe (using nats CLI):**
```bash
# Subscribe (terminal 1)
podman run --rm -it natsio/nats-box \
  nats -s nats://nats:changeme@host.containers.internal:4222 sub "orders.>"

# Publish (terminal 2)
podman run --rm natsio/nats-box \
  nats -s nats://nats:changeme@host.containers.internal:4222 pub "orders.new" '{"id":1}'
```

---

## Typesense (Fast Search Engine)

**Purpose:** Open-source typo-tolerant search engine optimised for instant, as-you-type results. Faster and simpler to operate than Elasticsearch or MeiliSearch for most use cases — zero configuration needed, sub-50ms queries on millions of documents, and a clean REST API. Ideal for e-commerce search, documentation search, and app-level search.

```bash
podman run -d \
  --name typesense \
  -p 127.0.0.1:8108:8108 \
  -v /home/user/typesense/data:/data:Z \
  -e TYPESENSE_DATA_DIR=/data \
  -e TYPESENSE_API_KEY=changeme \
  --restart unless-stopped \
  typesense/typesense:latest
```

**Create a collection and index documents:**
```bash
# Create a collection (schema)
curl http://localhost:8108/collections \
  -H "X-TYPESENSE-API-KEY: changeme" \
  -H "Content-Type: application/json" \
  -d '{"name":"products","fields":[{"name":"name","type":"string"},{"name":"price","type":"float"},{"name":"rating","type":"int32"}],"default_sorting_field":"rating"}'

# Index documents
curl http://localhost:8108/collections/products/documents/import \
  -H "X-TYPESENSE-API-KEY: changeme" \
  -H "Content-Type: text/plain" \
  --data-binary '{"name":"Laptop","price":999.99,"rating":5}
{"name":"Mouse","price":29.99,"rating":4}'

# Search (typo-tolerant)
curl "http://localhost:8108/collections/products/documents/search?q=latp&query_by=name" \
  -H "X-TYPESENSE-API-KEY: changeme"
```

> **MeiliSearch vs Typesense:** Both are fast and typo-tolerant. Typesense has a stricter schema, better multi-tenancy, and faster faceting. MeiliSearch has a more flexible schema-optional API and better out-of-box relevancy tuning.

---

## DuckDB (Embedded OLAP)

**Purpose:** In-process analytical database — think SQLite but for analytics. Runs inside your application process, needs no server, and executes columnar OLAP queries directly on Parquet, CSV, and JSON files at speeds that beat most dedicated databases for local workloads. Ideal for data analysis scripts, Jupyter notebooks, and ETL pipelines where you don't want to spin up a full ClickHouse or Postgres instance.

```bash
# Run DuckDB interactively
podman run --rm -it \
  -v /home/user/data:/data:ro,Z \
  datacatering/duckdb:latest

# Query a Parquet file directly (no import needed)
podman run --rm \
  -v /home/user/data:/data:ro,Z \
  datacatering/duckdb:latest \
  duckdb -c "SELECT year, SUM(revenue) FROM '/data/sales.parquet' GROUP BY year ORDER BY year"

# DuckDB REST API (MotherDuck alternative, self-hosted)
podman run -d \
  --name duckdb-api \
  -p 127.0.0.1:1294:1294 \
  -v /home/user/duckdb:/duckdb:Z \
  --restart unless-stopped \
  ghcr.io/tobilg/duckdb-api:latest
```

> DuckDB can read directly from S3/MinIO, InfluxDB line protocol files, and PostgreSQL — making it a powerful ad-hoc query layer over your existing data stores without ETL.

---

## SurrealDB (Multi-Model Database)

**Purpose:** A single database that acts as relational, document, graph, and time-series store simultaneously. One query language (SurrealQL — SQL-like) handles joins, graph traversals, computed fields, and live queries (WebSocket-based change streams). Useful when your data model doesn't fit neatly into relational or document paradigms, or when you want to avoid managing multiple specialised databases.

```bash
podman run -d \
  --name surrealdb \
  -p 127.0.0.1:8000:8000 \
  -v /home/user/surrealdb/data:/data:Z \
  --restart unless-stopped \
  surrealdb/surrealdb:latest start \
    --log debug \
    --user root \
    --pass changeme \
    file:/data/database.db
```

**Connect and run queries:**
```bash
podman exec -it surrealdb surreal sql \
  --conn http://localhost:8000 \
  --user root --pass changeme \
  --ns myns --db mydb

# Create a record
CREATE person:alice SET name = 'Alice', age = 30;

# Graph traversal — people who follow each other
SELECT ->follows->person.name AS following FROM person:alice;

# Live query (streams changes as WebSocket)
LIVE SELECT * FROM orders WHERE status = 'pending';
```

---

## Dragonfly (Modern Redis/Memcached Replacement)

**Purpose:** High-performance, multi-threaded in-memory data store with full Redis and Memcached API compatibility. Dragonfly uses a novel shared-nothing architecture that scales linearly with CPU cores — benchmarks show 25× higher throughput than Redis on a 16-core machine. Drop-in replacement: no code changes, same client libraries, same commands. Useful when a single Redis instance becomes a throughput bottleneck or when you want better memory efficiency (Dragonfly uses 30–40% less RAM than Redis for the same dataset).

```bash
podman run -d \
  --name dragonfly \
  -p 127.0.0.1:6380:6379 \
  -v /home/user/dragonfly/data:/data:Z \
  --ulimit memlock=-1 \
  --restart unless-stopped \
  docker.dragonflydb.io/dragonflydb/dragonfly
```

> Use port `6380` on the host to avoid conflicts with an existing Redis instance. Any Redis client connects to `localhost:6380` without modification. Test with: `podman exec dragonfly redis-cli -p 6379 ping`

---

## FerretDB (MongoDB-Compatible on PostgreSQL)

**Purpose:** An open-source MongoDB-compatible proxy that translates the MongoDB wire protocol to PostgreSQL queries. Use it as a drop-in backend for MongoDB applications — all existing MongoDB drivers, ORMs, and tools (Mongoose, mongosh, MongoDB Compass) connect without changes, but data is stored in PostgreSQL where you can query it with SQL. Ideal for self-hosters who want MongoDB API compatibility without running a separate MongoDB instance.

```yaml
# ~/ferretdb/compose.yml
services:
  ferretdb:
    image: ghcr.io/ferretdb/ferretdb:latest
    ports: ["127.0.0.1:27018:27017"]
    environment:
      FERRETDB_POSTGRESQL_URL: postgres://ferretdb:changeme@db:5432/ferretdb
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ferretdb
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: ferretdb
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

Connect with any MongoDB client: `mongosh mongodb://localhost:27018/mydb`

> **When to use FerretDB vs MongoDB:** Use FerretDB when you want MongoDB API compatibility with PostgreSQL's reliability, ACID guarantees, and operational simplicity. Use MongoDB directly for workloads that rely on change streams, full-text search, or aggregation pipelines not yet covered by FerretDB.

---

## Choosing the Right Database

| Use Case | Recommended Database |
|----------|---------------------|
| General-purpose relational, web apps | PostgreSQL |
| Legacy PHP apps, WordPress | MariaDB |
| Caching, sessions, pub/sub | Redis / Valkey |
| High-throughput caching (multi-core) | Dragonfly / KeyDB |
| Document storage, flexible schema | MongoDB |
| MongoDB API on PostgreSQL storage | FerretDB |
| Event streaming, data pipelines | Kafka / Redpanda |
| Task queues, worker jobs, RPC | RabbitMQ |
| Lightweight pub/sub + KV + streams | NATS JetStream |
| Graph data, social networks, recommendations | Neo4j |
| IoT telemetry, time-series at scale | Cassandra / ScyllaDB |
| Time-series with SQL & PostgreSQL tooling | TimescaleDB |
| Horizontal SQL scaling, multi-region | CockroachDB |
| Full-text search (simple, fast) | Typesense / MeiliSearch |
| Full-text search (enterprise scale) | Elasticsearch / OpenSearch |
| Vector/semantic search (AI/RAG) | Qdrant / Weaviate |
| SQLite with replication | Litestream |
| Metrics & IoT (line protocol) | InfluxDB |
| Local OLAP / data analysis | DuckDB |
| Multi-model (relational + graph + doc) | SurrealDB |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| PostgreSQL `FATAL: password authentication failed` | Verify `POSTGRES_USER` and `POSTGRES_PASSWORD` match; recreate the volume if the DB was initialised with different credentials |
| Redis `NOAUTH` error | Add `-e REDIS_PASSWORD=changeme` and `redis-server --requirepass changeme` to the command |
| MongoDB `auth failed` | Ensure client uses `admin` database for auth: connection string should include `?authSource=admin` |
| Elasticsearch OOM-killed | Limit JVM heap: add `-e ES_JAVA_OPTS="-Xms512m -Xmx512m"` — default is 50% of host RAM |
| Qdrant collection not found | Collections are created via API or the web UI dashboard; Qdrant does not auto-create on insert |
| InfluxDB can't accept writes | Verify the org name and bucket match `DOCKER_INFLUXDB_INIT_ORG` and `DOCKER_INFLUXDB_INIT_BUCKET` exactly |
| Adminer shows no database | Connect to `host.containers.internal` (not `localhost`) when the database is in another container |
| Kafka consumer lag growing | Check partition count vs consumer count — increase partitions or add consumer instances; verify no consumer is crashing |
| Kafka topic not created | Ensure `KAFKA_AUTO_CREATE_TOPICS_ENABLE=true` or create manually with `kafka-topics --create` |
| Neo4j heap OOM | Increase `NEO4J_dbms_memory_heap_max__size` — default is 512m; graph queries on large datasets need more |
| Cassandra connection refused | Cassandra takes 30–60 s to start; check `podman logs cassandra` for `Starting listening for CQL clients` |
| ScyllaDB low performance | Ensure `--cpuset-cpus` matches your actual CPU count; remove `--developer-mode 1` for production workloads |
| CockroachDB `node is not ready` | Single-node startup takes a few seconds; retry with `podman exec cockroachdb cockroach sql --insecure` after 10 s |
| TimescaleDB extension not found | Run `CREATE EXTENSION timescaledb;` in `psql` after first connection; it must be enabled per database |
| Redpanda schema registry errors | Ensure the schema registry port `8081` is not blocked; schema registry is separate from the Kafka broker port `9092` |
| Weaviate vectorisation fails | Verify Ollama is running and `TEXT2VEC_OLLAMA_APIENDPOINT` resolves; pull the embedding model: `podman exec ollama ollama pull nomic-embed-text` |
| RabbitMQ management UI unreachable | Ensure port `15672` is exposed; management plugin is bundled in the `-management` image tag |
| RabbitMQ messages not consumed | Check consumer acknowledgement mode — unacked messages stay in queue; verify the consumer is running and connected |
| NATS JetStream not persisting | Ensure `store_dir` is set in config and the `/data` volume is mounted; `jetstream {}` block must be present |
| Typesense collection not found | Collections must be explicitly created before indexing; verify the API key matches `TYPESENSE_API_KEY` |
| DuckDB Parquet read error | Ensure the file path inside the container matches the volume mount; DuckDB requires read permissions on the file |
| SurrealDB connection refused | Verify the `--conn` URL uses `http://` not `https://` for local connections; check the namespace and database exist |
| Dragonfly `ulimit` warning on startup | Set `--ulimit memlock=-1` in the run command; Dragonfly requires unlimited locked memory for performance |
| FerretDB command not supported | Check the [FerretDB compatibility list](https://docs.ferretdb.io/reference/supported-commands/) — some advanced MongoDB aggregation stages are not yet implemented |
