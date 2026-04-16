---
title: Fail2ban
section: Networking
updated: 2026-04-01
---

# Fail2ban — Brute-Force Protection

Monitors logs and temporarily bans IPs that fail authentication repeatedly. Integrates with firewalld automatically. **Not enabled by default** — enable when running any public-facing service.

## Enable & Status

```bash
# Enable and start
sudo systemctl enable --now fail2ban

# Check overall status
sudo fail2ban-client status

# Check SSH jail
sudo fail2ban-client status sshd

# Watch the fail2ban log live
sudo journalctl -u fail2ban -f
```

## Manual Ban / Unban

```bash
# Ban an IP manually
sudo fail2ban-client set sshd banip 1.2.3.4

# Unban an IP
sudo fail2ban-client set sshd unbanip 1.2.3.4

# View banned IPs from firewall perspective
sudo firewall-cmd --direct --get-all-rules
```

## Custom Jail for Caddy

Create `/etc/fail2ban/jail.d/caddy.conf`:

```ini
[caddy]
enabled  = true
port     = http,https
filter   = caddy
logpath  = /var/log/caddy/access.log
maxretry = 10
bantime  = 3600
findtime = 600
```

```bash
sudo systemctl restart fail2ban
```
