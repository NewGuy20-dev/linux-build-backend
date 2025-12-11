import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export type HookType = 'preBuild' | 'postBuild' | 'prePackage' | 'postPackage';

export interface PluginContext {
  buildId: string;
  spec: any;
  workspacePath: string;
}

export interface Plugin {
  name: string;
  version: string;
  hooks: Partial<Record<HookType, (ctx: PluginContext) => Promise<void>>>;
}

const loadedPlugins: Map<string, Plugin> = new Map();

export const loadPlugin = async (name: string): Promise<Plugin | null> => {
  if (loadedPlugins.has(name)) return loadedPlugins.get(name)!;

  const record = await prisma.plugin.findUnique({ where: { name } });
  if (!record || !record.enabled) return null;

  try {
    const plugin = require(record.entryPoint) as Plugin;
    loadedPlugins.set(name, plugin);
    logger.info({ plugin: name }, 'Plugin loaded');
    return plugin;
  } catch (e) {
    logger.error({ plugin: name, error: e }, 'Failed to load plugin');
    return null;
  }
};

export const runHook = async (hook: HookType, ctx: PluginContext) => {
  const plugins = await prisma.plugin.findMany({ where: { enabled: true, hooks: { has: hook } } });

  for (const p of plugins) {
    const plugin = await loadPlugin(p.name);
    if (plugin?.hooks[hook]) {
      try {
        await plugin.hooks[hook]!(ctx);
        logger.info({ plugin: p.name, hook }, 'Plugin hook executed');
      } catch (e) {
        logger.error({ plugin: p.name, hook, error: e }, 'Plugin hook failed');
      }
    }
  }
};

export const registerPlugin = async (name: string, version: string, entryPoint: string, hooks: HookType[]) => {
  return prisma.plugin.upsert({
    where: { name },
    update: { version, entryPoint, hooks },
    create: { name, version, entryPoint, hooks, author: 'system' },
  });
};

export const listPlugins = () => prisma.plugin.findMany();
