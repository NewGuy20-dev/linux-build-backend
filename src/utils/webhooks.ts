import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

const prisma = new PrismaClient();

type WebhookEvent = 'build.started' | 'build.completed' | 'build.failed';

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

const signPayload = (payload: string, secret: string): string => {
  return createHmac('sha256', secret).update(payload).digest('hex');
};

// SSRF Protection - validate webhook URLs
const isValidWebhookUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    
    // Require HTTPS
    if (parsed.protocol !== 'https:') return false;
    
    const hostname = parsed.hostname.toLowerCase();
    
    // Block localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
    
    // Block private IP ranges
    if (/^10\./.test(hostname)) return false;
    if (/^192\.168\./.test(hostname)) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return false;
    if (/^169\.254\./.test(hostname)) return false;
    
    // Block internal domains
    if (hostname.endsWith('.internal') || hostname.endsWith('.local') || hostname.endsWith('.localhost')) return false;
    
    // Block metadata endpoints
    if (hostname === '169.254.169.254') return false;
    
    return true;
  } catch {
    return false;
  }
};

export const triggerWebhooks = async (tenantId: string, event: WebhookEvent, data: Record<string, unknown>) => {
  const webhooks = await prisma.webhook.findMany({
    where: { tenantId, active: true, events: { has: event } },
  });

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const body = JSON.stringify(payload);

  for (const webhook of webhooks) {
    // SSRF protection
    if (!isValidWebhookUrl(webhook.url)) {
      logger.warn({ webhookId: webhook.id, url: webhook.url }, 'Blocked webhook to invalid URL');
      continue;
    }

    const signature = signPayload(body, webhook.secret);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Event': event,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      await prisma.webhook.update({
        where: { id: webhook.id },
        data: { lastTriggeredAt: new Date() },
      });

      logger.info({ webhookId: webhook.id, status: response.status }, 'Webhook delivered');
    } catch (err) {
      logger.error({ webhookId: webhook.id, error: (err as Error).message }, 'Webhook failed');
    }
  }
};

// Timing-safe signature verification - Fix for Finding 4
export const verifyWebhookSignature = (payload: string, signature: string, secret: string): boolean => {
  const expected = `sha256=${signPayload(payload, secret)}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
};

export { isValidWebhookUrl };
