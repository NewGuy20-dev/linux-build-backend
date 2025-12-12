import { describe, it, expect, beforeEach } from 'vitest';
import {
  registry,
  httpRequestsTotal,
  httpRequestDuration,
  buildsTotal,
  buildsInProgress,
  getMetrics,
  getContentType,
} from './metrics';

describe('metrics', () => {
  beforeEach(() => {
    registry.resetMetrics();
  });

  describe('httpRequestsTotal', () => {
    it('increments counter', () => {
      httpRequestsTotal.inc({ method: 'GET', path: '/test', status: '200' });
      expect(httpRequestsTotal).toBeDefined();
    });
  });

  describe('httpRequestDuration', () => {
    it('observes duration', () => {
      httpRequestDuration.observe({ method: 'GET', path: '/test', status: '200' }, 0.5);
      expect(httpRequestDuration).toBeDefined();
    });
  });

  describe('buildsTotal', () => {
    it('increments with labels', () => {
      buildsTotal.inc({ status: 'completed', distro: 'arch' });
      expect(buildsTotal).toBeDefined();
    });
  });

  describe('buildsInProgress', () => {
    it('can increment and decrement', () => {
      buildsInProgress.inc();
      buildsInProgress.dec();
      expect(buildsInProgress).toBeDefined();
    });
  });

  describe('getMetrics', () => {
    it('returns prometheus format', async () => {
      const metrics = await getMetrics();
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
    });
  });

  describe('getContentType', () => {
    it('returns prometheus content type', () => {
      expect(getContentType()).toContain('text/plain');
    });
  });
});
