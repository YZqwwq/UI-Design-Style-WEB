import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { request } from '../src/api.js';

test('browser client sends bodyless DELETE and JSON writes accepted by Fastify',async t=>{
  const app=Fastify();t.after(()=>app.close());
  app.delete('/api/designs/example',async req=>({ok:req.headers['x-atlas-request']==='1'}));
  app.post('/api/designs',async req=>req.body);
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    const result=await app.inject({url,method:options.method,headers:options.headers,...(options.body===undefined?{}:{payload:options.body})});
    return new Response(result.body,{status:result.statusCode});
  });
  assert.deepEqual(await request('/designs/example',{method:'DELETE'}),{ok:true});
  assert.deepEqual(await request('/designs',{method:'POST',body:JSON.stringify({name:'Example'})}),{name:'Example'});
});
