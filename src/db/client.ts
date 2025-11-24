import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

let prisma: PrismaClient;

if (connectionString.includes('neon.tech')) {
  console.log('Initializing Neon adapter with connection string:', connectionString.replace(/:[^:@]+@/, ':****@'));
  neonConfig.webSocketConstructor = ws;
  const adapter = new PrismaNeon({ connectionString });
  prisma = new PrismaClient({ adapter } as any);
} else {
  console.log('Initializing standard Prisma client');
  prisma = new PrismaClient();
}

export default prisma;
