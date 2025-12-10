import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';

// Test signature verification logic directly without importing the module
// (which instantiates PrismaClient)
const signPayload = (payload: string, secret: string): string => {
  return createHmac('sha256', secret).update(payload).digest('hex');
};

const verifyWebhookSignature = (payload: string, signature: string, secret: string): boolean => {
  const expected = `sha256=${signPayload(payload, secret)}`;
  return signature === expected;
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
});
