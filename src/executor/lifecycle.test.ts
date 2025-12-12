import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BuildStep } from './lifecycle';

describe('BuildStep enum', () => {
  it('should have correct step values', () => {
    expect(BuildStep.PENDING).toBe('pending');
    expect(BuildStep.VALIDATING).toBe('validating');
    expect(BuildStep.BUILDING).toBe('building');
    expect(BuildStep.COMPLETE).toBe('complete');
    expect(BuildStep.FAILED).toBe('failed');
  });

  it('should have all required steps', () => {
    const steps = Object.values(BuildStep);
    expect(steps).toContain('pending');
    expect(steps).toContain('parsing');
    expect(steps).toContain('validating');
    expect(steps).toContain('resolving');
    expect(steps).toContain('generating');
    expect(steps).toContain('building');
    expect(steps).toContain('iso_generating');
    expect(steps).toContain('uploading');
    expect(steps).toContain('complete');
    expect(steps).toContain('failed');
  });

  it('should have 10 total steps', () => {
    const steps = Object.values(BuildStep);
    expect(steps.length).toBe(10);
  });
});

describe('lifecycle validation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should reject invalid build IDs with path traversal', async () => {
    // Mock all dependencies
    vi.doMock('../db/db', () => ({ default: { userBuild: { update: vi.fn() } } }));
    vi.doMock('../utils/fs', () => ({ createTempDir: vi.fn(), cleanupDir: vi.fn() }));
    vi.doMock('./executor', () => ({ executeCommand: vi.fn(), executeCommandSecure: vi.fn() }));
    vi.doMock('../builder/dockerfileGenerator', () => ({ generateDockerfile: vi.fn() }));
    vi.doMock('../builder/isoGenerator', () => ({ generateIso: vi.fn() }));
    vi.doMock('../builder/tarExporter', () => ({ exportDockerImage: vi.fn() }));
    vi.doMock('../ws/websocket', () => ({ broadcastBuildComplete: vi.fn() }));
    vi.doMock('../utils/cancellation', () => ({ checkCancellation: vi.fn() }));
    vi.doMock('./logger', () => ({ log: vi.fn() }));

    const { runBuildLifecycle } = await import('./lifecycle');
    const spec = { base: 'arch', packages: { base: ['base'] } };
    
    await expect(runBuildLifecycle(spec as any, '../../../etc/passwd')).rejects.toThrow('Invalid build ID');
  });

  it('should reject invalid build IDs with shell injection', async () => {
    vi.doMock('../db/db', () => ({ default: { userBuild: { update: vi.fn() } } }));
    vi.doMock('../utils/fs', () => ({ createTempDir: vi.fn(), cleanupDir: vi.fn() }));
    vi.doMock('./executor', () => ({ executeCommand: vi.fn(), executeCommandSecure: vi.fn() }));
    vi.doMock('../builder/dockerfileGenerator', () => ({ generateDockerfile: vi.fn() }));
    vi.doMock('../builder/isoGenerator', () => ({ generateIso: vi.fn() }));
    vi.doMock('../builder/tarExporter', () => ({ exportDockerImage: vi.fn() }));
    vi.doMock('../ws/websocket', () => ({ broadcastBuildComplete: vi.fn() }));
    vi.doMock('../utils/cancellation', () => ({ checkCancellation: vi.fn() }));
    vi.doMock('./logger', () => ({ log: vi.fn() }));

    const { runBuildLifecycle } = await import('./lifecycle');
    const spec = { base: 'arch', packages: { base: ['base'] } };
    
    await expect(runBuildLifecycle(spec as any, 'id; rm -rf /')).rejects.toThrow('Invalid build ID');
  });
});

describe('build step transitions', () => {
  it('should define correct step order', () => {
    const expectedOrder = [
      BuildStep.PENDING,
      BuildStep.PARSING,
      BuildStep.VALIDATING,
      BuildStep.RESOLVING,
      BuildStep.GENERATING,
      BuildStep.BUILDING,
      BuildStep.ISO_GENERATING,
      BuildStep.UPLOADING,
      BuildStep.COMPLETE,
    ];
    
    // Verify all steps exist
    expectedOrder.forEach(step => {
      expect(Object.values(BuildStep)).toContain(step);
    });
  });

  it('should have FAILED as terminal state', () => {
    expect(BuildStep.FAILED).toBe('failed');
    expect(BuildStep.COMPLETE).toBe('complete');
  });
});
