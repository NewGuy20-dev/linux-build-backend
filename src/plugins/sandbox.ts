import { logger } from '../utils/logger';
import { PluginContext, HookType } from './loader';

export interface SandboxOptions {
  timeout?: number;
  memoryLimit?: number;
  allowedDomains?: string[];
}

const DEFAULT_OPTIONS: Required<SandboxOptions> = {
  timeout: 30000,
  memoryLimit: 128,
  allowedDomains: [],
};

const createSafeConsole = (pluginName: string) => ({
  log: (...args: any[]) => logger.info({ plugin: pluginName }, args.join(' ')),
  warn: (...args: any[]) => logger.warn({ plugin: pluginName }, args.join(' ')),
  error: (...args: any[]) => logger.error({ plugin: pluginName }, args.join(' ')),
  info: (...args: any[]) => logger.info({ plugin: pluginName }, args.join(' ')),
});

// Comprehensive SSRF protection
const createSafeFetch = (pluginName: string, allowedDomains: string[] = []) => {
  return async (url: string, options?: RequestInit) => {
    const urlObj = new URL(url);

    // Block all private/internal IPs and metadata endpoints
    const blockedPatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^192\.168\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^169\.254\./,
      /^0\.0\.0\.0$/,
      /^::1$/,
      /^fc00:/i,
      /^fe80:/i,
      /^fd[0-9a-f]{2}:/i,
      /metadata/i,
      /^169\.254\.169\.254$/,
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // Carrier-grade NAT
    ];

    if (blockedPatterns.some((p) => p.test(urlObj.hostname))) {
      throw new Error('Access to internal networks is not allowed');
    }

    if (allowedDomains.length > 0 && !allowedDomains.includes(urlObj.hostname)) {
      throw new Error(`Domain ${urlObj.hostname} is not in allowed list`);
    }

    logger.debug({ plugin: pluginName, url: urlObj.hostname }, 'Plugin fetch request');
    return fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  };
};

// Validate plugin code - comprehensive patterns to prevent sandbox escape
export const validatePluginCode = (code: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

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
    // Sandbox escape prevention
    { pattern: /getPrototypeOf/, message: 'getPrototypeOf is not allowed' },
    { pattern: /\bconstructor\b/, message: 'constructor access is not allowed' },
    { pattern: /__proto__/, message: '__proto__ access is not allowed' },
    { pattern: /\bprototype\b/, message: 'prototype access is not allowed' },
    { pattern: /\bProxy\b/, message: 'Proxy is not allowed' },
    { pattern: /\bReflect\b/, message: 'Reflect is not allowed' },
    { pattern: /\bSymbol\b/, message: 'Symbol is not allowed' },
    { pattern: /\bwith\s*\(/, message: 'with statement is not allowed' },
    { pattern: /\bglobalThis\b/, message: 'globalThis is not allowed' },
    { pattern: /\bwindow\b/, message: 'window is not allowed' },
    { pattern: /\bglobal\b/, message: 'global is not allowed' },
    { pattern: /\bthis\s*\[/, message: 'this[] access is not allowed' },
  ];

  for (const { pattern, message } of dangerousPatterns) {
    if (pattern.test(code)) {
      errors.push(message);
    }
  }

  return { valid: errors.length === 0, errors };
};

// Create frozen sandbox context
export const createSandboxContext = (pluginName: string, ctx: PluginContext, options: SandboxOptions = {}) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Create frozen copies to prevent prototype pollution
  const frozenContext = Object.freeze({ ...ctx });

  const sandbox = {
    context: frozenContext,
    console: Object.freeze(createSafeConsole(pluginName)),
    fetch: createSafeFetch(pluginName, opts.allowedDomains),
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, Math.min(ms, opts.timeout)),
    clearTimeout,
    Promise,
    JSON: Object.freeze({ parse: JSON.parse, stringify: JSON.stringify }),
    Math: Object.freeze({ ...Math }),
    Date,
    Array,
    Object: Object.freeze({ keys: Object.keys, values: Object.values, entries: Object.entries, freeze: Object.freeze }),
    String,
    Number,
    Boolean,
    Error,
    Map,
    Set,
    RegExp,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    // Explicitly blocked
    eval: undefined,
    Function: undefined,
    require: undefined,
    process: undefined,
    __dirname: undefined,
    __filename: undefined,
    globalThis: undefined,
    global: undefined,
    window: undefined,
    Proxy: undefined,
    Reflect: undefined,
  };

  return Object.freeze(sandbox);
};

// Execute plugin code safely
export const runInSandbox = async (
  pluginName: string,
  code: string,
  ctx: PluginContext,
  options: SandboxOptions = {}
): Promise<void> => {
  // Validate first
  const validation = validatePluginCode(code);
  if (!validation.valid) {
    throw new Error(`Code validation failed: ${validation.errors.join(', ')}`);
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sandbox = createSandboxContext(pluginName, ctx, opts);

  logger.info({ plugin: pluginName, timeout: opts.timeout }, 'Running plugin in sandbox');

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Plugin ${pluginName} timed out after ${opts.timeout}ms`));
    }, opts.timeout);

    try {
      // Use Function constructor with strict validation already done
      const argNames = Object.keys(sandbox);
      const argValues = Object.values(sandbox);
      const wrappedCode = `"use strict";\nreturn (async () => {\n${code}\n})();`;
      const fn = new Function(...argNames, wrappedCode);

      Promise.resolve(fn(...argValues))
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

export const executePluginSafe = async (
  pluginName: string,
  hook: HookType,
  code: string,
  ctx: PluginContext,
  options?: SandboxOptions
): Promise<{ success: boolean; error?: string }> => {
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
