import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'upgrade-insecure-requests': config.secureCookies ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/public', publicRoutes(db));
  app.use('/api/admin', adminRoutes(db));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ressource introuvable.' }));

  // Logo et éléments de marque (déposés dans /branding)
  app.use('/brand', express.static(config.brandingDir, { maxAge: '7d', fallthrough: false, dotfiles: 'deny' }));

  // Application web compilée
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1y', immutable: true }));
    const indexHtml = path.join(config.clientDist, 'index.html');
    app.get(/^\/(?!api\/|brand\/).*/, (req, res) => {
      res.set('Cache-Control', 'no-cache');
      if (req.path.startsWith('/admin')) res.set('X-Robots-Tag', 'noindex, nofollow');
      res.sendFile(indexHtml);
    });
  }

  // Gestion centralisée des erreurs
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide.' });
    if (err?.status === 404 || err?.statusCode === 404) return res.status(404).end();
    console.error('[erreur]', err);
    res.status(500).json({ error: 'Une erreur inattendue est survenue. Merci de réessayer.' });
  });

  return app;
}
