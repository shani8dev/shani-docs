---
title: Databases — Redis & Compatible Alternatives
section: Self-Hosting & Servers
updated: 2026-08-28
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

#### Common operations
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

### Redis Data Structures

Redis is not just a key-value store — it has five core data types, each suited to different use cases:

**String:** — the default. Any binary-safe value up to 512 MB. Used for caching, counters, rate limiting.
```bash
SET session:abc123 '{"user_id": 42}' EX 3600   # with 1-hour TTL
INCR page_views:home                             # atomic counter
```

**List:** — ordered, allows duplicates. Implemented as a doubly-linked list. Used for queues and activity feeds.
```bash
LPUSH jobs:email '{"to":"alice@example.com"}'   # push to head (producer)
BRPOP jobs:email 30                              # blocking pop from tail (consumer, 30s timeout)
```

**Set:** — unordered, unique members. Used for tags, unique visitors, friend lists.
```bash
SADD online_users user:42 user:99
SISMEMBER online_users user:42                   # is user:42 online?
SINTER premium_users active_users               # intersection: premium AND active
```

**Sorted Set:** — unique members each with a float score. Members are ordered by score. Used for leaderboards, priority queues, rate limiting with sliding windows.
```bash
ZADD leaderboard 9850 "alice" 7200 "bob"
ZRANGE leaderboard 0 9 REV WITHSCORES           # top 10, highest score first
ZADD leaderboard INCR 100 "alice"               # add 100 to alice's score
```

**Hash:** — field-value pairs within a single key. More memory-efficient than storing each field as a separate string key. Used for objects, user profiles, configuration.
```bash
HSET user:42 name "Alice" email "alice@example.com" role "admin"
HGET user:42 email
HGETALL user:42
```

#### Pub/Sub vs Streams vs Lists for messaging
- **Pub/Sub** (`SUBSCRIBE`, `PUBLISH`) — fire-and-forget. Messages are delivered to current subscribers only; no persistence, no acknowledgement.
- **Lists** with `BRPOP` — simple work queue. One producer, one consumer per message. Good for tasks.
- **Streams** (`XADD`, `XREADGROUP`) — persistent, consumer-group-aware event log. Replay, acknowledgement, multiple consumer groups. The closest Redis equivalent to Kafka.

### Redis Persistence Modes

Redis has two persistence mechanisms with fundamentally different trade-offs:

**RDB (Redis Database Snapshot):** — point-in-time snapshots saved to disk periodically. Compact, fast to load on restart, but you lose all writes since the last snapshot if Redis crashes.

**AOF (Append-Only File):** — every write command is appended to a log file. Configurable fsync policy: `always` (safe, slow), `everysec` (default, loses at most 1 second of data), `no` (fastest, OS decides).

```bash
# Enable AOF (what --appendonly yes does)
redis-server --appendonly yes --appendfsync everysec

# Enable RDB snapshots every 60 seconds if 1000 keys changed
redis-server --save 60 1000

# Use both (recommended for production)
redis-server --appendonly yes --save 900 1 --save 300 10 --save 60 10000
```

#### Trade-off summary
RDB gives faster restarts and smaller files; AOF gives better durability. For a homelab cache, losing a few seconds of data on crash is usually acceptable — use AOF with `everysec`. For session storage or queues where losing data matters, use `always` or run both.

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

#### Common operations
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

