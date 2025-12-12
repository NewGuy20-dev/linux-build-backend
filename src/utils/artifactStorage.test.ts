import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { saveArtifact, getArtifact, deleteArtifacts, getArtifactPath } from './artifactStorage';

const TEST_DIR = './test-artifacts';
const TEST_BUILD_ID = 'clh3am8hi0000qwer1234abcd'; // Valid cuid2 format

// Override ARTIFACT_DIR for tests
process.env.ARTIFACT_DIR = TEST_DIR;

describe('artifactStorage', () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('getArtifactPath', () => {
    it('returns correct path for valid inputs', () => {
      const result = getArtifactPath(TEST_BUILD_ID, 'file.iso');
      expect(result).toContain(TEST_BUILD_ID);
      expect(result).toContain('file.iso');
    });

    it('rejects invalid build ID', () => {
      expect(() => getArtifactPath('invalid!', 'file.iso')).toThrow('Invalid build ID');
    });

    it('prevents path traversal in filename', () => {
      const result = getArtifactPath(TEST_BUILD_ID, '../../../etc/passwd');
      expect(result).not.toContain('..');
      expect(result).toContain('passwd');
    });
  });

  describe('saveArtifact', () => {
    it('saves artifact to disk', async () => {
      const data = Buffer.from('test content');
      const filePath = await saveArtifact(TEST_BUILD_ID, 'test.txt', data);
      
      expect(filePath).toContain(TEST_BUILD_ID);
      const content = await fs.readFile(filePath);
      expect(content.toString()).toBe('test content');
    });
  });

  describe('getArtifact', () => {
    it('retrieves saved artifact', async () => {
      const data = Buffer.from('hello world');
      await saveArtifact(TEST_BUILD_ID, 'hello.txt', data);
      
      const result = await getArtifact(TEST_BUILD_ID, 'hello.txt');
      expect(result?.toString()).toBe('hello world');
    });

    it('returns null for missing artifact', async () => {
      const result = await getArtifact(TEST_BUILD_ID, 'nonexistent.txt');
      expect(result).toBeNull();
    });
  });

  describe('deleteArtifacts', () => {
    it('removes build artifacts directory', async () => {
      await saveArtifact(TEST_BUILD_ID, 'file.txt', Buffer.from('data'));
      await deleteArtifacts(TEST_BUILD_ID);
      
      const result = await getArtifact(TEST_BUILD_ID, 'file.txt');
      expect(result).toBeNull();
    });
  });
});
