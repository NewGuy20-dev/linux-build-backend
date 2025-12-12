import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCommandSecureArgs, executeCommand, executeCommandSecure } from './executor';

// Mock the logger to avoid database calls
vi.mock('./logger', () => ({
  log: vi.fn(),
}));

describe('executeCommandSecureArgs', () => {
  it('executes command with separate args (no shell)', async () => {
    const result = await executeCommandSecureArgs('echo', ['hello', 'world'], 'test-build-id');
    expect(result.trim()).toBe('hello world');
  });

  it('handles arguments with spaces safely', async () => {
    const result = await executeCommandSecureArgs('echo', ['hello world'], 'test-build-id');
    expect(result.trim()).toBe('hello world');
  });

  it('prevents shell injection via arguments', async () => {
    // This should NOT execute the rm command because execFile doesn't use shell
    // The semicolon and command are treated as literal text
    const result = await executeCommandSecureArgs('echo', ['test; echo injected'], 'test-build-id');
    // The output should be the literal string, not two separate outputs
    expect(result.trim()).toBe('test; echo injected');
  });

  it('rejects invalid command', async () => {
    await expect(
      executeCommandSecureArgs('nonexistent-command-xyz', [], 'test-build-id')
    ).rejects.toBeDefined();
  });
});

describe('executeCommand', () => {
  it('executes shell command', async () => {
    const result = await executeCommand('echo "hello"', 'test-build-id');
    expect(result.trim()).toBe('hello');
  });

  it('handles command with pipes', async () => {
    const result = await executeCommand('echo "hello world" | tr a-z A-Z', 'test-build-id');
    expect(result.trim()).toBe('HELLO WORLD');
  });
});

describe('executeCommandSecure', () => {
  it('executes without logging command', async () => {
    const result = await executeCommandSecure('echo "secret"', 'test-build-id');
    expect(result.trim()).toBe('secret');
  });
});
