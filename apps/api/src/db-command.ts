import { loadConfig, safeDatabaseError } from './config.js';
import { createPool } from './database.js';
import { migrate } from '../db/migrate.js';
import type { Pool } from 'pg';

let pool: Pool | undefined;
try {
  const args = process.argv.slice(2);
  if (!['check','migrate'].includes(args[0]) || args.slice(1).some(arg => arg !== '--production')) throw new Error('Unknown command');
  const config = await loadConfig(undefined, args.includes('--production') ? 'production' : 'development');
  pool = createPool(config.db);
  if (process.argv[2] === 'migrate') {
    await migrate(pool);
    const result = await pool.query('SELECT count(*)::int AS count FROM design_atlas.designs');
    console.log(`迁移完成，初始化模板共有 ${result.rows[0].count} 个设计；新账号注册时复制到各自的私有库。`);
  } else if (process.argv[2] === 'check') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const result = await client.query("SELECT 1 AS ok, current_setting('server_version') AS version, current_database() AS database, current_user AS username, to_regclass('design_atlas.users') IS NOT NULL AS accounts_ready");
      await client.query('ROLLBACK');
      console.log(`PostgreSQL 连接成功，版本：${result.rows[0].version}`);
      console.log(`环境：${config.environment}；实际数据库：${result.rows[0].database}；账号：${result.rows[0].username}`);
      console.log(`账号表：${result.rows[0].accounts_ready ? '已存在' : '尚未初始化'}`);
      console.log('账号认证与只读查询通过；未创建表或修改数据。');
    } finally { client.release(); }
  } else {
    throw new Error('Unknown command');
  }
} catch (error) {
  console.error(safeDatabaseError(error));
  process.exitCode = 1;
} finally { await pool?.end(); }
