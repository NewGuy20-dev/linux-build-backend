type InitSystem = 'systemd' | 'openrc' | 'runit' | 's6';

export function getEnableCommand(service: string, init: InitSystem): string {
  switch (init) {
    case 'systemd': return `systemctl enable ${service}`;
    case 'openrc': return `rc-update add ${service} default`;
    case 'runit': return `ln -sf /etc/sv/${service} /var/service/`;
    case 's6': return `s6-rc-bundle-update add default ${service}`;
    default: return `systemctl enable ${service}`;
  }
}

export function getStartCommand(service: string, init: InitSystem): string {
  switch (init) {
    case 'systemd': return `systemctl start ${service}`;
    case 'openrc': return `rc-service ${service} start`;
    case 'runit': return `sv start ${service}`;
    case 's6': return `s6-rc -u change ${service}`;
    default: return `systemctl start ${service}`;
  }
}

export function getDisableCommand(service: string, init: InitSystem): string {
  switch (init) {
    case 'systemd': return `systemctl disable ${service}`;
    case 'openrc': return `rc-update del ${service}`;
    case 'runit': return `rm /var/service/${service}`;
    case 's6': return `s6-rc-bundle-update delete default ${service}`;
    default: return `systemctl disable ${service}`;
  }
}

export function generateServiceScript(services: string[], init: InitSystem): string {
  return services.map(s => getEnableCommand(s, init)).join('\n');
}
