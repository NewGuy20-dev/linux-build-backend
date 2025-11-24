import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  prisma: {
    schema: 'prisma/schema.prisma',
  },
  datasource: {
    provider: 'postgresql',
    url: env("DATABASE_URL"),
  },
});
