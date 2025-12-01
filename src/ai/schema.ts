import { z } from 'zod';

const displaySchema = z.object({
  server: z.string().optional(),
  compositor: z.string().optional(),
  bar: z.string().optional(),
  launcher: z.string().optional(),
  terminal: z.string().optional(),
  notifications: z.string().optional(),
  lockscreen: z.string().optional(),
});

const defaultsSchema = z.object({
  swappiness: z.number().optional(),
  trim: z.boolean().optional(),
  kernelParams: z.string().optional(),
  dnsOverHttps: z.boolean().optional(),
  macRandomization: z.boolean().optional(),
});

const packagesSchema = z.union([
  z.array(z.string()),
  z.record(z.string(), z.boolean()),
]);

export const buildSchema = z.object({
  base: z.string(),
  kernel: z.string().optional(),
  init: z.string().optional(),
  architecture: z.string().optional(),
  display: displaySchema.optional(),
  packages: packagesSchema,
  securityFeatures: z.array(z.string()).optional(),
  defaults: defaultsSchema.optional(),
});

export type BuildSpec = z.infer<typeof buildSchema>;
