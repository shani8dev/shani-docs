---
title: dnscrypt-proxy (Encrypted DNS)
section: Networking
updated: 2026-04-20
---

# dnscrypt-proxy — Encrypted DNS

dnscrypt-proxy encrypts DNS queries between your machine and upstream resolvers using **DNSCrypt** or **DNS-over-HTTPS (DoH)**. Without it, DNS queries travel in plaintext — your ISP and anyone on-path can see every hostname you look up.

Pre-installed on Shani OS, integrated with openresolv. **Not active by default** — enable it when you want encrypted DNS without running a full resolver like BIND or dnsmasq.

> If you already use **dnsmasq** for local domains, pair them: run dnscrypt-proxy on port 5300 and have dnsmasq forward all non-local queries to it. See the [integration section](#integration-with-dnsmasq) below.

---

## Enable

```bash
sudo systemctl enable --now dnscrypt-proxy

# Confirm it is listening on 127.0.0.1:53
sudo ss -ulnp | grep :53

# Watch logs
journalctl -u dnscrypt-proxy -f
```

By default, dnscrypt-proxy listens on `127.0.0.1:53` and auto-selects public DoH/DNSCrypt resolvers that support DNSSEC and do not log queries.

---

## Point the System at dnscrypt-proxy

Tell openresolv to route all DNS queries through dnscrypt-proxy:

```bash
# Set dnscrypt-proxy as the system resolver
echo 'name_servers=127.0.0.1' | sudo tee -a /etc/resolvconf.conf

# Regenerate /etc/resolv.conf
sudo resolvconf -u

# Verify
cat /etc/resolv.conf       # should show: nameserver 127.0.0.1
dig +short example.com     # should return an answer
```

---

## Configuration

Edit `/etc/dnscrypt-proxy/dnscrypt-proxy.toml`:

```toml
# Listen address — change port to 5300 if dnsmasq also runs on this machine
listen_addresses = ['127.0.0.1:53']

# Use only resolvers that claim to not log queries
require_nolog = true

# Use only resolvers with DNSSEC support
require_dnssec = true

# Use only resolvers that don't filter (no censorship)
require_nofilter = true

# Automatically update the resolver list
auto_update_resolvers = true

# Optional: pin specific resolvers instead of auto-selecting
# server_names = ['cloudflare', 'quad9-dnscrypt-ip4-filter-pri']
```

After editing:

```bash
sudo systemctl restart dnscrypt-proxy
```

### Choosing Resolvers

```bash
# List all available resolvers and their properties
sudo dnscrypt-proxy -list

# Test resolver performance and check a query
sudo dnscrypt-proxy -resolve example.com
```

---

## Integration with dnsmasq

Run dnscrypt-proxy on port 5300 and have dnsmasq forward public queries to it, while keeping local `.home.local` names local:

```toml
# /etc/dnscrypt-proxy/dnscrypt-proxy.toml
listen_addresses = ['127.0.0.1:5300']
```

```ini
# /etc/dnsmasq.conf
server=127.0.0.1#5300        # forward all public queries to dnscrypt-proxy
address=/home.local/192.168.1.x   # resolve local names directly
```

openresolv points to dnsmasq (`name_servers=127.0.0.1`), which caches and forwards to dnscrypt-proxy on port 5300. This gives you local custom DNS, caching, and encrypted upstream resolution together.

---

## DNS Blocking

Block ads and malware domains at the DNS level:

```toml
# /etc/dnscrypt-proxy/dnscrypt-proxy.toml
[blocked_names]
  blocked_names_file = '/etc/dnscrypt-proxy/blocked-names.txt'
  log_file = '/var/log/dnscrypt-proxy-blocked.log'
```

```bash
# Download a community blocklist
curl -s https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts \
  | grep '^0.0.0.0' | awk '{print $2}' \
  | sudo tee /etc/dnscrypt-proxy/blocked-names.txt
sudo systemctl restart dnscrypt-proxy
```

---

## Verifying Encryption

```bash
# Check which resolver is active and its properties
sudo dnscrypt-proxy -resolve example.com

# DNS leak test — resolvers shown should be DoH/DNSCrypt servers, not your ISP's
# Visit: https://www.dnsleaktest.com
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Won't start | Check `journalctl -u dnscrypt-proxy`; common cause is port 53 already in use — check `ss -ulnp \| grep :53` |
| Port 53 conflict | If using alongside dnsmasq, set `listen_addresses = ['127.0.0.1:5300']` and point dnsmasq at that port |
| DNS stops working after enabling | Verify `cat /etc/resolv.conf` shows `nameserver 127.0.0.1`; test with `dig @127.0.0.1 example.com` |
| All resolvers unavailable | Some networks block non-HTTP traffic on port 443 — add `protocols = ['doh']` to force DNS-over-HTTPS on standard port 443 |
| VPN DNS not working | Ensure openresolv manages `/etc/resolv.conf` — VPN connections register their DNS via openresolv, which overrides dnscrypt-proxy for VPN-specific domains |
| Slow DNS | dnscrypt-proxy first-query latency is higher than a local cache — pair with dnsmasq for caching |

---

## See Also

- [Firewall](firewalld) — DNS port rules
- [WireGuard](wireguard) — VPN DNS interaction with openresolv
- [Security Features](features) — network security overview
