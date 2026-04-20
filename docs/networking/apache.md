---
title: Apache HTTP Server
section: Networking
updated: 2026-04-20
---

# Apache HTTP Server

Apache is a full-featured, battle-tested web server. On Shani OS, Caddy is the recommended reverse proxy for self-hosted services due to its automatic HTTPS and simpler configuration — but Apache is pre-installed for workloads that specifically need it: `.htaccess`-based access control, `mod_rewrite` rules inherited from existing deployments, PHP via `mod_php`, or applications that ship Apache-specific configuration.

Both can coexist by binding Apache to a non-standard port and proxying through Caddy.

---

## Service Management

```bash
# Enable and start at boot
sudo systemctl enable --now httpd

# Reload config with zero downtime (preferred)
sudo systemctl reload httpd

# Full restart (needed after enabling/disabling modules)
sudo systemctl restart httpd

# Test config syntax before reloading (catches errors before they go live)
sudo apachectl configtest

# Watch live logs
journalctl -u httpd -f
```

---

## Configuration

The main config file is `/etc/httpd/conf/httpd.conf`. Site-specific configs belong in `/etc/httpd/conf.d/` — any `.conf` file placed there is automatically included.

### Listen on a Non-Standard Port (Caddy Proxy Mode)

If Caddy handles ports 80/443, bind Apache to a local port and proxy through Caddy:

```apache
# /etc/httpd/conf/httpd.conf
Listen 127.0.0.1:8080
```

Then in your Caddyfile:

```caddyfile
app.example.com {
    reverse_proxy localhost:8080
}
```

### Virtual Hosts

```apache
# /etc/httpd/conf.d/mysite.conf

<VirtualHost *:8080>
    ServerName mysite.example.com
    DocumentRoot /srv/http/mysite

    <Directory /srv/http/mysite>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog  /var/log/httpd/mysite-error.log
    CustomLog /var/log/httpd/mysite-access.log combined
</VirtualHost>
```

### Basic Authentication

```bash
# Create a password file (-c creates the file; omit -c when adding further users)
sudo htpasswd -c /etc/httpd/conf/.htpasswd alice
sudo htpasswd /etc/httpd/conf/.htpasswd bob
```

```apache
<Directory /srv/http/protected>
    AuthType Basic
    AuthName "Restricted"
    AuthUserFile /etc/httpd/conf/.htpasswd
    Require valid-user
</Directory>
```

### URL Rewriting

```apache
<VirtualHost *:8080>
    ServerName app.example.com
    DocumentRoot /srv/http/app

    RewriteEngine On

    # SPA fallback — serve index.html for all non-file routes
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ /index.html [L]
</VirtualHost>
```

---

## Modules

```bash
# List all loaded modules
httpd -M

# Common modules — verify they are uncommented in httpd.conf:
# LoadModule rewrite_module     modules/mod_rewrite.so
# LoadModule ssl_module         modules/mod_ssl.so
# LoadModule proxy_module       modules/mod_proxy.so
# LoadModule proxy_http_module  modules/mod_proxy_http.so
# LoadModule headers_module     modules/mod_headers.so
```

After enabling or disabling a module, a full restart is required:

```bash
sudo systemctl restart httpd
```

---

## Logs

```bash
sudo tail -f /var/log/httpd/error_log
sudo tail -f /var/log/httpd/access_log
```

---

## Firewall

Only needed if Apache is serving traffic directly (not behind Caddy):

```bash
sudo firewall-cmd --add-service=http --add-service=https --permanent
sudo firewall-cmd --reload
```

---

## Permissions & SELinux

Apache runs as the `http` user. Shani OS uses SELinux by default — files served by Apache must carry the correct context:

```bash
# Apply the correct context to a new document root
sudo chcon -Rt httpd_sys_content_t /srv/http/mysite

# Or let restorecon derive it from policy
sudo restorecon -Rv /srv/http/mysite
```

If Apache needs to connect to a backend (reverse proxy mode), enable the relevant boolean:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `AH00558: Could not reliably determine server's FQDN` | Add `ServerName localhost` to `httpd.conf` — cosmetic, does not affect operation |
| Port 80/443 already in use | Caddy or another service owns the port — bind Apache to `127.0.0.1:8080` and proxy through Caddy |
| `403 Forbidden` on directory | Check filesystem permissions and the `<Directory>` block's `Require` directive; check SELinux context with `ls -Z` |
| `Permission denied` in error log | Apache (`http` user) cannot read the file — fix permissions or apply the correct SELinux context |
| Reverse proxy returns 503 | Enable the SELinux boolean: `sudo setsebool -P httpd_can_network_connect 1` |
| Config changes not taking effect | Run `sudo apachectl configtest` to validate, then `sudo systemctl reload httpd` |
