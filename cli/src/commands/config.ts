import Conf from 'conf';
import chalk from 'chalk';

const store = new Conf({ projectName: 'linuxbuilder' });

interface ConfigOptions {
  setApiKey?: string;
  setApiUrl?: string;
  show?: boolean;
}

export const config = (options: ConfigOptions): void => {
  if (options.setApiKey) {
    store.set('apiKey', options.setApiKey);
    console.log(chalk.green('✓ API key saved'));
  }

  if (options.setApiUrl) {
    store.set('apiUrl', options.setApiUrl);
    console.log(chalk.green(`✓ API URL set to ${options.setApiUrl}`));
  }

  if (options.show || (!options.setApiKey && !options.setApiUrl)) {
    const apiKey = store.get('apiKey') as string | undefined;
    const apiUrl = store.get('apiUrl', 'https://api.linuxbuilder.io') as string;

    console.log(chalk.bold('Linux Builder CLI Configuration\n'));
    console.log(`API URL: ${chalk.cyan(apiUrl)}`);
    console.log(`API Key: ${apiKey ? chalk.green('configured') : chalk.yellow('not set')}`);
    console.log(`\nConfig file: ${chalk.dim(store.path)}`);
  }
};

export const getConfig = () => ({
  apiKey: store.get('apiKey') as string | undefined,
  apiUrl: store.get('apiUrl', 'https://api.linuxbuilder.io') as string,
});
