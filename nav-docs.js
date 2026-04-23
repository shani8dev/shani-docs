/**
 * nav-docs.js — Navigation tree for wiki.shani.dev
 */

if (typeof CONFIG === 'undefined') {
  throw new Error('[Wiki Engine] No CONFIG found. Load config-docs.js before nav-docs.js.');
}

CONFIG.NAV_TREE = [
  { title: 'Overview', icon: 'fa-solid fa-house', slug: 'overview' },

  {
    title: 'Introduction', icon: 'fa-solid fa-book-open',
    children: [
      { title: 'What is Shanios?', slug: 'intro/what-is-shanios' },
      { title: 'Getting Started', slug: 'intro/getting-started' },
      { title: 'Migrating from Traditional Linux', slug: 'intro/migrating' },
      { title: "What's Included", slug: 'intro/whats-included' },
      { title: 'User Configuration', slug: 'intro/user-config' },
      { title: 'System Optimizations', slug: 'intro/optimizations' },
    ]
  },

  {
    title: 'Installation', icon: 'fa-solid fa-download',
    children: [
      { title: 'System Requirements', slug: 'install/requirements' },
      { title: 'Pre-Installation Setup', slug: 'install/pre-install' },
      { title: 'Installation Steps', slug: 'install/steps' },
      { title: 'First Boot', slug: 'install/first-boot' },
    ]
  },

  {
    title: 'Concepts', icon: 'fa-solid fa-lightbulb',
    children: [
      { title: 'Immutability', slug: 'concepts/immutability' },
      { title: 'Atomic Updates', slug: 'concepts/atomic-updates' },
      { title: 'Blue-Green Deployment', slug: 'concepts/blue-green' },
      { title: 'Persistence Strategy', slug: 'concepts/persistence' },
    ]
  },

  {
    title: 'Architecture', icon: 'fa-solid fa-diagram-project',
    children: [
      { title: 'Boot Process', slug: 'arch/boot' },
      { title: 'Filesystem Structure', slug: 'arch/filesystem' },
      { title: 'Btrfs Deep Dive', slug: 'arch/btrfs' },
      { title: 'Overlay Filesystem', slug: 'arch/overlay' },
      { title: 'Dracut Initramfs Module', slug: 'arch/dracut-module' },
    ]
  },

  {
    title: 'Security', icon: 'fa-solid fa-shield-halved',
    children: [
      { title: 'Security Features', slug: 'security/features' },
      { title: 'Secure Boot', slug: 'security/secure-boot' },
      { title: 'LUKS Management', slug: 'security/luks' },
      { title: 'Directory Encryption (gocryptfs)', slug: 'security/gocryptfs' },
      { title: 'TPM2 Enrollment', slug: 'security/tpm2' },
      { title: 'gen-efi Reference', slug: 'security/gen-efi' },
      { title: 'AppArmor (Mandatory Access Control)', slug: 'security/apparmor' },
      { title: 'Audit (auditd)', slug: 'security/audit' },
      { title: 'rkhunter (Rootkit Hunter)', slug: 'security/rkhunter' },
      { title: 'Lynis (Security Auditing)', slug: 'security/lynis' },
      { title: 'Firmware Updates (fwupd)', slug: 'security/fwupd' },
      { title: 'Hardware Authentication', slug: 'security/hardware-auth' },
    ]
  },

  {
    title: 'Updates & Config', icon: 'fa-solid fa-rotate',
    children: [
      { title: 'System Updates', slug: 'updates/system' },
      { title: 'System Config', slug: 'updates/config' },
      { title: 'Shell & Environment', slug: 'updates/shell' },
      { title: 'User Provisioning (shani-user-setup)', slug: 'updates/user-setup' },
      { title: 'shani-health Reference', slug: 'updates/shani-health' },
      { title: 'Factory Reset (shani-reset)', slug: 'updates/shani-reset' },
    ]
  },

  {
    title: 'Software & Apps', icon: 'fa-solid fa-cubes',
    children: [
      { title: 'Flatpak', slug: 'software/flatpak' },
      { title: 'Snaps', slug: 'software/snaps' },
      { title: 'AppImage', slug: 'software/appimage' },
      { title: 'Nix Package Manager', slug: 'software/nix' },
      { title: 'Homebrew', slug: 'software/homebrew' },
      { title: 'Containers', slug: 'software/containers' },
      { title: 'Distrobox', slug: 'software/distrobox' },
      { title: 'Apptainer (HPC Containers)', slug: 'software/apptainer' },
      { title: 'LXC and LXD', slug: 'software/lxc-lxd' },
      { title: 'systemd-nspawn', slug: 'software/systemd-nspawn' },
      { title: 'Virtual Machines', slug: 'software/vms' },
      { title: 'Bottles (Windows Compatibility)', slug: 'software/bottles' },
      { title: 'Android (Waydroid)', slug: 'software/waydroid' },
    ]
  },

  {
    title: 'Networking', icon: 'fa-solid fa-network-wired',
    children: [
      { title: 'NetworkManager & VPN', slug: 'networking/networkmanager-vpn' },
      { title: 'Tailscale VPN', slug: 'networking/tailscale' },
      { title: 'WireGuard (Manual)', slug: 'networking/wireguard' },
      { title: 'OpenVPN', slug: 'networking/openvpn' },
      { title: 'Cloudflared Tunnels', slug: 'networking/cloudflared' },
      { title: 'Caddy Web Server', slug: 'networking/caddy' },
      { title: 'Apache HTTP Server', slug: 'networking/apache' },
      { title: 'ModemManager (Mobile Broadband)', slug: 'networking/modemmanager' },
      { title: 'dnsmasq (Local DNS)', slug: 'networking/dnsmasq' },
      { title: 'dnscrypt-proxy (Encrypted DNS)', slug: 'networking/dnscrypt-proxy' },
      { title: 'openresolv (DNS)', slug: 'networking/openresolv' },
      { title: 'BIND (Authoritative DNS)', slug: 'networking/bind' },
      { title: 'Avahi (mDNS)', slug: 'networking/avahi' },
      { title: 'OpenSSH', slug: 'networking/openssh' },
      { title: 'SSHFS', slug: 'networking/sshfs' },
      { title: 'NFS File Sharing', slug: 'networking/nfs' },
      { title: 'Samba (SMB/CIFS)', slug: 'networking/samba' },
      { title: 'rsyncd (rsync Daemon)', slug: 'networking/rsyncd' },
      { title: 'nbd-server (Network Block Device)', slug: 'networking/nbd' },
      { title: 'Remote Desktop', slug: 'networking/remote-desktop' },
      { title: 'KDE Connect', slug: 'networking/kdeconnect' },
      { title: 'Firewall (firewalld)', slug: 'networking/firewalld' },
      { title: 'Fail2ban (Brute-Force Protection)', slug: 'networking/fail2ban' },
      { title: 'snmpd (SNMP)', slug: 'networking/snmpd' },
      { title: 'Kerberos', slug: 'networking/kerberos' },
      { title: 'slapd (OpenLDAP)', slug: 'networking/slapd' },
      { title: 'Exim (Mail Transfer Agent)', slug: 'networking/exim' },
      { title: 'arpwatch (ARP Monitor)', slug: 'networking/arpwatch' },
      { title: 'gpsd (GPS Daemon)', slug: 'networking/gpsd' },
      { title: 'apcupsd (UPS Daemon)', slug: 'networking/apcupsd' },
    ]
  },

  {
    title: 'System', icon: 'fa-solid fa-gear',
    children: [
      { title: 'cronie (Cron Scheduler)', slug: 'system/cronie' },
      { title: 'Backup & Recovery', slug: 'system/backup' },
    ]
  },

  {
    title: 'Self-Hosting & Servers', icon: 'fa-solid fa-server',
    children: [
      { title: 'AI & LLMs', slug: 'servers/ai-llms' },
      { title: 'Backups & Sync', slug: 'servers/backups-sync' },
      { title: 'Business Intelligence & Analytics', slug: 'servers/business-intelligence' },
      { title: 'Communication', slug: 'servers/communication' },
      { title: 'Databases & Caches', slug: 'servers/databases' },
      { title: 'Developer Tools', slug: 'servers/devtools' },
      { title: 'DevOps & Developer Infrastructure', slug: 'servers/devops' },
      { title: 'Education & E-Learning', slug: 'servers/education' },
      { title: 'Finance & Accounting', slug: 'servers/finance' },
      { title: 'Home Automation', slug: 'servers/home-automation' },
      { title: 'IoT & Monitoring', slug: 'servers/iot' },
      { title: 'Kubernetes & Container Orchestration', slug: 'servers/kubernetes' },
      { title: 'Mail Servers', slug: 'servers/mail' },
      { title: 'Container Management & Lifecycle', slug: 'servers/management' },
      { title: 'Media & Entertainment', slug: 'servers/media' },
      { title: 'Medical & Health', slug: 'servers/medical' },
      { title: 'Monitoring', slug: 'servers/monitoring' },
      { title: 'Network & Analytics', slug: 'servers/networking' },
      { title: 'Productivity & Files', slug: 'servers/productivity' },
      { title: 'Security & Identity', slug: 'servers/security' },
      { title: 'VPN & Tunnels', slug: 'servers/vpn-tunnels' },
      { title: 'Game Servers', slug: 'servers/game-servers' },
      { title: 'Clusters & High Availability', slug: 'servers/clusters' },
    ]
  },

  {
    title: 'Enterprise & OEM', icon: 'fa-solid fa-building',
    children: [
      { title: 'OEM & Fleet Deployment', slug: 'enterprise/fleet' },
    ]
  },

  { title: 'GPU Acceleration & HPC Containers', icon: 'fa-solid fa-microchip', slug: 'gpu-containers' },
  { title: 'Network Diagnostics & Tools', icon: 'fa-solid fa-diagram-project', slug: 'network-diag' },
  { title: 'Troubleshooting', icon: 'fa-solid fa-screwdriver-wrench', slug: 'troubleshooting' },
  { title: 'FAQ', icon: 'fa-solid fa-circle-question', slug: 'faq' },
];

