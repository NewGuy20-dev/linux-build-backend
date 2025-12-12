import * as path from 'path';

// Build ID validation - cuid2 format only
const CUID2_PATTERN = /^[a-z0-9]{20,30}$/;

export const validateBuildId = (buildId: string): string => {
  if (!CUID2_PATTERN.test(buildId)) {
    throw new Error('Invalid build ID format');
  }
  return buildId;
};

// Docker image name - strict alphanumeric with limited special chars
const DOCKER_IMAGE_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,127}$/;

export const sanitizeDockerImageName = (name: string): string => {
  const sanitized = name.toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  if (!DOCKER_IMAGE_PATTERN.test(sanitized)) {
    throw new Error('Invalid Docker image name');
  }
  return sanitized;
};

// Path validation - ensure path stays within allowed directory
export const validatePathWithinDir = (filePath: string, allowedDir: string): string => {
  const resolved = path.resolve(filePath);
  const allowed = path.resolve(allowedDir);
  if (!resolved.startsWith(allowed + path.sep) && resolved !== allowed) {
    throw new Error('Path traversal detected');
  }
  return resolved;
};

// Package name - alphanumeric, hyphens, underscores, dots
export const sanitizePackageName = (packageName: string): string => {
  return packageName.replace(/[^a-zA-Z0-9\-_.]/g, '');
};

// Shell argument escaping - wrap in single quotes, escape existing quotes
export const escapeShellArg = (arg: string): string => {
  return `'${arg.replace(/'/g, "'\\''")}'`;
};

// Remove newlines for Dockerfile commands
export const sanitizeCommand = (command: string): string => {
  return command.replace(/[\n\r]/g, '');
};

// Git URL validation - HTTPS only, allowed hosts
const ALLOWED_GIT_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org'];

export const validateGitUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      throw new Error('Only HTTPS git URLs allowed');
    }
    if (!ALLOWED_GIT_HOSTS.includes(parsed.hostname)) {
      throw new Error(`Git host not allowed: ${parsed.hostname}`);
    }
    if (/[;&|`$()]/.test(url)) {
      throw new Error('Invalid characters in git URL');
    }
    return url;
  } catch (e) {
    if (e instanceof Error && e.message.includes('allowed')) throw e;
    throw new Error('Invalid git URL format');
  }
};

// Mask sensitive data in strings (for logging)
const SENSITIVE_PATTERNS = [
  /dckr_pat_[A-Za-z0-9_-]+/g,
  /ghp_[A-Za-z0-9]+/g,
  /password[=:]\s*\S+/gi,
  /token[=:]\s*\S+/gi,
];

export const maskSensitiveData = (text: string): string => {
  let masked = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    masked = masked.replace(pattern, '[REDACTED]');
  }
  return masked;
};
