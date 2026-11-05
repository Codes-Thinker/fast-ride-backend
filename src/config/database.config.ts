import * as dotenv from 'dotenv';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

dotenv.config();

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// AWS RDS rejects unencrypted connections (pg_hba "no encryption" error), so
// SSL is on for RDS hosts even when DB_SSL was never set. DB_SSL=true/false
// still overrides the automatic choice.
function resolveSsl(host: string): PostgresConnectionOptions['ssl'] {
  const explicit = process.env.DB_SSL?.trim().toLowerCase();
  const useSsl =
    explicit === 'true' ? true : explicit === 'false' ? false : host.endsWith('.rds.amazonaws.com');

  return useSsl ? { rejectUnauthorized: false } : false;
}

export function getBaseDatabaseConfig(): PostgresConnectionOptions {
  const host = process.env.DB_HOST || 'localhost';

  return {
    type: 'postgres',
    host,
    port: toNumber(process.env.DB_PORT, 5432),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'postgres',
    ssl: resolveSsl(host),
  };
}

export function getMigrationDatabaseCandidates(): string[] {
  const configuredDb = (process.env.DB_NAME || '').trim();
  const fallbackDb = (process.env.DB_FALLBACK_NAME || 'postgres').trim();

  const candidates = [configuredDb, fallbackDb].filter((value) => value.length > 0);
  return Array.from(new Set(candidates));
}
