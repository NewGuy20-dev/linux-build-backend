#!/usr/bin/env node
import { Command } from 'commander';
import { init } from './commands/init';
import { start } from './commands/start';
import { status } from './commands/status';
import { logs } from './commands/logs';
import { download } from './commands/download';
import { templates } from './commands/templates';
import { config } from './commands/config';

const program = new Command();

program
  .name('lbuild')
  .version('1.0.0')
  .description('Linux Builder CLI - Build custom Linux images');

program
  .command('init')
  .description('Initialize a new build spec')
  .option('-t, --template <name>', 'Use a preset template')
  .option('-o, --output <file>', 'Output file', 'build-spec.json')
  .action(init);

program
  .command('start <spec>')
  .description('Start a new build')
  .option('-w, --wait', 'Wait for build to complete')
  .option('--compliance <profile>', 'Run compliance check (hipaa, pci-dss, soc2)')
  .action(start);

program
  .command('status <buildId>')
  .description('Check build status')
  .option('-j, --json', 'Output as JSON')
  .action(status);

program
  .command('logs <buildId>')
  .description('View build logs')
  .option('-f, --follow', 'Follow log output')
  .option('-n, --lines <n>', 'Number of lines to show', '50')
  .action(logs);

program
  .command('download <buildId>')
  .description('Download build artifacts')
  .option('-t, --type <type>', 'Artifact type (iso, docker)', 'iso')
  .option('-o, --output <path>', 'Output path')
  .action(download);

program
  .command('templates')
  .description('List available templates')
  .option('-d, --details', 'Show template details')
  .action(templates);

program
  .command('config')
  .description('Manage CLI configuration')
  .option('--set-api-key <key>', 'Set API key')
  .option('--set-api-url <url>', 'Set API URL')
  .option('--show', 'Show current config')
  .action(config);

program.parse();
