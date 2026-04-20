---
title: dnscrypt-proxy (Encrypted DNS)
section: Networking
updated: 2026-04-20
---

# dnscrypt-proxy — Encrypted DNS Proxy

dnscrypt-proxy encrypts DNS queries between your machine and upstream resolvers using **DNSCrypt** or **DNS-over-HTTPS (DoH)**. Without it, DNS queries travel in plaintext — your ISP (and anyone on-path) can see every hostname you look up. With dnscrypt-proxy running locally, all queries are encrypted before leaving the machine.

It is pre-installed on Shani OS and integrates with openresolv. **Not active by default** — enable it when you want encrypted DNS without running a full resolver like BIND or dnsmasq.

> If you already use **dnsmasq** for local domains, pair it with dnscrypt-proxy: dnsmasq handles local `.home` names and forwards everything else to dnscrypt-proxy on a non-standard port (e.g., 5300). See the integration section below.

---

## Enable

```bash
sudo systemctl enable --now dnscrypt-proxy

# Check status
systemctl status dnscrypt-proxy

# Watch logs
journalctl -u dnscrypt-proxy -f
```

By default, dnscrypt-proxy listens on `127.0.0.1:53` and uses a curated list of public DoH/DNSCrypt resolvers that support DNSSEC and do not log queries.

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

# Prefer DoH over DNSCrypt (both work; DoH is harder to block)
# Remove or comment out to use both
# protocols = ['doh']

# Maximum number of simultaneous queries
max_clients = 250

# Automatically update the resolver list
auto_update_resolvers = true

# Optional: pin specific resolvers by name instead of using the auto-selected list
# server_names = ['cloudflare', 'quad9-dnscrypt-ip4-filter-pri']
```

After editing:

```bash
sudo systemctl restart dnscrypt-proxy
```

---

## Point the System at dnscrypt-proxy

Tell openresolv to route all DNS queries through dnscrypt-proxy:

```bash
# 1. Set dnscrypt-proxy as the system resolver
echo 'name_servers=127.0.0.1' | sudo tee -a /etc/resolvconf.conf

# 2. Regenerate /etc/resolv.conf
sudo resolvconf -u

# 3. Verify
cat /etc/resolv.conf   # should show nameserver 127.0.0.1
dig +short example.com # should return an answer
```

---

## Integration with dnsmasq

If dnsmasq is already handling `.home.local` names, run dnscrypt-proxy on port 5300 and have dnsmasq forward public queries to it:

```toml
# /etc/dnscrypt-proxy/dnscrypt-proxy.toml
listen_addresses = ['127.0.0.1:5300']
```

```ini
# /etc/dnsmasq.conf — forward all non-local queries to dnscrypt-proxy
server=127.0.0.1#5300

# Keep local domain resolution local
address=/home.local/192.168.1.x
```

openresolv should point to dnsmasq (`name_servers=127.0.0.1`), and dnsmasq forwards upstream queries to dnscrypt-proxy on port 5300. This gives you both local custom DNS and encrypted upstream resolution.

---

## Verifying Encryption

```bash
# Check which resolver is being used and its properties
sudo dnscrypt-proxy -resolve example.com

# See all available resolvers and their features
sudo dnscrypt-proxy -list

# Test that queries are actually encrypted (should NOT show your ISP's resolver)
dig +short TXT whoami.cloudflare.com @1.1.1.1   # compare
dig +short myip.opendns.com @resolver1.opendns.com
```

An independent way to verify: visit [https://www.dnsleaktest.com](https://www.dnsleaktest.com) — the resolvers shown should be the DoH/DNSCrypt servers, not your ISP's nameservers.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `dnscrypt-proxy` won't start | Check `journalctl -u dnscrypt-proxy`; common cause is port 53 already in use — check `ss -ulnp | grep :53` |
| Port 53 conflict | If using alongside dnsmasq, set `listen_addresses = ['127.0.0.1:5300']` in the config and point dnsmasq at that port |
| DNS stops working after enabling | Verify `cat /etc/resolv.conf` shows `nameserver 127.0.0.1`; test directly with `dig @127.0.0.1 example.com` |
| All resolvers showing as unavailable | Check outbound UDP/TCP connectivity; some networks block port 443 for non-HTTP traffic — set `protocols = ['doh']` to force DNS-over-HTTPS which uses standard HTTPS port 443 |
| VPN DNS not working after enabling | Ensure openresolv is managing `/etc/resolv.conf` — VPN connections register their DNS via openresolv, which then overrides dnscrypt-proxy for VPN-specific domains |
| Slow DNS | dnscrypt-proxy auto-selects fast resolvers, but first-query latency is higher than a local cache — pair with dnsmasq for caching |
