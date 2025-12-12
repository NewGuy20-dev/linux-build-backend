import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { randomBytes } from 'crypto';

// OAuth2 configuration
interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  redirectUri: string;
}

// State storage for CSRF protection (use Redis in production)
const stateStore = new Map<string, { expires: number }>();
const STATE_TTL = 600000; // 10 minutes

const getOAuthConfig = (): OAuthConfig | null => {
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  return {
    clientId,
    clientSecret,
    authorizationUrl: process.env.OAUTH_AUTH_URL || '',
    tokenUrl: process.env.OAUTH_TOKEN_URL || '',
    userInfoUrl: process.env.OAUTH_USERINFO_URL || '',
    redirectUri: process.env.OAUTH_REDIRECT_URI || '',
  };
};

export const initiateOAuth = (_req: Request, res: Response) => {
  const config = getOAuthConfig();
  if (!config) {
    res.status(501).json({ error: 'OAuth not configured' });
    return;
  }

  // Generate CSRF state token
  const state = randomBytes(32).toString('hex');
  stateStore.set(state, { expires: Date.now() + STATE_TTL });

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state,
  });

  res.redirect(`${config.authorizationUrl}?${params}`);
};

export const handleOAuthCallback = async (req: Request, res: Response) => {
  const config = getOAuthConfig();
  if (!config) {
    res.status(501).json({ error: 'OAuth not configured' });
    return;
  }

  const { code, state } = req.query;
  
  // Validate CSRF state
  if (!state || typeof state !== 'string') {
    res.status(400).json({ error: 'Missing state parameter' });
    return;
  }
  
  const storedState = stateStore.get(state);
  if (!storedState || storedState.expires < Date.now()) {
    stateStore.delete(state as string);
    res.status(400).json({ error: 'Invalid or expired state' });
    return;
  }
  stateStore.delete(state as string);

  if (!code) {
    res.status(400).json({ error: 'Missing authorization code' });
    return;
  }

  try {
    const tokenRes = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error('No access token');

    const userRes = await fetch(config.userInfoUrl, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const user = await userRes.json();

    res.json({ user, tokens: { access_token: tokens.access_token, expires_in: tokens.expires_in } });
  } catch (e) {
    logger.error({ error: e }, 'OAuth callback failed');
    res.status(500).json({ error: 'Authentication failed' });
  }
};

export const validateSSOToken = async (req: Request, _res: Response, next: NextFunction) => {
  const token = req.headers['x-sso-token'] as string;
  if (!token) return next();

  const config = getOAuthConfig();
  if (!config) return next();

  try {
    const userRes = await fetch(config.userInfoUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (userRes.ok) {
      const user = await userRes.json();
      req.headers['x-user-id'] = user.sub || user.id;
    }
  } catch {
    // Continue without SSO user
  }
  next();
};
