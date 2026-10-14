import {createHmac,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {SendRegistrationCode} from './mail.js';

export interface EmailVerification {email:string;code:string}
export class EmailVerificationError extends Error {
  constructor(public readonly statusCode:number, public readonly errorCode:string, message:string, public readonly retryAfter?:number) {super(message);}
}
// Product identity rule: trim and lowercase; do not strip dots or plus-addressing.
export const normalizeEmail=(email:string)=>email.trim().toLowerCase();
export function codeDigest(secret:string,email:string,id:string,code:string) {
  return createHmac('sha256',secret).update(JSON.stringify(['atlas-registration-v1',email,id,code])).digest('hex');
}
export const invalidCode=()=>new EmailVerificationError(400,'INVALID_EMAIL_CODE','验证码无效、已过期或尝试次数过多，请重新获取。');
export async function verifyRegistrationCode(client:PoolClient,secret:string,verification:EmailVerification) {
  const email=normalizeEmail(verification.email);
  const result=await client.query('SELECT *, expires_at > now() AS valid FROM design_atlas.registration_codes WHERE email=$1 FOR UPDATE',[email]);
  const row=result.rows[0];
  if(!row || !row.valid || row.status!=='sent' || row.attempts>=5)return false;
  await client.query('UPDATE design_atlas.registration_codes SET attempts=attempts+1 WHERE email=$1',[email]);
  const expected=codeDigest(secret,email,row.id,verification.code);
  return /^[a-f0-9]{64}$/.test(row.code_hash) && timingSafeEqual(Buffer.from(row.code_hash,'hex'),Buffer.from(expected,'hex'));
}
export function createEmailRegistration(pool:Pool,secret:string,send:SendRegistrationCode) {
  return {
    async requestCode(address:string) {
      const email=normalizeEmail(address), id=randomUUID(),code=String(randomInt(0,1000000)).padStart(6,'0');
      // Atomic upsert serializes parallel sends, including across API instances.
      const result=await pool.query(`INSERT INTO design_atlas.registration_codes(email,id,code_hash,status,expires_at)
        VALUES ($1,$2,$3,'pending',now()+interval '10 minutes')
        ON CONFLICT(email) DO UPDATE SET id=EXCLUDED.id,code_hash=EXCLUDED.code_hash,status='pending',attempts=0,
          sent_at=now(),expires_at=EXCLUDED.expires_at,
          window_started_at=CASE WHEN registration_codes.window_started_at <= now()-interval '10 minutes' THEN now() ELSE registration_codes.window_started_at END,
          send_count=CASE WHEN registration_codes.window_started_at <= now()-interval '10 minutes' THEN 1 ELSE registration_codes.send_count+1 END
        WHERE registration_codes.sent_at <= now()-interval '60 seconds'
          AND (registration_codes.window_started_at <= now()-interval '10 minutes' OR registration_codes.send_count<5)
        RETURNING id`,[email,id,codeDigest(secret,email,id,code)]);
      if(!result.rowCount) throw new EmailVerificationError(429,'EMAIL_RATE_LIMIT','发送过于频繁，请稍后再试。',60);
      try { await send(email,code); }
      catch {
        await pool.query("UPDATE design_atlas.registration_codes SET status='failed' WHERE email=$1 AND id=$2",[email,id]);
        throw new EmailVerificationError(503,'MAIL_UNAVAILABLE','邮件发送失败或未确认，请稍后重新获取验证码。',60);
      }
      await pool.query("UPDATE design_atlas.registration_codes SET status='sent' WHERE email=$1 AND id=$2",[email,id]);
      // Limit retention of unclaimed addresses. No active challenge or rate window is removed.
      await pool.query("DELETE FROM design_atlas.registration_codes WHERE expires_at < now()-interval '1 day'");
      return {ok:true,retryAfter:60,expiresIn:600};
    },
  };
}
export type EmailRegistration=ReturnType<typeof createEmailRegistration>;
