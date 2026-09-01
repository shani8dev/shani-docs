---
title: Xray / V2Ray — Protocol-Obfuscating Proxy
section: Self-Hosting & Servers
updated: 2026-08-28
---

> **Part of the VPN & Tunnels series:** See [all networking docs](../networking)

## Xray / V2Ray (Protocol-Obfuscating Proxy)

**Purpose:** A suite of network proxy tools that wrap traffic in protocols designed to evade deep packet inspection — VLESS, VMESS, and XTLS over WebSocket or gRPC, disguised as ordinary HTTPS. Widely used alongside Hysteria 2 for censorship circumvention. Xray is the actively maintained fork of V2Ray with additional protocols (XTLS, VLESS, XHTTP) and better performance.

#### Use case vs WireGuard
Xray is a proxy, not a VPN — it forwards traffic through an HTTPS tunnel that looks like web traffic. WireGuard is a full network tunnel with a distinct UDP fingerprint. In environments where WireGuard and Shadowsocks are actively blocked, Xray VLESS+XTLS over port 443 is significantly harder to detect.

`/home/user/xray/config.json` (VLESS + XTLS-Reality — the modern recommended config):
```json
{
  "inbounds": [{
    "port": 443,
    "protocol": "vless",
    "settings": {
      "clients": [{
        "id": "your-uuid-here",
        "flow": "xtls-rprx-vision"
      }],
      "decryption": "none"
    },
    "streamSettings": {
      "network": "tcp",
      "security": "reality",
      "realitySettings": {
        "dest": "www.google.com:443",
        "serverNames": ["www.google.com"],
        "privateKey": "your-reality-private-key",
        "shortIds": ["your-short-id"]
      }
    }
  }],
  "outbounds": [{"protocol": "freedom"}]
}
```

```yaml
# ~/xray/compose.yaml
services:
  xray:
    image: ghcr.io/xtls/xray-core:latest
    ports:
      - "0.0.0.0:443:443/tcp"
    volumes:
      - /home/user/xray/config.json:/etc/xray/config.json:ro,Z
    command: run -config /etc/xray/config.json
    restart: unless-stopped
```

```bash
cd ~/xray && podman-compose up -d
```

##### Generate a UUID and Reality keys

```bash
# Generate a UUID for the client ID
podman run --rm ghcr.io/xtls/xray-core:latest uuid

# Generate a Reality key pair
podman run --rm ghcr.io/xtls/xray-core:latest x25519
```

#### Clients
[v2rayN](https://github.com/2dust/v2rayN) (Windows), [v2rayNG](https://github.com/2dust/v2rayNG) (Android), [Shadowrocket](https://apps.apple.com/app/shadowrocket/id932747118) (iOS), [Nekoray](https://github.com/MatsuriDayo/nekoray) (Linux/Windows). Share the connection config as a `vless://` URI or QR code.

> **XTLS-Reality** (shown above) is the recommended modern config — it borrows a real TLS certificate fingerprint from a public site (`www.google.com`), making the server indistinguishable from that site even to active probers. Older VMESS+WS configs are simpler but more detectable.

**Firewall:**
```bash
sudo firewall-cmd --add-port=443/tcp --permanent && sudo firewall-cmd --reload
```



---

## See Also

- [Networking](../networking) — all networking docs
