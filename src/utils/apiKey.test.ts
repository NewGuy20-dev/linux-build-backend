import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey } from './apiKey';

describe('generateApiKey', () => {
  it('generates key with lbk_ prefix', () => {
    const { key } = generateApiKey();
    expect(key.startsWith('lbk_')).toBe(true);
  });

  it('generates unique keys', () => {
    const keys = new Set([...Array(10)].map(() => generateApiKey().key));
    expect(keys.size).toBe(10);
  });

  it('returns hash and prefix', () => {
    const { key, hash, prefix } = generateApiKey();
    expect(hash).toHaveLength(64); // SHA-256 hex
    expect(prefix).toBe(key.slice(0, 12));
  });
});

describe('hashApiKey', () => {
  it('produces consistent hash', () => {
    const key = 'lbk_test123';
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it('produces different hashes for different keys', () => {
    expect(hashApiKey('lbk_a')).not.toBe(hashApiKey('lbk_b'));
  });
});
