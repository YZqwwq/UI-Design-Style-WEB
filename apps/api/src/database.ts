import pg from 'pg';
import type { PoolConfig } from 'pg';

export function createPool(config: PoolConfig) {
  const pool = new pg.Pool(config);
  // Idle connections may fail after a network interruption; avoid an unhandled error.
  pool.on('error', () => console.error('空闲数据库连接中断，后续请求将尝试重新连接。'));
  return pool;
}
