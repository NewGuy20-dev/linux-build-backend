import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { saveArtifact, getArtifact, deleteArtifacts, getArtifactPath } from './artifactStorage';

const TEST_DIR = './test-artifacts';
const TEST_BUILD_ID = 'test-build-123';

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
    it('returns correct path', () => {
      const result = getArtifactPath('build-1', 'file.iso');
      expect(result).toContain('build-1');
      expect(result).toContain('file.iso');
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
      const result = await getArtifact('nonexistent', 'file.txt');
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
