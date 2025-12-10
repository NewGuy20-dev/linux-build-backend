import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [registry],
});

export const buildsTotal = new Counter({
  name: 'builds_total',
  help: 'Total builds',
  labelNames: ['status', 'tier'],
  registers: [registry],
});

export const buildsInProgress = new Gauge({
  name: 'builds_in_progress',
  help: 'Builds currently in progress',
  registers: [registry],
});

export const buildDuration = new Histogram({
  name: 'build_duration_seconds',
  help: 'Build duration in seconds',
  labelNames: ['tier'],
  buckets: [60, 300, 600, 1200, 1800, 3600],
  registers: [registry],
});

export const getMetrics = async () => registry.metrics();
export const getContentType = () => registry.contentType;
