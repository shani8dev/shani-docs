---
title: Kerberos
section: Networking
updated: 2026-04-16
---

# Kerberos 5 (KDC)

Kerberos provides strong, mutual authentication for client/server applications using secret-key cryptography. It is the standard for enterprise network authentication.

## Server Setup (KDC)

### Configuration
Edit `/etc/krb5.conf`:
```ini
[libdefaults]
   default_realm = SHANIOS.LOCAL
[realms]
   SHANIOS.LOCAL = {
      kdc = kdc.shanios.local
      admin_server = kdc.shanios.local
   }
[domain_realm]
   .shanios.local = SHANIOS.LOCAL
```

### Initialize Database
```bash
# Create the realm database
sudo kdb5_util create -s -r SHANIOS.LOCAL

# Start services
sudo systemctl enable --now krb5kdc
sudo systemctl enable --now kadmin
```

### Administration
Create an admin principal:
```bash
sudo kadmin.local
addprinc admin/admin
```

## Firewall
```bash
sudo firewall-cmd --add-port=88/tcp --add-port=88/udp --permanent  # KDC
sudo firewall-cmd --add-port=749/tcp --permanent                  # Admin
sudo firewall-cmd --add-port=464/tcp --add-port=464/udp --permanent # Password change
sudo firewall-cmd --reload
```

## Persistence
Kerberos database files persist in `/var/lib/kerberos/krb5kdc` (bind-mounted from `/data/varlib/kerberos`).
