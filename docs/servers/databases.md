---
title: Databases & Caches
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Databases & Caches

Relational, document, caching, time-series, vector, graph, wide-column, streaming, and full-text search engines. All run rootless with bind-mount volumes labelled `:Z`. Named volumes omit `:Z` — Podman manages their labels automatically.

For multi-node, replicated, and HA deployments see the [Clusters wiki](https://docs.shani.dev/doc/servers/clusters).

---

## MariaDB / MySQL

**Purpose:** Open-source relational database for web apps, CMS platforms, and legacy software stacks.

```yaml
# ~/mariadb/compose.yaml
services:
  mariadb:
    image: mariadb:11
    ports:
      - 127.0.0.1:3306:3306
    volumes:
      - mariadb_data:/var/lib/mysql
    environment:
      MYSQL_ROOT_PASSWORD: strongpassword
      MYSQL_DATABASE: mydb
      MYSQL_USER: myuser
      MYSQL_PASSWORD: myuserpass
    restart: unless-stopped

volumes:
  mariadb_data:
```

```bash
cd ~/mariadb && podman-compose up -d
```

**Common operations:**
```bash
# Connect interactively
podman exec -it mariadb mariadb -u myuser -pmyuserpass mydb

# Run a query non-interactively
podman exec mariadb mariadb -u myuser -pmyuserpass mydb -e "SHOW TABLES;"

# Dump a database
podman exec mariadb mariadb-dump -u root -pstrongpassword mydb > backup.sql

# Restore from dump
cat backup.sql | podman exec -i mariadb mariadb -u root -pstrongpassword mydb

# List all databases
podman exec mariadb mariadb -u root -pstrongpassword -e "SHOW DATABASES;"

# Check running processes
podman exec mariadb mariadb -u root -pstrongpassword -e "SHOW PROCESSLIST;"

# Show table sizes
podman exec mariadb mariadb -u root -pstrongpassword -e \
  "SELECT table_name, ROUND((data_length+index_length)/1024/1024,2) AS 'Size (MB)'
   FROM information_schema.tables WHERE table_schema='mydb' ORDER BY 2 DESC;"
```

> **Connect**: `podman exec -it mariadb mariadb -u myuser -p mydb`
> **Backup**: `podman exec mariadb mariadb-dump -u root -p mydb > backup.sql`

---

## PostgreSQL

**Purpose:** Advanced, standards-compliant relational database known for complex queries, JSONB support, full-text search, and extensibility. Preferred database for most modern self-hosted apps.

```yaml
# ~/postgres/compose.yaml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - 127.0.0.1:5432:5432
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: myuser
      POSTGRES_PASSWORD: strongpassword
      POSTGRES_DB: mydb
    restart: unless-stopped

volumes:
  postgres_data:
```

```bash
cd ~/postgres && podman-compose up -d
```

> **Connect**: `podman exec -it postgres psql -U myuser -d mydb`
> **Backup**: `podman exec postgres pg_dump -U myuser mydb > backup.sql`
> **GUI**: pgAdmin (see below)

**pgAdmin (PostgreSQL GUI):**
```yaml
# ~/pgadmin/compose.yaml
services:
  pgadmin:
    image: dpage/pgadmin4
    ports:
      - 127.0.0.1:5050:80
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@example.com
      PGADMIN_DEFAULT_PASSWORD: admin
    restart: unless-stopped
```

```bash
cd ~/pgadmin && podman-compose up -d
```

**Common operations:**
```bash
# Connect interactively
podman exec -it postgres psql -U myuser -d mydb

# Run a query non-interactively
podman exec postgres psql -U myuser -d mydb -c "SELECT count(*) FROM users;"

# Dump a database
podman exec postgres pg_dump -U myuser mydb > backup.sql

# Restore from dump
cat backup.sql | podman exec -i postgres psql -U myuser -d mydb

# List databases
podman exec postgres psql -U myuser -c "\l"

# List tables in current DB
podman exec postgres psql -U myuser -d mydb -c "\dt"

# Check active connections
podman exec postgres psql -U myuser -c "SELECT count(*) FROM pg_stat_activity;"

# Show database sizes
podman exec postgres psql -U myuser -c \
  "SELECT pg_database.datname, pg_size_pretty(pg_database_size(pg_database.datname))
   FROM pg_database ORDER BY pg_database_size(pg_database.datname) DESC;"
```

---

## pgvector (Vector Search in PostgreSQL)

**Purpose:** PostgreSQL extension that adds a native vector column type and similarity search operators — enabling semantic search, RAG (Retrieval-Augmented Generation) pipelines, and embedding storage without a separate vector database. If you're already using PostgreSQL, this is the lowest-friction path to vector search: one `CREATE EXTENSION`, one extra column type, and you're done. Use Qdrant or Weaviate when you need billion-scale vector search or advanced ANN indexing; use pgvector when your dataset is under ~10M vectors and you'd rather keep your stack simple.

```yaml
# ~/pgvector/compose.yaml
services:
  pgvector:
    image: pgvector/pgvector:pg16
    ports:
      - 127.0.0.1:5432:5432
    volumes:
      - pgvector_data:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: myuser
      POSTGRES_PASSWORD: strongpassword
      POSTGRES_DB: mydb
    restart: unless-stopped

volumes:
  pgvector_data:
```

```bash
cd ~/pgvector && podman-compose up -d
```

> The `pgvector/pgvector:pg16` image is official PostgreSQL 16 with the extension pre-installed. You can also install the extension into an existing PostgreSQL instance:
> ```bash
> podman exec postgres psql -U myuser -d mydb -c "CREATE EXTENSION vector;"
> ```

**Set up a vector table and index:**
```sql
-- Enable the extension (once per database)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create a table with a vector column (1536 dims for OpenAI, 768 for nomic-embed-text)
CREATE TABLE documents (
  id       BIGSERIAL PRIMARY KEY,
  content  TEXT,
  metadata JSONB,
  embedding vector(768)
);

-- Create an HNSW index for fast approximate nearest-neighbour search
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Insert a document with its embedding
INSERT INTO documents (content, embedding)
VALUES ('Self-hosting is great', '[0.01, 0.23, ...]'::vector);

-- Semantic similarity search — find the 5 nearest neighbours
SELECT id, content, 1 - (embedding <=> '[0.02, 0.21, ...]'::vector) AS similarity
FROM documents
ORDER BY embedding <=> '[0.02, 0.21, ...]'::vector
LIMIT 5;
```

**Operators:**
- `<=>` — cosine distance (most common for text embeddings)
- `<->` — L2 (Euclidean) distance
- `<#>` — negative inner product (for dot-product similarity)

**Generate embeddings with Ollama and store them (Python example):**
```python
import psycopg2, requests

def embed(text):
    r = requests.post("http://localhost:11434/api/embeddings",
                      json={"model": "nomic-embed-text", "prompt": text})
    return r.json()["embedding"]

conn = psycopg2.connect("postgresql://myuser:strongpassword@localhost:5432/mydb")
cur = conn.cursor()
text = "Self-hosting gives you full data ownership"
vector = embed(text)
cur.execute("INSERT INTO documents (content, embedding) VALUES (%s, %s)", (text, vector))
conn.commit()
```

> See the [AI & LLMs wiki](https://docs.shani.dev/doc/servers/ai-llms) for the full Ollama setup. The `nomic-embed-text` model produces 768-dimensional vectors — adjust `vector(768)` to match your chosen model's output dimensions.

---

## Redis

**Purpose:** High-performance in-memory data store used for caching, session management, message brokering, and real-time analytics. Used as a dependency by Nextcloud, Immich, Authentik, and many others.

```yaml
# ~/redis/compose.yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - 127.0.0.1:6379:6379
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

volumes:
  redis_data:
```

```bash
cd ~/redis && podman-compose up -d
```

**Common operations:**
```bash
# Interactive CLI
podman exec -it redis redis-cli

# Ping server
podman exec redis redis-cli ping

# Set and get a key
podman exec redis redis-cli set mykey "hello"
podman exec redis redis-cli get mykey

# Monitor all commands in real time
podman exec redis redis-cli monitor

# Show server info and stats
podman exec redis redis-cli info

# List all keys (careful on large datasets)
podman exec redis redis-cli keys "*"

# Show memory usage
podman exec redis redis-cli info memory | grep used_memory_human

# Flush all keys (destructive!)
podman exec redis redis-cli flushall

# Save snapshot now
podman exec redis redis-cli bgsave

# Show connected clients
podman exec redis redis-cli client list
```

> **Test**: `podman exec -it redis redis-cli ping`
> **Monitor**: `podman exec -it redis redis-cli monitor`

---

## Valkey

**Purpose:** The Linux Foundation's open-source fork of Redis, created after the Redis licence change. Drop-in compatible with all Redis clients — just swap the image. Recommended if you want fully open-source Redis semantics under the BSD licence going forward.

```yaml
# ~/valkey/compose.yaml
services:
  valkey:
    image: valkey/valkey:8-alpine
    ports:
      - 127.0.0.1:6379:6379
    volumes:
      - valkey_data:/data
    command: valkey-server --appendonly yes
    restart: unless-stopped

volumes:
  valkey_data:
```

```bash
cd ~/valkey && podman-compose up -d
```

> Valkey is wire-protocol compatible with Redis 7.2. Any Jedis, redis-py, or ioredis client connects without modification.

---

## KeyDB

**Purpose:** Multithreaded Redis fork optimised for modern multi-core CPUs. Drop-in compatible with all Redis clients — just swap the image. KeyDB typically achieves 2–5× higher throughput than Redis on multi-core hosts.

```yaml
# ~/keydb/compose.yaml
services:
  keydb:
    image: eqalpha/keydb:alpine
    ports:
      - 127.0.0.1:6379:6379
    volumes:
      - keydb_data:/data
    restart: unless-stopped

volumes:
  keydb_data:
```

```bash
cd ~/keydb && podman-compose up -d
```

---

## Dragonfly (Modern Redis/Memcached Replacement)

**Purpose:** High-performance, multi-threaded in-memory data store with full Redis and Memcached API compatibility. Uses a shared-nothing architecture that scales linearly with CPU cores — benchmarks show 25× higher throughput than Redis on a 16-core machine. Also uses 30–40% less RAM than Redis for the same dataset. Drop-in replacement: no code changes, same client libraries, same commands.

```yaml
# ~/dragonfly/compose.yaml
services:
  dragonfly:
    image: docker.dragonflydb.io/dragonflydb/dragonfly
    ports:
      - 127.0.0.1:6380:6379
    volumes:
      - /home/user/dragonfly/data:/data:Z
    ulimits:
      memlock: -1
    restart: unless-stopped
```

```bash
cd ~/dragonfly && podman-compose up -d
```

**Common operations:**
```bash
# Connect with redis-cli (Dragonfly is fully compatible)
podman exec -it dragonfly redis-cli -p 6379

# Ping
podman exec dragonfly redis-cli -p 6379 ping

# Check info and memory usage
podman exec dragonfly redis-cli -p 6379 info memory | grep used_memory_human

# Monitor commands in real time
podman exec dragonfly redis-cli -p 6379 monitor

# Save snapshot
podman exec dragonfly redis-cli -p 6379 bgsave
```

> Use port `6380` on the host to avoid conflicts with an existing Redis instance. Any Redis client connects to `localhost:6380` without modification.

---

## MongoDB

**Purpose:** Flexible document database optimised for JSON-like storage, rapid development cycles, and unstructured data models.

```yaml
# ~/mongodb/compose.yaml
services:
  mongodb:
    image: mongo:7
    ports:
      - 127.0.0.1:27017:27017
    volumes:
      - mongodb_data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: strongpassword
    restart: unless-stopped

volumes:
  mongodb_data:
```

```bash
cd ~/mongodb && podman-compose up -d
```

**Common operations:**
```bash
# Connect with mongosh
podman exec -it mongodb mongosh -u admin -p strongpassword --authenticationDatabase admin

# List databases
podman exec mongodb mongosh -u admin -p strongpassword --authenticationDatabase admin \
  --eval "show dbs"

# Run a query
podman exec mongodb mongosh -u admin -p strongpassword --authenticationDatabase admin \
  --eval "db.getSiblingDB('mydb').mycollection.find().limit(5).pretty()"

# Dump a database
podman exec mongodb mongodump -u admin -p strongpassword --authenticationDatabase admin \
  --db mydb --out /tmp/dump

# Restore from dump
podman exec mongodb mongorestore -u admin -p strongpassword --authenticationDatabase admin \
  --db mydb /tmp/dump/mydb
```

> **GUI**: Add Mongo Express to your compose file:
```yaml
  mongo-express:
    image: mongo-express
    ports:
      - 127.0.0.1:8081:8081
    environment:
      ME_CONFIG_MONGODB_ADMINUSERNAME: admin
      ME_CONFIG_MONGODB_ADMINPASSWORD: strongpassword
      ME_CONFIG_MONGODB_URL: "mongodb://admin:strongpassword@host.containers.internal:27017/"
    restart: unless-stopped
```

---

## FerretDB (MongoDB-Compatible on PostgreSQL)

**Purpose:** Open-source MongoDB-compatible proxy that translates the MongoDB wire protocol to PostgreSQL queries. All existing MongoDB drivers, ORMs, and tools (Mongoose, mongosh, MongoDB Compass) connect without changes, but data is stored in PostgreSQL. Ideal when you want MongoDB API compatibility with PostgreSQL's reliability and ACID guarantees.

```yaml
# ~/ferretdb/compose.yaml
services:
  ferretdb:
    image: ghcr.io/ferretdb/ferretdb:latest
    ports:
      - 127.0.0.1:27018:27017
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
    volumes:
      - ferretdb_pg_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  ferretdb_pg_data:
```

```bash
cd ~/ferretdb && podman-compose up -d
```

**Common operations:**
```bash
# Connect with mongosh
podman run --rm -it mongo:7 mongosh mongodb://localhost:27018/mydb

# Insert a document
podman run --rm mongo:7 mongosh mongodb://localhost:27018/myapp \
  --eval 'db.users.insertOne({name: "Alice", role: "admin"})'

# Query documents
podman run --rm mongo:7 mongosh mongodb://localhost:27018/myapp \
  --eval 'db.users.find().pretty()'
```

> **FerretDB vs MongoDB:** Use FerretDB when you want MongoDB API compatibility with PostgreSQL's reliability. Use MongoDB directly for workloads relying on change streams, full-text search, or aggregation pipelines not yet covered by FerretDB.

---

## Apache Kafka

**Purpose:** Distributed event streaming platform. Producers publish events to topics; consumers read them with durable, replayable, ordered delivery. Handles millions of events per second with configurable retention.

> **KRaft mode only:** ZooKeeper was removed entirely in Kafka 4.0 (released March 18, 2025). All new deployments must use KRaft.

```yaml
# ~/kafka/compose.yaml
services:
  kafka:
    image: confluentinc/cp-kafka:latest
    ports:
      - 127.0.0.1:9092:9092
      - 127.0.0.1:29092:29092
    environment:
      CLUSTER_ID: "MkU3OEVBNTcwNTJENDM2Qk"
      KAFKA_NODE_ID: 1
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_LISTENERS: PLAINTEXT://kafka:29092,CONTROLLER://kafka:9093,PLAINTEXT_HOST://0.0.0.0:9092
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
      KAFKA_LOG_RETENTION_HOURS: 168
    volumes:
      - kafka_data:/var/lib/kafka/data
    restart: unless-stopped

  kafka-ui:
    image: ghcr.io/kafbat/kafka-ui:latest
    ports:
      - 127.0.0.1:8080:8080
    environment:
      KAFKA_CLUSTERS_0_NAME: local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:29092
    depends_on: [kafka]
    restart: unless-stopped

volumes:
  kafka_data:
```

```bash
cd ~/kafka && podman-compose up -d
```

**Common operations:**
```bash
# Create a topic
podman exec kafka kafka-topics \
  --bootstrap-server localhost:29092 \
  --create --topic my-topic --partitions 3 --replication-factor 1

# List topics
podman exec kafka kafka-topics --bootstrap-server localhost:29092 --list

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

```yaml
# ~/redpanda/compose.yaml
services:
  redpanda:
    image: redpandadata/redpanda:latest
    ports:
      - 127.0.0.1:9092:9092
      - 127.0.0.1:9644:9644
      - 127.0.0.1:8081:8081
    volumes:
      - /home/user/redpanda/data:/var/lib/redpanda/data:Z
    command: >
      redpanda start
      --node-id 0
      --kafka-addr 0.0.0.0:9092
      --advertise-kafka-addr localhost:9092
      --schema-registry-addr 0.0.0.0:8081
      --rpc-addr 0.0.0.0:33145
      --advertise-rpc-addr redpanda:33145
      --mode dev-container
    restart: unless-stopped

  redpanda-console:
    image: docker.redpanda.com/redpandadata/console:latest
    ports:
      - 127.0.0.1:8080:8080
    environment:
      KAFKA_BROKERS: host.containers.internal:9092
    restart: unless-stopped
```

```bash
cd ~/redpanda && podman-compose up -d
```

> Redpanda is fully compatible with the Kafka API — any Kafka client (Confluent SDK, librdkafka, kafka-python) connects without modification.

---

## RabbitMQ (Message Broker)

**Purpose:** The most widely deployed open-source message broker. Implements AMQP, MQTT, and STOMP. Use RabbitMQ when you need reliable task queues, fanout messaging, dead-letter exchanges, message acknowledgement, and per-message TTL. Used by Celery, Sidekiq, and most web framework background job systems.

```yaml
# ~/rabbitmq/compose.yaml
services:
  rabbitmq:
    image: rabbitmq:3-management-alpine
    ports:
      - 127.0.0.1:5672:5672
      - 127.0.0.1:15672:15672
    volumes:
      - /home/user/rabbitmq/data:/var/lib/rabbitmq:Z
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: changeme
    restart: unless-stopped
```

```bash
cd ~/rabbitmq && podman-compose up -d
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

> **Kafka vs RabbitMQ:** Use Kafka for high-throughput event streaming where consumers need to replay history. Use RabbitMQ for task queues, RPC patterns, and workloads where each message is processed once and discarded.

---

## NATS (Lightweight Messaging)

**Purpose:** High-performance, cloud-native messaging. Core NATS is publish/subscribe with at-most-once delivery. JetStream (built-in) adds persistent streams, at-least-once delivery, key-value store, and object store — all in a single ~20 MB binary with no external dependencies.

```yaml
# ~/nats/compose.yaml
services:
  nats:
    image: nats:alpine
    ports:
      - 127.0.0.1:4222:4222
      - 127.0.0.1:8222:8222
    volumes:
      - /home/user/nats/data:/data:Z
      - /home/user/nats/nats.conf:/etc/nats/nats.conf:ro,Z
    command: -c /etc/nats/nats.conf
    restart: unless-stopped
```

```bash
cd ~/nats && podman-compose up -d
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

**Common operations:**
```bash
# Check server info
podman run --rm natsio/nats-box \
  nats -s nats://nats:changeme@host.containers.internal:4222 server info

# List JetStream streams
podman run --rm natsio/nats-box \
  nats -s nats://nats:changeme@host.containers.internal:4222 stream ls

# View JetStream stats
curl http://localhost:8222/jsz | python3 -m json.tool | head -20

# Create a JetStream stream
podman run --rm natsio/nats-box \
  nats -s nats://nats:changeme@host.containers.internal:4222 \
  stream add ORDERS --subjects "orders.>" --storage file --replicas 1
```

---

## Neo4j (Graph Database)

**Purpose:** The leading native graph database. Stores data as nodes and relationships — ideal for social networks, recommendation engines, fraud detection, knowledge graphs, and any domain where connections between data points matter as much as the data itself. Queried with the Cypher query language.

```yaml
# ~/neo4j/compose.yaml
services:
  neo4j:
    image: neo4j:5
    ports:
      - 127.0.0.1:7474:7474
      - 127.0.0.1:7687:7687
    volumes:
      - /home/user/neo4j/data:/data:Z
      - /home/user/neo4j/logs:/logs:Z
      - /home/user/neo4j/import:/var/lib/neo4j/import:Z
    environment:
      NEO4J_AUTH: neo4j/strongpassword
      NEO4J_PLUGINS: '["apoc", "graph-data-science"]'
      NEO4J_dbms_memory_heap_initial__size: 512m
      NEO4J_dbms_memory_heap_max__size: 2g
    restart: unless-stopped
```

```bash
cd ~/neo4j && podman-compose up -d
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
```

**APOC** adds 450+ utility procedures for data import, refactoring, and graph algorithms — included via `NEO4J_PLUGINS` above.

---

## Apache Cassandra

**Purpose:** Wide-column NoSQL database designed for massive write throughput and linear horizontal scalability. No single point of failure. Ideal for IoT telemetry, event logs, and any workload where you need to write millions of rows per second across geographically distributed nodes.

```yaml
# ~/cassandra/compose.yaml
services:
  cassandra:
    image: cassandra:5
    ports:
      - 127.0.0.1:9042:9042
    volumes:
      - /home/user/cassandra/data:/var/lib/cassandra:Z
    environment:
      CASSANDRA_CLUSTER_NAME: HomeCluster
      CASSANDRA_DC: dc1
      CASSANDRA_RACK: rack1
      HEAP_NEWSIZE: 128m
      MAX_HEAP_SIZE: 1g
    restart: unless-stopped
```

```bash
cd ~/cassandra && podman-compose up -d
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
  humidity    FLOAT,
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

**Purpose:** Drop-in Cassandra replacement written in C++. Uses a shard-per-core architecture that eliminates the JVM and garbage collection pauses — delivering 10× better latency and throughput on the same hardware. Fully compatible with the CQL wire protocol and Cassandra client drivers.

```yaml
# ~/scylladb/compose.yaml
services:
  scylladb:
    image: scylladb/scylla:6
    ports:
      - 127.0.0.1:9042:9042
      - 127.0.0.1:10000:10000
    volumes:
      - /home/user/scylladb/data:/var/lib/scylla:Z
    cpuset: "0-3"
    command: --developer-mode 1 --seeds scylladb
    restart: unless-stopped
```

```bash
cd ~/scylladb && podman-compose up -d
```

> ScyllaDB is the recommended replacement for Cassandra in new deployments. Any code written against the Cassandra CQL API runs unmodified against ScyllaDB.

---

## CockroachDB (Distributed PostgreSQL)

**Purpose:** Distributed SQL database with strong ACID guarantees, automatic sharding, and survivable multi-node operation. Wire-compatible with PostgreSQL — connect with `psql` or any Postgres driver. Ideal for applications that need horizontal write scaling or multi-region data residency while keeping SQL semantics.

```yaml
# ~/cockroachdb/compose.yaml
services:
  cockroachdb:
    image: cockroachdb/cockroach:latest
    ports:
      - 127.0.0.1:26257:26257
      - 127.0.0.1:8081:8080
    volumes:
      - /home/user/cockroachdb/data:/cockroach/cockroach-data:Z
    command: start-single-node --insecure --http-addr=0.0.0.0:8080
    restart: unless-stopped
```

```bash
cd ~/cockroachdb && podman-compose up -d
```

> The Admin UI is at `http://localhost:8081` — shows query plans, node health, slow queries, and schema inspector.

**Create a database and user:**
```sql
CREATE DATABASE myapp;
CREATE USER myuser WITH PASSWORD 'strongpassword';
GRANT ALL ON DATABASE myapp TO myuser;
```

> For production, use TLS and the `--secure` flag. Insecure mode is suitable for local/internal-only deployments.

---

## TimescaleDB (Time-Series PostgreSQL)

**Purpose:** PostgreSQL extension that adds native time-series storage, hypertables, continuous aggregates, compression, and data retention policies. Query with standard SQL. Because it is just PostgreSQL, all your existing tools (pgAdmin, Grafana, ORMs) work without modification — you get 100× faster time-series queries.

```yaml
# ~/timescaledb/compose.yaml
services:
  timescaledb:
    image: timescale/timescaledb:latest-pg16
    ports:
      - 127.0.0.1:5433:5432
    volumes:
      - timescale_data:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: myuser
      POSTGRES_PASSWORD: strongpassword
      POSTGRES_DB: metrics
    restart: unless-stopped

volumes:
  timescale_data:
```

```bash
cd ~/timescaledb && podman-compose up -d
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

-- Automatic compression after 7 days
ALTER TABLE sensor_data SET (timescaledb.compress, timescaledb.compress_segmentby = 'device_id');
SELECT add_compression_policy('sensor_data', INTERVAL '7 days');

-- Data retention: drop data older than 1 year
SELECT add_retention_policy('sensor_data', INTERVAL '1 year');

-- Continuous aggregate (materialised 1-hour averages, auto-refreshed)
CREATE MATERIALIZED VIEW sensor_hourly
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', time) AS bucket, device_id,
       AVG(temperature) AS avg_temp, AVG(humidity) AS avg_humidity
FROM sensor_data GROUP BY bucket, device_id;
```

> Connect Grafana's TimescaleDB datasource to this instance for instant time-series dashboards.

---

## InfluxDB

**Purpose:** High-performance time-series database. Optimised for metrics, IoT telemetry, and real-time analytics. Used with Home Assistant and Grafana dashboards.

```yaml
# ~/influxdb/compose.yaml
services:
  influxdb:
    image: influxdb:2
    ports:
      - 127.0.0.1:8086:8086
    volumes:
      - influxdb_data:/var/lib/influxdb2
    environment:
      DOCKER_INFLUXDB_INIT_MODE: setup
      DOCKER_INFLUXDB_INIT_USERNAME: admin
      DOCKER_INFLUXDB_INIT_PASSWORD: strongpassword
      DOCKER_INFLUXDB_INIT_ORG: home
      DOCKER_INFLUXDB_INIT_BUCKET: metrics
    restart: unless-stopped

volumes:
  influxdb_data:
```

```bash
cd ~/influxdb && podman-compose up -d
```

**Common operations:**
```bash
# Open the InfluxDB CLI
podman exec -it influxdb influx

# List buckets
podman exec influxdb influx bucket list

# List organisations
podman exec influxdb influx org list

# Write a data point
podman exec influxdb influx write \
  --bucket metrics --org home \
  --token "$(podman exec influxdb influx auth list --json | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['token'])")" \
  'temperature,room=bedroom value=22.5'

# Query data (Flux)
podman exec influxdb influx query \
  --org home \
  'from(bucket:"metrics") |> range(start:-1h) |> filter(fn:(r) => r._measurement == "temperature")'

# Create a backup
podman exec influxdb influx backup /tmp/backup --org home
podman cp influxdb:/tmp/backup ./influxdb-backup-$(date +%Y%m%d)
```

---

## Qdrant (Vector Database)

**Purpose:** High-performance vector similarity search engine. Used with AI/LLM applications for semantic search, RAG pipelines, and recommendation systems. Connect to Ollama and Open WebUI for document-aware AI chat. See the [AI & LLMs wiki](https://docs.shani.dev/doc/servers/ai-llms) for the Ollama and Open WebUI setup.

```yaml
# ~/qdrant/compose.yaml
services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - 127.0.0.1:6333:6333
      - 127.0.0.1:6334:6334
    volumes:
      - /home/user/qdrant/storage:/qdrant/storage:Z
    restart: unless-stopped
```

```bash
cd ~/qdrant && podman-compose up -d
```

> **REST API**: `http://localhost:6333`
> **gRPC**: `localhost:6334`
> **Web UI**: `http://localhost:6333/dashboard`

---

## Weaviate (Vector Database with Built-In ML)

**Purpose:** Vector database with native modules for text, image, and multi-modal embeddings — no separate embedding service required. Supports hybrid search (vector + BM25 keyword), GraphQL API, and REST. The `text2vec-ollama` module connects directly to a local Ollama instance. See the [AI & LLMs wiki](https://docs.shani.dev/doc/servers/ai-llms).

```yaml
# ~/weaviate/compose.yaml
services:
  weaviate:
    image: cr.weaviate.io/semitechnologies/weaviate:latest
    ports:
      - 127.0.0.1:8080:8080
      - 127.0.0.1:50051:50051
    volumes:
      - weaviate_data:/var/lib/weaviate
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

```bash
cd ~/weaviate && podman-compose up -d
```

> Weaviate's `text2vec-ollama` module connects to your local Ollama for embeddings — no OpenAI API key needed.

---

## Chroma (Lightweight Vector Database)

**Purpose:** Simple, developer-friendly vector database focused on getting an AI/RAG application running in minutes. Minimal Python and JavaScript SDK, persistent server mode, and an opinionated API designed for LLM use cases — just `add`, `query`, and `delete`. Scale up to Qdrant or Weaviate when you need production-grade indexing at tens of millions of vectors.

```yaml
# ~/chroma/compose.yaml
services:
  chroma:
    image: chromadb/chroma:latest
    ports:
      - 127.0.0.1:8000:8000
    volumes:
      - /home/user/chroma/data:/chroma/chroma:Z
    environment:
      IS_PERSISTENT: "TRUE"
      ANONYMIZED_TELEMETRY: "FALSE"
    restart: unless-stopped
```

```bash
cd ~/chroma && podman-compose up -d
```

**Common operations (via REST API):**
```bash
curl http://localhost:8000/api/v1/heartbeat
curl http://localhost:8000/api/v1/collections
curl http://localhost:8000/api/v1/version
```

**Use with the Python SDK:**
```python
import chromadb

client = chromadb.HttpClient(host="localhost", port=8000)
collection = client.get_or_create_collection(
    name="my_docs",
    metadata={"hnsw:space": "cosine"}
)

collection.add(
    ids=["doc1", "doc2", "doc3"],
    documents=[
        "Self-hosting gives you full control",
        "Podman runs containers rootlessly",
        "Caddy is a modern reverse proxy",
    ],
    metadatas=[{"source": "wiki"}, {"source": "wiki"}, {"source": "wiki"}]
)

results = collection.query(
    query_texts=["how do I run containers without root?"],
    n_results=2
)
print(results["documents"])
```

> **Chroma vs Qdrant vs pgvector:** Chroma is the fastest to integrate in a Python LLM app. Qdrant offers more indexing control, filtering, and production throughput. pgvector is best if you're already using PostgreSQL and want zero extra infrastructure.

---

## MeiliSearch

**Purpose:** Lightning-fast, typo-tolerant full-text search engine with a simple REST API. No query language to learn.

```yaml
# ~/meilisearch/compose.yaml
services:
  meilisearch:
    image: getmeili/meilisearch:latest
    ports:
      - 127.0.0.1:7700:7700
    volumes:
      - meilisearch_data:/meili_data
    environment:
      MEILI_MASTER_KEY: changeme
    restart: unless-stopped

volumes:
  meilisearch_data:
```

```bash
cd ~/meilisearch && podman-compose up -d
```

**Common operations:**
```bash
# Check server health
curl http://localhost:7700/health -H "Authorization: Bearer changeme"

# List all indexes
curl http://localhost:7700/indexes -H "Authorization: Bearer changeme"

# Index documents and search
curl -X POST http://localhost:7700/indexes/movies/documents \
  -H "Authorization: Bearer changeme" \
  -H "Content-Type: application/json" \
  -d '[{"id":1,"title":"Inception","genre":"Sci-Fi"},{"id":2,"title":"The Matrix","genre":"Sci-Fi"}]'

curl "http://localhost:7700/indexes/movies/search?q=inceptoin" \
  -H "Authorization: Bearer changeme"
```

---

## Typesense (Fast Search Engine)

**Purpose:** Open-source typo-tolerant search engine optimised for instant, as-you-type results. Zero configuration needed, sub-50ms queries on millions of documents, and a clean REST API. Ideal for e-commerce search, documentation search, and app-level search.

```yaml
# ~/typesense/compose.yaml
services:
  typesense:
    image: typesense/typesense:latest
    ports:
      - 127.0.0.1:8108:8108
    volumes:
      - /home/user/typesense/data:/data:Z
    environment:
      TYPESENSE_DATA_DIR: /data
      TYPESENSE_API_KEY: changeme
    restart: unless-stopped
```

```bash
cd ~/typesense && podman-compose up -d
```

**Common operations:**
```bash
# Check server health
curl http://localhost:8108/health -H "X-TYPESENSE-API-KEY: changeme"

# Create a collection and index documents
curl http://localhost:8108/collections \
  -H "X-TYPESENSE-API-KEY: changeme" \
  -H "Content-Type: application/json" \
  -d '{"name":"products","fields":[{"name":"name","type":"string"},{"name":"price","type":"float"},{"name":"rating","type":"int32"}],"default_sorting_field":"rating"}'

# Search (typo-tolerant)
curl "http://localhost:8108/collections/products/documents/search?q=latp&query_by=name" \
  -H "X-TYPESENSE-API-KEY: changeme"
```

> **MeiliSearch vs Typesense:** Both are fast and typo-tolerant. Typesense has a stricter schema, better multi-tenancy, and faster faceting. MeiliSearch has a more flexible schema-optional API and better out-of-box relevancy tuning.

---

## DuckDB (Embedded OLAP)

**Purpose:** In-process analytical database — think SQLite for analytics. Runs inside your application process, needs no server, and executes columnar OLAP queries directly on Parquet, CSV, and JSON files. Ideal for data analysis scripts, Jupyter notebooks, and ETL pipelines where you don't want to spin up a full ClickHouse or Postgres instance.

```yaml
# ~/duckdb-api/compose.yaml
services:
  duckdb-api:
    image: ghcr.io/tobilg/duckdb-api:latest
    ports:
      - 127.0.0.1:1294:1294
    volumes:
      - /home/user/duckdb:/duckdb:Z
    restart: unless-stopped
```

```bash
cd ~/duckdb-api && podman-compose up -d
```

**Common operations (via REST API):**
```bash
curl -X POST http://localhost:1294/query \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT 42 AS answer"}'

curl -X POST http://localhost:1294/query \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM read_parquet('\''/duckdb/data.parquet'\'') LIMIT 10"}'
```

> DuckDB can read directly from S3/MinIO, InfluxDB line protocol files, and PostgreSQL — making it a powerful ad-hoc query layer over your existing data stores without ETL.

---

## ClickHouse (Columnar OLAP Database)

**Purpose:** Open-source columnar database optimised for real-time analytical queries on large datasets — billions of rows, sub-second aggregations, and high-throughput ingestion. Used by SigNoz, Plausible Analytics, PostHog, and many other self-hosted analytics platforms as their storage backend. Unlike DuckDB (embedded/local files), ClickHouse is a persistent server that accepts concurrent writes and queries from multiple clients.

```yaml
# ~/clickhouse/compose.yaml
services:
  clickhouse:
    image: clickhouse/clickhouse-server:latest
    ports:
      - 127.0.0.1:8123:8123    # HTTP interface
      - 127.0.0.1:9000:9000    # Native TCP interface
    volumes:
      - /home/user/clickhouse/data:/var/lib/clickhouse:Z
      - /home/user/clickhouse/logs:/var/log/clickhouse-server:Z
      - /home/user/clickhouse/config.xml:/etc/clickhouse-server/config.d/custom.xml:ro,Z
    ulimits:
      nofile:
        soft: 262144
        hard: 262144
    restart: unless-stopped
```

```xml
<!-- ~/clickhouse/config.xml — minimal custom config -->
<clickhouse>
  <listen_host>0.0.0.0</listen_host>
  <max_connections>100</max_connections>
  <users>
    <default>
      <password>changeme</password>
      <networks><ip>::/0</ip></networks>
      <profile>default</profile>
      <quota>default</quota>
    </default>
  </users>
</clickhouse>
```

```bash
cd ~/clickhouse && podman-compose up -d
```

**Common operations:**
```bash
# Interactive SQL shell
podman exec -it clickhouse clickhouse-client --password changeme

# Query via HTTP interface
curl "http://localhost:8123/?query=SELECT+version()&password=changeme"

# Show table sizes
podman exec clickhouse clickhouse-client --password changeme --query "
  SELECT database, table,
    formatReadableSize(sum(bytes_on_disk)) AS size,
    sum(rows) AS rows
  FROM system.parts WHERE active
  GROUP BY database, table
  ORDER BY sum(bytes_on_disk) DESC"

# Import CSV
podman exec -i clickhouse clickhouse-client --password changeme \
  --query "INSERT INTO mydb.events FORMAT CSV" < /path/to/events.csv
```

**Create a table optimised for event data:**
```sql
CREATE DATABASE IF NOT EXISTS analytics;

CREATE TABLE analytics.events (
  event_time   DateTime,
  session_id   String,
  user_id      UInt64,
  event_name   LowCardinality(String),
  properties   String
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (event_name, event_time)
TTL event_time + INTERVAL 1 YEAR;
```

> **DuckDB vs ClickHouse:** Use DuckDB for local, one-off analytics on files (CSV, Parquet, Postgres) — no server, no setup. Use ClickHouse when you need a persistent server that ingests data continuously from multiple sources and serves concurrent analytical queries at scale.

---

## SurrealDB (Multi-Model Database)

**Purpose:** A single database that acts as relational, document, graph, and time-series store simultaneously. One query language (SurrealQL — SQL-like) handles joins, graph traversals, computed fields, and live queries (WebSocket-based change streams).

```yaml
# ~/surrealdb/compose.yaml
services:
  surrealdb:
    image: surrealdb/surrealdb:latest
    ports:
      - 127.0.0.1:8000:8000
    volumes:
      - /home/user/surrealdb/data:/data:Z
    command: start --log debug --user root --pass changeme file:/data/database.db
    restart: unless-stopped
```

```bash
cd ~/surrealdb && podman-compose up -d
```

**Common operations:**
```bash
# Connect interactively
podman exec -it surrealdb surreal sql \
  --conn http://localhost:8000 \
  --user root --pass changeme \
  --ns myns --db mydb

# Export a database
podman exec surrealdb surreal export \
  --conn http://localhost:8000 \
  --user root --pass changeme \
  --ns myns --db mydb /tmp/export.surql
podman cp surrealdb:/tmp/export.surql ./surrealdb-$(date +%Y%m%d).surql
```

---

## SQLite via Litestream

**Purpose:** Streams SQLite WAL changes to S3-compatible storage in real time — continuous off-site replication with sub-second RPO for any app using SQLite, with no code changes required.

See the [Backups & Sync wiki](https://docs.shani.dev/doc/servers/backups-sync#litestream-sqlite-continuous-replication) for the full Litestream setup, including `litestream.yml` configuration, MinIO integration, and restore procedure.

---

## PocketBase (SQLite Backend-as-a-Service)

**Purpose:** Single-binary Go backend with a built-in SQLite database, REST and realtime subscriptions API, file storage, authentication (email/password, OAuth), and a clean admin dashboard. No separate database server needed. Perfect for lightweight apps, prototypes, or small-team internal tools.

```yaml
# ~/pocketbase/compose.yaml
services:
  pocketbase:
    image: ghcr.io/muchobien/pocketbase:latest
    ports:
      - 127.0.0.1:8090:8090
    volumes:
      - /home/user/pocketbase/pb_data:/pb_data:Z
    restart: unless-stopped
```

```bash
cd ~/pocketbase && podman-compose up -d
```

Access the admin UI at `http://localhost:8090/_/` to create your first admin account and define collections.

**Caddy:**
```caddyfile
pb.home.local { tls internal; reverse_proxy localhost:8090 }
```

---

## Supabase (Self-Hosted Firebase Alternative)

**Purpose:** Full open-source Firebase/Supabase stack — PostgreSQL + Auth + Storage + Realtime subscriptions + Edge Functions + Studio UI in one compose stack. Use when you need a complete BaaS for a production app with no per-seat or per-row fees.

```bash
# Clone the official self-hosted stack
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker

# Copy and edit the env file
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY
# Generate JWT secrets with: openssl rand -base64 32

podman-compose up -d
```

> The `.env.example` file contains detailed comments for every variable. At minimum set `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, and `SERVICE_ROLE_KEY`.

Access Supabase Studio at `http://localhost:3000`.

**Caddy:**
```caddyfile
supabase.home.local { tls internal; reverse_proxy localhost:3000 }
```

---

## NocoDB (Airtable on PostgreSQL)

**Purpose:** Turns any existing PostgreSQL, MySQL, or SQLite database into an Airtable-style spreadsheet UI with forms, views (grid, gallery, Kanban), and a REST API — without touching your schema. Essential for giving non-technical team members a usable frontend over raw database tables.

```yaml
# ~/nocodb/compose.yaml
services:
  nocodb:
    image: nocodb/nocodb:latest
    ports:
      - 127.0.0.1:8180:8080
    environment:
      NC_DB: pg://db:5432?u=nocodb&p=changeme&d=nocodb
      NC_AUTH_JWT_SECRET: changeme-run-openssl-rand-hex-32
    depends_on: [db]
    volumes:
      - /home/user/nocodb/data:/usr/app/data:Z
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: nocodb
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: nocodb
    volumes:
      - nocodb_pg_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  nocodb_pg_data:
```

```bash
cd ~/nocodb && podman-compose up -d
```

**Caddy:**
```caddyfile
nocodb.home.local { tls internal; reverse_proxy localhost:8180 }
```

---

## Adminer

**Purpose:** Lightweight, single-file database management interface supporting MySQL, PostgreSQL, SQLite, and Oracle. Useful for quick inspection without installing a full GUI.

```yaml
# ~/adminer/compose.yaml
services:
  adminer:
    image: adminer
    ports:
      - 127.0.0.1:8089:8080
    restart: unless-stopped
```

```bash
cd ~/adminer && podman-compose up -d
```

Access at `http://localhost:8089`. Enter `host.containers.internal` as the server address when connecting to a database in another container.

---

## CloudBeaver (Universal Database GUI)

**Purpose:** Web-based, multi-database IDE from the makers of DBeaver. Supports PostgreSQL, MySQL/MariaDB, SQLite, ClickHouse, MongoDB, Redis, and 40+ other databases — all from a single browser tab. Offers a full SQL editor with autocomplete, ERD diagrams, data export/import, and role-based access controls.

```yaml
# ~/cloudbeaver/compose.yaml
services:
  cloudbeaver:
    image: dbeaver/cloudbeaver:latest
    ports:
      - 127.0.0.1:8978:8978
    volumes:
      - /home/user/cloudbeaver/workspace:/opt/cloudbeaver/workspace:Z
    restart: unless-stopped
```

```bash
cd ~/cloudbeaver && podman-compose up -d
```

Access at `http://localhost:8978`. Complete the initial setup wizard, then add connections under **Connection → New Connection** — use `host.containers.internal` as the host for other containers.

**Caddy:**
```caddyfile
db-gui.home.local { tls internal; reverse_proxy localhost:8978 }
```

> **Adminer vs CloudBeaver:** Adminer is zero-config, instant-start, ideal for one-off inspection. CloudBeaver is a full web IDE with saved connections, shared team access, query history, and ERD diagrams — better for regular development work.

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
| Vector/semantic search (AI/RAG) | Qdrant / Weaviate |
| Vector search in existing PostgreSQL | pgvector |
| Vector search, LLM-app SDK simplicity | Chroma |
| SQLite with replication | Litestream |
| Metrics & IoT (line protocol) | InfluxDB |
| Local OLAP / data analysis on files | DuckDB |
| High-throughput server-side OLAP / analytics | ClickHouse |
| Multi-model (relational + graph + doc) | SurrealDB |
| Lightweight app backend (SQLite + Auth + API) | PocketBase |
| Full BaaS (PostgreSQL + Auth + Realtime + Storage) | Supabase |
| Visual spreadsheet UI over existing DB | NocoDB |
| Universal web-based DB GUI (multi-database) | CloudBeaver |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| PostgreSQL `FATAL: password authentication failed` | Verify `POSTGRES_USER` and `POSTGRES_PASSWORD` match; recreate the volume if the DB was initialised with different credentials |
| Redis `NOAUTH` error | Add `--requirepass changeme` to the command; update clients to pass the password |
| MongoDB `auth failed` | Ensure client uses `admin` database for auth: add `?authSource=admin` to the connection string |
| Qdrant collection not found | Collections are created via API or the web UI dashboard; Qdrant does not auto-create on insert |
| InfluxDB can't accept writes | Verify the org name and bucket match `DOCKER_INFLUXDB_INIT_ORG` and `DOCKER_INFLUXDB_INIT_BUCKET` exactly |
| Adminer shows no database | Connect to `host.containers.internal` (not `localhost`) when the database is in another container |
| Kafka consumer lag growing | Check partition count vs consumer count; increase partitions or add consumer instances; verify no consumer is crashing |
| Kafka topic not created | Ensure `KAFKA_AUTO_CREATE_TOPICS_ENABLE=true` or create manually with `kafka-topics --create` |
| Kafka KRaft broker not starting | Ensure `CLUSTER_ID` is set (generate with `kafka-storage random-uuid`); verify `KAFKA_PROCESS_ROLES`, `KAFKA_NODE_ID`, and `KAFKA_CONTROLLER_QUORUM_VOTERS` are all consistent |
| Neo4j heap OOM | Increase `NEO4J_dbms_memory_heap_max__size` — default is 512m; graph queries on large datasets need more |
| Cassandra connection refused | Cassandra takes 30–60 s to start; check `podman logs cassandra` for `Starting listening for CQL clients` |
| CockroachDB `node is not ready` | Single-node startup takes a few seconds; retry with `podman exec cockroachdb cockroach sql --insecure` after 10 s |
| TimescaleDB extension not found | Run `CREATE EXTENSION timescaledb;` in `psql` after first connection; must be enabled per database |
| Redpanda schema registry errors | Ensure schema registry port `8081` is not blocked; it is separate from the Kafka broker port `9092` |
| Weaviate vectorisation fails | Verify Ollama is running and `TEXT2VEC_OLLAMA_APIENDPOINT` resolves; pull the embedding model: `podman exec ollama ollama pull nomic-embed-text` |
| RabbitMQ management UI unreachable | Ensure port `15672` is exposed; management plugin is bundled in the `-management` image tag |
| RabbitMQ messages not consumed | Check consumer acknowledgement mode — unacked messages stay in queue; verify the consumer is running and connected |
| NATS JetStream not persisting | Ensure `store_dir` is set in config and the `/data` volume is mounted; `jetstream {}` block must be present |
| Typesense collection not found | Collections must be explicitly created before indexing; verify the API key matches `TYPESENSE_API_KEY` |
| DuckDB Parquet read error | Ensure the file path inside the container matches the volume mount; DuckDB requires read permissions on the file |
| SurrealDB connection refused | Verify the `--conn` URL uses `http://` not `https://` for local connections; check the namespace and database exist |
| Dragonfly `ulimit` warning on startup | Set `ulimits: memlock: -1` in the compose service; Dragonfly requires unlimited locked memory |
| FerretDB command not supported | Check the [FerretDB compatibility list](https://docs.ferretdb.io/reference/supported-commands/) — some advanced MongoDB aggregation stages are not yet implemented |
| PocketBase admin blank on first load | Visit `http://localhost:8090/_/` (note the trailing slash) to trigger admin setup |
| Supabase Studio not loading | Wait 60–90 s for all services to initialise; Kong and GoTrue must be healthy before Studio loads |
| NocoDB `Cannot read properties of undefined` on connect | Ensure `NC_DB` uses the `pg://` URI scheme with correct credentials; check the PostgreSQL container is fully started |
| pgvector `type "vector" does not exist` | Run `CREATE EXTENSION IF NOT EXISTS vector;` in the target database; must be enabled per database |
| Chroma collection not persisting after restart | Ensure `IS_PERSISTENT: "TRUE"` is set and the `/chroma/chroma` volume is correctly mounted |
| Chroma `Connection refused` from Python | Verify `chromadb.HttpClient(host="localhost", port=8000)` — the default `chromadb.Client()` is in-memory only |
| ClickHouse `Connection refused` on port 8123 | Ensure `<listen_host>0.0.0.0</listen_host>` is in the custom config; by default ClickHouse only binds to localhost |
| CloudBeaver can't connect to container databases | Use `host.containers.internal` instead of `localhost`; set the port to the host-side mapped port |
