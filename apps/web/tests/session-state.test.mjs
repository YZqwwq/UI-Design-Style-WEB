import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionState } from '../src/session-state.js';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve=r; }); return {promise,resolve}; };
test('old session response cannot override a completed login', async () => {
  const old=deferred(), current=deferred(), seen=[]; let count=0;
  const state=createSessionState(()=>++count===1?old.promise:current.promise,u=>seen.push(u));
  const restoring=state.restore();
  const login=state.mutate(async()=>{});
  await Promise.resolve();
  current.resolve({user:{id:'alice'}}); await login;
  old.resolve({user:null}); await restoring;
  assert.deepEqual(seen,[{id:'alice'}]);
});
test('closing a form or a failed mutation still reconciles the server session; only latest restore applies', async () => {
  const replies=[deferred(),deferred()]; let count=0; const seen=[];
  const state=createSessionState(()=>replies[count++].promise,u=>seen.push(u));
  const first=state.restore(), second=state.restore();
  replies[1].resolve({user:null}); await second;
  replies[0].resolve({user:{id:'stale'}}); await first;
  assert.deepEqual(seen,[null]);
  const failed=createSessionState(async()=>({user:{id:'committed'}}),u=>seen.push(u));
  await assert.rejects(failed.mutate(async()=>{throw Error('response lost');}));
  assert.deepEqual(seen,[null,{id:'committed'}]);
});
