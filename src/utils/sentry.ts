import * as Sentry from '@sentry/node';
import { Express } from 'express';

export const initSentry = (app: Express) => {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });

  // Setup express error handler
  Sentry.setupExpressErrorHandler(app);
};

export const sentryErrorHandler = Sentry.expressErrorHandler();

export const captureException = (error: Error, context?: Record<string, unknown>) => {
  Sentry.captureException(error, { extra: context });
};

export const captureMessage = (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
  Sentry.captureMessage(message, level);
};
