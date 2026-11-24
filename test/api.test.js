import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-'));
process.env.DATA_DIR = 'memory://';
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.BRANDING_DIR = dir;
process.env.BOOKING_RATE_LIMIT = '1000';

const { openDatabase, saveSettings, getSettings } = await import('../server/db.js');
const { createApp } = await import('../server/app.js');
const { upsertAdmin } = await import('../server/auth.js');
const { normalizePhone } = await import('../server/validation.js');

let server, base, db;
const ADMIN = { email: 'admin@test.fr', password: 'motdepasse-solide' };

before(async () => {
  db = await openDatabase();
  // Ouvert 7j/7, toute la journée, sans délai de prévenance -> tests indépendants de l'heure
  const all = [{ start: '08:00', end: '20:00' }];
  await saveSettings(db, { ...(await getSettings(db)), minNoticeHours: 0, weekly: { 1: all, 2: all, 3: all, 4: all, 5: all, 6: all, 7: all } });
  await upsertAdmin(db, ADMIN.email, ADMIN.password);
  server = createApp(db).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await db.close();
});

const json = (method, url, body, headers = {}) =>
  fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

async function firstFreeSlot(offset = 0) {
  const r = await (await fetch(base + '/api/public/availability')).json();
  const [date] = Object.keys(r.days).slice(1 + offset);
  return { date, time: r.days[date][0], all: r.days[date] };
}

const client = (i = 0) => ({ lastName: 'Dupont', firstName: 'Marie', email: `marie${i}@exemple.fr`, phone: '06 12 34 56 78' });

async function login() {
  const r = await json('POST', '/api/admin/login', ADMIN);
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}

test('normalisation des numéros', () => {
  assert.equal(normalizePhone('06 12 34 56 78'), '+33612345678');
  assert.equal(normalizePhone('+33 6 12 34 56 78'), '+33612345678');
  assert.equal(normalizePhone('0032 470 12 34 56'), '+32470123456');
  assert.equal(normalizePhone('12345'), null);
});

test('validation du formulaire', async () => {
  const { date, time } = await firstFreeSlot();
  const r = await json('POST', '/api/public/bookings', { date, time, lastName: '', firstName: 'A', email: 'pas-un-mail', phone: '12' });
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.ok(body.fields.lastName && body.fields.email && body.fields.phone);
});

test('réservation puis créneau retiré des disponibilités', async () => {
  const { date, time } = await firstFreeSlot();
  const r = await json('POST', '/api/public/bookings', { ...client(), date, time });
  assert.equal(r.status, 201);
  const b = await r.json();
  assert.match(b.reference, /^INV-/);
  assert.equal(b.phone, '+33612345678');
  const after = await (await fetch(`${base}/api/public/availability?from=${date}&to=${date}`)).json();
  assert.ok(!(after.days[date] || []).includes(time));
});

test('aucune double réservation, même en simultané', async () => {
  const { date, time } = await firstFreeSlot(1);
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      json('POST', '/api/public/bookings', { ...client(i), date, time }, { 'x-forwarded-for': `10.0.0.${i}` }),
    ),
  );
  const codes = results.map((r) => r.status).sort();
  assert.equal(codes.filter((c) => c === 201).length, 1, `codes: ${codes}`);
  assert.equal(codes.filter((c) => c === 409).length, 11);
  const { n } = await db.one(`SELECT COUNT(*)::int AS n FROM appointments WHERE date = ? AND time = ? AND status <> 'cancelled'`, [date, time]);
  assert.equal(n, 1);
});

test("l'admin est protégé côté serveur", async () => {
  for (const [m, u] of [['GET', '/api/admin/appointments'], ['GET', '/api/admin/stats'], ['PUT', '/api/admin/settings'], ['DELETE', '/api/admin/appointments/1']]) {
    const r = await json(m, u, m === 'PUT' ? {} : undefined);
    assert.equal(r.status, 401, `${m} ${u}`);
  }
  const bad = await json('POST', '/api/admin/login', { email: ADMIN.email, password: 'faux' });
  assert.equal(bad.status, 401);
});

test('CSRF : origine étrangère refusée', async () => {
  const cookie = await login();
  const r = await json('PUT', '/api/admin/settings', await getSettings(db), { cookie, origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('gestion admin : liste, recherche, statut, replanification, suppression', async () => {
  const cookie = await login();
  const list = await (await fetch(base + '/api/admin/appointments?q=dupont', { headers: { cookie } })).json();
  assert.ok(list.total >= 2);
  const byPhone = await (await fetch(base + '/api/admin/appointments?q=0612', { headers: { cookie } })).json();
  assert.equal(byPhone.total, list.total);

  const [a, b] = list.items;
  // Replanifier a sur le créneau de b -> conflit
  let r = await json('PATCH', `/api/admin/appointments/${a.id}`, { date: b.date, time: b.time }, { cookie });
  assert.equal(r.status, 409);
  // Marquer effectué
  r = await json('PATCH', `/api/admin/appointments/${a.id}`, { status: 'completed' }, { cookie });
  assert.equal((await r.json()).status, 'completed');
  // Annuler b libère le créneau
  r = await json('PATCH', `/api/admin/appointments/${b.id}`, { status: 'cancelled' }, { cookie });
  assert.equal(r.status, 200);
  const av = await (await fetch(`${base}/api/public/availability?from=${b.date}&to=${b.date}`)).json();
  assert.ok(av.days[b.date].includes(b.time));

  const stats = await (await fetch(base + '/api/admin/stats', { headers: { cookie } })).json();
  assert.equal(stats.completed, 1);
  assert.equal(stats.cancelled, 1);

  r = await fetch(`${base}/api/admin/appointments/${b.id}`, { method: 'DELETE', headers: { cookie } });
  assert.equal(r.status, 200);
  const csv = await (await fetch(base + '/api/admin/appointments.csv', { headers: { cookie } })).text();
  assert.match(csv, /Référence;Nom;Prénom/);
});

test('jour bloqué et disponibilité exceptionnelle pris en compte immédiatement', async () => {
  const cookie = await login();
  const { date } = await firstFreeSlot(3);
  let r = await json('POST', '/api/admin/overrides', { date, kind: 'blocked', reason: 'Congés' }, { cookie });
  assert.equal(r.status, 201);
  let av = await (await fetch(`${base}/api/public/availability?from=${date}&to=${date}`)).json();
  assert.equal(av.days[date], undefined);

  r = await json('POST', '/api/admin/overrides', { date, kind: 'custom', ranges: [{ start: '10:00', end: '11:00' }] }, { cookie });
  av = await (await fetch(`${base}/api/public/availability?from=${date}&to=${date}`)).json();
  assert.deepEqual(av.days[date], ['10:00', '10:30']);
});

test('le point d\'entrée Vercel restaure le chemin réécrit', async () => {
  const { default: handler } = await import('../api/index.js');
  const http = await import('node:http');
  const srv = http.createServer(handler).listen(0);
  const port = srv.address().port;
  const r = await fetch(`http://127.0.0.1:${port}/api/index?__path=/api/public/config&x=1`);
  srv.close();
  assert.equal(r.status, 200);
  assert.equal((await r.json()).companyName, 'INOVACOM');
});

test('diagnostic /api/health', async () => {
  const { default: handler } = await import('../api/index.js');
  const http = await import('node:http');
  const srv = http.createServer(handler).listen(0);
  const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/health`);
  srv.close();
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.ok, true);
});
