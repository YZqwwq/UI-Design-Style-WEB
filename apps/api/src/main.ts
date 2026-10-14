import { createMailer } from './mail.js';
import { createEmailRegistration } from './email-registration.js';
import { createAuthStore } from './auth-store.js';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { webDist } from './paths.js';
import { loadConfig, safeDatabaseError } from './config.js';
import { createPool } from './database.js';
import { createRepository, createTemplateRepository } from './repository.js';
import { createApp } from './app.js';
import { createLibraryStore } from './library.js';

try {
  const production = process.argv.includes('--production');
  const config = await loadConfig(undefined, production ? 'production' : 'development');
  const publicRoot = production ? webDist : undefined;
  if (publicRoot) {
    try { await access(path.join(publicRoot, 'index.html')); }
    catch { console.error('缺少前端构建产物，请先在仓库根目录运行 npm run build。'); process.exit(1); }
  }
  const pool = createPool(config.db);
  const app = createApp(createRepository(pool), { publicRoot, logger: true, auth: createAuthStore(pool,config.mail?.accessKeySecret), emailRegistration: config.mail ? createEmailRegistration(pool,config.mail.accessKeySecret,createMailer(config.mail)) : undefined, library:createLibraryStore(pool), publicRepository: createTemplateRepository(pool), origins: config.origins, secureCookie: config.secureCookie });
  app.addHook('onClose', async () => { await pool.end(); });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => { void app.close(); });
  }
  try {
    await app.listen({ host: '127.0.0.1', port: production ? config.port : config.apiPort });
  } catch (error) {
    await app.close();
    throw error;
  }
} catch (error) {
  console.error(safeDatabaseError(error));
  process.exitCode = 1;
}
