---
title: slapd (OpenLDAP)
section: Networking
updated: 2026-04-16
---

# OpenLDAP Server (slapd)

OpenLDAP is a free, open-source implementation of the Lightweight Directory Access Protocol (LDAP).

## Setup

### Initialization
OpenLDAP uses a dynamic configuration directory (`cn=config`). Database files persist in `/var/lib/openldap/openldap-data` (bind-mounted from `/data/varlib/openldap`).

```bash
# Enable service
sudo systemctl enable --now slapd
```

### Configure Root DN
OpenLDAP starts empty. You must add the base DN and root user.
Create `setup.ldif`:
```ldif
dn: cn=config
changetype: modify
replace: olcSuffix
olcSuffix: dc=shanios,dc=local
-
replace: olcRootDN
olcRootDN: cn=Manager,dc=shanios,dc=local
-
replace: olcRootPW
olcRootPW: {SSHA}hashedpassword
```
*Generate password hash with:* `slappasswd`

Apply the config:
```bash
sudo ldapadd -Y EXTERNAL -H ldapi:/// -f setup.ldif
```

### Firewall
```bash
sudo firewall-cmd --add-service=ldap --add-service=ldaps --permanent
sudo firewall-cmd --reload
```

## Verification
```bash
ldapsearch -x -H ldap://localhost -b dc=shanios,dc=local
```
