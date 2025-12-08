import { BuildSpec } from '../ai/schema';

type PackagesType = BuildSpec['packages'];
type CategorizedPackages = { base: string[]; development: string[]; ai_ml: string[]; security: string[]; networking: string[]; databases: string[]; servers: string[]; multimedia: string[]; utils: string[] };

export const normalizePackages = (packages: PackagesType): string[] => {
  if (Array.isArray(packages)) {
    return packages;
  }

  if (typeof packages === 'object' && packages !== null) {
    // Check if it's the categorized format
    if ('base' in packages && Array.isArray((packages as CategorizedPackages).base)) {
      const p = packages as CategorizedPackages;
      return [...p.base, ...p.development, ...p.ai_ml, ...p.security, ...p.networking, ...p.databases, ...p.servers, ...p.multimedia, ...p.utils];
    }
    // Record<string, boolean> format
    return Object.keys(packages).filter((pkg) => (packages as Record<string, boolean>)[pkg]);
  }

  return [];
};

export const flattenPackages = (packages: PackagesType): string[] => {
  return normalizePackages(packages);
};
