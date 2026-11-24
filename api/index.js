// Point d'entrée Vercel : toutes les requêtes /api/* et /brand/* arrivent ici (voir vercel.json).
import { getApp } from '../server/bootstrap.js';

export default async function handler(req, res) {
  // Si Vercel transmet l'URL réécrite, on restaure le chemin d'origine passé en paramètre.
  const url = new URL(req.url, 'http://localhost');
  const original = url.searchParams.get('__path');
  if (original !== null) {
    url.searchParams.delete('__path');
    const rest = url.searchParams.toString();
    req.url = `/${original.replace(/^\/+/, '')}${rest ? `?${rest}` : ''}`;
  }
  try {
    const { app } = await getApp();
    return app(req, res);
  } catch (err) {
    console.error('[init]', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Service momentanément indisponible. Merci de réessayer dans un instant.' }));
  }
}
