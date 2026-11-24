import { config } from './config.js';
import { getApp } from './bootstrap.js';

const { db, app } = await getApp();
const server = app.listen(config.port, config.host, () => {
  console.log(`INOVACOM RDV — http://localhost:${config.port}  (admin : /admin)`);
  if (!config.databaseUrl) console.log(`Base de données locale (PGlite) : ${config.dbDir}`);
});

const shutdown = () => {
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
