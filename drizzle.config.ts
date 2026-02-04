import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { computeDatabaseUrl, getDatabaseClientConfig } from './src/lib/database-url';

dotenv.config({ path: '.env.local', quiet: true });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  // Feels nasty to use `as` here but the type of dbCredentials is not compatible with the one from pg
  dbCredentials: getDatabaseClientConfig(computeDatabaseUrl()) as {
    user: string;
    password: string;
    host: string;
    port: number;
    database: string;
  },
  verbose: !!process.env.DEBUG_QUERY_LOGGING,
  strict: true,
});
