import { logger } from '../utils/logger';

interface BuildEvent {
  event: 'build.started' | 'build.completed' | 'build.failed';
  buildId: string;
  timestamp: string;
  data: { status: string; duration?: number; artifactUrl?: string; error?: string };
}

// Slack notification
export const sendSlackNotification = async (webhookUrl: string, event: BuildEvent) => {
  const color = event.event === 'build.completed' ? 'good' : event.event === 'build.failed' ? 'danger' : '#439FE0';
  const payload = {
    attachments: [{
      color,
      title: `Build ${event.event.split('.')[1]}`,
      text: `Build ID: ${event.buildId}`,
      fields: [
        { title: 'Status', value: event.data.status, short: true },
        ...(event.data.duration ? [{ title: 'Duration', value: `${event.data.duration}s`, short: true }] : []),
      ],
      ts: Math.floor(new Date(event.timestamp).getTime() / 1000),
    }],
  };

  try {
    await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (e) {
    logger.error({ error: e, webhookUrl }, 'Failed to send Slack notification');
  }
};

// Discord notification
export const sendDiscordNotification = async (webhookUrl: string, event: BuildEvent) => {
  const color = event.event === 'build.completed' ? 0x00ff00 : event.event === 'build.failed' ? 0xff0000 : 0x0099ff;
  const payload = {
    embeds: [{
      title: `Build ${event.event.split('.')[1]}`,
      description: `Build ID: \`${event.buildId}\``,
      color,
      fields: [
        { name: 'Status', value: event.data.status, inline: true },
        ...(event.data.duration ? [{ name: 'Duration', value: `${event.data.duration}s`, inline: true }] : []),
      ],
      timestamp: event.timestamp,
    }],
  };

  try {
    await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (e) {
    logger.error({ error: e, webhookUrl }, 'Failed to send Discord notification');
  }
};

// Generic webhook
export const sendWebhook = async (url: string, secret: string, event: BuildEvent) => {
  const crypto = await import('crypto');
  const body = JSON.stringify(event);
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Signature': `sha256=${signature}` },
      body,
    });
  } catch (e) {
    logger.error({ error: e, url }, 'Failed to send webhook');
  }
};
