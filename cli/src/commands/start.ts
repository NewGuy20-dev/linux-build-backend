import * as fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from './config';

interface StartOptions {
  wait?: boolean;
  compliance?: string;
}

export const start = async (specFile: string, options: StartOptions): Promise<void> => {
  const { apiKey, apiUrl } = getConfig();

  if (!apiKey) {
    console.error(chalk.red('Error: API key not configured. Run: lbuild config --set-api-key <key>'));
    process.exit(1);
  }

  if (!fs.existsSync(specFile)) {
    console.error(chalk.red(`Error: Spec file not found: ${specFile}`));
    process.exit(1);
  }

  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  const spinner = ora('Starting build...').start();

  try {
    const res = await fetch(`${apiUrl}/api/build/start`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(spec),
    });

    if (!res.ok) throw new Error(`Failed: ${res.statusText}`);

    const data = await res.json();
    spinner.succeed(`Build started: ${chalk.cyan(data.buildId)}`);

    if (!options.wait) {
      console.log(chalk.dim(`\nCheck status: lbuild status ${data.buildId}`));
      return;
    }

    // Poll for completion
    spinner.start('Building...');
    const timeout = 1800000; // 30 min
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const statusRes = await fetch(`${apiUrl}/api/build/status/${data.buildId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      const status = await statusRes.json();

      spinner.text = `Building... (${status.status})`;

      if (['SUCCESS', 'COMPLETED'].includes(status.status)) {
        spinner.succeed(chalk.green('Build completed!'));

        if (status.downloadUrls?.dockerImage) {
          console.log(`  Docker: ${chalk.cyan(status.downloadUrls.dockerImage)}`);
        }
        if (status.downloadUrls?.isoDownloadUrl) {
          console.log(`  ISO: ${chalk.cyan(apiUrl + status.downloadUrls.isoDownloadUrl)}`);
        }

        // Run compliance if requested
        if (options.compliance) {
          await runCompliance(data.buildId, options.compliance, apiKey, apiUrl);
        }
        return;
      }

      if (['FAILED', 'CANCELLED'].includes(status.status)) {
        spinner.fail(chalk.red(`Build ${status.status.toLowerCase()}`));
        process.exit(1);
      }

      await new Promise((r) => setTimeout(r, 5000));
    }

    spinner.fail('Build timed out');
    process.exit(1);
  } catch (e) {
    spinner.fail(chalk.red(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`));
    process.exit(1);
  }
};

async function runCompliance(buildId: string, profile: string, apiKey: string, apiUrl: string) {
  const spinner = ora(`Running ${profile} compliance check...`).start();

  const res = await fetch(`${apiUrl}/api/compliance/check/${buildId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile }),
  });

  if (res.ok) {
    const data = await res.json();
    const icon = data.passed ? chalk.green('✓') : chalk.yellow('⚠');
    spinner.succeed(`${icon} Compliance: ${data.score}% (${data.passed ? 'PASSED' : 'NEEDS ATTENTION'})`);
  } else {
    spinner.warn('Compliance check failed');
  }
}
