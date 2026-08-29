---
title: How Container Networking Works
section: Networking
updated: 2026-08-28
---

> **Part of the Networking & Infrastructure series:** See [all networking docs](../networking)

## How Container Networking Works

Understanding what Podman does under the hood helps debug connectivity issues between containers and the host.

#### When you start a container with `-p 8080:80`

1. Podman creates a **veth pair** — a virtual Ethernet cable with one end in the container's network namespace and one end on the host's bridge.
2. The host end is connected to a **bridge device** (e.g., `podman1` or `cni-podman0`). The bridge acts like a virtual switch.
3. Podman adds an **iptables NAT rule** to forward packets arriving on host port 8080 to the container's IP on port 80.
4. A return NAT rule ensures response packets are masqueraded back through the host IP.

```bash
# See the bridge Podman created
ip link show type bridge
ip addr show podman1    # or cni-podman0

# See veth pairs (one end in container, one on bridge)
ip link show type veth

# See Podman's NAT rules
sudo iptables -t nat -L PODMAN -n -v

# Find a container's IP address
podman inspect jellyfin --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'

# Ping a container from the host using its IP directly
ping $(podman inspect jellyfin --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
```

#### Why `host.containers.internal` exists
when a container needs to reach a service on the host (e.g., a database not in a container), it can't use `localhost` — that resolves to its own network namespace. `host.containers.internal` is a special DNS name Podman provides that resolves to the host's IP as seen from the container.

---



---

## See Also

- [Networking & Infrastructure](networking) — overview
