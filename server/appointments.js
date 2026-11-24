import crypto from 'node:crypto';
import { parisDateTime } from './time.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newReference() {
  const bytes = crypto.randomBytes(6);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `INV-${s}`;
}

const iso = (v) => (v instanceof Date ? v.toISOString() : v);

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
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };

export async function insertAppointment(db, a) {
  const start = parisDateTime(a.date, a.time);
  return db.one(
    `INSERT INTO appointments (reference, last_name, first_name, email, phone, date, time, duration, start_utc, status, notes, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    [
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
    ],
  );
}

/** Violation de contrainte d'unicité PostgreSQL */
export const isUniqueViolation = (err) => err?.code === '23505' || /duplicate key|unique constraint/i.test(err?.message || '');
