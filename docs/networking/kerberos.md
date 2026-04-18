---
title: Kerberos
section: Networking
updated: 2026-04-18
---

# Kerberos 5 (KDC)

Kerberos provides strong mutual authentication for client/server applications using secret-key cryptography. It is the standard for enterprise network authentication and is required by Active Directory environments.

---

## Server Setup (KDC)

### Configuration

Edit `/etc/krb5.conf`:

```ini
[libdefaults]
    default_realm = SHANIOS.LOCAL
    dns_lookup_realm = false
    dns_lookup_kdc = false
    forwardable = true

[realms]
    SHANIOS.LOCAL = {
        kdc = kdc.shanios.local
        admin_server = kdc.shanios.local
    }

[domain_realm]
    .shanios.local = SHANIOS.LOCAL
    shanios.local = SHANIOS.LOCAL
```

### Initialize the Realm Database

```bash
# Create the realm database (prompts for a master password)
sudo kdb5_util create -s -r SHANIOS.LOCAL

# Start services
sudo systemctl enable --now krb5kdc
sudo systemctl enable --now kadmin
```

### Principal Administration

```bash
# Open the admin shell (runs locally as root, bypasses network auth)
sudo kadmin.local

# Inside kadmin.local:
addprinc admin/admin          # create an admin principal
addprinc youruser             # create a user principal
addprinc -randkey host/kdc.shanios.local  # create a host service principal
ktadd host/kdc.shanios.local  # export to /etc/krb5.keytab
listprincs                    # list all principals
delprinc olduser              # delete a principal
quit
```

### Firewall

```bash
sudo firewall-cmd --add-port=88/tcp --add-port=88/udp --permanent   # KDC (authentication)
sudo firewall-cmd --add-port=749/tcp --permanent                     # kadmin (admin)
sudo firewall-cmd --add-port=464/tcp --add-port=464/udp --permanent  # kpasswd (password change)
sudo firewall-cmd --reload
```

### Persistence

Kerberos database files are stored in `/var/lib/kerberos/krb5kdc` and bind-mounted from `/data/varlib/kerberos` — they persist across OS updates and rollbacks.

---

## Client Usage

### Obtain a Ticket

```bash
# Authenticate and obtain a Kerberos ticket
kinit youruser@SHANIOS.LOCAL

# List active tickets and their expiry
klist

# Renew a ticket before it expires
kinit -R

# Destroy all tickets (log out)
kdestroy
```

### Test Authentication

```bash
# Verify you can reach the KDC
kinit admin/admin@SHANIOS.LOCAL

# Check DNS resolves the KDC correctly
host kdc.shanios.local
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Cannot contact any KDC for realm` | Check that `krb5kdc` is running (`systemctl status krb5kdc`) and that UDP/TCP 88 is open in the firewall |
| `Clock skew too great` | Kerberos requires clocks within 5 minutes — sync with `sudo timedatectl set-ntp true` |
| `Client not found in Kerberos database` | The principal does not exist — create it with `sudo kadmin.local` → `addprinc username` |
| `Decrypt integrity check failed` | Wrong password, or the keytab is stale — regenerate with `ktadd` in `kadmin.local` |
