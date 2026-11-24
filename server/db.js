import fs from 'node:fs';
import { config } from './config.js';

export const DEFAULT_SETTINGS = {
  slotDuration: 30, // minutes
  bufferMinutes: 0, // battement entre deux rendez-vous
  minNoticeHours: 2, // délai minimum avant un rendez-vous
  horizonDays: 45, // jusqu'à combien de jours à l'avance on peut réserver
  // 1 = lundi … 7 = dimanche (ISO)
  weekly: {
    1: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
    2: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
    3: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
    4: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }],
    5: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '17:00' }],
    6: [],
    7: [],
  },
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS admins (
    id            SERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    admin_id    INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    expires_at  BIGINT NOT NULL,
    created_at  BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    id    INTEGER PRIMARY KEY CHECK (id = 1),
    data  TEXT NOT NULL
  );

  -- Exceptions de calendrier : jour bloqué ou disponibilités exceptionnelles
  CREATE TABLE IF NOT EXISTS date_overrides (
    id          SERIAL PRIMARY KEY,
    date        TEXT NOT NULL UNIQUE,
    kind        TEXT NOT NULL CHECK (kind IN ('blocked','custom')),
    ranges      TEXT NOT NULL DEFAULT '[]',
    reason      TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id          SERIAL PRIMARY KEY,
    reference   TEXT NOT NULL UNIQUE,
    last_name   TEXT NOT NULL,
    first_name  TEXT NOT NULL,
    email       TEXT NOT NULL,
    phone       TEXT NOT NULL,
    date        TEXT NOT NULL,           -- YYYY-MM-DD (Europe/Paris)
    time        TEXT NOT NULL,           -- HH:mm      (Europe/Paris)
    duration    INTEGER NOT NULL,        -- minutes
    start_utc   TEXT NOT NULL,           -- ISO 8601 UTC
    status      TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','completed','cancelled')),
    notes       TEXT NOT NULL DEFAULT '',
    source      TEXT NOT NULL DEFAULT 'public',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Garde-fou ultime contre la double réservation : un seul RDV actif par créneau de départ
  CREATE UNIQUE INDEX IF NOT EXISTS ux_appointments_active_slot
    ON appointments(date, time) WHERE status <> 'cancelled';
  CREATE INDEX IF NOT EXISTS ix_appointments_date ON appointments(date, time);
  CREATE INDEX IF NOT EXISTS ix_appointments_status ON appointments(status);
`;

/** "a = ? AND b = ?" -> "a = $1 AND b = $2" */
const toPg = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

/** Interface commune aux deux moteurs : query / one / all / exec (+ tx / close) */
function wrap(run, execRaw) {
  const api = {
    query: (sql, params = []) => run(toPg(sql), params),
    one: async (sql, params) => (await api.query(sql, params)).rows[0],
    all: async (sql, params) => (await api.query(sql, params)).rows,
    exec: execRaw,
  };
  return api;
}

function pgAdapter(pool) {
  const runOn = (c) => async (sql, params) => {
    const r = await c.query(sql, params);
    return { rows: r.rows, count: r.rowCount ?? 0 };
  };
  const db = wrap(runOn(pool), (sql) => pool.query(sql));
  db.tx = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(wrap(runOn(client), (sql) => client.query(sql)));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };
  db.close = () => pool.end();
  return db;
}

function pgliteAdapter(lite) {
  const runOn = (c) => async (sql, params) => {
    const r = await c.query(sql, params);
    return { rows: r.rows, count: r.affectedRows ?? 0 };
  };
  const db = wrap(runOn(lite), (sql) => lite.exec(sql));
  db.tx = (fn) => lite.transaction((tx) => fn(wrap(runOn(tx), (sql) => tx.exec(sql))));
  db.close = () => lite.close();
  return db;
}

/**
 * Ouvre la base de données :
 *  - DATABASE_URL (ou POSTGRES_URL) défini -> PostgreSQL (Neon via Vercel, Supabase, serveur…)
 *  - sinon -> PGlite : PostgreSQL embarqué stocké dans ./data, aucune installation nécessaire
 */
export async function openDatabase({ url = config.databaseUrl, dir = config.dbDir } = {}) {
  let db;
  if (url) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: url, max: config.isServerless ? 3 : 10, idleTimeoutMillis: 10_000 });
    db = pgAdapter(pool);
  } else if (config.isServerless) {
    // Vercel : pas de disque permanent, une vraie base PostgreSQL est obligatoire
    throw Object.assign(new Error('DATABASE_URL manquant sur Vercel'), { code: 'NO_DATABASE_URL' });
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    if (dir !== 'memory://') fs.mkdirSync(dir, { recursive: true });
    db = pgliteAdapter(await PGlite.create(dir));
  }
  await migrate(db);
  return db;
}

async function migrate(db) {
  // Verrou : plusieurs instances serverless peuvent démarrer en même temps
  await db.tx(async (t) => {
    await t.query('SELECT pg_advisory_xact_lock(712001)');
    await t.exec(SCHEMA);
    await t.query('INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT (id) DO NOTHING', [JSON.stringify(DEFAULT_SETTINGS)]);
  });
}

/** Sérialise les écritures de rendez-vous : à appeler en début de transaction. */
export const lockBookings = (t) => t.query('SELECT pg_advisory_xact_lock(712002)');

export async function getSettings(db) {
  const row = await db.one('SELECT data FROM settings WHERE id = 1');
  return { ...DEFAULT_SETTINGS, ...JSON.parse(row.data) };
}

export async function saveSettings(db, settings) {
  await db.query('UPDATE settings SET data = ? WHERE id = 1', [JSON.stringify(settings)]);
}
