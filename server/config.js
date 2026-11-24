import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = process.env;
const isProd = env.NODE_ENV === 'production';

export const config = {
  root,
  isProd,
  port: Number(env.PORT) || 3000,
  host: env.HOST || '0.0.0.0',
  timezone: 'Europe/Paris',
  dbPath: env.DATABASE_PATH || path.join(root, 'data', 'inovacom.db'),
  brandingDir: env.BRANDING_DIR || path.join(root, 'branding'),
  clientDist: path.join(root, 'client', 'dist'),
  companyName: env.COMPANY_NAME || 'INOVACOM',
  publicUrl: env.PUBLIC_URL || '',
  // Derrière un reverse proxy (Nginx, Render, Railway…), mettre TRUST_PROXY=1
  trustProxy: env.TRUST_PROXY ? (Number.isNaN(Number(env.TRUST_PROXY)) ? env.TRUST_PROXY : Number(env.TRUST_PROXY)) : false,
  // Cookies "Secure" : activés par défaut en production (HTTPS requis)
  secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === 'true' : isProd,
  sessionTtlHours: Number(env.SESSION_TTL_HOURS) || 12,
  adminEmail: env.ADMIN_EMAIL,
  adminPassword: env.ADMIN_PASSWORD,
};
