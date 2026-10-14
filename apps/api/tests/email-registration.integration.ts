import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {loadConfig} from '../src/config.js';
import {createPool} from '../src/database.js';
import {createAuthStore} from '../src/auth-store.js';
import {createEmailRegistration} from '../src/email-registration.js';
import {createRepository} from '../src/repository.js';
import {createApp} from '../src/app.js';
import {cleanupCodes,testEmailSecret} from './helpers/email.js';

test('email registration: delivery failure, limits, expiry, attempts, atomic consumption and unique ownership',async()=>{
 const pool=createPool((await loadConfig()).db),suffix=randomBytes(6).toString('hex');
 const names=['ok','wrong','expired','race','retry','failed','duplicate'].map(x=>`email_${x}_${suffix}`);
 const codes=new Map<string,string>();let sends=0,fail=false;
 const mail=createEmailRegistration(pool,testEmailSecret,async(email,code)=>{sends++;codes.set(email,code);if(fail)throw new Error('private-provider-error');});
 const auth=createAuthStore(pool,testEmailSecret);
 const app=createApp(createRepository(pool),{auth,emailRegistration:mail});
 const headers={'x-atlas-request':'1',origin:'http://localhost:4173'};
 const emailOf=(i:number)=>`${names[i]}@example.com`;
 const request=(i:number)=>app.inject({method:'POST',url:'/api/auth/register/email-code',headers,payload:{email:emailOf(i)}});
 const register=(i:number,code=codes.get(emailOf(i)),username=names[i])=>app.inject({method:'POST',url:'/api/auth/register',headers,payload:{username,email:emailOf(i),code,password:'long-test-password',confirmation:'long-test-password'}});
 try {
  assert.equal((await request(0)).statusCode,200);
  const row=(await pool.query('SELECT * FROM design_atlas.registration_codes WHERE email=$1',[emailOf(0)])).rows[0];
  assert.notEqual(row.code_hash,codes.get(emailOf(0)));assert.equal(row.code_hash.length,64);
  const [a,b]=await Promise.all([request(0),request(0)]);assert.equal(a.statusCode,429);assert.equal(b.statusCode,429);assert.equal(sends,1);
  const registered=await register(0);assert.equal(registered.statusCode,201,registered.body);
  const user=registered.json().user;
  const stored=(await pool.query('SELECT email,email_verified_at FROM design_atlas.users WHERE id=$1',[user.id])).rows[0];
  assert.equal(stored.email,emailOf(0));assert.ok(stored.email_verified_at);
  assert.equal((await register(0,undefined,names[6])).statusCode,400);
  const copies=await pool.query('SELECT count(*)::int AS n FROM design_atlas.user_designs WHERE owner_id=$1',[user.id]);
  assert.equal(copies.rows[0].n,(await pool.query('SELECT count(*)::int AS n FROM design_atlas.designs')).rows[0].n);
  assert.equal((await pool.query('SELECT 1 FROM design_atlas.registration_codes WHERE email=$1',[emailOf(0)])).rowCount,0);
  // Already bound email cannot be claimed by another username, even with a fresh valid code.
  await mail.requestCode(emailOf(0));assert.equal((await register(0,undefined,names[6])).statusCode,409);

  assert.equal((await request(1)).statusCode,200);
  const wrong=codes.get(emailOf(1))==='000000'?'999999':'000000';
  for(let i=0;i<5;i++)assert.equal((await register(1,wrong)).statusCode,400);
  assert.equal((await register(1)).statusCode,400);
  assert.equal((await pool.query('SELECT attempts FROM design_atlas.registration_codes WHERE email=$1',[emailOf(1)])).rows[0].attempts,5);
  assert.equal((await pool.query('SELECT id FROM design_atlas.users WHERE username=$1',[names[1]])).rowCount,0);

  await request(2);await pool.query("UPDATE design_atlas.registration_codes SET expires_at=now()-interval '1 second' WHERE email=$1",[emailOf(2)]);
  assert.equal((await register(2)).statusCode,400);
  await request(3);
  const concurrent=await Promise.all([register(3),register(3)]);
  assert.deepEqual(concurrent.map(x=>x.statusCode).sort(),[201,400]);

  await mail.requestCode(emailOf(4));const old=codes.get(emailOf(4));
  await pool.query("UPDATE design_atlas.registration_codes SET sent_at=now()-interval '61 seconds' WHERE email=$1",[emailOf(4)]);
  await mail.requestCode(emailOf(4));
  if(old!==codes.get(emailOf(4)))assert.equal((await register(4,old)).statusCode,400);
  assert.equal((await register(4)).statusCode,201);
  // Same display name, different email: independent accounts and email-only login.
  await request(6);
  const sameName=await register(6,undefined,names[0]);assert.equal(sameName.statusCode,201,sameName.body);
  assert.notEqual(sameName.json().user.id,user.id);
  for(const [email,id] of [[emailOf(0),user.id],[emailOf(6),sameName.json().user.id]]){
   const login=await app.inject({method:'POST',url:'/api/auth/login',headers,payload:{username:email.toUpperCase(),password:'long-test-password'}});
   assert.equal(login.statusCode,200);assert.equal(login.json().user.id,id);
  }
  assert.equal(await auth.login(names[0],'long-test-password'),undefined);
  fail=true;const failed=await request(5);assert.equal(failed.statusCode,503);assert.ok(!failed.body.includes('private-provider-error'));
  assert.equal((await register(5)).statusCode,400);
  assert.equal((await pool.query('SELECT status FROM design_atlas.registration_codes WHERE email=$1',[emailOf(5)])).rows[0].status,'failed');
 }finally{await app.close();try{await cleanupCodes(pool,names);await pool.query('DELETE FROM design_atlas.users WHERE username=ANY($1::text[])',[names]);}finally{await pool.end();}}
});
