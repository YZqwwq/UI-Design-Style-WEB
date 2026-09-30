import { loadConfig, safeDatabaseError } from './config.js';
import { createPool } from './database.js';
import { migrate } from '../db/migrate.js';
import type { Pool } from 'pg';

let pool: Pool | undefined;
try {
  pool = createPool((await loadConfig()).db);
  if (process.argv[2] === 'migrate') {
    await migrate(pool);
    const result = await pool.query('SELECT count(*)::int AS count FROM design_atlas.designs');
    console.log(`迁移完成，初始化模板共有 ${result.rows[0].count} 个设计；新账号注册时复制到各自的私有库。`);
  } else if (process.argv[2] === 'check') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const result = await client.query("SELECT 1 AS ok, current_setting('server_version') AS version");
      await client.query('ROLLBACK');
      console.log(`PostgreSQL 连接成功，版本：${result.rows[0].version}`);
      console.log('账号认证与只读查询通过；未创建表或修改数据。');
    } finally { client.release(); }
  } else {
    throw new Error('Unknown command');
  }
} catch (error) {
  console.error(safeDatabaseError(error));
  process.exitCode = 1;
} finally { await pool?.end(); }
