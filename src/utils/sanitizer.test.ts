import { describe, it, expect } from 'vitest';
import {
  validateBuildId,
  sanitizeDockerImageName,
  validatePathWithinDir,
  sanitizePackageName,
  escapeShellArg,
  sanitizeCommand,
  validateGitUrl,
  maskSensitiveData,
} from './sanitizer';

describe('validateBuildId', () => {
  it('accepts valid cuid2 format', () => {
    expect(validateBuildId('clh3am8hi0000qwer1234abcd')).toBe('clh3am8hi0000qwer1234abcd');
  });

  it('rejects too short', () => {
    expect(() => validateBuildId('abc123')).toThrow('Invalid build ID format');
  });

  it('rejects uppercase', () => {
    expect(() => validateBuildId('CLH3AM8HI0000QWER1234ABCD')).toThrow('Invalid build ID format');
  });

  it('rejects special characters', () => {
    expect(() => validateBuildId('clh3am8hi0000qwer1234-bcd')).toThrow('Invalid build ID format');
  });
});

describe('sanitizeDockerImageName', () => {
  it('accepts valid name', () => {
    expect(sanitizeDockerImageName('my-app')).toBe('my-app');
  });

  it('lowercases input', () => {
    expect(sanitizeDockerImageName('MyApp')).toBe('myapp');
  });

  it('removes invalid characters', () => {
    expect(sanitizeDockerImageName('my@app!')).toBe('myapp');
  });

  it('rejects empty after sanitization', () => {
    expect(() => sanitizeDockerImageName('@@@')).toThrow('Invalid Docker image name');
  });
});

describe('validatePathWithinDir', () => {
  it('accepts path within directory', () => {
    const result = validatePathWithinDir('/app/data/file.txt', '/app/data');
    expect(result).toContain('/app/data');
  });

  it('rejects path traversal', () => {
    expect(() => validatePathWithinDir('/app/data/../secret', '/app/data')).toThrow('Path traversal detected');
  });

  it('accepts exact directory match', () => {
    const result = validatePathWithinDir('/app/data', '/app/data');
    expect(result).toContain('/app/data');
  });
});

describe('sanitizePackageName', () => {
  it('keeps valid characters', () => {
    expect(sanitizePackageName('my-package_1.0')).toBe('my-package_1.0');
  });

  it('removes invalid characters', () => {
    expect(sanitizePackageName('my@package!name')).toBe('mypackagename');
  });
});

describe('escapeShellArg', () => {
  it('wraps in single quotes', () => {
    expect(escapeShellArg('hello')).toBe("'hello'");
  });

  it('escapes single quotes', () => {
    expect(escapeShellArg("it's")).toBe("'it'\\''s'");
  });

  it('handles empty string', () => {
    expect(escapeShellArg('')).toBe("''");
  });
});

describe('sanitizeCommand', () => {
  it('removes newlines', () => {
    expect(sanitizeCommand('echo hello\nworld')).toBe('echo helloworld');
  });

  it('removes carriage returns', () => {
    expect(sanitizeCommand('echo hello\r\nworld')).toBe('echo helloworld');
  });
});

describe('validateGitUrl', () => {
  it('accepts valid GitHub URL', () => {
    expect(validateGitUrl('https://github.com/user/repo')).toBe('https://github.com/user/repo');
  });

  it('accepts GitLab URL', () => {
    expect(validateGitUrl('https://gitlab.com/user/repo')).toBe('https://gitlab.com/user/repo');
  });

  it('accepts Bitbucket URL', () => {
    expect(validateGitUrl('https://bitbucket.org/user/repo')).toBe('https://bitbucket.org/user/repo');
  });

  it('rejects HTTP', () => {
    expect(() => validateGitUrl('http://github.com/user/repo')).toThrow('Only HTTPS');
  });

  it('rejects disallowed host', () => {
    expect(() => validateGitUrl('https://evil.com/repo')).toThrow('not allowed');
  });

  it('rejects command injection', () => {
    expect(() => validateGitUrl('https://github.com/user/repo;rm -rf /')).toThrow();
  });

  it('rejects invalid URL', () => {
    expect(() => validateGitUrl('not-a-url')).toThrow('Invalid git URL format');
  });
});

describe('maskSensitiveData', () => {
  it('masks Docker tokens', () => {
    expect(maskSensitiveData('token: dckr_pat_abc123XYZ')).toContain('[REDACTED]');
  });

  it('masks GitHub tokens', () => {
    expect(maskSensitiveData('ghp_1234567890abcdef')).toBe('[REDACTED]');
  });

  it('masks password fields', () => {
    expect(maskSensitiveData('password=secret123')).toBe('[REDACTED]');
  });

  it('masks token fields', () => {
    expect(maskSensitiveData('token: mytoken123')).toBe('[REDACTED]');
  });

  it('preserves non-sensitive data', () => {
    expect(maskSensitiveData('hello world')).toBe('hello world');
  });
});
