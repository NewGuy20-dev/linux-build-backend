// Build presets - partial specs that can be merged with user specs
export const BUILD_PRESETS: Record<string, Record<string, any>> = {
  'developer-workstation': {
    base: 'arch',
    packages: ['git', 'docker', 'nodejs', 'python', 'code', 'vim', 'tmux'],
    customization: { shell: 'zsh', shellFramework: 'oh-my-zsh' },
  },
  'production-server': {
    base: 'debian',
    packages: ['nginx', 'fail2ban', 'logrotate', 'unattended-upgrades', 'ufw'],
  },
  'gaming-desktop': {
    base: 'arch',
    packages: ['steam', 'wine', 'vulkan-tools', 'gamemode', 'mangohud', 'lutris'],
    customization: { shell: 'bash' },
  },
  'edge-device': {
    base: 'alpine',
    packages: ['busybox', 'dropbear', 'curl'],
  },
  'pentesting': {
    base: 'arch',
    packages: ['nmap', 'wireshark-qt', 'aircrack-ng', 'john', 'hydra', 'sqlmap'],
  },
  'minimal-server': {
    base: 'alpine',
    packages: ['openssh', 'curl', 'htop'],
    init: 'openrc',
  },
};

export const getPreset = (name: string) => BUILD_PRESETS[name];
export const listPresets = () => Object.keys(BUILD_PRESETS);
