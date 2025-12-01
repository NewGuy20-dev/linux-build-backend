import { BuildSpec } from '../ai/schema';

export const normalizePackages = (packages: BuildSpec['packages']): string[] => {
  if (Array.isArray(packages)) {
    return packages;
  }

  return Object.keys(packages).filter((pkg) => packages[pkg]);
};

export const flattenPackages = (packages: BuildSpec['packages']): string[] => {
  return normalizePackages(packages);
};
