---
title: slapd (OpenLDAP)
section: Networking
updated: 2026-04-18
---

# OpenLDAP Server (slapd)

OpenLDAP is an open-source implementation of the Lightweight Directory Access Protocol (LDAP), used for centralised authentication and directory services. It is pre-installed on Shani OS.

Database files persist in `/var/lib/openldap/openldap-data`, bind-mounted from `/data/varlib/openldap`, and survive OS updates.

---

## Setup

### Enable the Service

```bash
sudo systemctl enable --now slapd
```

### Generate a Password Hash

```bash
# Generates a hashed password for use in LDIF files
slappasswd
# Enter your chosen password — copy the {SSHA}... output
```

### Configure the Root DN

OpenLDAP starts empty. Create `setup.ldif` to set the base DN and admin user:

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
olcRootPW: {SSHA}hashedpasswordhere
```

Apply using the local UNIX socket (no password needed):

```bash
sudo ldapadd -Y EXTERNAL -H ldapi:/// -f setup.ldif
```

### Load Core Schema

```bash
# Load standard schemas (required for most LDAP deployments)
sudo ldapadd -Y EXTERNAL -H ldapi:/// -f /etc/openldap/schema/core.ldif
sudo ldapadd -Y EXTERNAL -H ldapi:/// -f /etc/openldap/schema/cosine.ldif
sudo ldapadd -Y EXTERNAL -H ldapi:/// -f /etc/openldap/schema/inetorgperson.ldif
```

---

## Adding Entries

### Base Structure

Create `base.ldif`:

```ldif
dn: dc=shanios,dc=local
objectClass: dcObject
objectClass: organization
o: Shani OS Local
dc: shanios

dn: ou=users,dc=shanios,dc=local
objectClass: organizationalUnit
ou: users

dn: ou=groups,dc=shanios,dc=local
objectClass: organizationalUnit
ou: groups
```

```bash
ldapadd -x -H ldap://localhost \
  -D "cn=Manager,dc=shanios,dc=local" \
  -W -f base.ldif
```

### Add a User

```ldif
dn: uid=alice,ou=users,dc=shanios,dc=local
objectClass: inetOrgPerson
objectClass: posixAccount
objectClass: shadowAccount
uid: alice
cn: Alice Smith
sn: Smith
mail: alice@shanios.local
uidNumber: 10001
gidNumber: 10001
homeDirectory: /home/alice
loginShell: /bin/bash
userPassword: {SSHA}hashedpasswordhere
```

```bash
ldapadd -x -H ldap://localhost \
  -D "cn=Manager,dc=shanios,dc=local" \
  -W -f user-alice.ldif
```

---

## Querying

```bash
# List all entries under the base DN
ldapsearch -x -H ldap://localhost -b dc=shanios,dc=local

# Search for a specific user
ldapsearch -x -H ldap://localhost \
  -b ou=users,dc=shanios,dc=local \
  "(uid=alice)"

# Authenticated search (as Manager)
ldapsearch -x -H ldap://localhost \
  -D "cn=Manager,dc=shanios,dc=local" \
  -W -b dc=shanios,dc=local
```

---

## Firewall

```bash
sudo firewall-cmd --add-service=ldap --permanent    # port 389 (plain/STARTTLS)
sudo firewall-cmd --add-service=ldaps --permanent   # port 636 (TLS)
sudo firewall-cmd --reload
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ldapadd` returns `No such object` | The parent DN doesn't exist yet — add base structure entries before adding users/groups |
| `Invalid credentials` | Wrong bind DN or password; the bind DN must match `olcRootDN` exactly |
| `Can't contact LDAP server` | Check `systemctl status slapd`; confirm the service is listening: `ss -tlnp | grep 389` |
| Schema error on `ldapadd` | Load the required schema LDIFs first (`core.ldif`, `cosine.ldif`, `inetorgperson.ldif`) |
| View slapd logs | `journalctl -u slapd -f` |
