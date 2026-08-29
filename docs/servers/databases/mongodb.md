---
title: Databases — MongoDB & FerretDB
section: Self-Hosting & Servers
updated: 2026-08-28
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

#### Common operations
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

#### Common operations
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

