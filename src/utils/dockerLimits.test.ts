import { describe, it, expect } from 'vitest';
import { DEFAULT_LIMITS, getLimitsForTier, toDockerRunArgs } from './dockerLimits';

describe('DEFAULT_LIMITS', () => {
  it('has expected defaults', () => {
    expect(DEFAULT_LIMITS.memory).toBe('2g');
    expect(DEFAULT_LIMITS.cpus).toBe(2);
    expect(DEFAULT_LIMITS.pidsLimit).toBe(100);
    expect(DEFAULT_LIMITS.timeout).toBe(1800);
  });
});

describe('getLimitsForTier', () => {
  it('returns free tier by default', () => {
    expect(getLimitsForTier()).toEqual(DEFAULT_LIMITS);
  });

  it('returns higher limits for premium', () => {
    const premium = getLimitsForTier('premium');
    expect(premium.memory).toBe('8g');
    expect(premium.cpus).toBe(8);
  });

  it('falls back to default for unknown tier', () => {
    expect(getLimitsForTier('unknown' as any)).toEqual(DEFAULT_LIMITS);
  });
});

describe('toDockerRunArgs', () => {
  it('generates correct docker args', () => {
    const args = toDockerRunArgs(DEFAULT_LIMITS);
    expect(args).toContain('--memory=2g');
    expect(args).toContain('--cpus=2');
    expect(args).toContain('--pids-limit=100');
  });
});
