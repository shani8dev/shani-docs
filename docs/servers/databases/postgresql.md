---
title: Databases — PostgreSQL & MariaDB
section: Self-Hosting & Servers
updated: 2026-08-28
---

## CAP Theorem Quick Reference

The CAP theorem states that a distributed system can guarantee at most two of three properties: **Consistency** (all nodes see the same data at the same time), **Availability** (every request gets a response), and **Partition tolerance** (the system continues operating when network partitions occur). Since real networks always partition eventually, the real choice is between CP and AP.

| Database | CAP Classification | What this means in practice |
|----------|-------------------|------------------------------|
| PostgreSQL (single node) | CA | No partition tolerance — not distributed. ACID guarantees fully. |
| PostgreSQL + Patroni | CP | During failover election, the primary is unavailable. Consistency is never compromised. |
| Redis (single) | CA | No partition tolerance. Synchronous but not distributed. |
| Redis Sentinel | CP | Primary unavailable during failover election (~5s). |
| Cassandra / ScyllaDB | AP | Always available. Eventual consistency — reads may return stale data. Tune with `QUORUM` consistency level to move toward CP. |
| MongoDB Replica Set | CP | Primary unavailable during re-election. Strongly consistent by default. |
| Kafka | AP | Brokers stay available; consumers may see stale offsets during partition. |
| CockroachDB | CP | Strong consistency (serializable isolation) with partition tolerance. May be temporarily unavailable in split-brain. |
| etcd | CP | Refuses requests if quorum is lost. Never returns stale data. |

#### ACID vs BASE — the reliability spectrum
ACID (Atomicity, Consistency, Isolation, Durability) is the contract of traditional relational databases: every transaction either fully commits or fully rolls back, leaving the database in a consistent state, isolated from concurrent transactions, and durable on disk. BASE (Basically Available, Soft state, Eventually consistent) is the contract of distributed systems like Cassandra and early DynamoDB: the system is always available, but data may be temporarily inconsistent across nodes and will converge eventually. Most modern systems let you tune where on this spectrum you operate — Cassandra's `CONSISTENCY QUORUM` leans toward ACID; `CONSISTENCY ONE` leans toward BASE.

#### Indexing — the single most impactful performance lever
An index is a separate data structure (B-tree by default in PostgreSQL/MariaDB) that maps column values to row locations, turning a sequential table scan O(n) into a lookup O(log n). A query on an un-indexed column on a 10M-row table reads every row; the same query with an index reads ~23 rows. Trade-offs: indexes speed up reads but slow down writes (every INSERT/UPDATE must update the index). Partial indexes (PostgreSQL: `WHERE deleted_at IS NULL`) index only a subset of rows. Composite indexes are ordered — `(a, b)` helps queries on `a` or `(a, b)` but not `b` alone. `EXPLAIN ANALYZE` shows whether an index is used.

#### Connection pooling — why PgBouncer exists
PostgreSQL spawns a new OS process for every connection (unlike MySQL/MariaDB which use threads). Each process consumes ~5–10 MB of RAM. A web app with 100 concurrent workers each holding an idle connection wastes 500–1000 MB and creates scheduler pressure. PgBouncer sits between the app and PostgreSQL, multiplexing hundreds of app connections onto a small pool of actual database connections (transaction pooling: a connection is only held during a transaction, then returned to the pool). Dragonfly and Redis don't have this problem — they're single-threaded and handle connections via event loops.

#### Message queues vs event streaming — when to use each
A message queue (RabbitMQ, NATS) delivers each message to exactly one consumer, then deletes it. It's a task distribution system — ideal for job queues, email sending, and RPC. An event stream (Kafka, Redpanda) retains messages for a configurable period (days/weeks) and lets multiple independent consumers read them at their own pace. It's a shared, replayable log — ideal for audit trails, event sourcing, feeding multiple downstream systems (analytics, search indexing, ML pipelines) from one producer. The key question: do you want messages consumed and forgotten (queue) or permanently recorded and replayable (stream)?

#### Vector databases and embeddings — the AI infrastructure layer
A vector database (Qdrant, Weaviate, Chroma, pgvector) stores high-dimensional float vectors (embeddings) and answers "find the N most similar vectors to this query vector" using approximate nearest-neighbour (ANN) algorithms (HNSW, IVF). Embeddings are produced by ML models — a 1536-dimension float array that encodes semantic meaning. Two semantically similar sentences produce nearby vectors. This enables RAG (Retrieval-Augmented Generation): embed your documents, store in Qdrant, embed a user query, find the most similar document chunks, pass them as context to an LLM. pgvector adds this capability to PostgreSQL; Qdrant/Weaviate are purpose-built for scale.

#### Time-series data model — why specialised databases exist
Time-series data (metrics, IoT sensor readings, financial ticks) has properties regular databases handle poorly: extremely high write throughput (millions of inserts/second), data is always appended (rarely updated), queries are almost always range-based (last 24h, 7-day average), and old data is downsampled or expired. TimescaleDB adds automatic partitioning by time (hypertables) and continuous aggregates to PostgreSQL. InfluxDB uses a custom storage engine (TSM) optimised for these access patterns. The key concept: *retention policies* automatically delete data older than N days, preventing unbounded disk growth.

#### OLTP vs OLAP — two different access patterns
OLTP (Online Transaction Processing) databases (PostgreSQL, MariaDB, MongoDB) are optimised for high-frequency, low-latency reads and writes of individual rows — your app's operational database. OLAP (Online Analytical Processing) databases (ClickHouse, DuckDB, Redshift) are optimised for aggregate queries over millions of rows — your analytics and reporting layer. OLAP databases use columnar storage: data for one column is stored contiguously on disk, so `SELECT AVG(revenue) FROM orders` reads only the revenue column, not every field. Row-oriented databases read every column for every matching row. DuckDB runs OLAP queries directly on Parquet files; ClickHouse handles billions of rows per second on a single node.

#### Graph databases — when the relationships are the data
In a relational database, joining two tables is a set operation that scans rows. In a graph database (Neo4j), relationships are first-class objects stored with direct pointers — traversing "friends of friends" follows pointers in memory without scanning tables. Graph databases excel at: social networks (mutual connections, influence paths), recommendation engines (people who bought X also bought Y), access control graphs (who can access what via which roles), and network topology (how many hops between two nodes). Cypher (Neo4j's query language) expresses graph patterns naturally: `MATCH (a:User)-[:FOLLOWS]->(b:User)-[:FOLLOWS]->(c:User) WHERE a.name = 'Alice' RETURN c`.

#### Full-text search relevance — why MeiliSearch/Typesense aren't just SQL LIKE
SQL `LIKE '%query%'` does a sequential scan, can't rank by relevance, and doesn't handle typos. A search engine (MeiliSearch, Typesense, Elasticsearch) builds an inverted index — a map from each word to the documents containing it. Relevance ranking uses TF-IDF (term frequency × inverse document frequency) or BM25: rare words that appear often in a specific document are strong signals. Typo tolerance uses Levenshtein distance. Faceted search filters by structured attributes (category, price range) while ranking by full-text relevance. Use a dedicated search engine when you need: typo tolerance, relevance ranking, instant-search UX, or faceting.

#### Sharding vs partitioning
Partitioning splits a single table into multiple storage segments on one node — PostgreSQL table partitioning by date, MySQL partitioning by range. This improves query performance (only scan the relevant partition) and maintenance (drop old partitions instead of DELETE). Sharding distributes data across multiple nodes — each shard is a separate database server handling a subset of data. Sharding is for horizontal scale beyond what one node can handle. The challenge: cross-shard queries (join data on shard 1 with data on shard 2) require application-level handling or a distributed query layer (Citus, CockroachDB). The rule: partition first (cheap, always useful), shard only when necessary (expensive operationally).
---

## Key Concepts

#### SQL vs NoSQL — the real distinction
The choice isn't binary. The real question is: what access patterns does your application need? Relational databases (PostgreSQL, MariaDB) excel at complex joins, ad-hoc queries, and strong consistency. Document stores (MongoDB) excel when records are self-contained and schema flexibility matters. Wide-column stores (Cassandra, ScyllaDB) excel at write-heavy time-series workloads where queries always include a partition key. Use the wrong tool and you're fighting the data model on every query.

#### ACID vs BASE — what these actually mean
- **ACID** (Atomic, Consistent, Isolated, Durable) — every transaction either fully succeeds or fully rolls back; concurrent transactions don't see each other's partial state; committed data survives crashes. PostgreSQL, MySQL (InnoDB). The default expectation in any financial or transactional system.
- **BASE** (Basically Available, Soft state, Eventually consistent) — the system stays available even during failures; different nodes may temporarily disagree on state; they will converge eventually. Cassandra, DynamoDB. The default model for high-write, geographically distributed systems.

#### Indexes — how they work and when they hurt
An index is a separate data structure (usually a B-tree) that the database maintains alongside a table. Reads using the index skip full table scans — fast. Writes (INSERT, UPDATE, DELETE) are slower because every index must be updated. The pathological case: a table with 15 indexes on a write-heavy workload — each write touches 15 B-trees. Rule of thumb: index columns used in WHERE, JOIN, and ORDER BY clauses on tables with > 10,000 rows. Use `EXPLAIN ANALYZE` (Postgres) or `EXPLAIN` (MySQL) to verify an index is actually being used.

#### Connection pooling — why it matters at scale
PostgreSQL creates a backend process per connection. At 500 connections, you have 500 processes. PgBouncer sits in front and multiplexes thousands of app-side connections onto a small real pool. The app sees a normal database on port 5432 — pooling is transparent. Standard in any production PostgreSQL deployment handling more than a few dozen concurrent users.

#### N+1 query problem
Fetching a list of N items then making N additional queries for related data. Example: fetch 100 users, then loop to fetch each user's profile — 101 queries instead of 1 JOIN. ORM frameworks (ActiveRecord, SQLAlchemy) are the most common source. Fix: eager loading (`.includes()`, `.joinedload()`) or an explicit JOIN. A standard interview question for any backend role.

#### Read replicas vs sharding
A read replica receives all writes from the primary and serves read queries. Scales reads but not writes — all writes still go to one primary. Sharding splits data across multiple primaries (each handles a subset by user ID or hash). Scales both, but cross-shard joins are expensive or impossible. Default path: add a read replica first; shard only when write throughput is the proven bottleneck.

#### Database migrations — forward-compatible patterns
Schema changes that break running app code during deployment cause downtime. Safe pattern for adding a required column: (1) add as nullable — app ignores it, (2) backfill existing rows, (3) make non-null in a later migration after all app instances are updated. For dropping a column: stop reading/writing it in app code first, then drop in a separate migration. Never couple a breaking schema change and the app change in the same deployment.

#### Portability note
Compose examples use rootless **Podman** and `host.containers.internal`. When using Docker, replace `podman-compose` with `docker compose` and `host.containers.internal` with `host-gateway` (add `extra_hosts: [host-gateway:host-gateway]` to the service).

#### WAL (Write-Ahead Log) — the foundation of database durability
Before any change is written to the actual data files, it's appended to the WAL (also called redo log in MySQL, binlog in some contexts). On crash, the database replays the WAL to recover uncommitted transactions. This is what makes PostgreSQL and MySQL ACID-compliant. The WAL also powers streaming replication (standbys replay the primary's WAL) and point-in-time recovery (replay WAL from a base backup to any point in time). Understanding WAL is essential for explaining how replication, backup, and crash recovery work in interviews.

#### VACUUM and autovacuum in PostgreSQL
PostgreSQL uses MVCC (Multi-Version Concurrency Control) — old row versions are kept visible to concurrent transactions rather than being immediately overwritten. Dead tuples (old versions no longer needed) accumulate over time and must be reclaimed by VACUUM. autovacuum runs in the background and handles this automatically, but it can fall behind on high-churn tables. Symptoms of autovacuum lag: table bloat (physical size >> logical data size), slow sequential scans, and eventually transaction ID wraparound (a hard limit at 2 billion transactions that can cause database shutdown). Monitor `pg_stat_user_tables.n_dead_tup` and `autovacuum_count`.

#### Database connection limits and pooling tiers
PostgreSQL has a `max_connections` setting (default 100). Each connection is a backend process using ~5–10 MB RAM. At 200 connections you're using 1–2 GB just for connection overhead. The pooling stack: application → PgBouncer (transaction-mode pooling, 1000s of app connections → 20–50 real connections) → PostgreSQL. Transaction-mode pooling means a connection is only held for the duration of a single transaction — prepared statements and `SET` session variables don't work across transactions in this mode. Session-mode pooling is safer but provides less multiplexing benefit. For Kubernetes workloads, PgBouncer as a sidecar or as a shared service both work.

#### Schema migration tools — Flyway vs Liquibase vs Alembic
Schema migrations must be versioned, reproducible, and trackable. **Flyway**: SQL-first, simple, versioned files (`V1__create_users.sql`), Java or CLI. **Liquibase**: XML/YAML/JSON changesets with rollback support; more complex but supports diff-based migration generation. **Alembic** (Python): generates migration files from SQLAlchemy model diffs — developer-friendly but requires careful review since auto-generated migrations can miss edge cases. All three maintain a migration history table in the database. The rule: every schema change goes through a migration file committed to Git, never run directly against production.

---

## MariaDB

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

#### Common operations
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

### JSON vs JSONB

PostgreSQL has two JSON types with an important difference:

- **`json`** stores the raw text of the JSON document, preserving whitespace and key order. Every query re-parses the text. Fast to write, slow to query.
- **`jsonb`** stores a parsed binary representation, normalises key order, and supports GIN indexing. Slightly slower to write, much faster to query. Use `jsonb` for almost everything.

```sql
-- GIN index on jsonb — makes @>, ?, ?| operators fast
CREATE INDEX ON documents USING GIN (metadata);

-- Query: find all documents where metadata contains a specific key
SELECT id FROM documents WHERE metadata ? 'author';

-- Query: containment — metadata must contain this subset
SELECT id FROM documents WHERE metadata @> '{"status": "published"}';
```

### PostgreSQL Index Types

| Index Type | Best For | Notes |
|-----------|----------|-------|
| **B-tree** (default) | Equality and range queries (`=`, `<`, `>`, `BETWEEN`) | Works for most cases |
| **Hash** | Equality only (`=`) | Faster than B-tree for pure equality, no range support |
| **GIN** | `jsonb`, arrays, full-text search, `LIKE '%pattern%'` | Handles multiple values per row |
| **BRIN** | Very large tables with naturally ordered data (timestamps, sequential IDs) | Tiny index, useful for append-only logs |
| **GiST** | Geometric data, full-text search with ranking, range types | More flexible than GIN for some workloads |

Use `EXPLAIN ANALYZE` to verify an index is being used:
```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE created_at > NOW() - INTERVAL '7 days';
-- Look for "Index Scan" vs "Seq Scan" — a Seq Scan on a large table indicates a missing index
```

**Partial indexes:** index only a subset of rows — useful for filtering on a common condition:
```sql
-- Only index active users — much smaller, faster for this specific query
CREATE INDEX ON users (email) WHERE active = true;
```

**Covering indexes:** include extra columns so the query can be satisfied from the index alone without touching the table:
```sql
-- Include username so queries that fetch both email+username don't need a table lookup
CREATE INDEX ON users (email) INCLUDE (username);
```

#### pgAdmin (PostgreSQL GUI)
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

#### Common operations
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

##### Set up a vector table and index

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

#### Operators
- `<=>` — cosine distance (most common for text embeddings)
- `<->` — L2 (Euclidean) distance
- `<#>` — negative inner product (for dot-product similarity)

##### Generate embeddings with Ollama and store them (Python example)

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

## PgBouncer (PostgreSQL Connection Pooler)

**Purpose:** PostgreSQL is process-based — every client connection spawns a separate backend process. Under high load (hundreds of concurrent connections from an application server), this becomes the bottleneck. PgBouncer sits between your app and PostgreSQL, maintaining a small pool of real database connections and multiplexing many application connections onto them.

#### Pool modes
- **Transaction mode** (recommended) — a database connection is held only for the duration of a single transaction. Most efficient, but prepared statements and session-level features (`SET`, advisory locks) don't work across transactions.
- **Session mode** — a database connection is held for the entire application session. Fully transparent to the app but uses more connections.
- **Statement mode** — one database connection per SQL statement. Very aggressive; breaks multi-statement transactions.

```yaml
# ~/pgbouncer/compose.yaml
services:
  pgbouncer:
    image: edoburu/pgbouncer:latest
    ports:
      - 127.0.0.1:5432:5432    # apps connect here instead of directly to postgres
    environment:
      DB_HOST: host.containers.internal
      DB_PORT: 5432
      DB_USER: myuser
      DB_PASSWORD: strongpassword
      POOL_MODE: transaction
      MAX_CLIENT_CONN: 1000     # max app-side connections
      DEFAULT_POOL_SIZE: 25     # actual connections to PostgreSQL
      AUTH_TYPE: scram-sha-256
    restart: unless-stopped
```

```bash
cd ~/pgbouncer && podman-compose up -d
```

#### Check pool status
```bash
# Connect to the PgBouncer admin interface
psql -h localhost -p 5432 -U myuser pgbouncer -c "SHOW POOLS;"
psql -h localhost -p 5432 -U myuser pgbouncer -c "SHOW STATS;"
psql -h localhost -p 5432 -U myuser pgbouncer -c "SHOW CLIENTS;"
```

> Applications connect to PgBouncer on port 5432 exactly as they would connect directly to PostgreSQL — the pooling is completely transparent. Change only the host/port in your connection string.

