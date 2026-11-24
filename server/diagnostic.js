import { config } from './config.js';

/** Explication lisible d'une erreur de démarrage (sans divulguer de secret). */
export function diagnose(err) {
  if (config.isServerless && !config.databaseUrl) {
    return {
      code: 'DATABASE_NOT_CONNECTED',
      message:
        "Aucune base de données n'est reliée au projet Vercel. Onglet Storage → Neon → Connect au projet (Production), puis Deployments → Redeploy.",
    };
  }
  const c = err?.code || '';
  if (c === 'ENOTFOUND' || c === 'ECONNREFUSED' || c === 'ETIMEDOUT') {
    return { code: 'DATABASE_UNREACHABLE', message: "La base de données ne répond pas : vérifiez l'adresse DATABASE_URL dans Vercel." };
  }
  if (c === '28P01' || c === '28000') {
    return { code: 'DATABASE_AUTH_FAILED', message: 'Identifiants de base de données refusés : reconnectez la base Neon au projet puis redéployez.' };
  }
  if (c === '3D000') return { code: 'DATABASE_MISSING', message: "La base indiquée dans DATABASE_URL n'existe pas." };
  return { code: 'STARTUP_FAILED', message: `Erreur au démarrage (${c || err?.name || 'inconnue'}). Consultez Vercel → Logs.` };
}
