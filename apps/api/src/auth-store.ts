import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';

export interface User { id: string; username: string }
export interface AuthStore {
  register(username: string, password: string): Promise<User | undefined>;
  verify(username: string, password: string): Promise<User | undefined>;
  session(token: string): Promise<User | undefined>;
  issue(userId: string): Promise<string>;
  revoke(token: string): Promise<void>;
}
export const sessionSeconds = 60 * 60 * 24 * 7;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result));
});
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [version, salt, value] = stored.split('$');
  if (version !== 'scrypt-v1' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(value || '')) return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(value, 'hex'));
}
// Unknown usernames incur the same password derivation work.
const dummy = `scrypt-v1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export function createAuthStore(pool: Pool): AuthStore {
  return {
    async register(username, password) {
      const passwordHash = await hashPassword(password);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query('INSERT INTO design_atlas.users(username) VALUES ($1) ON CONFLICT(username) DO NOTHING RETURNING id,username', [username]);
        if (!result.rowCount) { await client.query('ROLLBACK'); return undefined; }
        const user: User = result.rows[0];
        await client.query('INSERT INTO design_atlas.password_credentials(user_id,password_hash) VALUES ($1,$2)', [user.id,passwordHash]);
        await client.query('INSERT INTO design_atlas.user_categories(owner_id,id,name,position) SELECT $1,id,name,position FROM design_atlas.categories', [user.id]);
        await client.query('INSERT INTO design_atlas.user_tags(owner_id,id,name,position) SELECT $1,id,name,position FROM design_atlas.tags', [user.id]);
        await client.query('INSERT INTO design_atlas.user_designs(owner_id,category_id,tag_id,content,position) SELECT $1,category_id,tag_id,content,position FROM design_atlas.designs', [user.id]);
        await client.query('COMMIT');
        return user;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async verify(username,password) {
      const result = await pool.query('SELECT u.id,u.username,u.disabled,p.password_hash FROM design_atlas.users u JOIN design_atlas.password_credentials p ON p.user_id=u.id WHERE u.username=$1', [username]);
      const row = result.rows[0];
      const valid = await verifyPassword(password,row?.password_hash || dummy);
      return valid && row && !row.disabled ? { id: row.id, username: row.username } : undefined;
    },
    async session(token) {
      if (!/^[a-f0-9]{64}$/.test(token)) return undefined;
      const result = await pool.query('SELECT u.id,u.username FROM design_atlas.sessions s JOIN design_atlas.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT u.disabled', [digest(token)]);
      return result.rows[0];
    },
    async issue(userId) {
      const token = randomBytes(32).toString('hex');
      await pool.query('DELETE FROM design_atlas.sessions WHERE expires_at<=now()');
      await pool.query("INSERT INTO design_atlas.sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '7 days')", [digest(token),userId]);
      return token;
    },
    async revoke(token) { await pool.query('DELETE FROM design_atlas.sessions WHERE token_hash=$1', [digest(token)]); },
  };
}
