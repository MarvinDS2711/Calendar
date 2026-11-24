import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = process.env;
const isServerless = !!env.VERCEL;
const isProd = env.NODE_ENV === 'production' || isServerless;

const parseTrustProxy = (v) => (v === undefined || v === '' ? undefined : Number.isNaN(Number(v)) ? v : Number(v));

export const config = {
  root,
  isProd,
  isServerless,
  port: Number(env.PORT) || 3000,
  host: env.HOST || '0.0.0.0',
  timezone: 'Europe/Paris',
  // PostgreSQL (Neon via Vercel, Supabase, serveur…). Neon/Vercel fournit DATABASE_URL ou POSTGRES_URL.
  databaseUrl: env.DATABASE_URL || env.POSTGRES_URL || '',
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
