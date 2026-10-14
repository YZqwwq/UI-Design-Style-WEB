import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/app.js';
import {codeDigest,normalizeEmail} from '../src/email-registration.js';
import type {CatalogRepository} from '../src/types.js';
const repo:CatalogRepository={list:async()=>({items:[],total:0}),get:async()=>undefined,metadata:async()=>({categories:[],tags:[]}),check:async()=>{}};
const headers={'x-atlas-request':'1',origin:'http://localhost:4173'};
test('code endpoint is public but requires CSRF header, validates a single email and limits requests',async t=>{
 const emails:string[]=[];
 const app=createApp(repo,{emailRegistration:{requestCode:async email=>{emails.push(email);return {ok:true,retryAfter:60,expiresIn:600};}}});t.after(()=>app.close());
 const send=(payload:object,h:Record<string,string>=headers)=>app.inject({method:'POST',url:'/api/auth/register/email-code',headers:h,payload});
 assert.equal((await send({email:'user@example.com'},{})).statusCode,403);
 for(const email of ['invalid','a@example.com,b@example.com','a@example.com\nBcc:x@y.com'])assert.equal((await send({email})).statusCode,400);
 assert.equal((await send({email:'USER@Example.com'})).statusCode,200);assert.equal(emails[0],'user@example.com');
 for(let i=1;i<10;i++)assert.equal((await send({email:`user${i}@example.com`})).statusCode,200);
 assert.equal((await send({email:'another@example.com'})).statusCode,429);assert.equal(emails.length,10);
});
test('unconfigured mail fails closed; registration cannot omit email or code',async t=>{
 const app=createApp(repo);t.after(()=>app.close());
 assert.equal((await app.inject({method:'POST',url:'/api/auth/register/email-code',headers,payload:{email:'user@example.com'}})).statusCode,503);
 const base={username:'alice',password:'long-password-123',confirmation:'long-password-123'};
 for(const payload of [base,{...base,email:'user@example.com'},{...base,email:'user@example.com',code:'abc123'}])assert.equal((await app.inject({method:'POST',url:'/api/auth/register',headers,payload})).statusCode,400);
});
test('verification digests bind secret, email, challenge and code without changing aliases',()=>{
 const hash=codeDigest('secret','u@example.com','id','123456');
 for(const args of [['other','u@example.com','id','123456'],['secret','x@example.com','id','123456'],['secret','u@example.com','other','123456'],['secret','u@example.com','id','123457']])assert.notEqual(codeDigest(...args as [string,string,string,string]),hash);
 assert.equal(normalizeEmail(' A.B+test@EXAMPLE.com '),'a.b+test@example.com');
});
test('registration validation identifies invalid or missing fields without echoing credentials',async t=>{
 const app=createApp(repo);t.after(()=>app.close());
 const base={username:'alice',password:'long-password-123',confirmation:'long-password-123',email:'user@example.com',code:'123456'};
 for(const [field,value,expected] of [
  ['username','','1–32'],['username',' '.repeat(3),'1–32'],
  ['password','short','10–128'],['email','invalid','有效的邮箱'],['code','abc123','6 位数字'],
  ['confirmation',undefined,'确认密码'],['email',undefined,'有效的邮箱'],['code',undefined,'6 位数字'],
 ] as const){
  const response=await app.inject({method:'POST',url:'/api/auth/register',headers,payload:{...base,[field]:value}});
  assert.equal(response.statusCode,400);
  assert.equal(response.json().field,field);
  assert.ok(response.json().message.includes(expected));
  assert.ok(!response.body.includes(base.password));
 }
 const extra=await app.inject({method:'POST',url:'/api/auth/register',headers,payload:{...base,unexpected:true}});
 assert.equal(extra.statusCode,400);assert.equal(extra.json().message,'请求参数或格式无效。');
 const malformed=await app.inject({method:'POST',url:'/api/auth/register',headers:{...headers,'content-type':'application/json'},payload:'{'});
 assert.equal(malformed.statusCode,400);assert.equal(malformed.json().message,'请求参数或格式无效。');
});
