import { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { addBuildJob } from '../queue/buildQueue';
import { logger } from '../utils/logger';
import { createId } from '@paralleldrive/cuid2';
import { buildSchema } from '../ai/schema';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const verifyGitHubSignature = (payload: string, signature: string | undefined, secret: string): boolean => {
  if (!signature) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
};

router.post('/github/webhook', async (req: Request, res: Response) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Webhook secret not configured' });
    return;
  }

  const signature = req.headers['x-hub-signature-256'] as string;
  const payload = JSON.stringify(req.body);

  if (!verifyGitHubSignature(payload, signature, secret)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const event = req.headers['x-github-event'] as string;
  const { repository, ref, sender } = req.body;

  logger.info({ event, repo: repository?.full_name, ref }, 'GitHub webhook received');

  if (event === 'workflow_dispatch' || event === 'push') {
    const buildId = createId();
    
    // Validate build spec from inputs
    let spec;
    try {
      const rawSpec = req.body.inputs?.spec || { base: 'ubuntu', packages: [] };
      spec = buildSchema.parse(typeof rawSpec === 'string' ? JSON.parse(rawSpec) : rawSpec);
    } catch {
      res.status(400).json({ error: 'Invalid build specification' });
      return;
    }

    await addBuildJob({
      buildId,
      spec,
      apiKeyHash: `github:${sender?.login || 'unknown'}`,
    });

    res.status(202).json({ buildId, message: 'Build queued' });
    return;
  }

  res.status(200).json({ message: 'Event ignored' });
});

// Requires authentication - Fix for Critical Finding 2
router.post('/github/dispatch', authMiddleware, async (req: Request, res: Response) => {
  const { owner, repo, workflow_id, ref = 'main', inputs } = req.body;
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    res.status(500).json({ error: 'GitHub token not configured' });
    return;
  }

  // Validate inputs
  if (!owner || !repo || !workflow_id) {
    res.status(400).json({ error: 'Missing required fields: owner, repo, workflow_id' });
    return;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow_id)}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref, inputs }),
      }
    );

    if (response.status === 204) {
      res.status(200).json({ message: 'Workflow dispatched' });
    } else {
      res.status(response.status).json({ error: 'Failed to dispatch workflow' });
    }
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'GitHub dispatch failed');
    res.status(500).json({ error: 'Failed to dispatch workflow' });
  }
});

export default router;
