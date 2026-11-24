import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { DateTime } from 'luxon';
import { getSettings, lockBookings } from '../db.js';
import { computeAvailability, isPublicSlotAvailable } from '../availability.js';
import { insertAppointment, isUniqueViolation } from '../appointments.js';
import { bookingSchema, validate, date as dateSchema } from '../validation.js';
import { logoInfo } from '../branding.js';
import { config } from '../config.js';
import { nowParis, TZ } from '../time.js';

export function publicRoutes(db) {
  const r = Router();

  const bookingLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: Number(process.env.BOOKING_RATE_LIMIT) || 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Trop de tentatives. Merci de réessayer dans quelques minutes.' },
  });

  r.get('/config', async (req, res) => {
    const s = await getSettings(db);
    res.set('Cache-Control', 'no-store');
    res.json({
      companyName: config.companyName,
      timezone: TZ,
      slotDuration: s.slotDuration,
      horizonDays: s.horizonDays,
      today: nowParis().toISODate(),
      logo: logoInfo(),
    });
  });

  // Ne renvoie QUE des horaires libres — aucune donnée client.
  r.get('/availability', async (req, res) => {
    const today = nowParis().toISODate();
    const from = dateSchema.safeParse(req.query.from).success ? req.query.from : today;
    let to = dateSchema.safeParse(req.query.to).success ? req.query.to : DateTime.fromISO(from).plus({ days: 41 }).toISODate();
    if (DateTime.fromISO(to).diff(DateTime.fromISO(from), 'days').days > 92) {
      to = DateTime.fromISO(from).plus({ days: 92 }).toISODate();
    }
    const start = from < today ? today : from;
    res.set('Cache-Control', 'no-store');
    res.json({ from: start, to, days: to < start ? {} : await computeAvailability(db, start, to) });
  });

  r.post('/bookings', bookingLimiter, validate(bookingSchema), async (req, res) => {
    const b = req.body;
    if (b.website) return res.status(400).json({ error: 'Requête invalide.' }); // robot

    try {
      // Transaction + verrou : vérification et insertion atomiques, même avec plusieurs serveurs.
      // L'index unique partiel garantit en plus qu'aucun doublon ne peut exister.
      const row = await db.tx(async (t) => {
        await lockBookings(t);
        if (!(await isPublicSlotAvailable(t, b.date, b.time))) return null;
        const { slotDuration } = await getSettings(t);
        return insertAppointment(t, { ...b, duration: slotDuration, source: 'public' });
      });
      if (!row) {
        return res.status(409).json({
          error: "Ce créneau vient d'être réservé ou n'est plus disponible. Merci d'en choisir un autre.",
          code: 'SLOT_TAKEN',
        });
      }
      // Seules les informations que le client vient lui-même de saisir sont renvoyées.
      res.status(201).json({
        reference: row.reference,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        date: row.date,
        time: row.time,
        duration: row.duration,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: "Ce créneau vient d'être réservé. Merci d'en choisir un autre.", code: 'SLOT_TAKEN' });
      }
      throw err;
    }
  });

  return r;
}
