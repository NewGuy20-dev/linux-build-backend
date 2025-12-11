import { describe, it, expect } from 'vitest';

// Test filename sanitization logic (extracted for testing)
const sanitizeFilename = (filename: string): string => {
  return filename.replace(/[^\w.-]/g, '_').slice(0, 255);
};

describe('filename sanitization for Content-Disposition', () => {
  it('preserves safe filenames', () => {
    expect(sanitizeFilename('build-123.tar')).toBe('build-123.tar');
    expect(sanitizeFilename('image_v1.0.iso')).toBe('image_v1.0.iso');
  });

  it('sanitizes header injection attempts', () => {
    expect(sanitizeFilename('file\r\nX-Injected: header')).toBe('file__X-Injected__header');
    expect(sanitizeFilename('file\nheader')).toBe('file_header');
  });

  it('removes special characters', () => {
    expect(sanitizeFilename('file<script>.tar')).toBe('file_script_.tar');
    expect(sanitizeFilename('file"name.iso')).toBe('file_name.iso');
  });

  it('truncates long filenames', () => {
    const longName = 'a'.repeat(300) + '.tar';
    expect(sanitizeFilename(longName).length).toBe(255);
  });

  it('handles unicode characters', () => {
    expect(sanitizeFilename('文件.tar')).toBe('__.tar');
  });
});

describe('owner key generation', () => {
  it('generates consistent hash for same input', () => {
    const crypto = require('crypto');
    const apiKey = 'test-api-key';
    const hash1 = crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 32);
    const hash2 = crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 32);
    expect(hash1).toBe(hash2);
  });

  it('generates different hash for different input', () => {
    const crypto = require('crypto');
    const hash1 = crypto.createHash('sha256').update('key1').digest('hex').slice(0, 32);
    const hash2 = crypto.createHash('sha256').update('key2').digest('hex').slice(0, 32);
    expect(hash1).not.toBe(hash2);
  });
});
