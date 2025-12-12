import { describe, it, expect } from 'vitest';
import {
  generateBorgConfig,
  generateResticConfig,
  generateBackupConfig,
  generateBackupCron,
} from './backupConfig';

// Use partial specs for testing - runtime code handles missing fields
const createSpec = (backup?: any) => ({ backup }) as any;

describe('generateBorgConfig', () => {
  it('returns empty when no backup config', () => {
    expect(generateBorgConfig(createSpec())).toBe('');
  });

  it('returns empty when tool is not borg', () => {
    expect(generateBorgConfig(createSpec({ enabled: true, tool: 'restic' }))).toBe('');
  });

  it('generates borg config with defaults', () => {
    const result = generateBorgConfig(createSpec({ enabled: true, tool: 'borg' }));
    expect(result).toContain('BORG_REPO="/var/backup/borg"');
    expect(result).toContain('KEEP_DAILY=7');
    expect(result).toContain('KEEP_WEEKLY=4');
    expect(result).toContain('KEEP_MONTHLY=12');
  });

  it('uses custom retention', () => {
    const result = generateBorgConfig(createSpec({
      enabled: true,
      tool: 'borg',
      retention: { daily: 14, weekly: 8, monthly: 6 },
    }));
    expect(result).toContain('KEEP_DAILY=14');
    expect(result).toContain('KEEP_WEEKLY=8');
    expect(result).toContain('KEEP_MONTHLY=6');
  });

  it('uses custom destination', () => {
    const result = generateBorgConfig(createSpec({
      enabled: true,
      tool: 'borg',
      destinations: ['/mnt/backup'],
    }));
    expect(result).toContain('BORG_REPO="/mnt/backup"');
  });
});

describe('generateResticConfig', () => {
  it('returns empty when no backup config', () => {
    expect(generateResticConfig(createSpec())).toBe('');
  });

  it('returns empty when tool is not restic', () => {
    expect(generateResticConfig(createSpec({ enabled: true, tool: 'borg' }))).toBe('');
  });

  it('generates restic config with defaults', () => {
    const result = generateResticConfig(createSpec({ enabled: true, tool: 'restic' }));
    expect(result).toContain('RESTIC_REPOSITORY="/var/backup/restic"');
    expect(result).toContain('KEEP_DAILY=7');
  });

  it('uses s3 destination', () => {
    const result = generateResticConfig(createSpec({
      enabled: true,
      tool: 'restic',
      destinations: ['s3://mybucket/backup'],
    }));
    expect(result).toContain('RESTIC_REPOSITORY="s3://mybucket/backup"');
  });
});

describe('generateBackupConfig', () => {
  it('returns empty when backup disabled', () => {
    expect(generateBackupConfig(createSpec({ enabled: false, tool: 'borg' }))).toBe('');
  });

  it('delegates to borg config', () => {
    expect(generateBackupConfig(createSpec({ enabled: true, tool: 'borg' }))).toContain('BORG_REPO');
  });

  it('delegates to restic config', () => {
    expect(generateBackupConfig(createSpec({ enabled: true, tool: 'restic' }))).toContain('RESTIC_REPOSITORY');
  });

  it('returns empty for unknown tool', () => {
    expect(generateBackupConfig(createSpec({ enabled: true, tool: 'unknown' }))).toBe('');
  });
});

describe('generateBackupCron', () => {
  it('returns empty when backup disabled', () => {
    expect(generateBackupCron(createSpec({ enabled: false, tool: 'borg' }))).toBe('');
  });

  it('generates daily cron by default', () => {
    const result = generateBackupCron(createSpec({ enabled: true, tool: 'borg', schedule: 'daily' }));
    expect(result).toContain('0 2 * * *');
  });

  it('generates weekly cron', () => {
    const result = generateBackupCron(createSpec({ enabled: true, tool: 'borg', schedule: 'weekly' }));
    expect(result).toContain('0 2 * * 0');
  });
});
