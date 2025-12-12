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
  labelNames: ['status', 'distro'],
  registers: [registry],
});

export const buildsInProgress = new Gauge({
  name: 'builds_in_progress',
  help: 'Builds currently in progress',
  labelNames: ['distro'],
  registers: [registry],
});

export const buildDuration = new Histogram({
  name: 'build_duration_seconds',
  help: 'Build duration in seconds',
  labelNames: ['distro', 'status'],
  buckets: [60, 120, 300, 600, 1200, 1800, 3600],
  registers: [registry],
});

export const buildArtifactSize = new Histogram({
  name: 'build_artifact_size_bytes',
  help: 'Build artifact size in bytes',
  labelNames: ['distro', 'type'],
  buckets: [1e6, 1e7, 1e8, 5e8, 1e9, 2e9, 5e9],
  registers: [registry],
});

export const getMetrics = async () => registry.metrics();
export const getContentType = () => registry.contentType;
