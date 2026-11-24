import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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

export function openDatabase(file = config.dbPath) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS admins (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name          TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash  TEXT PRIMARY KEY,
      admin_id    INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      expires_at  INTEGER NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id    INTEGER PRIMARY KEY CHECK (id = 1),
      data  TEXT NOT NULL
    );

    -- Exceptions de calendrier : jour bloqué ou disponibilités exceptionnelles
    CREATE TABLE IF NOT EXISTS date_overrides (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT NOT NULL UNIQUE,
      kind        TEXT NOT NULL CHECK (kind IN ('blocked','custom')),
      ranges      TEXT NOT NULL DEFAULT '[]',
      reason      TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      reference   TEXT NOT NULL UNIQUE,
      last_name   TEXT NOT NULL,
      first_name  TEXT NOT NULL,
      email       TEXT NOT NULL,
      phone       TEXT NOT NULL,
      date        TEXT NOT NULL,           -- YYYY-MM-DD (Europe/Paris)
      time        TEXT NOT NULL,           -- HH:mm      (Europe/Paris)
      duration    INTEGER NOT NULL,        -- minutes
      start_utc   TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','completed','cancelled')),
      notes       TEXT NOT NULL DEFAULT '',
      source      TEXT NOT NULL DEFAULT 'public',
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    -- Garde-fou ultime contre la double réservation : un seul RDV actif par créneau de départ
    CREATE UNIQUE INDEX IF NOT EXISTS ux_appointments_active_slot
      ON appointments(date, time) WHERE status <> 'cancelled';
    CREATE INDEX IF NOT EXISTS ix_appointments_date ON appointments(date, time);
    CREATE INDEX IF NOT EXISTS ix_appointments_status ON appointments(status);
  `);

  const row = db.prepare('SELECT data FROM settings WHERE id = 1').get();
  if (!row) db.prepare('INSERT INTO settings (id, data) VALUES (1, ?)').run(JSON.stringify(DEFAULT_SETTINGS));
  return db;
}

/** Exécute fn dans une transaction IMMEDIATE (verrou d'écriture pris dès le début). */
export function immediate(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getSettings(db) {
  const row = db.prepare('SELECT data FROM settings WHERE id = 1').get();
  return { ...DEFAULT_SETTINGS, ...JSON.parse(row.data) };
}

export function saveSettings(db, settings) {
  db.prepare('UPDATE settings SET data = ? WHERE id = 1').run(JSON.stringify(settings));
}
