import { z } from 'zod';
import { isIsoDate } from './time.js';

const trimmed = (max) => z.string().trim().min(1, 'Champ obligatoire').max(max, 'Texte trop long');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normalise un numéro : "06 12 34 56 78" -> "+33612345678" */
export function normalizePhone(raw) {
  let s = String(raw || '').replace(/[\s.\-()/]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^0[1-9]\d{8}$/.test(s)) return '+33' + s.slice(1);
  if (/^\+33[1-9]\d{8}$/.test(s)) return s;
  if (/^\+(?!33)[1-9]\d{6,14}$/.test(s)) return s; // international hors France
  return null;
}

export const date = z.string().refine(isIsoDate, 'Date invalide');
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide');

export const phone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Numéro de téléphone invalide' });
      return z.NEVER;
    }
    return n;
  });

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(EMAIL_RE, 'Adresse e-mail invalide');

export const contactSchema = z.object({
  lastName: trimmed(80),
  firstName: trimmed(80),
  email,
  phone,
});

export const bookingSchema = contactSchema.extend({
  date,
  time,
  website: z.string().optional(), // honeypot anti-robot
});

export const adminAppointmentSchema = contactSchema.extend({
  date,
  time,
  notes: z.string().max(2000).optional().default(''),
  status: z.enum(['confirmed', 'completed', 'cancelled']).optional(),
});

export const adminAppointmentPatch = adminAppointmentSchema.partial();

const range = z
  .object({ start: time, end: time })
  .refine((r) => r.start < r.end, "L'heure de fin doit être après l'heure de début");

const ranges = z.array(range).max(12).refine((rs) => {
  const sorted = [...rs].sort((a, b) => a.start.localeCompare(b.start));
  return sorted.every((r, i) => i === 0 || sorted[i - 1].end <= r.start);
}, 'Les plages horaires se chevauchent');

export const settingsSchema = z.object({
  slotDuration: z.number().int().min(10).max(240),
  bufferMinutes: z.number().int().min(0).max(120),
  minNoticeHours: z.number().int().min(0).max(24 * 14),
  horizonDays: z.number().int().min(1).max(90),
  weekly: z.object(Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, ranges]))),
});

export const overrideSchema = z
  .object({
    date,
    endDate: date.optional(), // pour bloquer une période (congés)
    kind: z.enum(['blocked', 'custom']),
    ranges: ranges.optional().default([]),
    reason: z.string().trim().max(200).optional().default(''),
  })
  .refine((o) => o.kind === 'blocked' || o.ranges.length > 0, {
    message: 'Ajoutez au moins une plage horaire',
    path: ['ranges'],
  })
  .refine((o) => !o.endDate || o.endDate >= o.date, { message: 'Période invalide', path: ['endDate'] });

export const loginSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10, 'Au moins 10 caractères').max(200),
});

/** Middleware de validation : remplace req.body par la valeur parsée */
export function validate(schema) {
  return (req, res, next) => {
    const r = schema.safeParse(req.body ?? {});
    if (!r.success) {
      const fields = {};
      for (const issue of r.error.issues) {
        const key = issue.path.join('.') || '_';
        fields[key] ??= issue.message;
      }
      return res.status(400).json({ error: 'Certaines informations sont invalides.', fields });
    }
    req.body = r.data;
    next();
  };
}
