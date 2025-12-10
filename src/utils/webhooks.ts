import { createHmac } from 'crypto';
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

export const verifyWebhookSignature = (payload: string, signature: string, secret: string): boolean => {
  const expected = `sha256=${signPayload(payload, secret)}`;
  return signature === expected;
};
