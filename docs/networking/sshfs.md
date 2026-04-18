---
title: SSHFS
section: Networking
updated: 2026-04-18
---

# SSHFS — Mount Remote Directories over SSH

SSHFS mounts any directory from an SSH-accessible machine as a local folder using FUSE. It requires only an SSH server on the remote — no special server-side software or configuration is needed beyond a working SSH connection. SSHFS is pre-installed on Shani OS.

See the [OpenSSH wiki page](https://docs.shani.dev/doc/networking/openssh) for SSH setup, key generation, and the `~/.ssh/config` shortcuts used in the examples below.

---

## Mounting

```bash
# Mount a remote directory
sshfs user@hostname:/home/user/projects ~/mnt/remote-projects

# Use a non-standard SSH port
sshfs -p 2222 user@hostname:/data ~/mnt/server

# Mount with reconnect and keepalive (survives brief network drops)
sshfs user@hostname:/data ~/mnt/server \
  -o reconnect,ServerAliveInterval=15,ServerAliveCountMax=3

# Use an SSH config alias (from ~/.ssh/config)
sshfs shanios:/home/youruser ~/mnt/shanios

# Unmount
fusermount -u ~/mnt/remote-projects
```

---

## Useful Mount Options

Pass options with `-o option1,option2`:

| Option | Effect |
|--------|--------|
| `reconnect` | Automatically reconnect if the connection drops |
| `ServerAliveInterval=15` | Send a keepalive every 15 seconds |
| `ServerAliveCountMax=3` | Disconnect after 3 unanswered keepalives |
| `follow_symlinks` | Follow symlinks on the remote (disabled by default for safety) |
| `cache=yes` | Enable attribute caching (faster, but stale if files change externally) |
| `uid=1000,gid=1000` | Map remote files to a specific local UID/GID |
| `allow_other` | Allow other local users to access the mount (requires `user_allow_other` in `/etc/fuse.conf`) |
| `idmap=user` | Map remote user to local user by name |

---

## Auto-mount at Login (fstab)

Add to `/etc/fstab`:

```text
user@hostname:/home/user/projects  /home/user/mnt/remote  fuse.sshfs  defaults,_netdev,reconnect,uid=1000,gid=1000,IdentityFile=/home/user/.ssh/id_ed25519  0 0
```

Apply without rebooting:

```bash
sudo mount -a
```

> **Note:** fstab SSHFS mounts require the SSH key to be usable without an interactive passphrase (use `ssh-agent` or a key without a passphrase for system-level mounts).

---

## Auto-mount on Access (systemd .mount unit)

For mounts that should activate on demand rather than at boot:

Create `~/.config/systemd/user/mnt-remote.mount`:

```ini
[Unit]
Description=SSHFS Mount — Remote Server
After=network-online.target

[Mount]
What=user@hostname:/home/user/projects
Where=/home/user/mnt/remote
Type=fuse.sshfs
Options=reconnect,ServerAliveInterval=15,IdentityFile=%h/.ssh/id_ed25519

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now mnt-remote.mount
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `fuse: bad mount point` | Create the mount point first: `mkdir -p ~/mnt/remote-projects` |
| `Transport endpoint is not connected` after network drop | Unmount the stale mount: `fusermount -u ~/mnt/remote-projects` then remount; use `reconnect` option to avoid this |
| Very slow file listing | Disable host key DNS lookups in `~/.ssh/config` with `UseDNS no`; enable attribute caching with `-o cache=yes` |
| `Permission denied` | Confirm SSH key auth works first: `ssh user@hostname`; check that the remote path exists and is readable by that user |
| Mount disappears after suspend/resume | Use `reconnect,ServerAliveInterval=15` options; alternatively, use a systemd mount unit with `Restart=on-failure` |
