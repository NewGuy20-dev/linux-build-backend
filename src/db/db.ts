import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const maskConnectionString = (value: string) => value.replace(/:[^:@]+@/, ':****@');
const isNeonConnection = /neon\.tech/i.test(connectionString);

let prisma: PrismaClient;

if (isNeonConnection) {
  console.log('Initializing Neon HTTP adapter with connection string:', maskConnectionString(connectionString));

  // Force the Neon driver to use the fetch-based HTTP transport for every query type.
  neonConfig.poolQueryViaFetch = true;
  neonConfig.fetchConnectionCache = true;
  neonConfig.useSecureWebSocket = false;
  neonConfig.webSocketConstructor = undefined;
  neonConfig.coalesceWrites = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = 'password';

  const adapter = new PrismaNeon({ connectionString });
  prisma = new PrismaClient({ adapter } as any);
} else {
  console.log('Initializing standard Prisma client');
  prisma = new PrismaClient();
}

export default prisma;
