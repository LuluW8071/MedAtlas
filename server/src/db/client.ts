import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { env } from '../config/env.js';
import * as schema from './schema.js';

const sqlite = new Database(env.appointmentsDbPath);
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    appointment_at INTEGER NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    timezone TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS appointments_time_idx ON appointments (appointment_at);
`);

export const appointmentsDb = drizzle(sqlite, { schema });
