/**
 * nav-docs.js — Navigation tree for wiki.shani.dev
 * Separated from config-docs.js so it can be edited independently.
 * Loaded before script-docs.js; the engine reads CONFIG.NAV_TREE from here.
 * Edit this file to add/remove/reorder sections and pages.
 */

// Merge NAV_TREE into CONFIG (which is defined by config-docs.js loaded first)
if (typeof CONFIG === 'undefined') {
  throw new Error('[Wiki Engine] No CONFIG found. Load config-docs.js before nav-docs.js.');
}

CONFIG.NAV_TREE = [
  { title: 'Overview', icon: 'fa-solid fa-house', slug: 'overview' },

  {
    title: 'Introduction', icon: 'fa-solid fa-book-open',
    children: [
      { title: "What is Shanios?", slug: 'intro/what-is-shanios' },
      { title: "Getting Started", slug: 'intro/getting-started' },
      { title: "Migrating from Traditional Linux", slug: 'intro/migrating' },
      { title: "What's Included", slug: 'intro/whats-included' },
      { title: "User Configuration", slug: 'intro/user-config' },
      { title: "System Optimizations", slug: 'intro/optimizations' },
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
      { title: 'Blue-Green Deployment', slug: 'concepts/blue-green' },
      { title: 'Atomic Updates', slug: 'concepts/atomic-updates' },
      { title: 'Persistence Strategy', slug: 'concepts/persistence' },
    ]
  },

  {
    title: 'Architecture', icon: 'fa-solid fa-diagram-project',
    children: [
      { title: 'Btrfs Deep Dive', slug: 'arch/btrfs' },
      { title: 'Filesystem Structure', slug: 'arch/filesystem' },
      { title: 'Overlay Filesystem', slug: 'arch/overlay' },
      { title: 'Boot Process', slug: 'arch/boot' },
      { title: 'Dracut Initramfs Module', slug: 'arch/dracut-module' },
    ]
  },

  {
    title: 'Security', icon: 'fa-solid fa-shield-halved',
    children: [
      { title: 'Security Features', slug: 'security/features' },
      { title: 'Secure Boot', slug: 'security/secure-boot' },
      { title: 'LUKS Management', slug: 'security/luks' },
      { title: 'TPM2 Enrollment', slug: 'security/tpm2' },
      { title: 'gen-efi Reference', slug: 'security/gen-efi' },
    ]
  },

  {
    title: 'Updates & Config', icon: 'fa-solid fa-rotate',
    children: [
      { title: 'System Updates', slug: 'updates/system' },
      { title: 'shani-health Reference', slug: 'updates/shani-health' },
      { title: 'Factory Reset (shani-reset)', slug: 'updates/shani-reset' },
      { title: 'User Provisioning', slug: 'updates/user-setup' },
      { title: 'Shell & Environment', slug: 'updates/shell' },
      { title: 'System Config', slug: 'updates/config' },
    ]
  },

  {
    title: 'Software & Apps', icon: 'fa-solid fa-cubes',
    children: [
      // Package formats
      { title: 'Flatpak', slug: 'software/flatpak' },
      { title: 'Snaps', slug: 'software/snaps' },
      { title: 'AppImage', slug: 'software/appimage' },

      // Package managers
      { title: 'Nix Package Manager', slug: 'software/nix' },
      { title: 'Homebrew', slug: 'software/homebrew' },

      // Containers & isolation
      { title: 'Containers', slug: 'software/containers' },
      { title: 'Distrobox', slug: 'software/distrobox' },
      { title: 'Apptainer (HPC Containers)', slug: 'software/apptainer' },
      { title: 'LXC and LXD', slug: 'software/lxc-lxd' },
      { title: 'systemd-nspawn', slug: 'software/systemd-nspawn' },

      // Virtualization
      { title: 'Virtual Machines', slug: 'software/vms' },

      // Compatibility layers
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
      { title: 'Cloudflared Tunnels', slug: 'networking/cloudflared' },
      { title: 'ModemManager (Mobile Broadband)', slug: 'networking/modemmanager' },

      { title: 'Caddy', slug: 'networking/caddy' },

      { title: 'dnsmasq (Local DNS)', slug: 'networking/dnsmasq' },
      { title: 'openresolv (DNS)', slug: 'networking/openresolv' },
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
      { title: 'Fail2ban', slug: 'networking/fail2ban' },
      { title: 'snmpd (SNMP)', slug: 'networking/snmpd' },
      { title: 'Kerberos', slug: 'networking/kerberos' },
      { title: 'slapd (OpenLDAP)', slug: 'networking/slapd' },
      { title: 'Backup & Recovery', slug: 'networking/backup' },
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
      { title: 'Education & E-Learning', slug: 'servers/education' },
      { title: 'Finance & Accounting', slug: 'servers/finance' },
      { title: 'Home Automation', slug: 'servers/home-automation' },
      { title: 'IoT & Monitoring', slug: 'servers/iot' },
      { title: 'Mail Servers', slug: 'servers/mail' },
      { title: 'Container Management & Lifecycle', slug: 'servers/management' },
      { title: 'Media & Entertainment', slug: 'servers/media' },
      { title: 'Medical & Health', slug: 'servers/medical' },
      { title: 'Monitoring', slug: 'servers/monitoring' },
      { title: 'Network & Analytics', slug: 'servers/networking' },
      { title: 'Productivity & Files', slug: 'servers/productivity' },
      { title: 'Security & Identity', slug: 'servers/security' },
      { title: 'VPN & Tunnels', slug: 'servers/vpn-tunnels' },
      { title: 'Game Server', slug: 'servers/game-servers' },
    ]
  },

  {
    title: 'Enterprise & OEM', icon: 'fa-solid fa-building',
    children: [
      { title: 'OEM & Fleet Deployment', slug: 'enterprise/fleet' },
    ]
  },

  { title: 'GPU Acceleration (CUDA/ROCm/oneAPI)', icon: 'fa-solid fa-microchip', slug: 'gpu-containers' },
  { title: 'Network Diagnostics & Tools', icon: 'fa-solid fa-diagram-project', slug: 'network-diag' },
  { title: 'Troubleshooting', icon: 'fa-solid fa-screwdriver-wrench', slug: 'troubleshooting' },
  { title: 'FAQ', icon: 'fa-solid fa-circle-question', slug: 'faq' },
];
