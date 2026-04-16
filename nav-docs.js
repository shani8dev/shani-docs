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
    ]
  },
  {
    title: 'Security', icon: 'fa-solid fa-shield-halved',
    children: [
      { title: 'Security Features', slug: 'security/features' },
      { title: 'Secure Boot', slug: 'security/secure-boot' },
      { title: 'LUKS After Install', slug: 'security/luks' },
      { title: 'TPM2 Enrollment', slug: 'security/tpm2' },
      { title: 'gen-efi Reference', slug: 'security/gen-efi' },
    ]
  },
  {
    title: 'Updates & Config', icon: 'fa-solid fa-rotate',
    children: [
      { title: 'System Updates', slug: 'updates/system' },
      { title: 'Shell & Environment', slug: 'updates/shell' },
      { title: 'System Config', slug: 'updates/config' },
    ]
  },
  {
    title: 'Software & Apps', icon: 'fa-solid fa-cubes',
    children: [
      { title: 'Flatpak', slug: 'software/flatpak' },
      { title: 'Snaps', slug: 'software/snaps' },
      { title: 'AppImage', slug: 'software/appimage' },
      { title: 'Containers', slug: 'software/containers' },
      { title: 'GPU Acceleration (CUDA/ROCm/oneAPI)', slug: 'software/gpu-containers' },
      { title: 'Distrobox', slug: 'software/distrobox' },
      { title: 'Nix Package Mgr', slug: 'software/nix' },
      { title: 'Homebrew', slug: 'software/homebrew' },
      { title: 'Virtual Machines', slug: 'software/vms' },
      { title: 'Android (Waydroid)', slug: 'software/waydroid' },
      { title: 'Bottles (Windows Compatibility)', slug: 'software/bottles' },
    ]
  },
  {
    title: 'Networking', icon: 'fa-solid fa-network-wired',
    children: [
      // Connection & Tunneling
      { title: 'NetworkManager & VPN', slug: 'networking/networkmanager-vpn' },
      { title: 'Tailscale VPN', slug: 'networking/tailscale' },
      { title: 'Wireguard (Manual)', slug: 'networking/wireguard' },
      { title: 'Cloudflared Tunnels', slug: 'networking/cloudflared' },
      { title: 'ModemManager', slug: 'networking/modemmanager' },
      
      // DNS & Service Discovery
      { title: 'dnsmasq', slug: 'networking/dnsmasq' },
      { title: 'openresolv', slug: 'networking/openresolv' },
      { title: 'avahi (mDNS/Bonjour)', slug: 'networking/avahi' },
      
      // Remote Access & File/Block Sharing
      { title: 'OpenSSH (sshd & ssh)', slug: 'networking/openssh' },
      { title: 'Sshfs', slug: 'networking/sshfs' },
      { title: 'NFS & rpcbind', slug: 'networking/nfs' },
      { title: 'Samba (SMB/CIFS)', slug: 'networking/samba' },
      { title: 'rsyncd', slug: 'networking/rsyncd' },
      { title: 'nbd-server', slug: 'networking/nbd' },
      { title: 'Remote Desktop', slug: 'networking/remote-desktop' },
      { title: 'KDE Connect', slug: 'networking/kdeconnect' },
      
      // Security, Auth & Monitoring
      { title: 'Firewall (firewalld)', slug: 'networking/firewalld' },
      { title: 'Fail2ban', slug: 'networking/fail2ban' },
      { title: 'snmpd', slug: 'networking/snmpd' },
      { title: 'Kerberos', slug: 'networking/kerberos' },
      { title: 'slapd (OpenLDAP)', slug: 'networking/slapd' },
      
      // Backup & Sync
      { title: 'Backup (rclone/restic)', slug: 'networking/backup' },
    ]
  },
  {
    title: 'Self-Hosting & Servers', icon: 'fa-solid fa-server',
    children: [
      { title: 'Caddy Web Server', slug: 'servers/caddy' },
      { title: 'Databases & Caches', slug: 'servers/databases' },
      { title: 'Media & Entertainment', slug: 'servers/media' },
      { title: 'Productivity & Files', slug: 'servers/productivity' },
      { title: 'Developer Tools', slug: 'servers/devtools' },
      { title: 'Security & Identity', slug: 'servers/security' },
      { title: 'Network & Analytics', slug: 'servers/networking' },
      { title: 'Container Lifecycle', slug: 'servers/management' },
      { title: 'VPN & Tunnels', slug: 'servers/vpn-tunnels' },
      { title: 'Backups & Sync', slug: 'servers/backups-sync' },
      { title: 'Home Automation', slug: 'servers/home-automation' },
      { title: 'Communication', slug: 'servers/communication' },
      { title: 'AI & LLMs', slug: 'servers/ai-llms' },
      { title: 'Mail Servers & Clients', slug: 'servers/mail' },
    ]
  },
  { title: 'Troubleshooting', icon: 'fa-solid fa-screwdriver-wrench',
    children: [
      { title: 'Network Diagnostics & Tools', slug: 'troubleshooting/networking' },
    ]
  },
  { title: 'FAQ', icon: 'fa-solid fa-circle-question', slug: 'faq' },
  { title: 'Glossary', icon: 'fa-solid fa-spell-check', slug: 'glossary' },
  { title: 'Contribute', icon: 'fa-solid fa-code-pull-request', slug: 'contribute' },
];
