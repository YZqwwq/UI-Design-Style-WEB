import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/database.js';
import { createAuthStore } from '../src/auth-store.js';
import { createRepository,createTemplateRepository } from '../src/repository.js';
import { createLibraryStore } from '../src/library.js';
import { createApp } from '../src/app.js';

test('real database: owner-scoped writes, password changes, logout-all and atomic registration',async()=>{
 const pool=createPool((await loadConfig()).db);
 const auth=createAuthStore(pool),repo=createRepository(pool);
 const app=createApp(repo,{auth,library:createLibraryStore(pool),publicRepository:createTemplateRepository(pool)});
 const suffix=randomBytes(6).toString('hex');
 const names=[`write_a_${suffix}`,`write_b_${suffix}`,`fail_${suffix}`];
 const password='test-password-'+suffix;
 const headers={'x-atlas-request':'1',origin:'http://localhost:4173'};
 const cookieOf=(r:{headers:Record<string,unknown>})=>String(r.headers['set-cookie']).split(';')[0];
 const send=(cookie:string,method:'POST'|'PUT'|'DELETE',url:string,payload?:object)=>app.inject({method,url,headers:{...headers,cookie},...(payload?{payload}:{})});
 try {
  const templates=(await pool.query('SELECT * FROM design_atlas.designs ORDER BY id')).rows;
  const accounts=[];
  for(const username of names.slice(0,2)){
   const response=await send('','POST','/api/auth/register',{username,password,confirmation:password});
   assert.equal(response.statusCode,201,response.body);accounts.push({user:response.json().user,cookie:cookieOf(response)});
  }
  const [a,b]=accounts;
  const termIds:Record<string,string>={};
  for(const kind of ['categories','tags']){
   const created=await send(a.cookie,'POST',`/api/${kind}`,{name:`private-${kind}`});
   assert.equal(created.statusCode,201,created.body);termIds[kind]=created.json().id;
   assert.equal((await send(b.cookie,'PUT',`/api/${kind}/${created.json().id}`,{name:'stolen'})).statusCode,404);
   assert.equal((await send(b.cookie,'DELETE',`/api/${kind}/${created.json().id}`)).statusCode,404);
   assert.equal((await send(a.cookie,'POST',`/api/${kind}`,{name:`private-${kind}`})).statusCode,409);
  }
  const body={name:'My design',category:'private-categories',tag:'private-tags'};
  const created=await send(a.cookie,'POST','/api/designs',body);assert.equal(created.statusCode,201,created.body);
  const id=created.json().id;
  assert.equal((await send('','POST','/api/designs',body)).statusCode,401);
  assert.equal((await send(b.cookie,'POST','/api/designs',body)).statusCode,400);
  for(const method of ['PUT','DELETE'] as const) assert.equal((await send(b.cookie,method,`/api/designs/${id}`,method==='PUT'?body:undefined)).statusCode,404);
  for(const payload of [{...body,owner_id:b.user.id},{...body,role:'admin'},{...body,colors:['red']},{...body,tone:'<script>'},{...body,name:'   '}]){
   assert.equal((await send(a.cookie,'POST','/api/designs',payload)).statusCode,400);
  }
  assert.equal((await send(a.cookie,'PUT',`/api/designs/${id}?owner_id=${b.user.id}`,body)).statusCode,400);
  assert.equal((await app.inject({method:'DELETE',url:`/api/designs/${id}`,headers:{cookie:a.cookie}})).statusCode,403);
  assert.equal((await send(a.cookie,'POST','/api/public/designs',body)).statusCode,404);
  const updated=await send(a.cookie,'PUT',`/api/designs/${id}`,{...body,name:'Updated',description:'<img src=x onerror=alert(1)>'});assert.equal(updated.statusCode,200,updated.body);
  assert.equal((await repo.get(id,a.user.id))?.name,'Updated');assert.equal(await repo.get(id,b.user.id),undefined);
  assert.equal((await send(a.cookie,'DELETE',`/api/categories/${termIds.categories}`)).statusCode,409);
  assert.equal((await send(a.cookie,'PUT',`/api/categories/${termIds.categories}`,{name:'Renamed'})).statusCode,200);
  assert.equal((await repo.get(id,a.user.id))?.category,'Renamed');
  assert.equal((await send(a.cookie,'DELETE',`/api/designs/${id}`)).statusCode,200);
  assert.equal(await repo.get(id,a.user.id),undefined);
  for(const kind of ['categories','tags']) assert.equal((await send(a.cookie,'DELETE',`/api/${kind}/${termIds[kind]}`)).statusCode,200);
  assert.deepEqual((await pool.query('SELECT * FROM design_atlas.designs ORDER BY id')).rows,templates);

  const login=()=>send('','POST','/api/auth/login',{username:names[0],password});
  const second=await login();assert.equal(second.statusCode,200);
  const newPassword=password+'-new';
  assert.equal((await send(a.cookie,'POST','/api/auth/password',{currentPassword:'wrong',password:newPassword,confirmation:newPassword})).statusCode,400);
  assert.equal((await send(a.cookie,'POST','/api/auth/password',{currentPassword:password,password:newPassword,confirmation:'mismatch'})).statusCode,400);
  assert.equal((await send(a.cookie,'POST','/api/auth/password',{currentPassword:password,password:newPassword,confirmation:newPassword})).statusCode,200);
  for(const cookie of [a.cookie,cookieOf(second)]) assert.equal((await app.inject({url:'/api/designs',headers:{cookie}})).statusCode,401);
  assert.equal((await login()).statusCode,401);
  const newLogin=()=>send('','POST','/api/auth/login',{username:names[0],password:newPassword});
  const one=await newLogin(),two=await newLogin();assert.equal(one.statusCode,200);assert.equal(two.statusCode,200);
  assert.equal((await send(cookieOf(one),'POST','/api/auth/logout-all',{})).statusCode,200);
  assert.equal((await app.inject({url:'/api/designs',headers:{cookie:cookieOf(two)}})).statusCode,401);
  assert.equal((await app.inject({url:'/api/designs',headers:{cookie:b.cookie}})).statusCode,200);
  await pool.query('UPDATE design_atlas.users SET disabled=true WHERE id=$1',[b.user.id]);
  assert.equal((await send(b.cookie,'POST','/api/designs',body)).statusCode,401);

  // Inject one session INSERT failure into a real transaction, without changing DB schema.
  const failingPool={connect:async()=>{
   const client=await pool.connect();
   return new Proxy(client,{get(target,key){
    if(key==='query') return (sql:string,values?:unknown[])=>{
     if(sql.startsWith('INSERT INTO design_atlas.sessions')) throw new Error('injected session write failure');
     return target.query(sql,values);
    };
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
   }});
  }} as unknown as Pool;
  await assert.rejects(createAuthStore(failingPool).register(names[2],password),/injected/);
  assert.equal((await pool.query('SELECT id FROM design_atlas.users WHERE username=$1',[names[2]])).rowCount,0);
  assert.ok(await auth.register(names[2],password));
 } finally {
  await app.close();
  try {await pool.query('DELETE FROM design_atlas.users WHERE username=ANY($1::text[])',[names]);}
  finally {await pool.end();}
 }
});
