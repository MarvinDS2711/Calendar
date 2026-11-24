// Usage : npm run admin -- set <email> <motdepasse> [nom]
//         npm run admin -- list
// Pour agir sur la base en ligne (Neon/Vercel), définir DATABASE_URL avant la commande.
import { openDatabase } from './db.js';
import { upsertAdmin } from './auth.js';

const [cmd, email, password, ...name] = process.argv.slice(2);
const db = await openDatabase();

if (cmd === 'set' && email && password) {
  if (password.length < 10) {
    console.error('Le mot de passe doit contenir au moins 10 caractères.');
    process.exitCode = 1;
  } else {
    const r = await upsertAdmin(db, email, password, name.join(' '));
    console.log(r.created ? `Administrateur ${email} créé.` : `Mot de passe de ${email} mis à jour (sessions fermées).`);
  }
} else if (cmd === 'list') {
  console.table(await db.all('SELECT id, email, name, created_at FROM admins ORDER BY id'));
} else {
  console.log('Usage :\n  npm run admin -- set <email> <motdepasse> [nom]\n  npm run admin -- list');
}
await db.close();
