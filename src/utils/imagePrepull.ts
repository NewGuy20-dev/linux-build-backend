import { executeCommandSecureArgs } from '../executor/executor';
import { logger } from './logger';

// Base images to pre-pull for faster builds
const BASE_IMAGES = [
  'archlinux:latest',
  'debian:bookworm',
  'ubuntu:noble',
  'alpine:latest',
  'fedora:latest',
];

/**
 * Pre-pull common base images on startup for faster builds
 */
export const prePullImages = async (): Promise<void> => {
  logger.info('Starting base image pre-pull...');
  
  for (const image of BASE_IMAGES) {
    try {
      await executeCommandSecureArgs('docker', ['pull', image], 'system');
      logger.info({ image }, 'Pre-pulled base image');
    } catch (error) {
      logger.warn({ image, error }, 'Failed to pre-pull image');
    }
  }
  
  logger.info('Base image pre-pull complete');
};

/**
 * Check if an image exists locally
 */
export const imageExists = async (image: string): Promise<boolean> => {
  try {
    await executeCommandSecureArgs('docker', ['image', 'inspect', image], 'system');
    return true;
  } catch {
    return false;
  }
};

/**
 * Pull image if not exists locally
 */
export const ensureImage = async (image: string): Promise<void> => {
  if (!await imageExists(image)) {
    await executeCommandSecureArgs('docker', ['pull', image], 'system');
  }
};
