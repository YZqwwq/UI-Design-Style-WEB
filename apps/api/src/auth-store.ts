import { EmailVerificationError, invalidCode, normalizeEmail, verifyRegistrationCode, type EmailVerification } from './email-registration.js';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export interface User { id: string; username: string }
export interface AuthSession { user: User; token: string }
export interface AuthStore {
  register(username: string, password: string, oldToken?: string, verification?: EmailVerification): Promise<AuthSession | undefined>;
  login(username: string, password: string, oldToken?: string): Promise<AuthSession | undefined>;
  session(token: string): Promise<User | undefined>;
  revoke(token: string): Promise<void>;
  revokeAll(userId: string): Promise<void>;
  changePassword(userId: string, currentPassword: string, password: string): Promise<boolean>;
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
export function createAuthStore(pool: Pool, emailSecret?: string): AuthStore {
  async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function issue(client: PoolClient, user: User, oldToken = ''): Promise<AuthSession> {
    const token = randomBytes(32).toString('hex');
    await client.query('DELETE FROM design_atlas.sessions WHERE user_id=$1 AND expires_at<=now()', [user.id]);
    await client.query("INSERT INTO design_atlas.sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '7 days')", [digest(token),user.id]);
    if (oldToken) await client.query('DELETE FROM design_atlas.sessions WHERE token_hash=$1', [digest(oldToken)]);
    return { user, token };
  }
  return {
    async register(username, password, oldToken, verification) {
      if (!emailSecret) throw new EmailVerificationError(503,"MAIL_UNAVAILABLE","注册邮件服务尚未配置，请稍后再试。");
      if (!verification) throw invalidCode();
      const email = normalizeEmail(verification.email);
      const passwordHash = await hashPassword(password);
      const registered = await transaction(async client => {
        if (!await verifyRegistrationCode(client,emailSecret,verification)) return invalidCode();
        const result = await client.query('INSERT INTO design_atlas.users(username,email,email_verified_at) VALUES ($1,$2,now()) ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO NOTHING RETURNING id,username', [username,email]);
        if (!result.rowCount) return undefined;
        const user: User = result.rows[0];
        await client.query('INSERT INTO design_atlas.password_credentials(user_id,password_hash) VALUES ($1,$2)', [user.id,passwordHash]);
        await client.query('INSERT INTO design_atlas.user_categories(owner_id,id,name,position) SELECT $1,id,name,position FROM design_atlas.categories', [user.id]);
        await client.query('INSERT INTO design_atlas.user_tags(owner_id,id,name,position) SELECT $1,id,name,position FROM design_atlas.tags', [user.id]);
        await client.query('INSERT INTO design_atlas.user_designs(owner_id,category_id,tag_id,content,position) SELECT $1,category_id,tag_id,content,position FROM design_atlas.designs', [user.id]);
        await client.query('DELETE FROM design_atlas.registration_codes WHERE email=$1',[email]);
        return issue(client, user, oldToken);
      });
      // Throw after committing failed-attempt counters; failures during account creation roll back everything.
      if (registered instanceof EmailVerificationError) throw registered;
      return registered;
    },
    async login(username,password,oldToken) {
      // Lock the account through verification and session issuance so password changes
      // and logout-all cannot interleave with issuance from an old password.
      return transaction(async client => {
        const result = await client.query('SELECT u.id,u.username,u.disabled,p.password_hash FROM design_atlas.users u JOIN design_atlas.password_credentials p ON p.user_id=u.id WHERE lower(u.email)=$1 OR (u.email IS NULL AND u.username=$1) FOR UPDATE OF u', [username]);
        const row = result.rowCount === 1 ? result.rows[0] : undefined;
        const valid = await verifyPassword(password,row?.password_hash || dummy);
        if (!valid || !row || row.disabled) return undefined;
        return issue(client, { id: row.id, username: row.username }, oldToken);
      });
    },
    async session(token) {
      if (!/^[a-f0-9]{64}$/.test(token)) return undefined;
      const result = await pool.query('SELECT u.id,u.username FROM design_atlas.sessions s JOIN design_atlas.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT u.disabled', [digest(token)]);
      return result.rows[0];
    },
    async revoke(token) { await pool.query('DELETE FROM design_atlas.sessions WHERE token_hash=$1', [digest(token)]); },
    async revokeAll(userId) {
      await transaction(async client => {
        await client.query('SELECT id FROM design_atlas.users WHERE id=$1 FOR UPDATE', [userId]);
        await client.query('DELETE FROM design_atlas.sessions WHERE user_id=$1', [userId]);
      });
    },
    async changePassword(userId, currentPassword, password) {
      return transaction(async client => {
        const result = await client.query('SELECT u.disabled,p.password_hash FROM design_atlas.users u JOIN design_atlas.password_credentials p ON p.user_id=u.id WHERE u.id=$1 FOR UPDATE OF u', [userId]);
        const row = result.rows[0];
        if (!await verifyPassword(currentPassword,row?.password_hash || dummy) || !row || row.disabled) return false;
        await client.query('UPDATE design_atlas.password_credentials SET password_hash=$1 WHERE user_id=$2', [await hashPassword(password),userId]);
        await client.query('DELETE FROM design_atlas.sessions WHERE user_id=$1', [userId]);
        return true;
      });
    },
  };
}
