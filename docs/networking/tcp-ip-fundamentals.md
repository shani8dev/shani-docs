---
title: TCP/IP Fundamentals
section: Networking
updated: 2026-08-28
---

> **Part of the Networking & Infrastructure series:** See [all networking docs](../networking)

## TCP/IP Fundamentals

### The TCP Three-Way Handshake

Every TCP connection opens with a three-message exchange:

1. **SYN** — client sends a segment with the SYN flag, picks an initial sequence number
2. **SYN-ACK** — server acknowledges the client's SYN and sends its own SYN
3. **ACK** — client acknowledges the server's SYN. Connection is now established.

This is why connection setup has a minimum latency of 1.5× the round-trip time (RTT) — three messages across two RTTs. TLS 1.3 reduces this further with 0-RTT resumption for known sessions.

### TCP vs UDP

| Property | TCP | UDP |
|----------|-----|-----|
| Reliability | Guaranteed delivery, retransmission on loss | Best-effort, no retransmission |
| Order | Ordered delivery | Out-of-order delivery possible |
| Connection | Connection-oriented (handshake) | Connectionless |
| Overhead | Higher (headers, ACKs, state) | Lower |
| Use cases | HTTP, PostgreSQL, SSH — anything correctness-critical | DNS, VoIP, video streaming, WireGuard |

WireGuard uses UDP specifically because the VPN layer handles its own reliability, and UDP's stateless nature makes it more resilient to brief packet loss and network changes (roaming between WiFi and mobile data).

---



---

## See Also

- [Networking & Infrastructure](networking) — overview
