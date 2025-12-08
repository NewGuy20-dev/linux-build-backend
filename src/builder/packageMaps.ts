// Package manager commands per distro
export const PACKAGE_MANAGERS: Record<string, { install: string; update: string }> = {
  arch: { install: 'pacman -S --noconfirm', update: 'pacman -Syu --noconfirm' },
  debian: { install: 'apt-get install -y', update: 'apt-get update && apt-get upgrade -y' },
  ubuntu: { install: 'apt-get install -y', update: 'apt-get update && apt-get upgrade -y' },
  alpine: { install: 'apk add --no-cache', update: 'apk update && apk upgrade' },
  fedora: { install: 'dnf install -y', update: 'dnf update -y' },
  opensuse: { install: 'zypper install -y', update: 'zypper refresh && zypper update -y' },
  void: { install: 'xbps-install -y', update: 'xbps-install -Su' },
  gentoo: { install: 'emerge --quiet', update: 'emerge --sync && emerge -uDN @world' },
};

// Abstract package name -> distro-specific package name (null = unavailable)
type PkgMap = Record<string, string | null>;
const PACKAGE_MAP: Record<string, PkgMap> = {
  // Development - Containers
  docker: { arch: 'docker', debian: 'docker.io', ubuntu: 'docker.io', alpine: 'docker', fedora: 'docker-ce', opensuse: 'docker', void: 'docker', gentoo: 'app-containers/docker' },
  podman: { arch: 'podman', debian: 'podman', ubuntu: 'podman', alpine: 'podman', fedora: 'podman', opensuse: 'podman', void: 'podman', gentoo: 'app-containers/podman' },
  kubernetes: { arch: 'kubectl', debian: 'kubectl', ubuntu: 'kubectl', alpine: 'kubectl', fedora: 'kubernetes-client', opensuse: 'kubernetes-client', void: null, gentoo: null },
  k3s: { arch: 'k3s-bin', debian: null, ubuntu: null, alpine: null, fedora: null, opensuse: null, void: null, gentoo: null },

  // Development - Languages
  python: { arch: 'python', debian: 'python3', ubuntu: 'python3', alpine: 'python3', fedora: 'python3', opensuse: 'python3', void: 'python3', gentoo: 'dev-lang/python' },
  pip: { arch: 'python-pip', debian: 'python3-pip', ubuntu: 'python3-pip', alpine: 'py3-pip', fedora: 'python3-pip', opensuse: 'python3-pip', void: 'python3-pip', gentoo: 'dev-python/pip' },
  nodejs: { arch: 'nodejs', debian: 'nodejs', ubuntu: 'nodejs', alpine: 'nodejs', fedora: 'nodejs', opensuse: 'nodejs', void: 'nodejs', gentoo: 'net-libs/nodejs' },
  npm: { arch: 'npm', debian: 'npm', ubuntu: 'npm', alpine: 'npm', fedora: 'npm', opensuse: 'npm', void: 'nodejs', gentoo: 'net-libs/nodejs' },
  rust: { arch: 'rust', debian: 'rustc', ubuntu: 'rustc', alpine: 'rust', fedora: 'rust', opensuse: 'rust', void: 'rust', gentoo: 'dev-lang/rust' },
  go: { arch: 'go', debian: 'golang', ubuntu: 'golang', alpine: 'go', fedora: 'golang', opensuse: 'go', void: 'go', gentoo: 'dev-lang/go' },
  java: { arch: 'jdk-openjdk', debian: 'default-jdk', ubuntu: 'default-jdk', alpine: 'openjdk17', fedora: 'java-17-openjdk', opensuse: 'java-17-openjdk', void: 'openjdk17', gentoo: 'dev-java/openjdk' },
  ruby: { arch: 'ruby', debian: 'ruby', ubuntu: 'ruby', alpine: 'ruby', fedora: 'ruby', opensuse: 'ruby', void: 'ruby', gentoo: 'dev-lang/ruby' },

  // Development - Editors
  neovim: { arch: 'neovim', debian: 'neovim', ubuntu: 'neovim', alpine: 'neovim', fedora: 'neovim', opensuse: 'neovim', void: 'neovim', gentoo: 'app-editors/neovim' },
  vim: { arch: 'vim', debian: 'vim', ubuntu: 'vim', alpine: 'vim', fedora: 'vim', opensuse: 'vim', void: 'vim', gentoo: 'app-editors/vim' },
  emacs: { arch: 'emacs', debian: 'emacs', ubuntu: 'emacs', alpine: 'emacs', fedora: 'emacs', opensuse: 'emacs', void: 'emacs', gentoo: 'app-editors/emacs' },
  vscode: { arch: 'code', debian: null, ubuntu: null, alpine: null, fedora: null, opensuse: null, void: null, gentoo: null },
  vscodium: { arch: 'vscodium-bin', debian: null, ubuntu: null, alpine: null, fedora: null, opensuse: null, void: null, gentoo: null },

  // Development - VCS
  git: { arch: 'git', debian: 'git', ubuntu: 'git', alpine: 'git', fedora: 'git', opensuse: 'git', void: 'git', gentoo: 'dev-vcs/git' },
  delta: { arch: 'git-delta', debian: null, ubuntu: null, alpine: null, fedora: null, opensuse: null, void: 'delta', gentoo: null },

  // AI/ML
  cuda: { arch: 'cuda', debian: 'nvidia-cuda-toolkit', ubuntu: 'nvidia-cuda-toolkit', alpine: null, fedora: 'cuda', opensuse: null, void: null, gentoo: 'dev-util/nvidia-cuda-toolkit' },
  pytorch: { arch: 'python-pytorch-cuda', debian: 'python3-torch', ubuntu: 'python3-torch', alpine: null, fedora: 'python3-pytorch', opensuse: null, void: null, gentoo: null },
  tensorflow: { arch: 'python-tensorflow', debian: null, ubuntu: null, alpine: null, fedora: null, opensuse: null, void: null, gentoo: null },
  ollama: { arch: 'ollama', debian: null, ubuntu: null, alpine: null, fedora: null, opensuse: null, void: null, gentoo: null },
  jupyter: { arch: 'jupyterlab', debian: 'jupyter', ubuntu: 'jupyter', alpine: null, fedora: 'python3-jupyterlab', opensuse: null, void: null, gentoo: null },

  // Security
  apparmor: { arch: 'apparmor', debian: 'apparmor', ubuntu: 'apparmor', alpine: null, fedora: null, opensuse: 'apparmor', void: null, gentoo: 'sys-libs/libapparmor' },
  selinux: { arch: null, debian: 'selinux-basics', ubuntu: 'selinux-basics', alpine: null, fedora: 'selinux-policy', opensuse: null, void: null, gentoo: 'sec-policy/selinux-base' },
  nftables: { arch: 'nftables', debian: 'nftables', ubuntu: 'nftables', alpine: 'nftables', fedora: 'nftables', opensuse: 'nftables', void: 'nftables', gentoo: 'net-firewall/nftables' },
  iptables: { arch: 'iptables', debian: 'iptables', ubuntu: 'iptables', alpine: 'iptables', fedora: 'iptables', opensuse: 'iptables', void: 'iptables', gentoo: 'net-firewall/iptables' },
  ufw: { arch: 'ufw', debian: 'ufw', ubuntu: 'ufw', alpine: null, fedora: null, opensuse: null, void: null, gentoo: 'net-firewall/ufw' },
  fail2ban: { arch: 'fail2ban', debian: 'fail2ban', ubuntu: 'fail2ban', alpine: 'fail2ban', fedora: 'fail2ban', opensuse: 'fail2ban', void: 'fail2ban', gentoo: 'net-analyzer/fail2ban' },

  // Networking
  networkmanager: { arch: 'networkmanager', debian: 'network-manager', ubuntu: 'network-manager', alpine: 'networkmanager', fedora: 'NetworkManager', opensuse: 'NetworkManager', void: 'NetworkManager', gentoo: 'net-misc/networkmanager' },
  wireguard: { arch: 'wireguard-tools', debian: 'wireguard', ubuntu: 'wireguard', alpine: 'wireguard-tools', fedora: 'wireguard-tools', opensuse: 'wireguard-tools', void: 'wireguard-tools', gentoo: 'net-vpn/wireguard-tools' },
  openvpn: { arch: 'openvpn', debian: 'openvpn', ubuntu: 'openvpn', alpine: 'openvpn', fedora: 'openvpn', opensuse: 'openvpn', void: 'openvpn', gentoo: 'net-vpn/openvpn' },
  tailscale: { arch: 'tailscale', debian: null, ubuntu: null, alpine: 'tailscale', fedora: null, opensuse: null, void: 'tailscale', gentoo: null },

  // Databases
  postgresql: { arch: 'postgresql', debian: 'postgresql', ubuntu: 'postgresql', alpine: 'postgresql', fedora: 'postgresql-server', opensuse: 'postgresql-server', void: 'postgresql', gentoo: 'dev-db/postgresql' },
  mysql: { arch: 'mysql', debian: 'mysql-server', ubuntu: 'mysql-server', alpine: 'mysql', fedora: 'mysql-server', opensuse: 'mysql-server', void: 'mysql', gentoo: 'dev-db/mysql' },
  mariadb: { arch: 'mariadb', debian: 'mariadb-server', ubuntu: 'mariadb-server', alpine: 'mariadb', fedora: 'mariadb-server', opensuse: 'mariadb', void: 'mariadb', gentoo: 'dev-db/mariadb' },
  redis: { arch: 'redis', debian: 'redis-server', ubuntu: 'redis-server', alpine: 'redis', fedora: 'redis', opensuse: 'redis', void: 'redis', gentoo: 'dev-db/redis' },
  mongodb: { arch: 'mongodb-bin', debian: null, ubuntu: null, alpine: null, fedora: null, opensuse: null, void: null, gentoo: null },
  sqlite: { arch: 'sqlite', debian: 'sqlite3', ubuntu: 'sqlite3', alpine: 'sqlite', fedora: 'sqlite', opensuse: 'sqlite3', void: 'sqlite', gentoo: 'dev-db/sqlite' },

  // Servers
  nginx: { arch: 'nginx', debian: 'nginx', ubuntu: 'nginx', alpine: 'nginx', fedora: 'nginx', opensuse: 'nginx', void: 'nginx', gentoo: 'www-servers/nginx' },
  apache: { arch: 'apache', debian: 'apache2', ubuntu: 'apache2', alpine: 'apache2', fedora: 'httpd', opensuse: 'apache2', void: 'apache', gentoo: 'www-servers/apache' },
  caddy: { arch: 'caddy', debian: null, ubuntu: null, alpine: 'caddy', fedora: null, opensuse: null, void: 'caddy', gentoo: null },

  // Multimedia
  ffmpeg: { arch: 'ffmpeg', debian: 'ffmpeg', ubuntu: 'ffmpeg', alpine: 'ffmpeg', fedora: 'ffmpeg', opensuse: 'ffmpeg', void: 'ffmpeg', gentoo: 'media-video/ffmpeg' },
  pipewire: { arch: 'pipewire', debian: 'pipewire', ubuntu: 'pipewire', alpine: 'pipewire', fedora: 'pipewire', opensuse: 'pipewire', void: 'pipewire', gentoo: 'media-video/pipewire' },
  pulseaudio: { arch: 'pulseaudio', debian: 'pulseaudio', ubuntu: 'pulseaudio', alpine: 'pulseaudio', fedora: 'pulseaudio', opensuse: 'pulseaudio', void: 'pulseaudio', gentoo: 'media-sound/pulseaudio' },
  gstreamer: { arch: 'gstreamer', debian: 'gstreamer1.0-tools', ubuntu: 'gstreamer1.0-tools', alpine: 'gstreamer', fedora: 'gstreamer1', opensuse: 'gstreamer', void: 'gstreamer1', gentoo: 'media-libs/gstreamer' },

  // Shells
  zsh: { arch: 'zsh', debian: 'zsh', ubuntu: 'zsh', alpine: 'zsh', fedora: 'zsh', opensuse: 'zsh', void: 'zsh', gentoo: 'app-shells/zsh' },
  fish: { arch: 'fish', debian: 'fish', ubuntu: 'fish', alpine: 'fish', fedora: 'fish', opensuse: 'fish', void: 'fish', gentoo: 'app-shells/fish' },

  // Monitoring
  prometheus: { arch: 'prometheus', debian: 'prometheus', ubuntu: 'prometheus', alpine: 'prometheus', fedora: null, opensuse: null, void: 'prometheus', gentoo: 'app-metrics/prometheus' },
  grafana: { arch: 'grafana', debian: 'grafana', ubuntu: 'grafana', alpine: null, fedora: null, opensuse: null, void: null, gentoo: null },
  netdata: { arch: 'netdata', debian: 'netdata', ubuntu: 'netdata', alpine: 'netdata', fedora: 'netdata', opensuse: null, void: 'netdata', gentoo: 'net-analyzer/netdata' },

  // Backup
  borg: { arch: 'borg', debian: 'borgbackup', ubuntu: 'borgbackup', alpine: 'borgbackup', fedora: 'borgbackup', opensuse: 'borgbackup', void: 'borgbackup', gentoo: 'app-backup/borgbackup' },
  restic: { arch: 'restic', debian: 'restic', ubuntu: 'restic', alpine: 'restic', fedora: 'restic', opensuse: 'restic', void: 'restic', gentoo: 'app-backup/restic' },

  // Utils
  yay: { arch: 'yay', debian: null, ubuntu: null, alpine: null, fedora: null, opensuse: null, void: null, gentoo: null },
  flatpak: { arch: 'flatpak', debian: 'flatpak', ubuntu: 'flatpak', alpine: 'flatpak', fedora: 'flatpak', opensuse: 'flatpak', void: 'flatpak', gentoo: 'sys-apps/flatpak' },
  curl: { arch: 'curl', debian: 'curl', ubuntu: 'curl', alpine: 'curl', fedora: 'curl', opensuse: 'curl', void: 'curl', gentoo: 'net-misc/curl' },
  wget: { arch: 'wget', debian: 'wget', ubuntu: 'wget', alpine: 'wget', fedora: 'wget', opensuse: 'wget', void: 'wget', gentoo: 'net-misc/wget' },
  htop: { arch: 'htop', debian: 'htop', ubuntu: 'htop', alpine: 'htop', fedora: 'htop', opensuse: 'htop', void: 'htop', gentoo: 'sys-process/htop' },
  neofetch: { arch: 'neofetch', debian: 'neofetch', ubuntu: 'neofetch', alpine: 'neofetch', fedora: 'neofetch', opensuse: 'neofetch', void: 'neofetch', gentoo: 'app-misc/neofetch' },

  // Display - Compositors
  hyprland: { arch: 'hyprland', debian: null, ubuntu: null, alpine: null, fedora: 'hyprland', opensuse: null, void: 'hyprland', gentoo: 'gui-wm/hyprland' },
  sway: { arch: 'sway', debian: 'sway', ubuntu: 'sway', alpine: 'sway', fedora: 'sway', opensuse: 'sway', void: 'sway', gentoo: 'gui-wm/sway' },
  i3: { arch: 'i3-wm', debian: 'i3', ubuntu: 'i3', alpine: 'i3wm', fedora: 'i3', opensuse: 'i3', void: 'i3', gentoo: 'x11-wm/i3' },

  // Display - Bars/Launchers/Terminals
  waybar: { arch: 'waybar', debian: 'waybar', ubuntu: 'waybar', alpine: 'waybar', fedora: 'waybar', opensuse: null, void: 'waybar', gentoo: 'gui-apps/waybar' },
  polybar: { arch: 'polybar', debian: 'polybar', ubuntu: 'polybar', alpine: null, fedora: null, opensuse: null, void: 'polybar', gentoo: 'x11-misc/polybar' },
  rofi: { arch: 'rofi', debian: 'rofi', ubuntu: 'rofi', alpine: 'rofi', fedora: 'rofi', opensuse: 'rofi', void: 'rofi', gentoo: 'x11-misc/rofi' },
  wofi: { arch: 'wofi', debian: 'wofi', ubuntu: 'wofi', alpine: 'wofi', fedora: 'wofi', opensuse: null, void: 'wofi', gentoo: 'gui-apps/wofi' },
  kitty: { arch: 'kitty', debian: 'kitty', ubuntu: 'kitty', alpine: 'kitty', fedora: 'kitty', opensuse: 'kitty', void: 'kitty', gentoo: 'x11-terms/kitty' },
  alacritty: { arch: 'alacritty', debian: 'alacritty', ubuntu: 'alacritty', alpine: 'alacritty', fedora: 'alacritty', opensuse: 'alacritty', void: 'alacritty', gentoo: 'x11-terms/alacritty' },
  foot: { arch: 'foot', debian: 'foot', ubuntu: 'foot', alpine: 'foot', fedora: 'foot', opensuse: null, void: 'foot', gentoo: 'x11-terms/foot' },
};

export interface ResolvedPackages {
  packages: string[];
  warnings: string[];
}

export function resolvePackages(abstractPackages: string[], distro: string): ResolvedPackages {
  const packages: string[] = [];
  const warnings: string[] = [];

  for (const pkg of abstractPackages) {
    const mapping = PACKAGE_MAP[pkg.toLowerCase()];
    if (!mapping) {
      packages.push(pkg); // Use original name
      continue;
    }
    const distroPackage = mapping[distro];
    if (distroPackage === null) {
      warnings.push(`Package '${pkg}' is not available on ${distro}`);
    } else if (distroPackage) {
      packages.push(distroPackage);
    } else {
      packages.push(pkg); // Fallback to original
    }
  }

  return { packages: [...new Set(packages)], warnings };
}

export function getPackageManager(distro: string) {
  return PACKAGE_MANAGERS[distro] || PACKAGE_MANAGERS.debian;
}
