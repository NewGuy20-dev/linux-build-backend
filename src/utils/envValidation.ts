import { logger } from './logger';

interface EnvVar {
  name: string;
  required?: boolean;
  default?: string;
  validator?: (value: string) => boolean;
}

const envVars: EnvVar[] = [
  { name: 'DATABASE_URL', required: true },
  { name: 'NODE_ENV', default: 'development' },
  { name: 'PORT', default: '3000', validator: (v) => !isNaN(parseInt(v)) },
  { name: 'API_KEYS' },
  { name: 'DOCKER_HOST' },
  { name: 'ARTIFACT_DIR', default: './artifacts' },
  { name: 'LOG_LEVEL', default: 'info', validator: (v) => ['debug', 'info', 'warn', 'error'].includes(v) },
];

export const validateEnv = (): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  for (const { name, required, default: defaultVal, validator } of envVars) {
    const value = process.env[name];

    if (!value && required) {
      errors.push(`Missing required env var: ${name}`);
      continue;
    }

    if (!value && defaultVal) {
      process.env[name] = defaultVal;
    }

    if (value && validator && !validator(value)) {
      errors.push(`Invalid value for ${name}: ${value}`);
    }
  }

  if (errors.length > 0) {
    errors.forEach((e) => logger.error(e));
  } else {
    logger.info('Environment validation passed');
  }

  return { valid: errors.length === 0, errors };
};

export const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};
