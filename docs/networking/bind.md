---
title: BIND (Authoritative DNS)
section: Networking
updated: 2026-04-20
---

# BIND — Authoritative DNS Server

BIND (`named`) is the most widely deployed DNS server. On Shani OS it is pre-installed and provides two distinct functions that are often combined but can be used independently:

- **Authoritative server** — the canonical source of truth for a zone (e.g., `home.local`). Other resolvers query it for answers about your domain.
- **Recursive / caching resolver** — forwards queries upstream and caches results locally.

For simple local DNS and DHCP on a homelab, **dnsmasq** is lighter and easier to configure. Use BIND when you need a full authoritative zone with proper SOA/NS records, zone transfers to secondary servers, DNSSEC signing, or split-horizon DNS.

`named` state and zone files persist in `/var/named`, bind-mounted from `/data/varlib/named`, and survive OS updates.

---

## Enable

```bash
sudo systemctl enable --now named

# Check status
systemctl status named

# Watch logs
journalctl -u named -f
```

---

## Configuration

The main config is `/etc/named.conf`. Zones are typically stored in `/var/named/`.

### Caching / Forwarding Resolver Only

Use this when you want a local caching resolver that forwards to an upstream (e.g., to use alongside dnsmasq for split DNS, or as a standalone resolver):

```
// /etc/named.conf
options {
    directory "/var/named";
    listen-on { 127.0.0.1; };   // localhost only — change to 0.0.0.0 for LAN
    allow-query { localhost; 192.168.1.0/24; };
    recursion yes;

    forwarders {
        1.1.1.1;
        8.8.8.8;
    };
    forward only;

    dnssec-validation auto;
};
```

### Authoritative Zone for `home.local`

A split-horizon setup: BIND is authoritative for `home.local` while forwarding all other queries upstream. This is the recommended homelab pattern.

```
// /etc/named.conf
options {
    directory "/var/named";
    listen-on { any; };
    allow-query { localhost; 192.168.1.0/24; };
    recursion yes;

    forwarders { 1.1.1.1; 8.8.8.8; };
    forward only;

    dnssec-validation auto;
};

// Authoritative for home.local (forward zone)
zone "home.local" IN {
    type master;
    file "home.local.zone";
    allow-update { none; };
};

// Authoritative for reverse zone (192.168.1.x → hostname)
zone "1.168.192.in-addr.arpa" IN {
    type master;
    file "192.168.1.rev";
    allow-update { none; };
};
```

### Zone File: `/var/named/home.local.zone`

```dns
$TTL 86400
@   IN  SOA  ns1.home.local. admin.home.local. (
        2026042001  ; Serial (date + increment: YYYYMMDDnn)
        3600        ; Refresh
        900         ; Retry
        604800      ; Expire
        300 )       ; Negative cache TTL

; Name servers
@       IN  NS   ns1.home.local.

; A records
ns1     IN  A    192.168.1.1
router  IN  A    192.168.1.1
nas     IN  A    192.168.1.10
printer IN  A    192.168.1.20
desktop IN  A    192.168.1.50

; CNAME aliases
files   IN  CNAME nas.home.local.
```

### Reverse Zone File: `/var/named/192.168.1.rev`

```dns
$TTL 86400
@   IN  SOA  ns1.home.local. admin.home.local. (
        2026042001
        3600
        900
        604800
        300 )

@       IN  NS   ns1.home.local.

; PTR records (last octet only)
1       IN  PTR  router.home.local.
10      IN  PTR  nas.home.local.
20      IN  PTR  printer.home.local.
50      IN  PTR  desktop.home.local.
```

---

## Applying Changes

```bash
# Check config syntax
sudo named-checkconf

# Check a zone file
sudo named-checkzone home.local /var/named/home.local.zone

# Reload zones without restarting (increment Serial first)
sudo systemctl reload named

# Force reload of all zones
sudo rndc reload

# Reload a single zone
sudo rndc reload home.local

# Flush the DNS cache
sudo rndc flush
```

> **Always increment the Serial number** in the SOA record before reloading — secondary servers and caches use this to detect changes. The convention is `YYYYMMDDnn` (e.g., `2026042001` for the first change on 2026-04-20).

---

## Zone Transfers (Primary → Secondary)

Allow a secondary BIND server to receive zone transfers:

```
// On the primary — add to the zone block:
zone "home.local" IN {
    type master;
    file "home.local.zone";
    allow-transfer { 192.168.1.2; };   // secondary server IP
    notify yes;
};
```

```
// On the secondary:
zone "home.local" IN {
    type slave;
    file "slaves/home.local.zone";
    masters { 192.168.1.1; };
};
```

---

## Firewall

```bash
sudo firewall-cmd --add-service=dns --permanent
sudo firewall-cmd --reload
```

---

## Testing

```bash
# Query your BIND server directly
dig @127.0.0.1 nas.home.local
dig @127.0.0.1 -x 192.168.1.10    # reverse lookup

# Verify the server is authoritative (should show 'aa' flag)
dig @127.0.0.1 home.local SOA

# Check from another machine on the LAN
dig @192.168.1.1 nas.home.local
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `named` won't start | Run `sudo named-checkconf` — syntax errors in `named.conf` prevent startup; check `journalctl -u named` |
| Zone not loading | Run `sudo named-checkzone home.local /var/named/home.local.zone` — common causes are missing trailing dots on FQDNs and wrong Serial format |
| Queries returning `SERVFAIL` | DNSSEC validation failing — set `dnssec-validation no;` temporarily to isolate; or ensure `dnssec-validation auto;` and that upstream resolvers support DNSSEC |
| Recursive queries not working from LAN | Check `allow-query` and `recursion yes` are set in `options {}` |
| Changes not picked up | Increment the Serial in the zone file, then run `sudo rndc reload home.local` |
| Port 53 conflict with dnsmasq | Run only one resolver on port 53 — either configure dnsmasq to forward `.home.local` to BIND on a non-standard port, or replace dnsmasq with BIND entirely |
