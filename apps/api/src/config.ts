import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'dotenv';
import type { PoolConfig } from 'pg';
import { repositoryRoot } from './paths.js';

class ConfigurationError extends Error {}

export type DatabaseEnvironment = 'development' | 'production';
export async function loadConfig(root = repositoryRoot, environment: DatabaseEnvironment = 'development') {
  // Read credentials only on the server. Never include values in errors or logs.
  if (!['development','production'].includes(environment)) throw new ConfigurationError('数据库环境无效');
  let contents;
  try { contents = await readFile(path.join(root, '.env')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    contents = await readFile(path.join(root, '.ENV'));
  }
  const file = parse(contents);
  const development = environment === 'development';
  const credentialKey = (key: string) => development ? `${key}-test` : key;
  const connectionValue = (key: string) => development ? file[`${key}-test`] ?? file[key] : file[key];
  const missing = ['PGDATABASE', 'PGUSER', 'PGPASSWORD'].map(credentialKey).filter(key => !file[key]);
  missing.push(...['PGHOST','PGPORT','PGSSLMODE'].filter(key => !connectionValue(key)));
  if (missing.length) throw new ConfigurationError(`数据库配置缺少：${missing.join(', ')}`);
  if (development && file['PGDATABASE-test'] === file.PGDATABASE) throw new ConfigurationError('测试库与正式库名称相同，已拒绝连接。');
  const integer = (value: string, max: number, name: string) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > max) throw new ConfigurationError(`${name} 配置无效`);
    return number;
  };
  if (!['disable', 'verify-full'].includes(connectionValue('PGSSLMODE'))) throw new ConfigurationError('PGSSLMODE 仅支持 disable 或 verify-full');
  const db: PoolConfig = {
    host: connectionValue('PGHOST'),
    port: integer(connectionValue('PGPORT'), 65535, 'PGPORT'),
    database: file[credentialKey('PGDATABASE')],
    user: file[credentialKey('PGUSER')],
    password: file[credentialKey('PGPASSWORD')],
    ssl: connectionValue('PGSSLMODE') === 'disable' ? false : { rejectUnauthorized: true },
    connectionTimeoutMillis: integer(connectionValue('PGCONNECT_TIMEOUT') || '10', 120, 'PGCONNECT_TIMEOUT') * 1000,
    statement_timeout: 10000,
    query_timeout: 12000,
    idleTimeoutMillis: 30000,
    max: 5,
    application_name: `design-atlas-${environment}`,
  };
  const originValue = process.env.APP_ORIGIN || file.APP_ORIGIN;
  const servicePort = integer(process.env.PORT || file.PORT || '4173',65535,'PORT');
  const webPort = development ? integer(process.env.WEB_PORT || '4173',65535,'WEB_PORT') : servicePort;
  let origins = [`http://localhost:${webPort}`, `http://127.0.0.1:${webPort}`];
  if (originValue) {
    try {
      const parsed = new URL(originValue);
      if (!['http:','https:'].includes(parsed.protocol) || parsed.origin !== originValue) throw new Error();
      origins = [parsed.origin];
    } catch { throw new ConfigurationError('APP_ORIGIN 必须是完整站点源地址，不含路径或结尾斜杠'); }
  }
  return {
    environment,
    origins,
    secureCookie: origins.every(origin => origin.startsWith('https://')),
    db,
    port: servicePort,
    apiPort: integer(process.env.API_PORT || '4174', 65535, 'API_PORT'),
  };
}

export function safeDatabaseError(error: unknown): string {
  if (error instanceof ConfigurationError) return error.message;
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    ENOENT: '缺少 .env 或必要的项目文件。',
    ECONNREFUSED: '数据库连接被拒绝，请检查监听和端口。',
    ETIMEDOUT: '数据库连接超时。',
    ENOTFOUND: '无法解析数据库主机。',
    '28P01': '数据库密码认证失败，请核对 .env。',
    '28000': '数据库拒绝认证，请检查用户与连接授权。',
    '3D000': '指定数据库不存在。',
    '42501': '数据库权限不足。',
    '42P01': '缺少数据库表，请先运行 npm run db:migrate。',
    EADDRINUSE: '本地端口已占用，请停止旧服务或设置 PORT。',
    MIGRATION_CONFLICT: '目标 schema 已存在但不含迁移记录，已停止以避免覆盖。',
    MIGRATION_CHANGED: '已执行的迁移文件被修改，请恢复原文件并添加新的迁移。',
  };
  return messages[code || ''] || '操作失败，请检查本地配置、网络与数据库日志（原始错误未输出）。';
}
