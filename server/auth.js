import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

export const COOKIE = 'inv_session';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
// Hash factice : on compare même si l'e-mail n'existe pas (temps de réponse constant)
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);
const ttlMs = () => config.sessionTtlHours * 3600_000;

export async function hashPassword(pw) {
  return bcrypt.hash(pw, 12);
}

export async function verifyCredentials(db, email, password) {
  const admin = await db.one('SELECT * FROM admins WHERE email = lower(?)', [email]);
  const ok = await bcrypt.compare(password, admin?.password_hash || DUMMY_HASH);
  return ok && admin ? admin : null;
}

export async function createSession(db, adminId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  await db.query('DELETE FROM sessions WHERE expires_at < ?', [now]);
  await db.query('INSERT INTO sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)', [
    sha256(token),
    adminId,
    now + ttlMs(),
    now,
  ]);
  return token;
}

export async function destroySession(db, token) {
  if (token) await db.query('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.secureCookies,
    path: '/',
    maxAge: ttlMs(),
  };
}

/** Middleware : exige une session admin valide (renouvelée à chaque requête). */
export function requireAdmin(db) {
  return async (req, res, next) => {
    const token = req.cookies?.[COOKIE];
    if (!token) return res.status(401).json({ error: 'Authentification requise.' });
    const row = await db.one(
      `SELECT s.token_hash, s.expires_at, a.id, a.email, a.name FROM sessions s
       JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ?`,
      [sha256(token)],
    );
    if (!row || Number(row.expires_at) < Date.now()) {
      res.clearCookie(COOKIE, { path: '/' });
      return res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter.' });
    }
    // Expiration glissante
    await db.query('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', [Date.now() + ttlMs(), row.token_hash]);
    req.admin = { id: row.id, email: row.email, name: row.name };
    req.sessionToken = token;
    next();
  };
}

/** Protection CSRF : requêtes modifiantes uniquement en JSON et depuis la même origine. */
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    const host = req.get('x-forwarded-host') || req.get('host');
    try {
      if (new URL(origin).host !== host) return res.status(403).json({ error: 'Origine refusée.' });
    } catch {
      return res.status(403).json({ error: 'Origine refusée.' });
    }
  }
  if (req.method !== 'DELETE' && !req.is('application/json')) {
    return res.status(415).json({ error: 'Format de requête non supporté.' });
  }
  next();
}

/** Crée ou met à jour un administrateur. */
export async function upsertAdmin(db, email, password, name = '') {
  const hash = await hashPassword(password);
  const normalized = email.trim().toLowerCase();
  const existing = await db.one('SELECT id FROM admins WHERE email = ?', [normalized]);
  if (existing) {
    await db.query(`UPDATE admins SET password_hash = ?, name = COALESCE(NULLIF(?, ''), name) WHERE id = ?`, [hash, name, existing.id]);
    await db.query('DELETE FROM sessions WHERE admin_id = ?', [existing.id]);
    return { id: existing.id, created: false };
  }
  const r = await db.one('INSERT INTO admins (email, name, password_hash) VALUES (?, ?, ?) RETURNING id', [normalized, name, hash]);
  return { id: r.id, created: true };
}

export async function revokeOtherSessions(db, adminId, currentToken) {
  await db.query('DELETE FROM sessions WHERE admin_id = ? AND token_hash <> ?', [adminId, sha256(currentToken || '')]);
}

/**
 * Premier démarrage : crée le compte administrateur s'il n'en existe aucun.
 * Sur Vercel, ADMIN_EMAIL et ADMIN_PASSWORD doivent être définis.
 */
export async function ensureAdmin(db) {
  const { n } = await db.one('SELECT COUNT(*)::int AS n FROM admins');
  if (n > 0) return;
  if (config.isServerless && !config.adminPassword) {
    console.warn('[INOVACOM] Aucun administrateur : définissez ADMIN_EMAIL et ADMIN_PASSWORD dans Vercel puis redéployez.');
    return;
  }
  const email = config.adminEmail || 'admin@inovacom.local';
  const password = config.adminPassword || crypto.randomBytes(9).toString('base64url');
  try {
    await upsertAdmin(db, email, password, 'Administrateur');
  } catch (err) {
    if (err?.code === '23505') return; // créé en parallèle par une autre instance
    throw err;
  }
  console.log('\n┌──────────────────────────────────────────────────────────────');
  console.log('│ Compte administrateur créé');
  console.log(`│   E-mail       : ${email}`);
  if (!config.adminPassword) console.log(`│   Mot de passe : ${password}   (à changer dans Paramètres)`);
  else console.log('│   Mot de passe : celui défini dans ADMIN_PASSWORD');
  console.log('└──────────────────────────────────────────────────────────────\n');
}
