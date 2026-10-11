import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { hashPassword, verifyPassword, type AuthStore } from '../src/auth-store.js';
import type { CatalogRepository } from '../src/types.js';
import { designs } from '../db/seed/designs.js';

const headers = {'x-atlas-request':'1',origin:'http://localhost:4173'};
function setup() {
  const sessions = new Map<string,{id:string;username:string}>();
  const users = new Map<string,{id:string;username:string;password:string}>();
  let seq = 0;
  const issue = async (id:string) => { const token=(++seq).toString(16).padStart(64,'0'); const user={id,username:id};sessions.set(token,user);return {user,token}; };
  const auth: AuthStore = {
    register: async (username,password) => { if(users.has(username))return undefined;const user={id:username,username,password};users.set(username,user);return issue(user.id); },
    login: async (username,password) => {const u=users.get(username);return u?.password===password?issue(u.id):undefined;},
    session: async token=>sessions.get(token),
    revokeAll:async()=>{sessions.clear();}, changePassword:async()=>true,
    revoke: async token=>{sessions.delete(token);},
  };
  const seen: string[]=[];
  const repository: CatalogRepository={
    list: async (_filters,owner)=>{seen.push(owner);return {items:[{...designs[0],id:owner}],total:1};},
    get: async (id,owner)=>{seen.push(owner);return id===owner?{...designs[0],id}:undefined;},
    metadata:async owner=>{seen.push(owner);return {categories:[owner],tags:[]};},check:async()=>{},
  };
  return {app:createApp(repository,{auth}),seen};
}
async function register(app:ReturnType<typeof createApp>,username:string) {
 const r=await app.inject({method:'POST',url:'/api/auth/register',headers,payload:{username,password:'long-password-123',confirmation:'long-password-123'}});
 assert.equal(r.statusCode,201); assert.equal(r.json().user.username,username.toLowerCase());
 return String(r.headers['set-cookie']).split(';')[0];
}
test('password hashing uses unique salt and verifies without storing plaintext',async()=>{
 const a=await hashPassword('long-password-123'), b=await hashPassword('long-password-123');
 assert.notEqual(a,b);assert.ok(!a.includes('long-password'));assert.equal(await verifyPassword('long-password-123',a),true);assert.equal(await verifyPassword('wrong-password',a),false);
});
test('anonymous requests fail closed; registration, session, and logout lifecycle',async t=>{
 const {app}=setup();t.after(()=>app.close());
 for(const url of ['/api/designs','/api/catalog','/api/designs/alice'])assert.equal((await app.inject(url)).statusCode,401);
 assert.equal((await app.inject('/api/auth/me')).json().user,null);
 const cookie=await register(app,'Alice');
 const me=await app.inject({url:'/api/auth/me',headers:{cookie}});assert.equal(me.json().user.username,'alice');
 const duplicate=await app.inject({method:'POST',url:'/api/auth/register',headers,payload:{username:'ALICE',password:'long-password-123',confirmation:'long-password-123'}});assert.equal(duplicate.statusCode,409);
 const out=await app.inject({method:'POST',url:'/api/auth/logout',headers:{...headers,cookie},payload:{}});assert.equal(out.statusCode,200);assert.match(String(out.headers['set-cookie']),/Max-Age=0/);
 assert.equal((await app.inject({url:'/api/designs',headers:{cookie}})).statusCode,401);
 const login=await app.inject({method:'POST',url:'/api/auth/login',headers,payload:{username:'ALICE',password:'long-password-123'}});assert.equal(login.statusCode,200);assert.match(String(login.headers['set-cookie']),/HttpOnly; SameSite=Lax/);
 const wrong=await app.inject({method:'POST',url:'/api/auth/login',headers,payload:{username:'alice',password:'incorrect-password'}});assert.equal(wrong.statusCode,401);
});
test('two users cannot read each other; owner parameters cannot override session',async t=>{
 const {app,seen}=setup();t.after(()=>app.close());const a=await register(app,'alice'),b=await register(app,'bob');
 assert.equal((await app.inject({url:'/api/designs',headers:{cookie:a}})).json().items[0].id,'alice');
 assert.equal((await app.inject({url:'/api/catalog',headers:{cookie:b}})).json().categories[0],'bob');
 assert.equal((await app.inject({url:'/api/designs/alice',headers:{cookie:b}})).statusCode,404);
 assert.equal((await app.inject({method:'POST',url:'/api/designs/alice/prompt',headers:{...headers,cookie:b},payload:{}})).statusCode,404);
 assert.equal((await app.inject({url:'/api/designs?owner_id=alice',headers:{cookie:b}})).statusCode,400);
 assert.deepEqual(seen,['alice','bob','bob','bob']);
});
test('CSRF, validation and repeated password attempts are rejected',async t=>{
 const {app}=setup();t.after(()=>app.close());const payload={username:'alice',password:'long-password-123',confirmation:'long-password-123'};
 for(const h of [{},{...headers,origin:'https://other.example'}])assert.equal((await app.inject({method:'POST',url:'/api/auth/register',headers:h,payload})).statusCode,403);
 assert.equal((await app.inject({method:'POST',url:'/api/auth/register',headers,payload:{...payload,password:'short'}})).statusCode,400);
 for(let i=0;i<10;i++)assert.equal((await app.inject({method:'POST',url:'/api/auth/login',headers,payload:{username:payload.username,password:payload.password}})).statusCode,401);
 assert.equal((await app.inject({method:'POST',url:'/api/auth/login',headers,payload:{username:payload.username,password:payload.password}})).statusCode,429);
});

test('server rejects missing/mismatched confirmation and identity injection without frontend checks',async t=>{
 const {app}=setup();t.after(()=>app.close());
 const credentials={username:'alice',password:'long-password-123'};
 for(const payload of [credentials,{...credentials,confirmation:'different'},{...credentials,confirmation:credentials.password,role:'admin'}]){
  assert.equal((await app.inject({method:'POST',url:'/api/auth/register',headers,payload})).statusCode,400);
 }
 const cookie=await register(app,'alice');
 assert.equal((await app.inject({method:'POST',url:'/api/auth/password',headers,payload:{currentPassword:'x',password:'long-password-123',confirmation:'long-password-123'}})).statusCode,401);
 assert.equal((await app.inject({method:'POST',url:'/api/auth/password',headers:{...headers,cookie},payload:{currentPassword:'x',password:'long-password-123',confirmation:'different'}})).statusCode,400);
 assert.equal((await app.inject({method:'POST',url:'/api/auth/logout-all',headers:{...headers,cookie},payload:{userId:'bob'}})).statusCode,400);
});
