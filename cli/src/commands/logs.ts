import chalk from 'chalk';
import { getConfig } from './config';

interface LogsOptions {
  follow?: boolean;
  lines: string;
}

export const logs = async (buildId: string, options: LogsOptions): Promise<void> => {
  const { apiKey, apiUrl } = getConfig();

  if (!apiKey) {
    console.error(chalk.red('Error: API key not configured'));
    process.exit(1);
  }

  const fetchLogs = async () => {
    const res = await fetch(`${apiUrl}/api/build/status/${buildId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      console.error(chalk.red(`Error: ${res.statusText}`));
      process.exit(1);
    }

    return res.json();
  };

  const printLogs = (data: any, lastCount: number): number => {
    const logs = data.logs || [];
    const newLogs = logs.slice(lastCount);

    for (const log of newLogs) {
      const time = new Date(log.createdAt).toLocaleTimeString();
      const levelColor = { error: chalk.red, warn: chalk.yellow, info: chalk.blue }[log.level] || chalk.white;
      console.log(`${chalk.dim(time)} ${levelColor(`[${log.level}]`)} ${log.message}`);
    }

    return logs.length;
  };

  let data = await fetchLogs();
  let lastCount = 0;

  // Show initial logs
  const limit = parseInt(options.lines, 10);
  const logs = data.logs || [];
  const startIdx = Math.max(0, logs.length - limit);
  lastCount = startIdx;
  printLogs({ logs: logs.slice(startIdx) }, 0);
  lastCount = logs.length;

  if (!options.follow) return;

  // Follow mode
  console.log(chalk.dim('\n--- Following logs (Ctrl+C to exit) ---\n'));

  while (true) {
    await new Promise((r) => setTimeout(r, 2000));
    data = await fetchLogs();
    lastCount = printLogs(data, lastCount);

    if (['SUCCESS', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(data.status)) {
      console.log(chalk.dim(`\n--- Build ${data.status.toLowerCase()} ---`));
      break;
    }
  }
};
