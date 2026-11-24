import { DateTime } from 'luxon';
import { getSettings } from './db.js';
import { TZ, nowParis, toMinutes, fromMinutes, parisDateTime } from './time.js';

/** Plages horaires effectives d'une journée (règles hebdo + exceptions). */
export function dayRanges(date, settings, override) {
  if (override?.kind === 'blocked') return [];
  if (override?.kind === 'custom') return override.ranges;
  const weekday = DateTime.fromISO(date, { zone: TZ }).weekday; // 1..7
  return settings.weekly[weekday] || [];
}

/** Créneaux théoriques (avant prise en compte des RDV et du délai de prévenance). */
export function generateSlots(ranges, duration, buffer) {
  const slots = [];
  const step = duration + buffer;
  for (const r of ranges) {
    const end = toMinutes(r.end);
    for (let t = toMinutes(r.start); t + duration <= end; t += step) slots.push(fromMinutes(t));
  }
  return [...new Set(slots)].sort();
}

const overlaps = (aStart, aDur, bStart, bDur, buffer) =>
  aStart < bStart + bDur + buffer && bStart < aStart + aDur + buffer;

async function loadOverrides(db, from, to) {
  const rows = await db.all('SELECT * FROM date_overrides WHERE date BETWEEN ? AND ?', [from, to]);
  return new Map(rows.map((r) => [r.date, { ...r, ranges: JSON.parse(r.ranges) }]));
}

async function loadActive(db, from, to, excludeId) {
  const rows = await db.all(
    `SELECT id, date, time, duration FROM appointments
     WHERE status <> 'cancelled' AND date BETWEEN ? AND ? AND id <> ?`,
    [from, to, excludeId ?? -1],
  );
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }
  return byDate;
}

/**
 * Disponibilités réelles entre deux dates incluses.
 * @returns {Promise<Record<string, string[]>>} date -> ["09:00", ...]
 */
export async function computeAvailability(db, from, to, { excludeId, admin = false } = {}) {
  const settings = await getSettings(db);
  const now = nowParis();
  const earliest = admin ? now.startOf('day') : now.plus({ hours: settings.minNoticeHours });
  const lastDay = admin ? null : now.startOf('day').plus({ days: settings.horizonDays }).toISODate();

  const [overrides, active] = await Promise.all([loadOverrides(db, from, to), loadActive(db, from, to, excludeId)]);
  const result = {};

  let cursor = DateTime.fromISO(from, { zone: TZ });
  const end = DateTime.fromISO(to, { zone: TZ });
  let guard = 0;
  while (cursor <= end && guard++ < 400) {
    const date = cursor.toISODate();
    cursor = cursor.plus({ days: 1 });
    if (lastDay && date > lastDay) break;

    const ranges = dayRanges(date, settings, overrides.get(date));
    if (!ranges.length) continue;
    const taken = active.get(date) || [];
    const slots = generateSlots(ranges, settings.slotDuration, settings.bufferMinutes).filter((time) => {
      const dt = parisDateTime(date, time);
      if (!dt || dt < earliest) return false;
      const s = toMinutes(time);
      return !taken.some((a) => overlaps(s, settings.slotDuration, toMinutes(a.time), a.duration, settings.bufferMinutes));
    });
    if (slots.length) result[date] = slots;
  }
  return result;
}

/** Vérifie qu'un créneau est réservable par un client (à appeler dans une transaction verrouillée). */
export async function isPublicSlotAvailable(db, date, time) {
  const avail = await computeAvailability(db, date, date);
  return (avail[date] || []).includes(time);
}

/** Pour l'admin : un horaire libre (aucun chevauchement avec un autre RDV actif). */
export async function hasConflict(db, date, time, duration, excludeId) {
  const settings = await getSettings(db);
  const rows = await db.all(`SELECT time, duration FROM appointments WHERE status <> 'cancelled' AND date = ? AND id <> ?`, [
    date,
    excludeId ?? -1,
  ]);
  const s = toMinutes(time);
  return rows.some((a) => overlaps(s, duration, toMinutes(a.time), a.duration, settings.bufferMinutes));
}
