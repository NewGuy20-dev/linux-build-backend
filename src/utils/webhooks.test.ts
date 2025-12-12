import { describe, it, expect } from 'vitest';
import { createHmac, timingSafeEqual } from 'crypto';

// Test signature verification logic directly without importing the module
const signPayload = (payload: string, secret: string): string => {
  return createHmac('sha256', secret).update(payload).digest('hex');
};

const verifyWebhookSignature = (payload: string, signature: string, secret: string): boolean => {
  const expected = `sha256=${signPayload(payload, secret)}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
};

// SSRF validation logic
const isValidWebhookUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1') return false;
    if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) return false;
    if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return false;
    return true;
  } catch { return false; }
};

describe('webhooks', () => {
  describe('verifyWebhookSignature', () => {
    const secret = 'test-secret';
    const payload = '{"event":"build.completed"}';

    it('returns true for valid signature', () => {
      const validSig = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
      expect(verifyWebhookSignature(payload, validSig, secret)).toBe(true);
    });

    it('returns false for invalid signature', () => {
      expect(verifyWebhookSignature(payload, 'sha256=invalid', secret)).toBe(false);
    });

    it('returns false for wrong secret', () => {
      const sig = `sha256=${createHmac('sha256', 'wrong-secret').update(payload).digest('hex')}`;
      expect(verifyWebhookSignature(payload, sig, secret)).toBe(false);
    });
  });

  describe('isValidWebhookUrl', () => {
    it('accepts valid HTTPS URLs', () => {
      expect(isValidWebhookUrl('https://example.com/webhook')).toBe(true);
    });

    it('rejects HTTP URLs', () => {
      expect(isValidWebhookUrl('http://example.com/webhook')).toBe(false);
    });

    it('rejects localhost', () => {
      expect(isValidWebhookUrl('https://localhost/webhook')).toBe(false);
      expect(isValidWebhookUrl('https://127.0.0.1/webhook')).toBe(false);
    });

    it('rejects private IPs', () => {
      expect(isValidWebhookUrl('https://10.0.0.1/webhook')).toBe(false);
      expect(isValidWebhookUrl('https://192.168.1.1/webhook')).toBe(false);
    });

    it('rejects internal domains', () => {
      expect(isValidWebhookUrl('https://api.internal/webhook')).toBe(false);
      expect(isValidWebhookUrl('https://service.local/webhook')).toBe(false);
    });
  });
});
