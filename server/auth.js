import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

export const COOKIE = 'inv_session';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
// Hash factice : on compare même si l'e-mail n'existe pas (temps de réponse constant)
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

export async function hashPassword(pw) {
  return bcrypt.hash(pw, 12);
}

export async function verifyCredentials(db, email, password) {
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  const ok = await bcrypt.compare(password, admin?.password_hash || DUMMY_HASH);
  return ok && admin ? admin : null;
}

export function createSession(db, adminId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    adminId,
    now + config.sessionTtlHours * 3600_000,
    now,
  );
  return token;
}

export function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.secureCookies,
    path: '/',
    maxAge: config.sessionTtlHours * 3600_000,
  };
}

/** Middleware : exige une session admin valide (renouvelée à chaque requête). */
export function requireAdmin(db) {
  return (req, res, next) => {
    const token = req.cookies?.[COOKIE];
    if (!token) return res.status(401).json({ error: 'Authentification requise.' });
    const row = db
      .prepare(
        `SELECT s.token_hash, s.expires_at, a.id, a.email, a.name FROM sessions s
         JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ?`,
      )
      .get(sha256(token));
    if (!row || row.expires_at < Date.now()) {
      res.clearCookie(COOKIE, { path: '/' });
      return res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter.' });
    }
    // Expiration glissante
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(
      Date.now() + config.sessionTtlHours * 3600_000,
      row.token_hash,
    );
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
  const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(email);
  if (existing) {
    db.prepare('UPDATE admins SET password_hash = ?, name = COALESCE(NULLIF(?, \'\'), name) WHERE id = ?').run(hash, name, existing.id);
    db.prepare('DELETE FROM sessions WHERE admin_id = ?').run(existing.id);
    return { id: existing.id, created: false };
  }
  const r = db.prepare('INSERT INTO admins (email, name, password_hash) VALUES (?, ?, ?)').run(email, name, hash);
  return { id: Number(r.lastInsertRowid), created: true };
}

export function revokeOtherSessions(db, adminId, currentToken) {
  db.prepare('DELETE FROM sessions WHERE admin_id = ? AND token_hash <> ?').run(adminId, sha256(currentToken || ''));
}
