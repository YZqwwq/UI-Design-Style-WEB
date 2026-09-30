import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp as buildApp } from '../src/app.js';
import { designs } from '../db/seed/designs.js';
import type { CatalogRepository, Filters } from '../src/types.js';

// These catalog tests run as one explicitly authenticated fixture user.
function createApp(repository: CatalogRepository, options: Parameters<typeof buildApp>[1] = {}) {
  return buildApp(repository, { ...options, auth: {
    session: async () => ({id:'00000000-0000-4000-8000-000000000001',username:'fixture'}),
    register: async () => undefined, verify: async () => undefined,
    issue: async () => '', revoke: async () => {},
  }});
}

function repository(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
  return {
    list: async () => ({ items: designs, total: designs.length }),
    get: async id => designs.find(d => d.id === id),
    metadata: async () => ({ categories: ['极简主义'], tags: ['简洁'] }),
    check: async () => {},
    ...overrides,
  };
}

test('list passes validated filters and pagination to the repository', async t => {
  let captured: Filters | undefined;
  const app = createApp(repository({ list: async filters => { captured = filters; return { items: [designs[7]], total: 1 }; } }));
  t.after(() => app.close());
  const response = await app.inject({ url: '/api/designs?' + new URLSearchParams({ category: '极简主义', tag: '暗色', query: 'STUDIO', limit: '10', offset: '0' }) });
  assert.equal(response.statusCode, 200);
  assert.deepEqual({ ...captured }, { category: '极简主义', tag: '暗色', query: 'STUDIO', limit: 10, offset: 0 });
  assert.equal(response.json().items[0].id, 'mono');
  assert.equal(response.json().total, 1);
});

test('invalid filters and bodies are rejected before reaching database', async t => {
  let calls = 0;
  const app = createApp(repository({ list: async () => { calls++; throw Error(); }, get: async () => { calls++; throw Error(); } }));
  t.after(() => app.close());
  for (const query of ['limit=0', 'limit=101', 'offset=-1', 'limit=no', 'unknown=x', 'query=' + 'x'.repeat(201)]) {
    assert.equal((await app.inject('/api/designs?' + query)).statusCode, 400);
  }
  for (const payload of [{ purpose: 'x'.repeat(161) }, { purpose: {}, secret: 'x' }, { extra: true }]) {
    assert.equal((await app.inject({ method: 'POST', headers: {'x-atlas-request':'1'}, url: '/api/designs/glass/prompt', payload })).statusCode, 400);
  }
  assert.equal(calls, 0);
});

test('detail, metadata and prompt remain available through backend API', async t => {
  const app = createApp(repository());
  t.after(() => app.close());
  assert.equal((await app.inject('/api/health')).json().database, 'connected');
  assert.deepEqual((await app.inject('/api/catalog')).json().categories, ['极简主义']);
  assert.equal((await app.inject('/api/designs/glass')).json().name, '光的层次');
  for (const url of ['/api/designs/missing', '/api/designs/missing/prompt']) {
    assert.equal((await app.inject({ url, headers: {'x-atlas-request':'1'}, method: url.endsWith('/prompt') ? 'POST' : 'GET', ...(url.endsWith('/prompt') ? { payload: {} } : {}) })).statusCode, 404);
  }
  const response = await app.inject({ method: 'POST', headers: {'x-atlas-request':'1'}, url: '/api/designs/glass/prompt', payload: { purpose: '摄影作品集' } });
  assert.equal(response.statusCode, 200);
  assert.match(response.json().prompt, /摄影作品集/);
  assert.match(response.json().prompt, /半透明/);
});

test('database failures return a retryable status without credentials or SQL', async t => {
  const fail = async () => { throw Error('password=DO_NOT_EXPOSE SELECT private'); };
  const app = createApp(repository({ list: fail, check: fail, get: fail, metadata: fail }));
  t.after(() => app.close());
  for (const url of ['/api/health', '/api/designs', '/api/catalog', '/api/designs/glass']) {
    const response = await app.inject(url);
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error, 'SERVICE_UNAVAILABLE');
    assert.doesNotMatch(response.body, /DO_NOT_EXPOSE|SELECT|password/);
  }
});

test('production serves built assets while keeping backend and env files private', async t => {
  const publicRoot = await mkdtemp(path.join(tmpdir(), 'atlas-web-'));
  await mkdir(path.join(publicRoot, 'assets'));
  await writeFile(path.join(publicRoot, 'index.html'), '<html>Design Atlas</html>');
  await writeFile(path.join(publicRoot, 'assets', 'app-test.js'), 'console.log("web")');
  await writeFile(path.join(publicRoot, '.env'), 'SECRET=must-not-be-served');
  const app = createApp(repository(), { publicRoot });
  t.after(async () => { await app.close(); await rm(publicRoot, { recursive: true, force: true }); });
  for (const url of ['/', '/assets/app-test.js']) assert.equal((await app.inject(url)).statusCode, 200);
  for (const url of ['/.env', '/src/config.ts', '/db/seed/designs.ts', '/package.json', '/assets/../.env', '/api/missing']) {
    const response = await app.inject(url);
    assert.ok([403, 404].includes(response.statusCode));
    assert.doesNotMatch(response.body, /must-not-be-served/);
  }
  assert.equal((await app.inject('/api/health')).json().database, 'connected');
});

test('development API does not serve frontend or repository files', async t => {
  const app = createApp(repository());
  t.after(() => app.close());
  for (const url of ['/', '/src/app.js', '/.env', '/package.json']) assert.equal((await app.inject(url)).statusCode, 404);
});

test('guest endpoints use only templates and private endpoints remain protected', async t => {
  let privateCalls=0;
  const privateRepository=repository({list:async()=>{privateCalls++;return {items:[],total:0};},get:async()=>{privateCalls++;return undefined;}});
  const app=buildApp(privateRepository,{publicRepository:repository()});
  t.after(()=>app.close());
  assert.equal((await app.inject('/api/public/designs')).json().total,8);
  assert.deepEqual((await app.inject('/api/public/catalog')).json().categories,['极简主义']);
  assert.equal((await app.inject('/api/public/designs/glass')).json().name,'光的层次');
  assert.equal((await app.inject({method:'POST',url:'/api/public/designs/glass/prompt',headers:{'x-atlas-request':'1'},payload:{}})).statusCode,200);
  assert.equal((await app.inject('/api/public/designs/private-user-id')).statusCode,404);
  assert.equal((await app.inject('/api/public/designs?owner_id=other')).statusCode,400);
  assert.equal((await app.inject('/api/designs')).statusCode,401);
  assert.equal((await app.inject('/api/designs/glass')).statusCode,401);
  assert.equal(privateCalls,0);
});
