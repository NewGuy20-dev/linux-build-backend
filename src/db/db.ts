import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const adapter = new PrismaNeonHttp(connectionString, { fullResults: true });
const basePrisma = new PrismaClient({ adapter } as any);

// Add retry logic for transient connection failures
const prisma = basePrisma.$extends({
  query: {
    async $allOperations({ operation, model, args, query }) {
      const maxRetries = 3;
      let lastError;
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await query(args);
        } catch (error: any) {
          lastError = error;
          if (error.message?.includes('ETIMEDOUT') || error.message?.includes('fetch failed')) {
            console.log(`[DB] Retry ${i + 1}/${maxRetries} for ${model}.${operation}`);
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
            continue;
          }
          throw error;
        }
      }
      throw lastError;
    },
  },
});

export default prisma;
