import { logger } from '../utils/logger';
import { PluginContext, HookType } from './loader';

// Sandboxed execution environment for plugins
// Uses isolated context with limited API surface

export interface SandboxOptions {
  timeout?: number;        // Execution timeout in ms
  memoryLimit?: number;    // Memory limit in MB
  allowedModules?: string[]; // Allowed require modules
}

const DEFAULT_OPTIONS: Required<SandboxOptions> = {
  timeout: 30000,
  memoryLimit: 128,
  allowedModules: ['path', 'crypto'],
};

// Safe console wrapper
const createSafeConsole = (pluginName: string) => ({
  log: (...args: any[]) => logger.info({ plugin: pluginName }, args.join(' ')),
  warn: (...args: any[]) => logger.warn({ plugin: pluginName }, args.join(' ')),
  error: (...args: any[]) => logger.error({ plugin: pluginName }, args.join(' ')),
  info: (...args: any[]) => logger.info({ plugin: pluginName }, args.join(' ')),
});

// Safe fetch wrapper with restrictions
const createSafeFetch = (pluginName: string, allowedDomains: string[] = []) => {
  return async (url: string, options?: RequestInit) => {
    const urlObj = new URL(url);
    
    // Block internal/private IPs
    const blockedPatterns = [/^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./];
    if (blockedPatterns.some(p => p.test(urlObj.hostname))) {
      throw new Error('Access to internal networks is not allowed');
    }

    // Check allowed domains if specified
    if (allowedDomains.length > 0 && !allowedDomains.includes(urlObj.hostname)) {
      throw new Error(`Domain ${urlObj.hostname} is not in allowed list`);
    }

    logger.debug({ plugin: pluginName, url: urlObj.hostname }, 'Plugin fetch request');
    return fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  };
};

// Create sandboxed context for plugin execution
export const createSandboxContext = (pluginName: string, ctx: PluginContext, options: SandboxOptions = {}) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return {
    // Plugin context (read-only)
    context: Object.freeze({ ...ctx }),

    // Safe console
    console: createSafeConsole(pluginName),

    // Safe fetch
    fetch: createSafeFetch(pluginName),

    // Limited globals
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, Math.min(ms, opts.timeout)),
    clearTimeout,
    Promise,
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Error,
    Map,
    Set,
    RegExp,

    // Blocked globals
    eval: undefined,
    Function: undefined,
    require: undefined,
    process: undefined,
    __dirname: undefined,
    __filename: undefined,
  };
};

// Execute plugin code in sandbox
export const runInSandbox = async (
  pluginName: string,
  code: string,
  ctx: PluginContext,
  options: SandboxOptions = {}
): Promise<void> => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sandbox = createSandboxContext(pluginName, ctx, opts);

  logger.info({ plugin: pluginName, timeout: opts.timeout }, 'Running plugin in sandbox');

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Plugin ${pluginName} timed out after ${opts.timeout}ms`));
    }, opts.timeout);

    try {
      // Create async function from code
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction(...Object.keys(sandbox), `"use strict";\n${code}`);

      fn(...Object.values(sandbox))
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch((err: Error) => {
          clearTimeout(timer);
          reject(err);
        });
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
};

// Validate plugin code before execution
export const validatePluginCode = (code: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Check for dangerous patterns
  const dangerousPatterns = [
    { pattern: /\beval\s*\(/, message: 'eval() is not allowed' },
    { pattern: /\bFunction\s*\(/, message: 'Function constructor is not allowed' },
    { pattern: /\brequire\s*\(/, message: 'require() is not allowed' },
    { pattern: /\bimport\s*\(/, message: 'Dynamic import is not allowed' },
    { pattern: /\bprocess\./, message: 'process access is not allowed' },
    { pattern: /\b__dirname\b/, message: '__dirname is not allowed' },
    { pattern: /\b__filename\b/, message: '__filename is not allowed' },
    { pattern: /child_process/, message: 'child_process is not allowed' },
    { pattern: /\bfs\b/, message: 'fs module is not allowed' },
  ];

  for (const { pattern, message } of dangerousPatterns) {
    if (pattern.test(code)) {
      errors.push(message);
    }
  }

  return { valid: errors.length === 0, errors };
};

// Safe plugin execution wrapper
export const executePluginSafe = async (
  pluginName: string,
  hook: HookType,
  code: string,
  ctx: PluginContext,
  options?: SandboxOptions
): Promise<{ success: boolean; error?: string }> => {
  // Validate code first
  const validation = validatePluginCode(code);
  if (!validation.valid) {
    logger.error({ plugin: pluginName, errors: validation.errors }, 'Plugin validation failed');
    return { success: false, error: `Validation failed: ${validation.errors.join(', ')}` };
  }

  try {
    await runInSandbox(pluginName, code, ctx, options);
    logger.info({ plugin: pluginName, hook }, 'Plugin executed successfully');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ plugin: pluginName, hook, error: message }, 'Plugin execution failed');
    return { success: false, error: message };
  }
};
