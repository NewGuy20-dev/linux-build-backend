import * as fs from 'fs';
import chalk from 'chalk';

const PRESETS: Record<string, object> = {
  'developer': {
    base: 'arch',
    init: 'systemd',
    packages: { base: ['base', 'linux-lts'], development: ['git', 'vim', 'nodejs'], utils: ['curl', 'wget'] },
    customization: { shell: 'zsh' },
  },
  'server': {
    base: 'debian',
    init: 'systemd',
    packages: { base: ['base-files'], security: ['fail2ban', 'ufw'], servers: ['nginx'] },
    securityFeatures: { firewall: { enabled: true, policy: 'deny' } },
  },
  'minimal': {
    base: 'alpine',
    init: 'openrc',
    packages: { base: ['alpine-base'], utils: ['curl'] },
  },
};

interface InitOptions {
  template?: string;
  output: string;
}

export const init = (options: InitOptions): void => {
  const spec = options.template && PRESETS[options.template]
    ? PRESETS[options.template]
    : {
        base: 'arch',
        init: 'systemd',
        kernel: { version: 'linux-lts' },
        packages: { base: ['base', 'linux-lts', 'linux-firmware'], development: [], utils: [] },
        customization: { shell: 'bash' },
      };

  fs.writeFileSync(options.output, JSON.stringify(spec, null, 2));
  console.log(chalk.green(`✓ Created ${options.output}`));

  if (options.template) {
    console.log(chalk.dim(`  Using template: ${options.template}`));
  }

  console.log(chalk.dim('\nEdit the file and run: lbuild start ' + options.output));
};
