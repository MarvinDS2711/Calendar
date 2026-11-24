import { DateTime } from 'luxon';
import { config } from './config.js';

export const TZ = config.timezone;

export const nowParis = () => DateTime.now().setZone(TZ);

/** "YYYY-MM-DD" + "HH:mm" (heure de Paris) -> DateTime Paris, ou null si invalide (ex: trou DST) */
export function parisDateTime(date, time) {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: TZ });
  if (!dt.isValid) return null;
  // Heure inexistante (passage à l'heure d'été) : luxon décale, on rejette
  if (dt.toFormat('yyyy-MM-dd') !== date || dt.toFormat('HH:mm') !== time) return null;
  return dt;
}

export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const fromMinutes = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromISO(s).isValid;
