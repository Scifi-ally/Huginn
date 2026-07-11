import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from './schema.js';
import dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (process.env.NODE_ENV === 'production' && !databaseUrl) {
  throw new Error('DATABASE_URL must be provided in production environments.');
}

const pool = new Pool({
  connectionString: databaseUrl || 'postgres://postgres:postgres@localhost:5433/warden',
});

export const db = drizzle(pool, { schema });
