import * as dotenv from 'dotenv';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

dotenv.config();

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getBaseDatabaseConfig(): PostgresConnectionOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: toNumber(process.env.DB_PORT, 5432),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
}

export function getMigrationDatabaseCandidates(): string[] {
  const configuredDb = (process.env.DB_NAME || '').trim();
  const fallbackDb = (process.env.DB_FALLBACK_NAME || 'postgres').trim();

  const candidates = [configuredDb, fallbackDb].filter((value) => value.length > 0);
  return Array.from(new Set(candidates));
}
