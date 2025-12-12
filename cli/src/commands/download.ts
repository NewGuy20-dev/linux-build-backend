import * as fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from './config';

interface DownloadOptions {
  type: string;
  output?: string;
}

export const download = async (buildId: string, options: DownloadOptions): Promise<void> => {
  const { apiKey, apiUrl } = getConfig();

  if (!apiKey) {
    console.error(chalk.red('Error: API key not configured'));
    process.exit(1);
  }

  const spinner = ora(`Downloading ${options.type} artifact...`).start();

  try {
    const res = await fetch(`${apiUrl}/api/build/download/${buildId}/${options.type}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      spinner.fail(chalk.red(`Error: ${res.statusText}`));
      process.exit(1);
    }

    const contentType = res.headers.get('content-type');

    // Check if it's a JSON response (docker hub reference)
    if (contentType?.includes('application/json')) {
      const data = await res.json();
      spinner.succeed('Docker image reference:');
      console.log(`  ${chalk.cyan(data.pullCommand)}`);
      return;
    }

    // Binary download
    const buffer = await res.arrayBuffer();
    const outputPath = options.output || `${buildId}.${options.type === 'docker' ? 'tar' : 'iso'}`;

    fs.writeFileSync(outputPath, Buffer.from(buffer));
    spinner.succeed(`Downloaded to ${chalk.cyan(outputPath)}`);
    console.log(chalk.dim(`  Size: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`));
  } catch (e) {
    spinner.fail(chalk.red(`Error: ${e instanceof Error ? e.message : 'Download failed'}`));
    process.exit(1);
  }
};
