import { openDatabase } from './db.js';
import { ensureAdmin } from './auth.js';
import { createApp } from './app.js';

let ready;

/** Initialise une seule fois par instance : base, schéma, administrateur, application Express. */
export function getApp() {
  ready ??= (async () => {
    const db = await openDatabase();
    await ensureAdmin(db);
    return { db, app: createApp(db) };
  })().catch((err) => {
    ready = undefined; // nouvel essai à la prochaine requête
    throw err;
  });
  return ready;
}
