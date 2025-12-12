import chalk from 'chalk';
import { getConfig } from './config';

interface StatusOptions {
  json?: boolean;
}

export const status = async (buildId: string, options: StatusOptions): Promise<void> => {
  const { apiKey, apiUrl } = getConfig();

  if (!apiKey) {
    console.error(chalk.red('Error: API key not configured'));
    process.exit(1);
  }

  const res = await fetch(`${apiUrl}/api/build/status/${buildId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    console.error(chalk.red(`Error: ${res.statusText}`));
    process.exit(1);
  }

  const data = await res.json();

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const statusColor = {
    SUCCESS: chalk.green,
    COMPLETED: chalk.green,
    FAILED: chalk.red,
    CANCELLED: chalk.yellow,
    PENDING: chalk.blue,
    BUILDING: chalk.cyan,
  }[data.status] || chalk.white;

  console.log(chalk.bold(`Build ${buildId}\n`));
  console.log(`Status:    ${statusColor(data.status)}`);
  console.log(`Base:      ${data.baseDistro || 'N/A'}`);
  console.log(`Created:   ${new Date(data.createdAt).toLocaleString()}`);

  if (data.buildDuration) {
    console.log(`Duration:  ${data.buildDuration}s`);
  }

  if (data.downloadUrls) {
    console.log(chalk.bold('\nArtifacts:'));
    if (data.downloadUrls.dockerImage) console.log(`  Docker: ${data.downloadUrls.dockerImage}`);
    if (data.downloadUrls.isoDownloadUrl) console.log(`  ISO:    ${apiUrl}${data.downloadUrls.isoDownloadUrl}`);
  }
};
