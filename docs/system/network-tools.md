---
title: Network Tools
section: System
updated: 2026-04-01
---

# Network Tools

Shanios includes a comprehensive suite of networking utilities for diagnostics, monitoring, security, and file transfer. All tools listed here are pre-installed unless noted otherwise.

## 📦 Package Reference
| Package | Tools Included | Purpose |
|---------|----------------|---------|
| `iproute2` | `ip`, `ss` | Modern interface, routing, & socket management |
| `iputils` | `ping`, `arping` | Basic reachability & MAC discovery |
| `inetutils` | `traceroute`, `ftp`, `telnet` | Legacy path tracing & protocol clients |
| `net-tools` | `ifconfig`, `netstat`, `arp`, `route` | Legacy network configuration |
| `bind` | `dig`, `host`, `nslookup` | DNS query & resolution tools |
| `wireless_tools` | `iwconfig`, `iwlist`, `iwspy` | Legacy wireless diagnostics |
| `wpa_supplicant` | `wpa_cli`, `wpa_passphrase` | WPA authentication management |
| `net-snmp` | `snmpwalk`, `snmpget` | SNMP network device monitoring |
| `openldap` | `ldapsearch` | LDAP directory queries |
| `iproute2` | `ip` (includes `netns`) | Network namespace isolation |

> 💡 **Installable Tools**: `speedtest-cli` and `fast` are available via `pipx`.
> ```bash
> pipx install speedtest-cli fast-cli
> ```

---

## 🌐 1. Connectivity & Path Tracing
Test reachability, latency, and route paths to external hosts.

**`ping`** — ICMP reachability & latency.
```bash
ping -c 4 host                  # Basic reachability
ping -s 1400 -c 4 host          # Large packet (MTU test)
ping6 -c 4 ipv6.google.com      # IPv6 connectivity
```

**`arping`** — Layer 2 reachability (LAN only).
```bash
sudo arping -I eth0 host        # Verify host is alive at L2
sudo arping -c 3 192.168.1.50   # Discover MAC address of IP
```

**`traceroute`** — Trace network path hop-by-hop.
```bash
traceroute host                 # Standard ICMP traceroute
traceroute -T -p 443 host       # TCP traceroute (bypasses ICMP blocks)
```

**`mtr`** — Live traceroute with packet loss & latency stats.
```bash
mtr host                        # Interactive TUI
mtr --report --report-cycles 20 host # Non-interactive report
```

**`speedtest-cli`** — Internet speed test (requires `pipx`).
```bash
speedtest-cli --simple          # Ping, Download, Upload output
speedtest-cli --server 1234     # Use specific server ID
```

---

## 🔍 2. DNS & Name Resolution
Query DNS servers and manage local resolution.

**`dig`** — Comprehensive DNS queries.
```bash
dig host +short                 # Clean IP output
dig host AAAA                   # IPv6 address
dig @1.1.1.1 host               # Query Cloudflare specifically
dig -x 1.2.3.4                  # Reverse DNS (PTR)
dig +trace host                 # Full recursive resolution trace
```

**`host` / `nslookup`** — Simpler alternatives.
```bash
host host                       # A record lookup
nslookup host 8.8.8.8           # Query via Google DNS
```

**`resolvconf`** — Manage `/etc/resolv.conf`.
```bash
resolvconf -l                   # List registered nameservers
sudo resolvconf -u              # Force regeneration of resolv.conf
```

---

## 🔌 3. Interfaces, Routing & Hardware
Manage network interfaces, drivers, and wireless settings.

**`ip`** — Modern interface & routing management (replaces ifconfig/route).
```bash
ip -brief addr show             # Compact IP summary
ip route get 8.8.8.8            # Trace route for specific destination
ip neigh flush all              # Clear ARP cache
```

**`ethtool`** — NIC hardware diagnostics.
```bash
ethtool eth0                    # Link speed & status
ethtool -i eth0                 # Driver & firmware version
sudo ethtool -S eth0            # Detailed NIC error stats
sudo ethtool -p eth0 5          # Blink LED to identify port
```

**`iw` / `iwconfig`** — Wireless diagnostics.
```bash
iw dev wlan0 scan               # Scan networks (modern)
iw dev wlan0 link               # Current connection signal/rate
iwlist wlan0 scan               # Scan networks (legacy)
iwconfig wlan0                  # Interface SSID & signal
```

**`wpa_cli` / `wpa_passphrase`** — WPA Supplicant management.
```bash
sudo wpa_cli status             # Connection state
sudo wpa_cli scan_results       # View scan results
wpa_passphrase "SSID" "PASS"    # Generate config block
```

**`ip netns`** — Network namespace isolation (for testing containers).
```bash
sudo ip netns add testns        # Create namespace
sudo ip netns exec testns ping 1.1.1.1 # Test inside namespace
```

---

## 🚪 4. Sockets, Ports & Processes
Identify listening services and open connections.

**`ss`** — Socket statistics (modern replacement for netstat).
```bash
ss -tlnp                        # TCP listening with PID/Process
ss -s                           # Summary of socket states
ss -tnp state established       # Active connections only
```

**`netstat`** — Legacy network statistics.
```bash
netstat -tlnp                   # Listening TCP (same as ss -tlnp)
netstat -s                      # Protocol error counters
netstat -r                      # Routing table
```

**`lsof`** — List open files & network connections.
```bash
lsof -i :80                     # What is using port 80?
lsof -i TCP -n -P               # All TCP connections (no DNS)
```

---

## 📡 5. Capture, Analysis & Scanning
Deep inspection of network traffic and services.

**`tcpdump`** — Live packet capture.
```bash
sudo tcpdump -i any -n          # Capture all traffic (no DNS)
sudo tcpdump -i any port 80 -A  # HTTP traffic with ASCII payload
sudo tcpdump -i any -w cap.pcap # Save to file for Wireshark
```

**`ngrep`** — Grep over network traffic.
```bash
sudo ngrep -d any -q "GET\|POST" port 80 # Match HTTP methods
sudo ngrep -d any -qi "password"        # Find plaintext credentials
```

**`nmap`** — Network discovery & port scanning.
```bash
nmap -sn 192.168.1.0/24         # Ping sweep (find live hosts)
nmap -sV host                   # Service version detection
nmap -A host                    # Aggressive: OS, version, scripts, trace
sudo nmap -sU -p 53 host        # UDP scan (DNS, etc.)
```

**`whois`** — Domain & IP registration info.
```bash
whois domain.com                # Domain details
whois 8.8.8.8                   # IP/ASN info
```

**`snmpwalk`** — SNMP device monitoring.
```bash
snmpwalk -v2c -c public 192.168.1.1 # Walk router MIB
snmpget -v2c -c public 192.168.1.1 sysDescr.0 # Get description
```

**`ldapsearch`** — LDAP directory queries.
```bash
ldapsearch -x -H ldap://server -b "dc=com" # Anonymous query
ldapsearch -x -D "cn=admin" -W -b "dc=com" # Authenticated bind
```

---

## 📥 6. Transfer, Relay & Protocols
Download files, test protocols, and create relays.

**`curl`** — Advanced HTTP testing.
```bash
curl -vI host                   # Verbose headers only
curl -o /dev/null -s -w "%{http_code}" host # Status code only
curl --resolve host:443:127.0.0.1 https://host # Test DNS override
curl -w "@curl-format.txt" host # Custom timing stats
```

**`wget`** — Recursive downloads.
```bash
wget -r -l 1 --spider host      # Check broken links
wget -q --server-response host  # Headers only
```

**`rsync`** — Incremental sync.
```bash
rsync -avz --delete src/ dst/   # Mirror directory
rsync -avz --dry-run src/ dst/  # Preview changes
```

**`aria2`** — Multi-protocol downloader.
```bash
aria2c -x 16 -s 16 url          # 16 connections parallel download
aria2c "magnet:?xt=urn:btih:..." # Download torrent
```

**`zsync`** — Delta updates (used by `shani-deploy`).
```bash
zsync url/file.zsync            # Download only changed blocks
zsync -i existing.iso url/file.zsync # Update existing file
```

**`nc` (netcat) / `socat`** — Relays & port testing.
```bash
nc -zv host 22                  # Test if port is open
socat TCP-LISTEN:8080,fork TCP:target:80 # Simple port forward
```

**`inetutils`** — Legacy clients.
```bash
telnet host 25                  # Test SMTP handshake
ftp host                        # Legacy FTP client
```

---

## 📊 7. Bandwidth & Monitoring
Measure throughput and monitor traffic in real-time.

**`iperf3`** — Bandwidth throughput testing.
```bash
iperf3 -s                       # Run server mode
iperf3 -c 192.168.1.100 -P 4    # 4-stream client test
iperf3 -c host -u -b 100M       # UDP test at 100Mbps
```

**`nethogs`** — Per-process bandwidth.
```bash
sudo nethogs eth0               # "Top" for network usage
```

**`iftop`** — Per-connection bandwidth.
```bash
sudo iftop -i eth0 -n           # Interactive flow view (no DNS)
```

**`bandwhich`** — Process & connection bandwidth TUI.
```bash
sudo bandwhich                  # Live bandwidth breakdown
```

**`vnstat`** — Persistent bandwidth statistics.
```bash
vnstat -d                       # Daily breakdown
vnstat -h                       # Hourly breakdown
vnstat --live                   # Live traffic rate
```

---

## 🔐 8. Security & Certificates

**`openssl`** — TLS/SSL inspection.
```bash
openssl s_client -connect host:443 -tls1_3 # Test TLS 1.3 support
openssl x509 -in cert.pem -noout -dates   # Check certificate expiry
```

**`nft`** — Firewall rule inspection.
```bash
sudo nft list ruleset           # View all nftables rules
sudo nft list chain inet firewalld filter_INPUT # Check INPUT chain
```

**`journalctl`** — Service logs.
```bash
sudo journalctl -u sshd -f      # Follow SSH logs
sudo journalctl -u NetworkManager -k # Kernel logs related to networking
```

