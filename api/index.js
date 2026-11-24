// Point d'entrée Vercel : toutes les requêtes /api/* et /brand/* arrivent ici (voir vercel.json).
import { getApp } from '../server/bootstrap.js';
import { config } from '../server/config.js';
import { diagnose } from '../server/diagnostic.js';

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

export default async function handler(req, res) {
  // Si Vercel transmet l'URL réécrite, on restaure le chemin d'origine passé en paramètre.
  const url = new URL(req.url, 'http://localhost');
  const original = url.searchParams.get('__path');
  if (original !== null) {
    url.searchParams.delete('__path');
    const rest = url.searchParams.toString();
    req.url = `/${original.replace(/^\/+/, '')}${rest ? `?${rest}` : ''}`;
  }
  const path = req.url.split('?')[0];

  let app;
  let failure;
  try {
    ({ app } = await getApp());
  } catch (err) {
    console.error('[init]', err);
    failure = diagnose(err);
  }

  // Page de diagnostic : https://votre-site/api/health
  if (path === '/api/health') {
    return send(res, failure ? 503 : 200, {
      ok: !failure,
      database: config.databaseUrl ? `configurée (${config.databaseUrlSource})` : 'NON configurée',
      admin: {
        ADMIN_EMAIL: config.adminEmail ? 'défini' : 'MANQUANT',
        ADMIN_PASSWORD: config.adminPassword ? 'défini' : 'MANQUANT',
      },
      ...(failure && { probleme: failure.message, code: failure.code }),
    });
  }
  if (failure) {
    return send(res, 503, { error: 'Service momentanément indisponible. Merci de réessayer dans un instant.', code: failure.code });
  }
  return app(req, res);
}
