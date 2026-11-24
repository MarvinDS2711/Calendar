// Usage : npm run admin -- set <email> <motdepasse> [nom]
//         npm run admin -- list
import { openDatabase } from './db.js';
import { upsertAdmin } from './auth.js';

const [cmd, email, password, ...name] = process.argv.slice(2);
const db = openDatabase();

if (cmd === 'set' && email && password) {
  if (password.length < 10) {
    console.error('Le mot de passe doit contenir au moins 10 caractères.');
    process.exit(1);
  }
  const r = await upsertAdmin(db, email, password, name.join(' '));
  console.log(r.created ? `Administrateur ${email} créé.` : `Mot de passe de ${email} mis à jour (sessions fermées).`);
} else if (cmd === 'list') {
  console.table(db.prepare('SELECT id, email, name, created_at FROM admins').all());
} else {
  console.log('Usage :\n  npm run admin -- set <email> <motdepasse> [nom]\n  npm run admin -- list');
}
db.close();
