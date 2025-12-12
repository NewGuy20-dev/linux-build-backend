import chalk from 'chalk';
import { getConfig } from './config';

interface TemplatesOptions {
  details?: boolean;
}

export const templates = async (options: TemplatesOptions): Promise<void> => {
  const { apiKey, apiUrl } = getConfig();

  if (!apiKey) {
    console.error(chalk.red('Error: API key not configured'));
    process.exit(1);
  }

  const res = await fetch(`${apiUrl}/api/templates/presets`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    console.error(chalk.red(`Error: ${res.statusText}`));
    process.exit(1);
  }

  const data = await res.json();

  console.log(chalk.bold('Available Templates\n'));

  for (const name of data.presets || []) {
    console.log(`  ${chalk.cyan(name)}`);

    if (options.details && data.details?.[name]) {
      const preset = data.details[name];
      console.log(chalk.dim(`    Base: ${preset.base}`));
      if (preset.packages?.base) {
        console.log(chalk.dim(`    Packages: ${preset.packages.base.slice(0, 3).join(', ')}...`));
      }
    }
  }

  console.log(chalk.dim('\nUse: lbuild init --template <name>'));
};
