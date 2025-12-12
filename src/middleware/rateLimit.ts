import rateLimit from 'express-rate-limit';

// Strict rate limit for build creation (resource intensive)
export const buildRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 builds per hour per IP
  message: { error: 'Too many build requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Moderate rate limit for AI generation
export const generateRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 generations per hour per IP
  message: { error: 'Too many generation requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limit
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
