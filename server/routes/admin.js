import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { DateTime } from 'luxon';
import bcrypt from 'bcryptjs';
import { immediate, getSettings, saveSettings } from '../db.js';
import { computeAvailability, hasConflict } from '../availability.js';
import { insertAppointment, isUniqueViolation, toDto } from '../appointments.js';
import {
  COOKIE,
  cookieOptions,
  createSession,
  csrfGuard,
  destroySession,
  hashPassword,
  requireAdmin,
  revokeOtherSessions,
  verifyCredentials,
} from '../auth.js';
import {
  adminAppointmentPatch,
  adminAppointmentSchema,
  date as dateSchema,
  loginSchema,
  overrideSchema,
  passwordChangeSchema,
  settingsSchema,
  validate,
} from '../validation.js';
import { nowParis, parisDateTime } from '../time.js';
import { logoInfo } from '../branding.js';

const CONFLICT = { error: 'Ce créneau chevauche un autre rendez-vous.', code: 'SLOT_TAKEN' };
const NOT_FOUND = { error: 'Rendez-vous introuvable.' };

export function adminRoutes(db) {
  const r = Router();
  r.use(csrfGuard);
  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  /* ---------------------------- Authentification --------------------------- */

  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 8,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  });

  r.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
    const admin = await verifyCredentials(db, req.body.email, req.body.password);
    if (!admin) return res.status(401).json({ error: 'Identifiants incorrects.' });
    const token = createSession(db, admin.id);
    res.cookie(COOKIE, token, cookieOptions());
    res.json({ id: admin.id, email: admin.email, name: admin.name });
  });

  r.post('/logout', (req, res) => {
    destroySession(db, req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  // ---- Tout ce qui suit exige une session valide ----
  r.use(requireAdmin(db));

  r.get('/me', (req, res) => res.json(req.admin));

  r.post('/password', validate(passwordChangeSchema), async (req, res) => {
    const row = db.prepare('SELECT password_hash FROM admins WHERE id = ?').get(req.admin.id);
    if (!(await bcrypt.compare(req.body.currentPassword, row.password_hash))) {
      return res.status(400).json({ error: 'Mot de passe actuel incorrect.', fields: { currentPassword: 'Incorrect' } });
    }
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(await hashPassword(req.body.newPassword), req.admin.id);
    // Déconnecte les autres sessions
    revokeOtherSessions(db, req.admin.id, req.sessionToken);
    res.json({ ok: true });
  });

  /* ------------------------------ Tableau de bord ---------------------------- */

  r.get('/stats', (req, res) => {
    const nowIso = new Date().toISOString();
    const today = nowParis().toISODate();
    const one = (sql, ...p) => db.prepare(sql).get(...p).n;
    const list = (sql, ...p) => db.prepare(sql).all(...p).map(toDto);
    res.json({
      total: one('SELECT COUNT(*) n FROM appointments'),
      upcoming: one(`SELECT COUNT(*) n FROM appointments WHERE status = 'confirmed' AND start_utc >= ?`, nowIso),
      completed: one(`SELECT COUNT(*) n FROM appointments WHERE status = 'completed'`),
      cancelled: one(`SELECT COUNT(*) n FROM appointments WHERE status = 'cancelled'`),
      toProcess: one(`SELECT COUNT(*) n FROM appointments WHERE status = 'confirmed' AND start_utc < ?`, nowIso),
      todayCount: one(`SELECT COUNT(*) n FROM appointments WHERE status <> 'cancelled' AND date = ?`, today),
      today: list(`SELECT * FROM appointments WHERE status <> 'cancelled' AND date = ? ORDER BY time`, today),
      next: list(
        `SELECT * FROM appointments WHERE status = 'confirmed' AND start_utc >= ? AND date > ? ORDER BY start_utc LIMIT 6`,
        nowIso,
        today,
      ),
      week: db
        .prepare(
          `SELECT date, COUNT(*) n FROM appointments WHERE status <> 'cancelled' AND date BETWEEN ? AND ? GROUP BY date`,
        )
        .all(today, nowParis().plus({ days: 13 }).toISODate()),
      logo: logoInfo(),
    });
  });

  /* ------------------------------- Rendez-vous ------------------------------- */

  function buildFilter(query) {
    const where = [];
    const params = [];
    const nowIso = new Date().toISOString();
    const { status, from, to } = query;
    const q = String(query.q || '').trim().slice(0, 100);

    if (['confirmed', 'completed', 'cancelled'].includes(status)) {
      where.push('status = ?');
      params.push(status);
    } else if (status === 'upcoming') {
      where.push(`status = 'confirmed' AND start_utc >= ?`);
      params.push(nowIso);
    } else if (status === 'to_process') {
      where.push(`status = 'confirmed' AND start_utc < ?`);
      params.push(nowIso);
    }
    if (dateSchema.safeParse(from).success) {
      where.push('date >= ?');
      params.push(from);
    }
    if (dateSchema.safeParse(to).success) {
      where.push('date <= ?');
      params.push(to);
    }
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
      const parts = [
        `last_name LIKE ? ESCAPE '\\'`,
        `first_name LIKE ? ESCAPE '\\'`,
        `(first_name || ' ' || last_name) LIKE ? ESCAPE '\\'`,
        `(last_name || ' ' || first_name) LIKE ? ESCAPE '\\'`,
        `email LIKE ? ESCAPE '\\'`,
        `reference LIKE ? ESCAPE '\\'`,
      ];
      params.push(like, like, like, like, like, like);
      let digits = q.replace(/\D/g, '');
      if (digits.length >= 3) {
        if (digits.startsWith('0')) digits = digits.slice(1);
        parts.push('phone LIKE ?');
        params.push(`%${digits}%`);
      }
      where.push(`(${parts.join(' OR ')})`);
    }
    return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  r.get('/appointments', (req, res) => {
    const { sql, params } = buildFilter(req.query);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const order = req.query.sort === 'desc' ? 'DESC' : 'ASC';
    const total = db.prepare(`SELECT COUNT(*) n FROM appointments ${sql}`).get(...params).n;
    const items = db
      .prepare(`SELECT * FROM appointments ${sql} ORDER BY date ${order}, time ${order} LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize)
      .map(toDto);
    res.json({ items, total, page, pageSize });
  });

  r.get('/appointments.csv', (req, res) => {
    const { sql, params } = buildFilter(req.query);
    const rows = db.prepare(`SELECT * FROM appointments ${sql} ORDER BY date, time`).all(...params);
    const labels = { confirmed: 'Planifié', completed: 'Effectué', cancelled: 'Annulé' };
    const esc = (v) => {
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise l'injection de formules
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Référence', 'Nom', 'Prénom', 'E-mail', 'Téléphone', 'Date', 'Heure', 'Durée (min)', 'Statut', 'Notes'];
    const lines = rows.map((a) =>
      [a.reference, a.last_name, a.first_name, a.email, a.phone, DateTime.fromISO(a.date).toFormat('dd/MM/yyyy'), a.time, a.duration, labels[a.status], a.notes]
        .map(esc)
        .join(';'),
    );
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="rendez-vous-${nowParis().toISODate()}.csv"`);
    res.send('﻿' + [header.join(';'), ...lines].join('\r\n'));
  });

  r.get('/appointments/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM appointments WHERE id = ?').get(Number(req.params.id));
    if (!row) return res.status(404).json(NOT_FOUND);
    res.json(toDto(row));
  });

  r.post('/appointments', validate(adminAppointmentSchema), (req, res) => {
    const a = req.body;
    if (!parisDateTime(a.date, a.time)) return res.status(400).json({ error: 'Horaire inexistant (changement d\'heure).' });
    try {
      const row = immediate(db, () => {
        const { slotDuration } = getSettings(db);
        if ((a.status ?? 'confirmed') !== 'cancelled' && hasConflict(db, a.date, a.time, slotDuration)) return null;
        return insertAppointment(db, { ...a, duration: slotDuration, source: 'admin' });
      });
      if (!row) return res.status(409).json(CONFLICT);
      res.status(201).json(toDto(row));
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json(CONFLICT);
      throw err;
    }
  });

  r.patch('/appointments/:id', validate(adminAppointmentPatch), (req, res) => {
    const id = Number(req.params.id);
    try {
      const result = immediate(db, () => {
        const cur = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
        if (!cur) return { status: 404, body: NOT_FOUND };
        const p = req.body;
        const next = {
          last_name: p.lastName ?? cur.last_name,
          first_name: p.firstName ?? cur.first_name,
          email: p.email ?? cur.email,
          phone: p.phone ?? cur.phone,
          date: p.date ?? cur.date,
          time: p.time ?? cur.time,
          status: p.status ?? cur.status,
          notes: p.notes ?? cur.notes,
        };
        const start = parisDateTime(next.date, next.time);
        if (!start) return { status: 400, body: { error: 'Horaire invalide.' } };
        const moved = next.date !== cur.date || next.time !== cur.time;
        const reactivated = cur.status === 'cancelled' && next.status !== 'cancelled';
        if ((moved || reactivated) && next.status !== 'cancelled' && hasConflict(db, next.date, next.time, cur.duration, id)) {
          return { status: 409, body: CONFLICT };
        }
        db.prepare(
          `UPDATE appointments SET last_name=?, first_name=?, email=?, phone=?, date=?, time=?, start_utc=?, status=?, notes=?,
           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
        ).run(next.last_name, next.first_name, next.email, next.phone, next.date, next.time, start.toUTC().toISO(), next.status, next.notes, id);
        return { status: 200, body: toDto(db.prepare('SELECT * FROM appointments WHERE id = ?').get(id)) };
      });
      res.status(result.status).json(result.body);
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json(CONFLICT);
      throw err;
    }
  });

  r.delete('/appointments/:id', (req, res) => {
    const info = db.prepare('DELETE FROM appointments WHERE id = ?').run(Number(req.params.id));
    if (!info.changes) return res.status(404).json(NOT_FOUND);
    res.json({ ok: true });
  });

  /** Créneaux libres d'un jour pour l'admin (ignore délai de prévenance & horizon). */
  r.get('/availability', (req, res) => {
    if (!dateSchema.safeParse(req.query.date).success) return res.status(400).json({ error: 'Date invalide' });
    const exclude = req.query.exclude ? Number(req.query.exclude) : undefined;
    const days = computeAvailability(db, req.query.date, req.query.date, { excludeId: exclude, admin: true });
    res.json({ date: req.query.date, slots: days[req.query.date] || [] });
  });

  /* ------------------------------ Disponibilités ----------------------------- */

  r.get('/settings', (req, res) => res.json(getSettings(db)));

  r.put('/settings', validate(settingsSchema), (req, res) => {
    saveSettings(db, req.body);
    res.json(getSettings(db));
  });

  r.get('/overrides', (req, res) => {
    const since = nowParis().minus({ days: 7 }).toISODate();
    const rows = db.prepare('SELECT * FROM date_overrides WHERE date >= ? ORDER BY date').all(since);
    res.json(rows.map((o) => ({ id: o.id, date: o.date, kind: o.kind, ranges: JSON.parse(o.ranges), reason: o.reason })));
  });

  r.post('/overrides', validate(overrideSchema), (req, res) => {
    const o = req.body;
    const dates = [];
    let d = DateTime.fromISO(o.date);
    const end = DateTime.fromISO(o.endDate || o.date);
    while (d <= end && dates.length < 366) {
      dates.push(d.toISODate());
      d = d.plus({ days: 1 });
    }
    const stmt = db.prepare(
      `INSERT INTO date_overrides (date, kind, ranges, reason) VALUES (?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET kind = excluded.kind, ranges = excluded.ranges, reason = excluded.reason`,
    );
    immediate(db, () => {
      for (const date of dates) stmt.run(date, o.kind, JSON.stringify(o.kind === 'custom' ? o.ranges : []), o.reason);
    });
    // Information : RDV existants sur des jours bloqués (ils ne sont pas annulés automatiquement)
    const impacted =
      o.kind === 'blocked'
        ? db
            .prepare(`SELECT COUNT(*) n FROM appointments WHERE status = 'confirmed' AND date BETWEEN ? AND ?`)
            .get(dates[0], dates.at(-1)).n
        : 0;
    res.status(201).json({ ok: true, count: dates.length, impacted });
  });

  r.delete('/overrides/:id', (req, res) => {
    const info = db.prepare('DELETE FROM date_overrides WHERE id = ?').run(Number(req.params.id));
    if (!info.changes) return res.status(404).json({ error: 'Exception introuvable.' });
    res.json({ ok: true });
  });

  return r;
}
