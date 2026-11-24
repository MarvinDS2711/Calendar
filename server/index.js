import crypto from 'node:crypto';
import { config } from './config.js';
import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { upsertAdmin } from './auth.js';

const db = openDatabase();

// Premier démarrage : création du compte administrateur
const adminCount = db.prepare('SELECT COUNT(*) n FROM admins').get().n;
if (adminCount === 0) {
  const email = config.adminEmail || 'admin@inovacom.local';
  const password = config.adminPassword || crypto.randomBytes(9).toString('base64url');
  await upsertAdmin(db, email, password, 'Administrateur');
  console.log('\n┌──────────────────────────────────────────────────────────────');
  console.log('│ Compte administrateur créé');
  console.log(`│   E-mail       : ${email}`);
  if (!config.adminPassword) console.log(`│   Mot de passe : ${password}   (à changer dans Paramètres)`);
  else console.log('│   Mot de passe : celui défini dans ADMIN_PASSWORD');
  console.log('└──────────────────────────────────────────────────────────────\n');
}

const app = createApp(db);
const server = app.listen(config.port, config.host, () => {
  console.log(`INOVACOM RDV — http://localhost:${config.port}  (admin : /admin)`);
});

const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
