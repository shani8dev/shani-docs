---
title: Troubleshooting
section: Networking
updated: 2026-08-28
---

> **Part of the VPN & Tunnels series:** See [all networking docs](../networking)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `TUN/TAP device not found` | Run `sudo modprobe tun` on the host |
| Clients can't route traffic | Verify `net.ipv4.ip_forward=1` is set; check `--sysctl` flags in the container run command |
| DNS not resolving for VPN clients | Set `WG_DEFAULT_DNS` or equivalent to `1.1.1.1` or your Pi-hole address |
| Headscale nodes show offline | Verify Headscale is listening on `0.0.0.0:8080`; check that `server_url` in config matches your public domain |
| Pangolin tunnel not connecting | Verify Newt credentials (`NEWT_ID`, `NEWT_SECRET`); check VPS firewall allows `51820/udp` |
| NetBird peers not connecting | Ensure the TURN relay (Coturn) port `3478/udp` is open; check signal server is reachable on port `10000` |
| NetBird dashboard blank | OIDC configuration may be wrong — check management logs: `podman-compose logs management` |
| Firezone DB error on startup | Ensure `DATABASE_URL` host points to the `db` service name; check `podman-compose logs db` |
| Hysteria QUIC timeout | Ensure UDP port 443 is open on your VPS firewall and not blocked by the ISP |
| Nebula nodes can't reach each other | Verify `ca.crt` matches on all nodes; check `static_host_map` IPs resolve correctly |
| MongoDB connection refused (Pritunl) | Confirm `pritunl-mongo` is running; use `--network host` so both containers share the same network namespace |
| OpenVPN auth fails | Re-export the client config with `ovpn_getclient`; verify firewall allows `1194/udp` |
| Gluetun VPN not connecting | Verify `WIREGUARD_PRIVATE_KEY` and `WIREGUARD_ADDRESSES` are correct; check `podman logs gluetun` for auth errors |
| Gluetun leaking real IP | Ensure the app container uses `network_mode: service:gluetun` — any other network mode bypasses the tunnel |
| qBittorrent WebUI unreachable via Gluetun | Port must be published on the `gluetun` container, not `qbittorrent`; the app container shares gluetun's network |
| WireGuard client can't reach LAN | Ensure `AllowedIPs` includes the home subnet (e.g., `192.168.1.0/24`) and that `PostUp` iptables MASQUERADE rule is active on the server |
| WireGuard road warrior QR not showing | Install `qrencode` via Nix: `nix-env -iA nixpkgs.qrencode`; for the linuxserver container, peer QR PNGs are in `config/peer_<name>/peer_<name>.png` |
| Outline Manager can't connect to server | The management API port (default `9090`) must be reachable; check firewall and that the `SB_API_PREFIX` in the environment matches the Manager's saved config |
| Outline client times out | Ensure both TCP and UDP on the data port are open; Shadowsocks uses both; check ISP is not blocking the port |
| Xray VLESS connection rejected | Verify the client UUID matches exactly; check that port 443 is open; confirm the Reality `serverNames` is reachable from the server itself |
| Xray Reality `private key` error | Regenerate the key pair with `xray x25519` — the public key goes in the client config, private key stays on the server |

> 🔒 **Security tip:** Always bind management UIs (`wg-easy`, `headplane`, `portainer`) to `127.0.0.1` and proxy through Caddy. Never expose control-plane interfaces directly to the internet. Rotate pre-auth keys periodically and use `fail2ban` on any publicly facing port.


---

## See Also

- [Networking](../networking) — all networking docs
