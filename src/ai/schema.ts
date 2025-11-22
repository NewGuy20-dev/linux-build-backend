import { z } from 'zod';

export const buildSchema = z.object({
  baseDistro: z.enum(['arch', 'debian', 'ubuntu', 'alpine']),
  packages: z.array(z.string()),
  commands: z.array(z.string()),
  outputFormat: z.enum(['iso', 'docker']),
  desktopEnv: z.optional(z.enum(['gnome', 'kde', 'xfce'])),
  includeSteam: z.optional(z.boolean()),
});

export type BuildSpec = z.infer<typeof buildSchema>;
