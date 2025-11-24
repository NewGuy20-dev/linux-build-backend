import { z } from 'zod';

export const buildSchema = z.object({
  name: z.string(),
  base: z.enum(['arch', 'ubuntu', 'debian']),
  kernel: z.string(),
  init: z.string(),
  architecture: z.string(),
  desktop: z.object({
    display_server: z.string(),
    compositor: z.string(),
    bar: z.string(),
    launcher: z.string(),
    terminal: z.string(),
    notifications: z.string(),
    lock_screen: z.string(),
  }),
  packages: z.object({
    system: z.array(z.string()),
    dev: z.array(z.string()),
    network_security: z.array(z.string()),
    utils: z.array(z.string()),
    multimedia: z.array(z.string()),
    browsers: z.array(z.string()),
  }),
  security: z.object({
    full_disk_encryption: z.boolean(),
    secure_boot: z.boolean(),
    apparmor_profiles: z.boolean(),
    ufw_default_on: z.boolean(),
    auto_security_updates: z.boolean(),
  }),
  defaults: z.object({
    swappiness: z.number(),
    ssd_trim: z.boolean(),
    kernel_params: z.string(),
    doh: z.boolean(),
    mac_randomization: z.boolean(),
  }),
});

export type BuildSpec = z.infer<typeof buildSchema>;
