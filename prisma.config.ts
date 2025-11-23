import { defineConfig } from 'prisma/config';

export default defineConfig({
  datasources: {
    db: {
      provider: 'postgresql',
      url: process.env.DIRECT_URL,
    },
  },
});
