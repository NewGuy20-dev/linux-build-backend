import { BuildSpec } from '../ai/schema';

export const flattenPackages = (packages: BuildSpec['packages']): string[] => {
  return Object.values(packages).flat();
};
