---
title: Exim (Mail Transfer Agent)
section: Networking
updated: 2026-04-20
---

# Exim — Mail Transfer Agent

Exim is a pre-installed Mail Transfer Agent (MTA). On a desktop or homelab machine, its primary purpose is **local mail delivery** — routing system notifications, cron job output, fail2ban alerts, and other daemon messages to the local `root` or user mailbox, and optionally forwarding them to an external email address via a relay (smarthost).

Running a full inbound SMTP server on a residential IP is generally impractical (ISPs block port 25; major providers reject mail from dynamic IPs). The most useful configuration for Shani OS is **smarthost / relay mode**: Exim accepts local mail and forwards it through an authenticated external SMTP server such as Gmail, Fastmail, or Mailgun.

---

## Service Management

```bash
sudo systemctl enable --now exim

systemctl status exim
journalctl -u exim -f
```

---

## Configuration

Exim's config is at `/etc/mail/exim.conf` (on Arch-based systems, sometimes `/etc/exim/exim.conf`). Shani OS uses the standard Arch path `/etc/mail/exim.conf`.

### Smarthost (Relay via External SMTP)

The most common setup: all local mail is relayed through an external SMTP server. Replace the values below with your provider's settings.

```
# /etc/mail/exim.conf

primary_hostname = yourhostname.local

# Accept mail for local delivery
local_interfaces = 127.0.0.1

# Route all outbound mail through a smarthost
begin routers

  send_via_smarthost:
    driver = manualroute
    domains = !+local_domains
    transport = smarthost_smtp
    route_list = * smtp.gmail.com

begin transports

  smarthost_smtp:
    driver = smtp
    hosts = smtp.gmail.com
    port = 587
    hosts_require_auth = *
    hosts_require_tls = *

begin authenticators

  plaintext_auth:
    driver = plaintext
    public_name = PLAIN
    client_send = : your@gmail.com : your-app-password
```

> **Gmail:** Use an [App Password](https://myaccount.google.com/apppasswords) (not your main password) — requires 2FA to be enabled on the account. Set `smtp.gmail.com`, port `587`.

After editing:

```bash
# Test config syntax
sudo exim -bV

# Reload
sudo systemctl restart exim
```

### Forward Root Mail to a User or External Address

System daemons send mail to `root`. Forward it to a real address by creating `/etc/aliases`:

```
root: youruser
youruser: you@example.com
```

Then rebuild the alias database:

```bash
sudo newaliases
```

### Forward a User's Local Mail

Create `~/.forward` in the user's home directory:

```
you@example.com
```

---

## Sending Test Mail

```bash
# Send a test message
echo "Test from Shani OS" | mail -s "Test" root

# Or directly via Exim
echo "Subject: Test" | sudo exim -v root

# Check the mail queue
exim -bp

# Force delivery of queued messages
sudo exim -qf

# View Exim logs
sudo tail -f /var/log/exim/mainlog
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Mail stuck in queue | Run `exim -bp` to see the queue; `sudo exim -qf` to force retry; check `mainlog` for rejection reasons |
| `Authentication failed` | Verify credentials in `client_send`; for Gmail, ensure you are using an App Password not your account password |
| `TLS negotiation failed` | Confirm `hosts_require_tls = *` is set and the upstream SMTP port supports STARTTLS (587) or TLS (465) |
| Cron output not being mailed | Ensure `MAILTO` is set in the crontab (`MAILTO=root` or `MAILTO=youruser`) and Exim is running |
| Exim not starting | Run `sudo exim -bV` to check config syntax; check `journalctl -u exim` for errors |
