---
title: Network Debugging Quick Reference
section: Networking
updated: 2026-08-28
---

> **Part of the Networking & Infrastructure series:** See [all networking docs](../networking)

## Network Debugging Quick Reference

These commands are the foundation of diagnosing connectivity, DNS, and firewall problems on any Linux host.

```bash
# Show all active connections and their state
ss -s

# Find what process is listening on a specific port
ss -tlnp | grep :443
ss -tlnp | grep :8080

# Show all established TCP connections
ss -tn state established

# Trace the path to a host (TCP, bypasses ICMP blocks)
traceroute -T -p 443 example.com

# Capture packets on an interface (write to file for Wireshark)
sudo tcpdump -i eth0 -n 'port 443' -w /tmp/capture.pcap
sudo tcpdump -i eth0 -n 'host 1.1.1.1'
sudo tcpdump -i podman1 -n 'port 5432'   # capture container traffic

# DNS debugging — full recursive trace
dig +trace example.com

# Query a specific resolver
dig @1.1.1.1 example.com
dig @localhost example.com         # test your Pi-hole / AdGuard

# Check if a port is reachable (without telnet)
curl -v --connect-timeout 5 telnet://192.168.1.100:5432

# Show listening ports and their process
ss -tlnp
# or: lsof -i -P -n | grep LISTEN
```

#### TCP connection states to know

- `ESTABLISHED` — active connection in use
- `TIME_WAIT` — connection closed, waiting for delayed packets to expire (default 60–120s). High TIME_WAIT count on a busy server is normal but can exhaust ephemeral ports — tune `net.ipv4.tcp_tw_reuse` if needed.
- `CLOSE_WAIT` — the remote end closed the connection but the local application hasn't called `close()` yet. Persistent CLOSE_WAIT usually indicates a bug in the application.
- `SYN_SENT` — connection attempt in progress, SYN sent but SYN-ACK not yet received. Stuck connections here usually indicate the remote is unreachable or filtered by a firewall.

---



---

## See Also

- [Networking & Infrastructure](networking) — overview
