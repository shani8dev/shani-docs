---
title: Fail2ban (Brute-Force Protection)
section: Networking
updated: 2026-04-20
---

# Fail2ban — Brute-Force Protection

fail2ban monitors log files for repeated authentication failures and temporarily bans offending IPs via firewalld. It integrates with firewalld automatically on Shani OS — no extra backend configuration is required.

**Not enabled by default.** Enable it whenever you run any public-facing service — especially SSH, Caddy, or Vaultwarden.

---

## Enable & Status

```bash
# Enable and start (persists across reboots)
sudo systemctl enable --now fail2ban

# Overall status — shows all active jails and ban counts
sudo fail2ban-client status

# Status of the SSH jail specifically
sudo fail2ban-client status sshd

# Watch logs live
sudo journalctl -u fail2ban -f
```

---

## Manual Ban / Unban

```bash
# Ban an IP in the sshd jail
sudo fail2ban-client set sshd banip 1.2.3.4

# Unban an IP
sudo fail2ban-client set sshd unbanip 1.2.3.4

# View all currently banned IPs across all jails
sudo fail2ban-client banned

# View the raw firewalld rules fail2ban has added
sudo firewall-cmd --direct --get-all-rules
```

---

## Configuration

fail2ban ships with a default `/etc/fail2ban/jail.conf`. **Never edit this file directly** — it is overwritten on package updates. Instead, create overrides in `/etc/fail2ban/jail.d/`.

### SSH Jail

Create `/etc/fail2ban/jail.d/sshd-local.conf`:

```ini
[sshd]
enabled  = true
port     = ssh
maxretry = 5
bantime  = 1h
findtime = 10m
```

> If you changed SSH to a non-standard port (e.g., 2222), set `port = 2222` here.

| Parameter | Meaning |
|-----------|---------|
| `maxretry` | Failures before banning |
| `findtime` | Time window in which failures are counted |
| `bantime` | How long the IP is banned; use `-1` for permanent |

### Caddy Jail

First, enable JSON logging in your Caddyfile:

```caddyfile
{
    log {
        output file /var/log/caddy/access.log
        format json
    }
}
```

Create `/etc/fail2ban/filter.d/caddy.conf`:

```ini
[Definition]
failregex = ^.*"remote_ip":"<HOST>".*"status":(401|403|404|429).*$
ignoreregex =
datepattern = %%Y-%%m-%%dT%%H:%%M:%%S
```

Create `/etc/fail2ban/jail.d/caddy.conf`:

```ini
[caddy]
enabled  = true
port     = http,https
filter   = caddy
logpath  = /var/log/caddy/access.log
maxretry = 10
bantime  = 1h
findtime = 10m
```

### Vaultwarden Jail

Create `/etc/fail2ban/filter.d/vaultwarden.conf`:

```ini
[Definition]
failregex = ^.*Username or password is incorrect\. Try again\. IP: <HOST>\..*$
ignoreregex =
```

Create `/etc/fail2ban/jail.d/vaultwarden.conf`:

```ini
[vaultwarden]
enabled  = true
port     = http,https
filter   = vaultwarden
logpath  = /home/user/vaultwarden/data/vaultwarden.log
maxretry = 5
bantime  = 1h
findtime = 10m
```

### Reload After Changes

```bash
sudo systemctl restart fail2ban

# Verify the new jail is active
sudo fail2ban-client status caddy
```

---

## Whitelist Your Own IP

Prevent accidentally locking yourself out. Create `/etc/fail2ban/jail.d/local.conf`:

```ini
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 192.168.1.0/24 100.64.0.0/10
```

`100.64.0.0/10` covers the entire Tailscale CGNAT address range.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| fail2ban won't start | Check `journalctl -u fail2ban` for syntax errors; validate with `sudo fail2ban-client -t` |
| Banned yourself | Unban with `sudo fail2ban-client set sshd unbanip YOUR_IP`; add your IP to `ignoreip` |
| IPs not being banned | Confirm the jail is enabled (`sudo fail2ban-client status`); verify the log path in the jail config exists and is being written to |
| firewalld not blocking banned IPs | Ensure fail2ban is using the firewalld backend: check `/etc/fail2ban/jail.conf` for `banaction = firewallcmd-rich-rules` |
| Caddy jail never triggers | Confirm Caddy is writing JSON logs to `logpath`; test the regex: `sudo fail2ban-regex /var/log/caddy/access.log /etc/fail2ban/filter.d/caddy.conf` |

---

## See Also

- [Firewall](firewalld) — the firewall that fail2ban writes rules into
- [Security Features](features) — overview of all security layers
