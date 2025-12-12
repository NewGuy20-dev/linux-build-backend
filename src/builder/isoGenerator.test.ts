import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../executor/executor', () => ({
  executeCommandSecureArgs: vi.fn().mockResolvedValue(''),
}));

vi.mock('../executor/logger', () => ({
  log: vi.fn(),
}));

vi.mock('../utils/cancellation', () => ({
  checkCancellation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''),
  copyFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue(['custom-linux.iso']),
}));

// Valid CUID2 format build IDs for testing
const VALID_BUILD_ID = 'clx1234567890abcdefghij';

// Helper to create full package structure
const createPackages = (base: string[] = ['base']) => ({
  base,
  development: [],
  ai_ml: [],
  security: [],
  networking: [],
  databases: [],
  servers: [],
  multimedia: [],
  utils: [],
});

describe('isoGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateBaseDistro', () => {
    it('should accept valid distros', async () => {
      const { DOCKER_IMAGES } = await import('./dockerfileGenerator');
      const validDistros = Object.keys(DOCKER_IMAGES);
      
      expect(validDistros).toContain('arch');
      expect(validDistros).toContain('debian');
      expect(validDistros).toContain('ubuntu');
      expect(validDistros).toContain('fedora');
      expect(validDistros).toContain('alpine');
    });
  });

  describe('generateIso', () => {
    it('should generate ISO for arch base with full spec', async () => {
      const { generateIso } = await import('./isoGenerator');
      const { executeCommandSecureArgs } = await import('../executor/executor');
      
      const spec = {
        base: 'arch',
        init: 'systemd',
        kernel: { version: 'linux-lts' },
        packages: createPackages(['base', 'linux-lts']),
      };

      const result = await generateIso(spec as any, VALID_BUILD_ID, '/tmp/workspace');
      
      expect(result).toContain('.iso');
      expect(executeCommandSecureArgs).toHaveBeenCalled();
    });

    it('should check for cancellation', async () => {
      const { generateIso } = await import('./isoGenerator');
      const { checkCancellation } = await import('../utils/cancellation');
      
      const spec = { 
        base: 'arch', 
        packages: createPackages(['base']),
      };
      await generateIso(spec as any, 'clxcancelcheck1234abcde', '/tmp/workspace');
      
      expect(checkCancellation).toHaveBeenCalledWith('clxcancelcheck1234abcde');
    });
  });

  describe('error handling', () => {
    it('should reject unsupported distro', async () => {
      const { generateIso } = await import('./isoGenerator');
      
      const spec = {
        base: 'unsupported-distro',
        packages: createPackages(['base']),
      };

      await expect(generateIso(spec as any, 'clxinvaliddistro123abcd', '/tmp/workspace'))
        .rejects.toThrow('Unsupported base distribution');
    });
  });

  describe('filesystem and bootloader', () => {
    it('should handle btrfs filesystem', async () => {
      const { generateIso } = await import('./isoGenerator');
      
      const spec = {
        base: 'arch',
        packages: createPackages(['base']),
        filesystem: { root: 'btrfs', compression: true },
      };

      const result = await generateIso(spec as any, 'clxbtrfstest1234abcdefg', '/tmp/workspace');
      expect(result).toBeDefined();
    });

    it('should handle encryption setup', async () => {
      const { generateIso } = await import('./isoGenerator');
      
      const spec = {
        base: 'arch',
        packages: createPackages(['base']),
        filesystem: { root: 'ext4', encryption: 'luks2' },
      };

      const result = await generateIso(spec as any, 'clxlukstest12345abcdefg', '/tmp/workspace');
      expect(result).toBeDefined();
    });
  });
});
