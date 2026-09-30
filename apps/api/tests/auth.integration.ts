import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/database.js';
import { createAuthStore } from '../src/auth-store.js';
import { createRepository } from '../src/repository.js';
import { createApp } from '../src/app.js';

// Explicit opt-in: creates only unique test users, removes them and all their copies in finally.
test('PostgreSQL registration copies templates, isolates users and persists/revokes sessions',async()=>{
 const pool=createPool((await loadConfig()).db);
 const auth=createAuthStore(pool),repo=createRepository(pool);
 const app=createApp(repo,{auth});
 const suffix=randomBytes(8).toString('hex');
 const names=[`test_a_${suffix}`,`test_b_${suffix}`];
 const headers={'x-atlas-request':'1',origin:'http://localhost:4173'};
 const password=randomBytes(24).toString('hex');
 try {
  const templates=(await pool.query('SELECT id,content FROM design_atlas.designs ORDER BY position,id')).rows;
  const accounts=[];
  for(const username of names){
   const r=await app.inject({method:'POST',url:'/api/auth/register',headers,payload:{username,password}});
   assert.equal(r.statusCode,201);
   accounts.push({user:r.json().user,cookie:String(r.headers['set-cookie']).split(';')[0]});
  }
  const [a,b]=accounts;
  const listA=await repo.list({limit:100},a.user.id),listB=await repo.list({limit:100},b.user.id);
  assert.equal(listA.total,templates.length);assert.equal(listB.total,templates.length);
  assert.notEqual(listA.items[0].id,listB.items[0].id);
  assert.deepEqual(listA.items.map(d=>d.name),listB.items.map(d=>d.name));
  assert.deepEqual((await repo.metadata(a.user.id)).categories,(await repo.metadata(b.user.id)).categories);
  assert.equal((await repo.list({category:'极简主义',tag:'暗色',query:'STUDIO'},a.user.id)).items[0].name,'黑白之间');
  assert.equal((await repo.list({query:"%' OR true --"},a.user.id)).total,0);
  const page=await repo.list({limit:2,offset:2},a.user.id);assert.deepEqual(page.items.map(d=>d.id),listA.items.slice(2,4).map(d=>d.id));
  for(const route of [`/api/designs/${listA.items[0].id}`,`/api/designs/${listA.items[0].id}/prompt`]){
   const response=await app.inject({url:route,method:route.endsWith('/prompt')?'POST':'GET',headers:{...headers,cookie:b.cookie},...(route.endsWith('/prompt')?{payload:{}}:{})});
   assert.equal(response.statusCode,404);
  }
  await pool.query("UPDATE design_atlas.user_designs SET content=jsonb_set(content,'{name}',to_jsonb('A 独立修改'::text)) WHERE owner_id=$1 AND id=$2",[a.user.id,listA.items[0].id]);
  assert.equal((await repo.get(listA.items[0].id,a.user.id))?.name,'A 独立修改');
  assert.equal((await repo.get(listB.items[0].id,b.user.id))?.name,listB.items[0].name);
  assert.deepEqual((await pool.query('SELECT id,content FROM design_atlas.designs ORDER BY position,id')).rows,templates);
  const stored=(await pool.query('SELECT password_hash FROM design_atlas.password_credentials WHERE user_id=$1',[a.user.id])).rows[0].password_hash;
  assert.ok(stored.startsWith('scrypt-v1$'));assert.notEqual(stored,password);
  const token=a.cookie.split('=')[1];
  assert.equal((await pool.query('SELECT token_hash FROM design_atlas.sessions WHERE user_id=$1',[a.user.id])).rows[0].token_hash,createHash('sha256').update(token).digest('hex'));
  assert.equal((await createAuthStore(pool).session(token))?.id,a.user.id);
  await pool.query("UPDATE design_atlas.sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",[a.user.id]);
  assert.equal((await app.inject({url:'/api/designs',headers:{cookie:a.cookie}})).statusCode,401);
  const login=await app.inject({method:'POST',url:'/api/auth/login',headers,payload:{username:names[0].toUpperCase(),password}});assert.equal(login.statusCode,200);
  assert.equal((await repo.list({},a.user.id)).total,templates.length);
  assert.equal((await repo.get(listA.items[0].id,a.user.id))?.name,'A 独立修改');
  const cookie=String(login.headers['set-cookie']).split(';')[0];
  await app.inject({method:'POST',url:'/api/auth/logout',headers:{...headers,cookie},payload:{}});
  assert.equal((await app.inject({url:'/api/designs',headers:{cookie}})).statusCode,401);
 } finally {
  await app.close();
  try {await pool.query('DELETE FROM design_atlas.users WHERE username=ANY($1::text[])',[names]);}
  finally {await pool.end();}
 }
});
