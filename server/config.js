import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = process.env;
const isServerless = !!env.VERCEL;
const isProd = env.NODE_ENV === 'production' || isServerless;

/**
 * Adresse PostgreSQL. L'intégration Neon de Vercel crée DATABASE_URL / POSTGRES_URL, éventuellement
 * avec un préfixe (ex. STORAGE_DATABASE_URL, NEON_POSTGRES_URL) : on les détecte tous.
 */
function findDatabaseUrl() {
  if (env.DATABASE_URL) return { url: env.DATABASE_URL, from: 'DATABASE_URL' };
  if (env.POSTGRES_URL) return { url: env.POSTGRES_URL, from: 'POSTGRES_URL' };
  const keys = Object.keys(env).sort();
  for (const suffix of ['_DATABASE_URL', '_POSTGRES_URL']) {
    const key = keys.find((k) => k.endsWith(suffix) && /^postgres(ql)?:\/\//.test(env[k] || ''));
    if (key) return { url: env[key], from: key };
  }
  return { url: '', from: null };
}
const db = findDatabaseUrl();

const parseTrustProxy = (v) => (v === undefined || v === '' ? undefined : Number.isNaN(Number(v)) ? v : Number(v));

export const config = {
  root,
  isProd,
  isServerless,
  port: Number(env.PORT) || 3000,
  host: env.HOST || '0.0.0.0',
  timezone: 'Europe/Paris',
  // PostgreSQL (Neon via Vercel, Supabase, serveur…). Neon/Vercel fournit DATABASE_URL ou POSTGRES_URL.
  databaseUrl: db.url,
  databaseUrlSource: db.from,
  // Sans URL : PostgreSQL embarqué (PGlite) stocké dans ce dossier
  dbDir: env.DATA_DIR || path.join(root, 'data', 'pglite'),
  brandingDir: env.BRANDING_DIR || path.join(root, 'branding'),
  clientDist: path.join(root, 'client', 'dist'),
  companyName: env.COMPANY_NAME || 'INOVACOM',
  // Derrière un reverse proxy (Nginx, Render, Railway…), mettre TRUST_PROXY=1. Automatique sur Vercel.
  trustProxy: parseTrustProxy(env.TRUST_PROXY) ?? (isServerless ? 1 : false),
  // Cookies "Secure" : activés par défaut en production (HTTPS requis)
  secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === 'true' : isProd,
  sessionTtlHours: Number(env.SESSION_TTL_HOURS) || 12,
  adminEmail: env.ADMIN_EMAIL,
  adminPassword: env.ADMIN_PASSWORD,
};
