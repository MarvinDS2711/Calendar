import crypto from 'node:crypto';
import { parisDateTime } from './time.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newReference() {
  const bytes = crypto.randomBytes(6);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `INV-${s}`;
}

export const toDto = (r) =>
  r && {
    id: r.id,
    reference: r.reference,
    lastName: r.last_name,
    firstName: r.first_name,
    email: r.email,
    phone: r.phone,
    date: r.date,
    time: r.time,
    duration: r.duration,
    startUtc: r.start_utc,
    status: r.status,
    notes: r.notes,
    source: r.source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };

export function insertAppointment(db, a) {
  const start = parisDateTime(a.date, a.time);
  const r = db
    .prepare(
      `INSERT INTO appointments (reference, last_name, first_name, email, phone, date, time, duration, start_utc, status, notes, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newReference(),
      a.lastName,
      a.firstName,
      a.email,
      a.phone,
      a.date,
      a.time,
      a.duration,
      start.toUTC().toISO(),
      a.status || 'confirmed',
      a.notes || '',
      a.source || 'public',
    );
  return db.prepare('SELECT * FROM appointments WHERE id = ?').get(r.lastInsertRowid);
}

export const isUniqueViolation = (err) => /UNIQUE constraint failed/i.test(err?.message || '');
